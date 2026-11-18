// Real userscript + Chromium; all API responses and storage are isolated test doubles.
// NODE_PATH=/path/to/playwright/node_modules node tools/test-lrr-index-browser.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const script = fs.readFileSync(path.join(__dirname, '../ExHentai_Library_Toolkit.user.js'), 'utf8');
const store = { enableLrrChecker: true, enableAltSearch: true, lrrServerUrl: 'https://lrr.invalid', lrrApiKey: 'test-only', enableQuickFav: false, enableGlobalSearch: false, enableChineseHighlight: false, enableUncensoredLabel: false };
const rows = Array.from({ length: 4000 }, (_, i) => ({ arcid: i.toString(16).padStart(40, '0'), title: '[Studio (Artist)] Background Collection ' + i, tags: 'artist:Artist', pagecount: 24, size: 1000 }));
rows[0].tags += ', source:exhentai.org/g/12345/abcdef/';
rows[1].title = '[Studio (Artist)] Weekend Sketchbook Vol.1';
const fixture = `<!doctype html><html><head><meta charset="utf-8"><title>Safe library test</title></head><body><h1>Local metadata index test</h1><table class="itg"><tbody>
<tr><td><a href="https://e-hentai.org/g/12345/abcdef/"><span class="glink">Source link test</span></a></td></tr>
<tr><td><a href="https://e-hentai.org/g/67890/abcdef/"><span class="glink">[Studio (Artist)] Weekend Sketchbook Vol.1 [中国翻訳]</span></a></td></tr>
<tr><td><a href="https://e-hentai.org/g/99999/abcdef/"><span class="glink">[Unrelated] Totally Different Book</span></a></td></tr>
</tbody></table></body></html>`;
function install({ seed, rows, fail }) {
  const data = structuredClone(seed);
  window.__lrrRequests = [];
  window.GM_info = { script: { version: 'test' } };
  window.GM_getValue = (key, fallback) => key in data ? structuredClone(data[key]) : fallback;
  window.GM_setValue = async (key, value) => { data[key] = structuredClone(value); await window.__saveLrrValue(key, value); };
  window.GM_registerMenuCommand = () => {};
  window.GM_xmlhttpRequest = options => {
    window.__lrrRequests.push(options.url);
    const timer = setTimeout(() => {
      if (fail) return options.onerror(new Error('Offline test'));
      const url = new URL(options.url);
      const body = url.pathname === '/api/info' ? { version: '0.9.82', total_archives: rows.length } : url.pathname === '/api/archives' ? rows : url.pathname === '/api/search' ? { data: [], recordsTotal: rows.length, recordsFiltered: 0 } : { success: 0 };
      options.onload({ status: 200, responseText: JSON.stringify(body) });
    }, 10);
    return { abort() { clearTimeout(timer); if (options.onabort) options.onabort(); } };
  };
}
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const errors = [], outbound = [];
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  async function open(fail = false) {
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.exposeFunction('__saveLrrValue', (key, value) => { store[key] = value; });
    await page.route('**/*', route => {
      if (route.request().url() === 'https://toolkit-preview.invalid/') return route.fulfill({ contentType: 'text/html', body: fixture });
      outbound.push(route.request().url()); return route.abort();
    });
    await page.addInitScript(install, { seed: store, rows, fail });
    await page.goto('https://toolkit-preview.invalid/');
    await page.addScriptTag({ content: script });
    await page.locator('#eh-toolkit-launcher').click();
    await page.locator('[data-eh-tab="check"]').click();
    await page.waitForFunction(() => document.querySelector('#eh-tb-index-status').textContent.includes('4000'));
    await page.waitForFunction(() => document.querySelectorAll('.lrr-marker-downloaded').length === 1 && document.querySelectorAll('.lrr-marker-file').length >= 1);
    assert.equal(await page.locator('tr').nth(2).locator('[class*="lrr-marker"]').count(), 0);
    return page;
  }
  try {
    const first = await open();
    assert.equal((await first.evaluate(() => window.__lrrRequests)).filter(url => url.endsWith('/api/archives')).length, 1);
    // The pre-existing manual rescan must also refresh a still-fresh metadata snapshot.
    await first.locator('#eh-tb-rescan-lrr').click();
    await first.waitForFunction(() => window.__lrrRequests.filter(url => url.endsWith('/api/archives')).length === 2);
    await first.waitForFunction(() => /已同步|Synchronized/.test(document.querySelector('#eh-tb-index-status').textContent));
    await first.close();
    // Simulates a new script/browser session receiving the manager's persisted GM values.
    const cached = await open(true);
    assert.deepEqual(await cached.evaluate(() => window.__lrrRequests), []);
    const snapshots = Object.keys(store).filter(key => key.startsWith('eh-lrr-index-v1-'));
    assert.equal(snapshots.length, 1);
    assert.equal(store[snapshots[0]].count, 4000);
    const stamp = store[snapshots[0]].updatedAt;
    await cached.locator('#eh-tb-sync-index').click();
    await cached.waitForFunction(() => /同步失败|Sync failed/.test(document.querySelector('#eh-tb-index-status').textContent));
    assert.equal(store[snapshots[0]].updatedAt, stamp);
    assert.equal(await cached.locator('.lrr-marker-downloaded').count(), 1);
    await cached.locator('[data-eh-tab="settings"]').click();
    await cached.getByText('高级', { exact: true }).click();
    const downloadReady = cached.waitForEvent('download');
    await cached.locator('#eh-tb-export-logs').click();
    const download = await downloadReady;
    assert.equal(await download.failure(), null);
    const exportedText = fs.readFileSync(await download.path(), 'utf8');
    const diagnostics = JSON.parse(exportedText);
    assert.equal(diagnostics.entries[0].event, 'runtime.started');
    assert.equal(diagnostics.entries.at(-1).event, 'diagnostics.export');
    assert.equal(exportedText.includes('test-only'), false, 'API key must never be exported');
    assert.ok(diagnostics.count > 1);
    for (const event of ['lrr.index.loaded', 'lrr.index.local-lookup', 'lrr.index.sync-failed']) {
      assert.ok(diagnostics.entries.some(entry => entry.event === event), 'export must contain ' + event);
    }
    assert.deepEqual(errors, []); assert.deepEqual(outbound, []);
    console.log('Browser checks passed: 4000 metadata rows, source/title badges, persistent reopen without network, offline sync preserves snapshot, one-click redacted JSON log download.');
    await cached.close();
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
