const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../ExHentai_Library_Toolkit.user.js'), 'utf8');

// 重扫进度轮询：LANraragi 没有进度接口，脚本用 /api/info 的归档数做启发式判断。
function loadProgress(globals = {}) {
  const context = vm.createContext(Object.assign({
    t: (zh, en) => zh,
    CONFIG: { lrrServerUrl: 'http://lrr.test' },
  }, globals));
  const start = source.indexOf('    var lrrRescanPollTimer = null;');
  const end = source.indexOf('    async function triggerLrrContentRescan(', start);
  assert.ok(start >= 0 && end > start);
  vm.runInContext(source.slice(start, end), context);
  return context;
}

function harness(totals, options = {}) {
  const statuses = [];
  const cleared = [];
  let tick = null;
  let index = 0;
  let clock = 1_000_000;
  const box = { isConnected: options.connected !== false };
  const ctx = loadProgress({
    Date: { now: () => clock },
    setInterval: fn => { tick = fn; return 1; },
    clearInterval: id => cleared.push(id),
    updateLrrStatus: (target, state, message, detail) => statuses.push({ state, message, detail }),
    fetchLrrServerInfo: async () => {
      if (options.failures) throw new Error('network down');
      const total = totals[Math.min(index++, totals.length - 1)];
      return { total_archives: total };
    },
  });
  return {
    ctx,
    box,
    statuses,
    cleared,
    get tick() { return tick; },
    advance: seconds => { clock += seconds * 1000; },
  };
}

test('progress polling reports completion once the archive count settles', async () => {
  const h = harness([100, 100, 100, 100]);
  h.ctx.watchLrrRescanProgress(h.box);

  for (let i = 0; i < 3; i++) { h.advance(5); await h.tick(); }
  // 15 秒、归档数未变 2 次：仍在索引，不能提前宣布完成。
  assert.equal(h.statuses.at(-1).state, 'checking');
  assert.match(h.statuses.at(-1).message, /正在重扫/);
  assert.equal(h.cleared.length, 0);

  h.advance(5);
  await h.tick();
  assert.equal(h.cleared.length, 1);
  assert.equal(h.statuses.at(-1).state, 'online');
  assert.match(h.statuses.at(-1).message, /重扫已完成/);
  assert.match(h.statuses.at(-1).detail, /100/);
});

test('progress polling keeps showing new archive counts while the index grows', async () => {
  const h = harness([100, 120, 260, 300, 300, 300, 300]);
  h.ctx.watchLrrRescanProgress(h.box);

  for (let i = 0; i < 4; i++) { h.advance(5); await h.tick(); }
  assert.equal(h.cleared.length, 0, '归档数仍在变化时不能判定完成');
  assert.match(h.statuses.at(-1).detail, /300/);

  for (let i = 0; i < 3; i++) { h.advance(5); await h.tick(); }
  assert.equal(h.cleared.length, 1);
  assert.match(h.statuses.at(-1).message, /重扫已完成/);
});

test('progress polling gives up after five minutes instead of polling forever', async () => {
  const h = harness([100]);
  h.ctx.watchLrrRescanProgress(h.box);
  h.advance(301);
  await h.tick();

  assert.equal(h.cleared.length, 1);
  assert.match(h.statuses.at(-1).message, /仍在后台进行/);
});

test('progress polling stops quietly when the panel is gone or the server keeps failing', async () => {
  const disconnected = harness([100], { connected: false });
  disconnected.ctx.watchLrrRescanProgress(disconnected.box);
  await disconnected.tick();
  assert.equal(disconnected.cleared.length, 1);
  assert.equal(disconnected.statuses.length, 0);

  const failing = harness([100], { failures: true });
  failing.ctx.watchLrrRescanProgress(failing.box);
  for (let i = 0; i < 3; i++) { failing.advance(3); await failing.tick(); }
  assert.equal(failing.cleared.length, 1, '连续三次取不到 /api/info 就停止轮询');
  assert.equal(failing.statuses.length, 0);
});

test('a new rescan trigger cancels the previous progress timer', async () => {
  const h = harness([100, 100, 100, 100]);
  h.ctx.watchLrrRescanProgress(h.box);
  h.ctx.watchLrrRescanProgress(h.box);
  assert.equal(h.cleared.length, 1, '重复触发时应先清掉上一个定时器');
});
