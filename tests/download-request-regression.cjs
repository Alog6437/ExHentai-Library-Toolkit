const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

function harness() {
  const source = fs.readFileSync(path.join(__dirname, '../ExHentai_Library_Toolkit.user.js'), 'utf8');
  const start = source.indexOf('    function createGalleryDownloadTask(');
  const end = source.indexOf('    function galleryTextRequest(', start);
  assert.ok(start >= 0 && end > start);
  const timers = new Map(), requests = [];
  let serial = 0, aborts = 0;
  const ctx = vm.createContext({
    recordRuntimeLog: () => {},
    setTimeout(fn, ms) { const id = ++serial; timers.set(id, { fn, ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
    GM_xmlhttpRequest(options) {
      requests.push(options);
      return { abort() { aborts++; options.onabort(); } };
    },
  });
  vm.runInContext(source.slice(start, end), ctx);
  return { ctx, timers, requests, get aborts() { return aborts; } };
}
const tick = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

test('stalled requests abort at 60 seconds, ignore late load and release task handles', async () => {
  const h = harness(), task = h.ctx.createGalleryDownloadTask();
  const pending = h.ctx.galleryRawRequest({ url: 'https://image.test/a', task });
  const rejected = assert.rejects(pending, /60s without new response bytes/);
  assert.equal(task.requests.size, 1);
  const timer = [...h.timers.values()][0];
  assert.equal(timer.ms, 60000);
  timer.fn();
  h.requests[0].onload({ status: 200, response: 'late bytes' });
  await rejected;
  assert.equal(h.aborts, 1);
  assert.equal(task.requests.size, 0);
  assert.equal(h.timers.size, 0);
});

test('only new bytes reset the stall deadline', async () => {
  const h = harness();
  const pending = h.ctx.galleryRawRequest({ url: 'https://image.test/a' });
  const initial = [...h.timers.keys()][0];
  h.requests[0].onprogress({ loaded: 10 });
  const next = [...h.timers.keys()][0];
  assert.notEqual(initial, next);
  h.requests[0].onprogress({ loaded: 10 });
  assert.equal([...h.timers.keys()][0], next);
  h.requests[0].onload({ status: 200 });
  await pending;
  assert.equal(h.timers.size, 0);
});

test('pause aborts the active attempt and resume reissues it without accepting late callbacks', async () => {
  const h = harness(), task = h.ctx.createGalleryDownloadTask();
  let starts = 0;
  const pending = h.ctx.galleryTaskRequest(task, { url: 'https://image.test/a', onstart() { starts++; } });
  await tick();
  assert.equal(starts, 1);
  assert.equal(h.requests.length, 1);
  task.pause();
  await tick();
  assert.equal(h.aborts, 1);
  assert.equal(h.requests.length, 1);
  h.requests[0].onload({ status: 200, responseText: 'stale' });
  task.resume();
  await tick();
  assert.equal(h.requests.length, 2);
  assert.equal(starts, 2, 'each transparent retry resets its byte accounting');
  h.requests[1].onload({ status: 200, responseText: 'fresh' });
  assert.equal((await pending).responseText, 'fresh');
  assert.equal(task.requests.size, 0);
});

test('stopping a paused task wakes its waiters without issuing another request', async () => {
  const h = harness(), task = h.ctx.createGalleryDownloadTask();
  task.pause();
  const pending = h.ctx.galleryTaskRequest(task, { url: 'https://image.test/a' });
  const rejected = assert.rejects(pending, /discarded/);
  await tick();
  task.stop(new Error('discarded'));
  await rejected;
  assert.equal(h.requests.length, 0);
  assert.equal(task.waiters.length, 0);
});

test('stopping a task aborts every active request exactly once', async () => {
  const h = harness(), task = h.ctx.createGalleryDownloadTask();
  const pending = [1, 2, 3].map(n => h.ctx.galleryRawRequest({ url: `https://image.test/${n}`, task }));
  const rejected = pending.map(p => assert.rejects(p, /storage failed/));
  task.stop(new Error('storage failed'));
  await Promise.all(rejected);
  assert.equal(h.aborts, 3);
  assert.equal(task.requests.size, 0);
  assert.equal(h.timers.size, 0);
});

test('synchronous transport failures clear timers and registered cancellation callbacks', async () => {
  const h = harness(), task = h.ctx.createGalleryDownloadTask();
  h.ctx.GM_xmlhttpRequest = () => { throw new Error('transport unavailable'); };
  await assert.rejects(h.ctx.galleryRawRequest({ url: 'https://image.test/a', task }), /transport unavailable/);
  assert.equal(task.requests.size, 0);
  assert.equal(h.timers.size, 0);
});
