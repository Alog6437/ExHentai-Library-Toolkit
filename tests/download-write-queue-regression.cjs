const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
async function tick() { for (let i = 0; i < 40; i++) await Promise.resolve(); }
function setup(options = {}) {
  const source = fs.readFileSync(path.join(__dirname, '../ExHentai_Library_Toolkit.user.js'), 'utf8');
  const ctx = vm.createContext({ console, Date, Set, Promise, recordRuntimeLog() {} });
  const start = source.indexOf('    function createGalleryDownloadTask(');
  const end = source.indexOf('    function galleryRawRequest(', start);
  assert.ok(start >= 0 && end > start);
  vm.runInContext(source.slice(start, end), ctx);
  // The write queue may live outside the request helpers block.
  if (!ctx.createGalleryWriteQueue) {
    const q = source.indexOf('    function createGalleryWriteQueue(');
    assert.ok(q >= 0, 'missing write queue helper');
    const next = source.indexOf('\n    function ', q + 10);
    assert.ok(next > q, 'write queue helper needs a clear function boundary');
    vm.runInContext(source.slice(q, next), ctx);
  }
  const task = ctx.createGalleryDownloadTask();
  const queue = ctx.createGalleryWriteQueue(task, options);
  return { task, queue };
}

test('admission returns before disk completion, but drain waits and writes are serialized', async () => {
  const { queue } = setup({ maxItems: 3, maxBytes: 100 });
  const gate = deferred(), writes = [];
  await queue.enqueue(10, async () => { writes.push('first-start'); await gate.promise; writes.push('first-end'); });
  await queue.enqueue(10, async () => { writes.push('second'); });
  assert.deepEqual(writes, ['first-start']);
  let drained = false;
  const drain = queue.drain().then(() => { drained = true; });
  await tick(); assert.equal(drained, false);
  gate.resolve(); await drain;
  assert.deepEqual(writes, ['first-start', 'first-end', 'second']);
  assert.equal(queue.getStats().pendingItems, 0);
  assert.equal(queue.getStats().pendingBytes, 0);
  queue.dispose();
});

test('item backpressure includes active write and releases a blocked producer', async () => {
  const { queue } = setup({ maxItems: 1, maxBytes: 100 });
  const gate = deferred();
  await queue.enqueue(10, () => gate.promise);
  let admitted = false;
  const second = queue.enqueue(10, async () => {}).then(() => { admitted = true; });
  await tick(); assert.equal(admitted, false);
  assert.equal(queue.getStats().pendingItems, 1);
  gate.resolve(); await second; await queue.drain();
  assert.equal(queue.getStats().peakItems, 1);
  queue.dispose();
});

test('byte budget blocks producers independently of the item limit', async () => {
  const { queue } = setup({ maxItems: 10, maxBytes: 10 });
  const gate = deferred();
  await queue.enqueue(7, () => gate.promise);
  let admitted = false;
  const second = queue.enqueue(7, async () => {}).then(() => { admitted = true; });
  await tick(); assert.equal(admitted, false);
  assert.equal(queue.getStats().pendingBytes, 7);
  gate.resolve(); await second; await queue.drain();
  assert.ok(queue.getStats().peakBytes <= 10);
  queue.dispose();
});

test('oversized image is admitted alone rather than deadlocking the queue', async () => {
  const { queue } = setup({ maxItems: 10, maxBytes: 10 });
  const gate = deferred();
  await queue.enqueue(20, () => gate.promise);
  let admitted = false;
  const second = queue.enqueue(1, async () => {}).then(() => { admitted = true; });
  await tick(); assert.equal(admitted, false);
  assert.equal(queue.getStats().pendingItems, 1);
  assert.equal(queue.getStats().pendingBytes, 20);
  gate.resolve(); await second; await queue.drain();
  queue.dispose();
});

test('pause keeps admitted work and resume drains it exactly once', async () => {
  const { queue, task } = setup({ maxItems: 3, maxBytes: 100 });
  task.pause();
  let writes = 0;
  const producer = queue.enqueue(3, async () => { writes++; });
  await tick(); assert.equal(writes, 0);
  task.resume(); await producer; await queue.drain();
  assert.equal(writes, 1);
  queue.dispose();
});

test('stop rejects blocked admission and waits for active disk IO before drain rejects', async () => {
  const { queue, task } = setup({ maxItems: 1, maxBytes: 10 });
  const gate = deferred();
  await queue.enqueue(1, () => gate.promise);
  const waiting = queue.enqueue(1, async () => assert.fail('must not write after stop'));
  const rejected = assert.rejects(waiting, /cancel-test/);
  task.stop(new Error('cancel-test'));
  await rejected;
  let drained = false;
  const drain = assert.rejects(queue.drain(), /cancel-test/).then(() => { drained = true; });
  await tick(); assert.equal(drained, false);
  gate.resolve(); await drain;
  assert.equal(queue.getStats().pendingBytes, 0);
  queue.dispose();
});

test('disk failure stops task, rejects backpressure, discards pending writes and is fully handled', async () => {
  let error;
  const { queue, task } = setup({ maxItems: 2, maxBytes: 10, onError: e => { error = e; } });
  const gate = deferred();
  await queue.enqueue(1, async () => { await gate.promise; throw new Error('quota exceeded'); });
  await queue.enqueue(1, async () => assert.fail('queued write must be discarded'));
  const waiting = assert.rejects(queue.enqueue(1, async () => assert.fail('must not admit')), /quota exceeded/);
  const drain = assert.rejects(queue.drain(), /quota exceeded/);
  gate.resolve(); await waiting; await drain;
  assert.equal(task.stopped, true);
  assert.equal(error.galleryCode, 'zip-write-failed');
  assert.equal(queue.getStats().pendingItems, 0);
  assert.equal(queue.getStats().pendingBytes, 0);
  queue.dispose();
});
