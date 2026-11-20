const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'ExHentai_Library_Toolkit.user.js'), 'utf8');
function load() {
  const start = source.indexOf('    function normalizeToolkitPosition(');
  const end = source.indexOf('    function getToolkitViewport(', start);
  const ctx = vm.createContext({}); vm.runInContext(source.slice(start, end), ctx); return ctx;
}
test('natural panel heights above 560px grow without the old fixed cap', () => {
  const c = load(), viewport = { left: 0, top: 0, width: 1440, height: 1200 };
  for (const height of [404, 600, 800, 1000]) {
    const layout = c.computeToolkitLayout(viewport, null, height);
    assert.equal(layout.panelMaxHeight, height);
    assert.equal(layout.placement, 'below');
    assert.ok(layout.panelY + height <= 1200);
  }
});
test('tall content only falls back to screen bounds, including bottom docking', () => {
  const c = load(), viewport = { left: 0, top: 0, width: 390, height: 760 };
  for (const yRatio of [0, 0.5, 1]) {
    const layout = c.computeToolkitLayout(viewport, { version: 1, xRatio: 1, yRatio }, 1800);
    assert.ok(layout.panelMaxHeight > 0 && layout.panelMaxHeight < 1800);
    assert.ok(layout.panelY >= 0 && layout.panelY + layout.panelMaxHeight <= 760);
  }
});
