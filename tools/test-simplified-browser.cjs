// Full userscript regression for the simplified UI and explicitly retained highlights.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'ExHentai_Library_Toolkit.user.js'), 'utf8');
const fixture = fs.readFileSync(path.join(__dirname, 'fixtures/gallery.html'), 'utf8');
const version = source.match(/^\/\/ @version\s+(\S+)/m)[1];
const rows = '<div id="nb"><input id="native-search" placeholder="Native search"></div><div id="gdf" onclick="return false"><a id="favoritelink">Native favorite</a></div><section class="itg">' +
  '<div class="gl1t" data-case="chinese"><div class="gl4t glname"><a href="https://e-hentai.org/g/101/aaaa/">示例速写集 [汉化]</a></div><div id="posted_101" onclick="return false">Native favorites</div></div>' +
  '<div class="gl1t" data-case="english"><div class="gl4t glname"><a href="https://e-hentai.org/g/102/bbbb/">Sample Sketches [English]</a></div></div>' +
  '<div class="gl1t" data-case="plain"><div class="gl4t glname"><a href="https://e-hentai.org/g/103/cccc/">Plain Sketches</a></div></div></section>';
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [], outbound = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      if (route.request().url() === 'https://toolkit-preview.invalid/g/12345/preview/') return route.fulfill({ contentType: 'text/html; charset=utf-8', body: fixture.replace('</body>', rows + '</body>') });
      outbound.push(route.request().url()); return route.abort();
    });
    await page.addInitScript(({ version }) => {
      const store = { enableLrrChecker: false, enableQuickFav: true, enableGlobalSearch: true, defaultFavcat: 9, enableChineseHighlight: true, enableUncensoredLabel: true, uiLanguage: 'zh' };
      window.GM_info = { script: { version } };
      window.GM_getValue = (key, fallback) => key in store ? store[key] : fallback;
      window.GM_setValue = (key, value) => { store[key] = value; };
      window.GM_xmlhttpRequest = options => {
        const request = JSON.parse(options.data || '{}');
        const response = { gmetadata: (request.gidlist || [[12345, 'preview']]).map(([gid, token]) => ({ gid, token, title: 'Safe Preview', title_jpn: '安全预览', filecount: '24', tags: gid === 101 || gid === 104 ? ['misc:uncensored'] : [] })) };
        const timer = setTimeout(() => options.onload({ status: 200, responseText: JSON.stringify(response) }), 15);
        return { abort() { clearTimeout(timer); } };
      };
    }, { version });
    await page.goto('https://toolkit-preview.invalid/g/12345/preview/');
    await page.addScriptTag({ content: source });
    await page.locator('#eh-toolkit-launcher').waitFor();
    await page.locator('[data-case="chinese"] .eh-uncensored-marker').waitFor();
    assert.equal(await page.locator('[data-case="chinese"] .eh-uncensored-marker').textContent(), '无修正');
    assert.equal(await page.locator('[data-case="plain"] .eh-uncensored-marker').count(), 0);
    assert.equal(await page.locator('[data-case="chinese"] .gl4t').evaluate(node => getComputedStyle(node).color), 'rgb(255, 141, 141)');
    assert.notEqual(await page.locator('[data-case="english"] .gl4t').evaluate(node => getComputedStyle(node).color), 'rgb(255, 141, 141)');
    assert.equal(await page.locator('#gdf').getAttribute('onclick'), 'return false');
    assert.equal(await page.locator('#posted_101').getAttribute('onclick'), 'return false');
    assert.equal(await page.locator('#g_search, #posted_101_favbtn, #posted_101_favcat').count(), 0);
    await page.evaluate(() => document.querySelector('.itg').insertAdjacentHTML('beforeend', '<div class="gl1t" data-case="dynamic"><div class="gl4t glname"><a href="https://e-hentai.org/g/104/dddd/">Dynamic Sketches</a></div></div>'));
    await page.locator('[data-case="dynamic"] .eh-uncensored-marker').waitFor();
    assert.equal(await page.locator('[data-case="chinese"] .eh-uncensored-marker').count(), 1);
    await page.locator('#eh-toolkit-launcher').click();
    assert.equal(await page.locator('#eh-gdl-test, #eh-gdl-metadata').count(), 0);
    assert.equal(await page.locator('#eh-gdl-download').count(), 1);
    await page.locator('[data-eh-tab="settings"]').click();
    assert.equal(await page.locator('#cfg-enableChineseHighlight').isChecked(), true);
    assert.equal(await page.locator('#cfg-enableUncensoredLabel').isChecked(), true);
    assert.equal(await page.locator('#cfg-enableQuickFav, #cfg-enableGlobalSearch, #cfg-defaultFavcat, #cfg-enableLogging, #cfg-lrrDebugMode').count(), 0);
    assert.equal(await page.locator('#cfg-lrrConcurrency').evaluate(node => node.closest('details').open), false);
    assert.equal(await page.locator('#cfg-altSearchConcurrency').evaluate(node => node.closest('details').open), false);
    assert.equal(await page.locator('#eh-tb-export-logs').count(), 1);
    assert.deepEqual(errors, []); assert.deepEqual(outbound, []);
    console.log('Simplification browser checks passed: Chinese highlighting, actual-tag uncensored labels and dynamic badges retained; native favorites/search untouched despite old enabled settings; removed controls absent; performance collapsed; runtime export retained.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
