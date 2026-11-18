const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'ExHentai_Library_Toolkit.user.js'), 'utf8');
function load() {
  const start = source.indexOf('    function normalizeToolkitPosition(');
  const end = source.indexOf('\n    function ', source.indexOf('    function computeToolkitLayout(', start) + 10);
  assert.ok(start >= 0 && end > start, 'position helpers must be extractable');
  const ctx = vm.createContext({});
  vm.runInContext(source.slice(start, end), ctx);
  return ctx;
}
function plain(value) { return JSON.parse(JSON.stringify(value)); }
function contained(layout, viewport) {
  const epsilon = 0.01;
  assert.ok(layout.x >= viewport.left - epsilon && layout.y >= viewport.top - epsilon);
  assert.ok(layout.x + 34 <= viewport.left + viewport.width + epsilon);
  assert.ok(layout.y + 34 <= viewport.top + viewport.height + epsilon);
  assert.ok(layout.panelX >= viewport.left - epsilon && layout.panelY >= viewport.top - epsilon);
  assert.ok(layout.panelX + layout.panelWidth <= viewport.left + viewport.width + epsilon);
  assert.ok(layout.panelY + layout.panelMaxHeight <= viewport.top + viewport.height + epsilon);
  assert.ok(layout.panelWidth > 0 && layout.panelMaxHeight > 0);
}
test('saved launcher coordinates accept only finite versioned ratios', () => {
  const ctx = load();
  assert.deepEqual(plain(ctx.normalizeToolkitPosition({ version: 1, xRatio: 0.25, yRatio: 0.75 })), { version: 1, xRatio: 0.25, yRatio: 0.75 });
  for (const value of [null, {}, 'bad', { version: 2, xRatio: 0, yRatio: 0 }, { version: 1, xRatio: '0', yRatio: 0 }, { version: 1, xRatio: NaN, yRatio: 0 }, { version: 1, xRatio: Infinity, yRatio: 0 }, { version: 1, xRatio: -0.1, yRatio: 0 }, { version: 1, xRatio: 0, yRatio: 1.1 }]) assert.equal(ctx.normalizeToolkitPosition(value), null);
});
test('no saved location defaults to top-right and opens a compact panel below', () => {
  const ctx = load(), viewport = { left: 0, top: 0, width: 1440, height: 900 };
  const result = ctx.computeToolkitLayout(viewport, null, 444);
  assert.equal(result.x, 1390); assert.equal(result.y, 16);
  assert.equal(result.panelWidth, 340);
  assert.ok(result.panelY >= result.y + 34);
  contained(result, viewport);
});
test('saved corners and center remain visible on desktop, narrow, short and offset viewports', () => {
  const ctx = load();
  for (const viewport of [{ left: 0, top: 0, width: 1440, height: 900 }, { left: 0, top: 0, width: 390, height: 360 }, { left: 0, top: 0, width: 280, height: 300 }, { left: 80, top: 120, width: 240, height: 220 }]) {
    for (const xRatio of [0, 0.5, 1]) for (const yRatio of [0, 0.5, 1]) contained(ctx.computeToolkitLayout(viewport, { version: 1, xRatio, yRatio }, 560), viewport);
  }
});
test('position writes stay ordered and recover after storage failures', async () => {
  const start = source.indexOf('    function persistToolkitPosition(');
  const end = source.indexOf('    function resetToolkitPosition(', start);
  const writes = [], errors = [];
  let release;
  const first = new Promise((resolve, reject) => { release = () => reject(new Error('storage unavailable')); });
  const ctx = vm.createContext({ toolkitPosition: { version: 1, xRatio: 0.2, yRatio: 0.3 }, toolkitPositionWriteChain: Promise.resolve(),
    gmSet: (key, value) => { writes.push({ key, value: plain(value) }); return writes.length === 1 ? first : Promise.resolve(); },
    recordRuntimeLog: (...args) => errors.push(args),
  });
  vm.runInContext(source.slice(start, end), ctx);
  const one = ctx.persistToolkitPosition();
  ctx.toolkitPosition = null;
  const two = ctx.persistToolkitPosition();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(writes.length, 1, 'reset must wait for pending older write');
  release(); await one; await two;
  assert.deepEqual(writes, [{ key: 'ehToolkitPosition', value: { version: 1, xRatio: 0.2, yRatio: 0.3 } }, { key: 'ehToolkitPosition', value: null }]);
  assert.equal(errors.length, 1);
});

test('bottom docking opens above the launcher instead of overflowing the screen', () => {
  const ctx = load(), viewport = { left: 0, top: 0, width: 1440, height: 900 };
  const result = ctx.computeToolkitLayout(viewport, { version: 1, xRatio: 0.1, yRatio: 1 }, 444);
  assert.ok(result.panelY + Math.min(444, result.panelMaxHeight) <= result.y);
  contained(result, viewport);
});
