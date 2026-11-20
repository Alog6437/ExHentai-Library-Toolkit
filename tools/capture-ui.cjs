// Run: NODE_PATH=/path/to/playwright/node_modules node tools/capture-ui.cjs
// Loads the actual userscript, not a replica. All network access is intercepted.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'docs/ui-preview');
const fixture = fs.readFileSync(path.join(__dirname, 'fixtures/gallery.html'), 'utf8');
const userscript = fs.readFileSync(path.join(root, 'ExHentai_Library_Toolkit.user.js'), 'utf8');
fs.mkdirSync(output, { recursive: true });

function installMocks(scriptVersion) {
  const store = { enableQuickFav: false, enableGlobalSearch: false, enableChineseHighlight: false, enableUncensoredLabel: false };
  window.__previewStore = store;
  window.__previewAborts = 0;
  window.__previewActive = 0;
  window.GM_info = { script: { version: scriptVersion } };
  window.GM_getValue = (key, fallback) => key in store ? store[key] : fallback;
  window.GM_setValue = (key, value) => { store[key] = value; };
  window.__previewMenus = [];
  window.GM_registerMenuCommand = (...args) => { window.__previewMenus.push(args[0]); };
  window.GM_xmlhttpRequest = options => {
    let aborted = false;
    const image = options.responseType === 'arraybuffer';
    if (image) window.__previewActive++;
    const timer = setTimeout(() => {
      if (aborted) return;
      if (image) window.__previewActive--;
      let responseText = '';
      if (options.url.includes('/api.php')) {
        responseText = JSON.stringify({ gmetadata: [{ gid: 12345, token: 'preview', filecount: '24', title: 'Weekend Sketchbook — Volume 01', title_jpn: '周末速写集 Vol.01', tags: [] }] });
      } else if (options.url.includes('/s/')) {
        const pageNumber = (options.url.match(/12345-(\d+)/) || [])[1] || '1';
        responseText = '<img id="img" src="https://toolkit-preview.invalid/mock-image.jpg"><a href="/fullimg.php?gid=12345&page=' + pageNumber + '">Download original</a>';
      } else if (options.url.includes('/g/')) responseText = document.documentElement.outerHTML;
      else if (options.url.includes('/api/info')) responseText = JSON.stringify({ version: '0.9.30', total_archives: 128 });
      const response = image ? new Uint8Array([255, 216, 255, 217]).buffer : responseText;
      if (image && options.onprogress) options.onprogress({ loaded: response.byteLength, total: response.byteLength, lengthComputable: true });
      options.onload({ status: 200, response, responseText, finalUrl: options.url, responseHeaders: image ? 'Content-Type: image/jpeg\r\nContent-Disposition: attachment; filename="Preview original ' + new URL(options.url).searchParams.get('page') + '.JPEG"' : 'Content-Type: application/json' });
    }, image ? 450 : 30);
    return { abort() { if (aborted) return; aborted = true; clearTimeout(timer); if (image) window.__previewActive--; window.__previewAborts++; if (options.onabort) options.onabort(); } };
  };
}

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const outbound = [];
    await page.route('**/*', route => {
      if (route.request().url() === 'https://toolkit-preview.invalid/g/12345/preview/') return route.fulfill({ contentType: 'text/html; charset=utf-8', body: fixture });
      outbound.push(route.request().url());
      return route.abort();
    });
    const scriptVersion = userscript.match(/^\/\/ @version\s+(\S+)/m)[1];
    await page.addInitScript(installMocks, scriptVersion);
    await page.goto('https://toolkit-preview.invalid/g/12345/preview/');
    await page.addScriptTag({ content: userscript });
    await page.locator('.eh-lrr-float-ball').waitFor();
    const launcher = page.locator('#eh-toolkit-launcher');
    const hostButtonStyle = await page.addStyleTag({ content: 'button { font-family:serif; line-height:40px; text-indent:8px; letter-spacing:4px; padding:9px; min-width:80px; margin:5px; text-align:left; }' });
    const alignment = await launcher.evaluate(node => {
      const box = node.getBoundingClientRect();
      const range = document.createRange(); range.selectNodeContents(node);
      const text = range.getBoundingClientRect();
      return { width: box.width, height: box.height, dx: (text.left + text.right - box.left - box.right) / 2, dy: (text.top + text.bottom - box.top - box.bottom) / 2 };
    });
    assert.equal(alignment.width, 34); assert.equal(alignment.height, 34);
    assert.ok(Math.abs(alignment.dx) <= 1 && Math.abs(alignment.dy) <= 1.5, `launcher text must be centered despite host CSS: ${JSON.stringify(alignment)}`);
    await hostButtonStyle.evaluate(node => node.remove());
    await launcher.screenshot({ path: path.join(output, 'launcher-icon.png') });
    const launcherBox = await launcher.boundingBox();
    assert.ok(launcherBox.x > 1300 && launcherBox.y >= 0 && launcherBox.y <= 20, 'launcher must be at top right');
    assert.equal(await page.locator('#cfg-galleryDlParallel').inputValue(), '5');
    await page.screenshot({ path: path.join(output, '01-collapsed-desktop.png') });
    assert.equal(await page.locator('.eh-lrr-float-ball').count(), 1);
    assert.equal(await page.locator('.eh-gdl-float-ball').count(), 1);
    await page.locator('.eh-lrr-float-ball').click();
    const shell = page.locator('#eh-toolkit-shell');
    await shell.waitFor({ state: 'visible' });
    assert.equal(await page.locator('#eh-gallerydl-panel .eh-tb-version').textContent(), 'v' + scriptVersion);
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('#eh-toolkit-header')).backgroundColor), await shell.evaluate(n => getComputedStyle(n).backgroundColor));
    await page.screenshot({ path: path.join(output, '02-download-desktop.png') });
    const box = await shell.boundingBox();
    assert.ok(box.y >= launcherBox.y + launcherBox.height && box.y <= 65, 'panel must open below launcher');
    assert.ok(box.width <= 360, `panel too wide: ${box.width}`);
    assert.ok(box.height <= 600, `panel too tall: ${box.height}`);
    await shell.screenshot({ path: path.join(output, 'download-panel.png') });
    await page.locator('[data-eh-tab="check"]').click();
    const syncButton = page.getByRole('button', { name: '立即同步', exact: true });
    assert.equal(await syncButton.count(), 1);
    const assertSingleLine = async () => {
      const lineCount = await syncButton.evaluate(node => {
        const range = document.createRange(); range.selectNodeContents(node);
        return range.getClientRects().length;
      });
      assert.equal(lineCount, 1, 'sync label must stay on one line');
    };
    await assertSingleLine();
    await shell.screenshot({ path: path.join(output, 'check-panel.png') });
    await page.locator('[data-eh-tab="settings"]').click();
    await shell.screenshot({ path: path.join(output, 'settings-panel.png') });
    assert.equal(await page.locator('#cfg-lrrApiKey').getAttribute('type'), 'password');
    await page.locator('#eh-toolkit-theme').selectOption('light');
    assert.equal(await shell.getAttribute('data-theme'), 'light');
    await page.locator('[data-eh-tab="download"]').click();
    await shell.screenshot({ path: path.join(output, 'download-panel-light.png') });
    await page.locator('[data-eh-tab="settings"]').click();
    await page.locator('#eh-toolkit-theme').selectOption('dark');
    await page.locator('[data-eh-tab="download"]').click();
    await page.locator('#eh-gdl-download').click();
    await page.waitForFunction(() => {
      const n = document.querySelector('#eh-gdl-progress');
      return n && parseInt(n.textContent, 10) > 0 && window.__previewActive > 0;
    });
    await page.getByRole('button', { name: '暂停', exact: true }).click();
    await page.getByRole('button', { name: '继续', exact: true }).waitFor();
    assert.ok(await page.evaluate(() => window.__previewAborts) > 0);
    const averageSpeed = page.locator('#eh-gdl-average-speed');
    await averageSpeed.waitFor({ state: 'visible' });
    assert.equal(await page.locator('#eh-gdl-speed').textContent(), '0 B/s');
    const pausedAverage = await averageSpeed.textContent();
    await page.waitForTimeout(1200); // Exercise a real periodic tick while paused.
    assert.equal(await averageSpeed.textContent(), pausedAverage, 'pause must freeze average speed');
    assert.equal(await page.locator('#eh-gdl-speed').textContent(), '0 B/s');
    await shell.screenshot({ path: path.join(output, 'paused-panel.png') });
    const savedPages = await page.locator('#eh-gdl-progress').textContent();
    await page.locator('#eh-toolkit-close').click();
    assert.equal(await shell.isVisible(), false);
    await page.locator('#eh-toolkit-launcher').click();
    assert.equal(await page.locator('#eh-gdl-progress').textContent(), savedPages);
    await page.getByRole('button', { name: '继续', exact: true }).click();
    await page.waitForFunction(previous => {
      const n = document.querySelector('#eh-gdl-progress');
      return n && parseInt(n.textContent, 10) > parseInt(previous, 10) && window.__previewActive > 0;
    }, savedPages);
    await page.getByRole('button', { name: '暂停', exact: true }).click();
    await page.getByRole('button', { name: '继续', exact: true }).waitFor();
    await page.getByRole('button', { name: '放弃并清理', exact: true }).click();
    await page.locator('.eh-gdl-task-controls').waitFor({ state: 'detached' });
    await page.setViewportSize({ width: 390, height: 760 });
    await page.waitForFunction(() => { const r = document.querySelector('#eh-toolkit-shell').getBoundingClientRect(); return r.left >= 0 && r.right <= 390 && r.top >= 0 && r.bottom <= 760; });
    const mobileBox = await shell.boundingBox();
    assert.ok(mobileBox.x >= 0 && mobileBox.x + mobileBox.width <= 390);
    assert.ok(mobileBox.y >= 0 && mobileBox.y + mobileBox.height <= 760);
    await page.screenshot({ path: path.join(output, '03-mobile.png') });
    await page.locator('[data-eh-tab="check"]').click();
    await assertSingleLine();
    await page.locator('[data-eh-tab="download"]').click();
    await page.setViewportSize({ width: 390, height: 360 });
    await page.waitForFunction(() => { const r = document.querySelector('#eh-toolkit-shell').getBoundingClientRect(); return r.top >= 50 && r.bottom <= 360; });
    const shortBox = await shell.boundingBox();
    assert.ok(shortBox.y >= 50 && shortBox.y + shortBox.height <= 360, 'short viewport panel must fit below top-right launcher');
    await page.setViewportSize({ width: 390, height: 760 });
    // The watchdog must recreate removed UI, without creating duplicate launchers.
    await page.evaluate(() => document.querySelector('#eh-toolkit-shell').remove());
    await page.locator('#eh-toolkit-shell').waitFor({ state: 'attached' });
    assert.equal(await page.locator('.eh-lrr-float-ball').count(), 1);
    assert.deepEqual(await page.evaluate(() => window.__previewMenus), [], 'no extension menu commands should be registered');
    assert.equal(errors.length, 0, errors.join('\n'));
    assert.deepEqual(outbound, []);
    fs.writeFileSync(path.join(output, 'verification.json'), JSON.stringify({ desktop: box, mobile: mobileBox, browserErrors: errors, externalNetworkRequests: outbound, checks: ['real userscript initialization', 'top-right launcher and downward panel', 'new configuration concurrency 5', 'short viewport containment', 'single launcher', 'three tabs', 'compact desktop panel', 'dark and light themes', 'masked API key', 'download pause abort', 'separate current and average speeds', 'pause freezes average across periodic tick', 'single-line sync label desktop and mobile', 'collapse preserves task', 'download resumes with saved progress', 'discard cleanup', 'mobile viewport containment', 'removed UI recovery'] }, null, 2));
    console.log('UI browser checks passed; screenshots:', output);
    await context.close();
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
