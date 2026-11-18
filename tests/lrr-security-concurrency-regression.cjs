const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '../ExHentai_Library_Toolkit.user.js'), 'utf8');
const tick = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
function extract(startMarker, endMarker) {
  const start = source.indexOf(startMarker), end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0 && end > start, startMarker);
  return source.slice(start, end);
}
function pools(extra = {}) {
  const ctx = vm.createContext({ CONFIG: { enableLrrChecker: true, lrrServerUrl: 'https://lrr.invalid', lrrConcurrency: 1, altSearchConcurrency: 1 }, ...extra });
  vm.runInContext(extract('    function createPool(', '    function getCache('), ctx);
  return ctx;
}

test('GM storage adapters propagate async rejection and synchronous failure instead of claiming success', async () => {
  const code = extract('  function gmSet(', '  var LRR_CACHE_EXPIRE');
  const legacy = vm.createContext({ GM_setValue: () => Promise.reject(new Error('async write rejected')) });
  vm.runInContext(code, legacy);
  await assert.rejects(legacy.gmSet('lrrApiKey', 'value'), /async write rejected/);
  const modern = vm.createContext({ GM: { setValue: () => Promise.reject(new Error('modern write rejected')) } });
  vm.runInContext(code, modern);
  await assert.rejects(modern.gmSet('lrrApiKey', 'value'), /modern write rejected/);
  const synchronous = vm.createContext({ GM_setValue: () => { throw new Error('sync write failed'); } });
  vm.runInContext(code, synchronous);
  assert.throws(() => synchronous.gmSet('lrrApiKey', 'value'), /sync write failed/);
});

test('credential updates distinguish blank preservation, explicit deletion and trimmed replacement', () => {
  const ctx = vm.createContext({});
  const start = source.indexOf('    function readLrrCredentialUpdate(');
  assert.ok(start >= 0);
  const end = source.indexOf('\n    function ', start + 12);
  vm.runInContext(source.slice(start, end), ctx);
  for (const blank of ['', '  ', null, undefined]) assert.equal(ctx.readLrrCredentialUpdate(blank, false).action, 'keep');
  assert.equal(ctx.readLrrCredentialUpdate('  replacement-key  ', false).value, 'replacement-key');
  assert.equal(ctx.readLrrCredentialUpdate('replacement', false).action, 'replace');
  assert.equal(ctx.readLrrCredentialUpdate('replacement', true).action, 'clear');
  assert.equal(ctx.readLrrCredentialUpdate('replacement', true).value, '');
});

test('pool releases slots after sync throws and rejected promises and preserves FIFO admission', async () => {
  const ctx = pools(), run = ctx.createPool(1), order = [];
  const jobs = [
    run(() => { order.push(1); throw new Error('sync failure'); }),
    run(() => { order.push(2); return Promise.reject(new Error('async failure')); }),
    run(() => { order.push(3); return 42; }),
  ];
  const results = await Promise.allSettled(jobs);
  assert.deepEqual(order, [1, 2, 3]);
  assert.equal(results[0].status, 'rejected'); assert.equal(results[1].status, 'rejected');
  assert.equal(results[2].value, 42);
  assert.equal(await run(() => 7), 7);
});

test('stable pools honor dynamic limits without replacing active-slot accounting', async () => {
  const ctx = pools(); ctx.ensureLrrRequestPools();
  const primary = ctx.runLrrCheckLimited, alt = ctx.runAltSearchLimited;
  let active = 0, peak = 0; const gates = [];
  const work = () => primary(() => new Promise(resolve => { active++; peak = Math.max(peak, active); gates.push(() => { active--; resolve(); }); }));
  const first = work(), second = work(); await tick();
  assert.equal(active, 1);
  ctx.ensureLrrRequestPools();
  assert.equal(ctx.runLrrCheckLimited, primary); assert.equal(ctx.runAltSearchLimited, alt);
  ctx.CONFIG.lrrConcurrency = 2;
  const third = work(); await tick();
  assert.equal(active, 2);
  ctx.CONFIG.lrrConcurrency = 1;
  gates.shift()(); await tick(); assert.equal(active, 1);
  gates.shift()(); await tick(); assert.equal(active, 1);
  gates.shift()(); await Promise.all([first, second, third]);
  assert.equal(peak, 2); assert.equal(active, 0);
});

function flushHarness() {
  const calls = [], gates = [], errors = [];
  const ctx = pools({ galleriesToCheck: [], lrrScanGeneration: 0, runtimeConsole: (...args) => errors.push(args),
    processGallery: entry => { calls.push(entry.id); return new Promise((resolve, reject) => gates.push({ resolve, reject })); } });
  vm.runInContext(extract('    function flushPendingRequests(', '    var lrrRescanTimer'), ctx);
  function add(id, extra = {}) { ctx.galleriesToCheck.push({ id, generation: ctx.lrrScanGeneration, titleElement: { isConnected: true }, ...extra }); }
  return { ctx, calls, gates, errors, add };
}

test('overlapping DOM flushes share one global primary budget and failures do not block later work', async () => {
  const h = flushHarness();
  h.add('first'); h.ctx.flushPendingRequests(); await tick();
  h.add('second'); h.ctx.flushPendingRequests(); await tick();
  assert.deepEqual(h.calls, ['first']);
  h.gates.shift().reject(new Error('failed gallery')); await tick();
  assert.deepEqual(h.calls, ['first', 'second']);
  h.gates.shift().resolve(); await tick();
  assert.equal(h.errors.length, 1);
});

test('generation changes discard stale queued entries without resetting the in-flight budget', async () => {
  const h = flushHarness(); h.add('old-active'); h.add('old-queued'); h.ctx.flushPendingRequests(); await tick();
  h.ctx.lrrScanGeneration++;
  const pool = h.ctx.runLrrCheckLimited; h.ctx.ensureLrrRequestPools();
  assert.equal(pool, h.ctx.runLrrCheckLimited);
  h.add('new'); h.ctx.flushPendingRequests(); await tick();
  assert.deepEqual(h.calls, ['old-active']);
  h.gates.shift().resolve(); await tick();
  assert.deepEqual(h.calls, ['old-active', 'new']);
  h.gates.shift().resolve(); await tick();
});

test('detached entries and disabled queued work do not issue gallery requests', async () => {
  const h = flushHarness(); h.add('active'); h.add('detached', { titleElement: { isConnected: false } }); h.add('disabled');
  h.ctx.flushPendingRequests(); await tick(); h.ctx.CONFIG.enableLrrChecker = false;
  h.gates.shift().resolve(); await tick();
  assert.deepEqual(h.calls, ['active']);
});
