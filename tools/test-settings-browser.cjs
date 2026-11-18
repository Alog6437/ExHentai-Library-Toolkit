// Full userscript settings lifecycle; GM storage stays outside the page in this test.
// NODE_PATH=/path/to/playwright/node_modules node tools/test-settings-browser.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const script = fs.readFileSync(path.join(root, 'ExHentai_Library_Toolkit.user.js'), 'utf8');
const fixture = fs.readFileSync(path.join(__dirname, 'fixtures/gallery.html'), 'utf8');
const initialKey = 'private-stored-test-key', replacement = 'replacement-test-key';
const store = { lrrApiKey: initialKey, lrrServerUrl: 'https://lrr.invalid', enableLrrChecker: false, enableQuickFav: false, enableGlobalSearch: false, enableChineseHighlight: false, enableUncensoredLabel: false };
let failCredentialWrite = false, failOtherWrite = false;
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    const errors = [], network = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', route => {
      if (route.request().url() === 'https://toolkit-preview.invalid/g/12345/preview/') return route.fulfill({ contentType: 'text/html; charset=utf-8', body: fixture });
      network.push(route.request().url()); return route.abort();
    });
    await page.exposeFunction('__getStored', (key, fallback) => key in store ? store[key] : fallback);
    await page.exposeFunction('__setStored', (key, value) => {
      if (key === 'lrrApiKey' && failCredentialWrite) throw new Error('simulated credential storage failure: ' + value);
      if (key === 'lrrServerUrl' && failOtherWrite) throw new Error('simulated unrelated settings failure');
      store[key] = value;
    });
    await page.addInitScript(version => {
      window.GM_getValue = (key, fallback) => window.__getStored(key, fallback);
      window.GM_setValue = (key, value) => window.__setStored(key, value);
      window.GM_info = { script: { version } };
      window.GM_xmlhttpRequest = () => { throw new Error('Unexpected network request in disabled-checker test'); };
    }, script.match(/^\/\/ @version\s+(\S+)/m)[1]);
    await page.addInitScript({ content: script });
    await page.goto('https://toolkit-preview.invalid/g/12345/preview/');
    async function openSettings() {
      await page.locator('#eh-toolkit-launcher').click();
      await page.locator('[data-eh-tab="settings"]').click();
      await page.locator('#cfg-lrrApiKey').evaluate(node => { let p = node.parentElement; while (p) { if (p.tagName === 'DETAILS') p.open = true; p = p.parentElement; } });
    }
    const keyInput = page.locator('#cfg-lrrApiKey');
    async function assertSecretNotRefilled(secret) {
      assert.equal(await keyInput.inputValue(), '');
      assert.equal(await page.locator('html').evaluate((node, value) => node.outerHTML.includes(value), secret), false);
    }
    async function save(expectSuccess = true) {
      const handled = page.waitForEvent('dialog').then(async dialog => {
        if (expectSuccess) {
          assert.match(dialog.message(), /已保存/);
          const reloaded = page.waitForEvent('domcontentloaded');
          await dialog.accept(); await reloaded; await openSettings();
        } else {
          assert.match(dialog.message(), /失败/); await dialog.accept();
        }
      });
      await Promise.all([handled, page.locator('#eh-tb-save').click()]);
    }
    await openSettings();
    await assertSecretNotRefilled(initialKey);
    assert.match(await page.locator('#eh-tb-api-key-status').textContent(), /已配置/);
    await save(); // Saving unrelated settings must not delete the existing key.
    assert.equal(store.lrrApiKey, initialKey); await assertSecretNotRefilled(initialKey);
    await keyInput.fill('  ' + replacement + '  '); await save();
    assert.equal(store.lrrApiKey, replacement); await assertSecretNotRefilled(replacement);
    failCredentialWrite = true;
    await keyInput.fill('failed-new-secret'); await save(false);
    assert.equal(store.lrrApiKey, replacement); assert.equal(await keyInput.inputValue(), '');
    assert.match(await page.locator('#eh-tb-api-key-status').textContent(), /未确认/);
    failCredentialWrite = false; failOtherWrite = true;
    await keyInput.fill('partially-saved-test-key'); await save(false);
    assert.equal(store.lrrApiKey, 'partially-saved-test-key');
    assert.match(await page.locator('#eh-tb-api-key-status').textContent(), /已配置/);
    await assertSecretNotRefilled('partially-saved-test-key');
    failOtherWrite = false;
    await page.locator('#cfg-clearLrrApiKey').check(); await save();
    assert.equal(store.lrrApiKey, ''); await assertSecretNotRefilled(replacement);
    assert.match(await page.locator('#eh-tb-api-key-status').textContent(), /未配置/);
    assert.deepEqual(errors, []); assert.deepEqual(network, []);
    console.log('Settings browser checks passed: no saved-key DOM refill, blank preserves key, trimmed replacement, explicit deletion, failure preserves stored credential and clears input.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
