// Actual userscript; safe fixture and external GM persistence, with no real site access.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'ExHentai_Library_Toolkit.user.js'), 'utf8');
const fixture = fs.readFileSync(path.join(__dirname, 'fixtures/gallery.html'), 'utf8');
const version = source.match(/^\/\/ @version\s+(\S+)/m)[1];
const output = path.join(root, 'docs/ui-preview');
const positionKey = 'ehToolkitPosition';
const store = { enableQuickFav: false, enableGlobalSearch: false, enableChineseHighlight: false, enableUncensoredLabel: false };
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const errors = [], outbound = [];
  async function createPage({ delayedPosition = false } = {}) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    let releasePosition;
    const stalePosition = store[positionKey];
    await page.exposeFunction('__getStoredValue', (key, fallback) => {
      if (delayedPosition && key === positionKey) return new Promise(resolve => { releasePosition = () => resolve(stalePosition); });
      return key in store ? store[key] : fallback;
    });
    await page.exposeFunction('__setStoredValue', (key, value) => { store[key] = value; });
    await page.addInitScript(({ version }) => {
      window.GM_info = { script: { version } };
      window.GM_getValue = (key, fallback) => window.__getStoredValue(key, fallback);
      window.GM_setValue = (key, value) => window.__setStoredValue(key, value).then(() => { if (key === 'ehToolkitPosition') window.__positionWriteDone = true; });
      window.GM_xmlhttpRequest = () => ({ abort() {} });
    }, { version });
    await page.route('**/*', route => {
      if (route.request().url() === 'https://toolkit-preview.invalid/g/12345/preview/') return route.fulfill({ contentType: 'text/html; charset=utf-8', body: fixture });
      outbound.push(route.request().url()); return route.abort();
    });
    async function boot() {
      await page.goto('https://toolkit-preview.invalid/g/12345/preview/');
      await page.addScriptTag({ content: source });
      await page.locator('#eh-toolkit-launcher').waitFor();
    }
    await boot();
    return { context, page, boot, release: () => { assert.ok(releasePosition, 'position read must have started'); releasePosition(); } };
  }
  async function drag(page, x, y, { touch = false, cancel = false } = {}) {
    const launcher = page.locator('#eh-toolkit-launcher'), box = await launcher.boundingBox();
    if (touch) {
      await launcher.dispatchEvent('pointerdown', { pointerId: 9, pointerType: 'touch', isPrimary: true, button: 0, buttons: 1, clientX: box.x + 17, clientY: box.y + 17 });
      await launcher.dispatchEvent('pointermove', { pointerId: 9, pointerType: 'touch', isPrimary: true, button: 0, buttons: 1, clientX: x, clientY: y });
      await launcher.dispatchEvent(cancel ? 'pointercancel' : 'pointerup', { pointerId: 9, pointerType: 'touch', isPrimary: true, button: 0, buttons: 0, clientX: x, clientY: y });
    } else {
      await page.mouse.move(box.x + 17, box.y + 17); await page.mouse.down();
      await page.mouse.move(x, y, { steps: 8 }); await page.mouse.up();
    }
  }
  async function visibleBounds(page) {
    const viewport = page.viewportSize();
    for (const selector of ['#eh-toolkit-launcher', '#eh-toolkit-shell']) {
      const node = page.locator(selector);
      if (!await node.isVisible()) continue;
      const box = await node.boundingBox();
      assert.ok(box.x >= -1 && box.y >= -1 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1, `${selector} outside ${JSON.stringify(viewport)}: ${JSON.stringify(box)}`);
    }
  }
  async function waitForStored(page) {
    await page.waitForFunction(() => window.__positionWriteDone === true);
    assert.ok(store[positionKey]);
  }
  try {
    let h = await createPage(), page = h.page;
    let box = await page.locator('#eh-toolkit-launcher').boundingBox();
    assert.ok(box.x > 1300 && box.y === 16, 'unconfigured default is top-right');
    await page.mouse.move(box.x + 17, box.y + 17); await page.mouse.down();
    await page.mouse.move(box.x + 19, box.y + 18); await page.mouse.up();
    assert.equal(await page.locator('#eh-toolkit-shell').isVisible(), true, 'tiny click jitter is not a drag');
    assert.equal(store[positionKey], undefined, 'ordinary click does not save a dragged position');
    await page.locator('#eh-toolkit-launcher').click();
    await drag(page, 170, 830); await waitForStored(page);
    assert.equal(await page.locator('#eh-toolkit-shell').isVisible(), false, 'drag must not toggle the panel');
    const saved = JSON.parse(JSON.stringify(store[positionKey]));
    box = await page.locator('#eh-toolkit-launcher').boundingBox();
    assert.ok(Math.abs(box.x + 17 - 170) < 3 && Math.abs(box.y + 17 - 830) < 3);
    await page.locator('#eh-toolkit-launcher').click();
    const shellBox = await page.locator('#eh-toolkit-shell').boundingBox();
    assert.ok(shellBox.y + shellBox.height <= box.y, 'bottom-positioned launcher opens panel above');
    await visibleBounds(page);
    await page.screenshot({ path: path.join(output, 'dragged-desktop.png') });
    await h.context.close();
    h = await createPage(); page = h.page;
    await page.waitForFunction(() => document.querySelector('#eh-toolkit-launcher').getBoundingClientRect().left < 500);
    assert.deepEqual(store[positionKey], saved, 'reopening loads GM position without rewriting it');
    await page.locator('#eh-toolkit-launcher').click();
    await page.setViewportSize({ width: 280, height: 300 }); await visibleBounds(page);
    await drag(page, 140, 150);
    assert.equal(await page.locator('#eh-toolkit-shell').isVisible(), true, 'dragging an open panel never closes it');
    await visibleBounds(page);
    await page.screenshot({ path: path.join(output, 'dragged-mobile.png') });
    // Reattach the same launcher, not an unbound duplicate, after host DOM replacement.
    await page.evaluate(() => document.querySelector('#eh-toolkit-launcher').remove());
    await page.locator('#eh-toolkit-launcher').waitFor();
    await visibleBounds(page);
    await drag(page, 240, 50, { touch: true, cancel: true }); await visibleBounds(page);
    assert.equal(await page.locator('#eh-toolkit-shell').isVisible(), true);
    await page.locator('#eh-toolkit-launcher').focus(); await page.keyboard.press('Enter');
    assert.equal(await page.locator('#eh-toolkit-shell').isVisible(), false, 'keyboard click works after pointer cancellation');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#eh-toolkit-shell').isVisible(), true);
    await page.locator('[data-eh-tab="settings"]').click();
    await page.locator('#eh-tb-reset-position').click();
    await page.waitForFunction(() => Math.abs(document.querySelector('#eh-toolkit-launcher').getBoundingClientRect().top - 16) < 1);
    await visibleBounds(page);
    await h.context.close();
    store[positionKey] = { version: 1, xRatio: 0, yRatio: 1 };
    h = await createPage({ delayedPosition: true }); page = h.page;
    await drag(page, 650, 280);
    const latest = await page.locator('#eh-toolkit-launcher').boundingBox();
    h.release();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    box = await page.locator('#eh-toolkit-launcher').boundingBox();
    assert.ok(Math.abs(box.x - latest.x) < 1 && Math.abs(box.y - latest.y) < 1, 'late persisted read must not override user drag');
    await h.context.close();
    assert.deepEqual(errors, []); assert.deepEqual(outbound, []);
    console.log('Position browser checks passed: default top-right, mouse/touch drag, no accidental toggle, persistent reopening, above/below panel, narrow resize, DOM reattach, reset and late-read race.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
