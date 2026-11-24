// Safe, offline, full-userscript favorites highlighting regression.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'ExHentai_Library_Toolkit.user.js'), 'utf8');
const version = source.match(/^\/\/ @version\s+(\S+)/m)[1];
const url = 'https://e-hentai.org/favorites.php';
const red = 'rgb(255, 141, 141)';
const fixture = `<!doctype html><html><head><meta charset="utf-8"><title>Safe favorites highlight preview</title>
<style>body{font:15px sans-serif;background:#f5f4ec;color:#242424;margin:32px}h1{font-size:22px}.itg{width:100%;border-collapse:collapse;background:white;margin:16px 0}.itg td{padding:14px;border-bottom:1px solid #ddd}.itg a,.itg .glink,.itg .gl4t{color:#36566d;font-weight:400}a{color:#36566d}#outside{padding:14px;background:#e8e7dd}.glname,.gl4t{padding:14px;background:#fff;margin:8px 0}</style></head><body>
<h1>Safe favorites / 收藏标题高亮预览</h1><p>Fictional text only. No images or real gallery content.</p>
<div id="outside">界面说明：汉化 <a href="https://example.invalid/">Unrelated 汉化 link</a><span class="glink">Outside 汉化 heading</span></div>
<main id="lists"><table class="itg gltm"><tbody>
<tr><td class="gl3t"><a href="/g/101/aaaa/"><div class="glink" id="compact-zh">示例植物速写 [汉化]</div></a></td></tr>
<tr><td class="gl3t"><a href="/g/102/bbbb/"><div class="glink" id="compact-en">Fictional Botanical Studies [English]</div></a></td></tr>
</tbody></table>
<table class="itg glte"><tbody><tr><td><a href="/g/103/cccc/"><div class="glink" id="extended-zh">示例风景画 [Chinese]</div></a></td></tr></tbody></table>
<table class="itg gltc"><tbody><tr><td><a href="/g/104/dddd/"><div class="glink" id="minimal-zh">示例建筑素描 [中国翻訳]</div></a></td></tr></tbody></table>
<section class="itg glt"><div class="gl1t"><div class="gl4t" id="thumbnail-zh">示例静物习作 [汉化]</div></div></section>
<section class="itg"><div class="glname"><a id="name-zh" href="/g/105/eeee/">示例旅行画册 [Chinese]</a></div><div class="glname"><a id="name-en" href="/g/106/ffff/">Fictional Travel Studies [English]</a></div></section></main></body></html>`;

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    for (const language of ['zh', 'en']) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 1050 } });
      const page = await context.newPage();
      page.setDefaultTimeout(10000);
      const errors = [], outbound = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/*', route => {
        if (route.request().url() === url) return route.fulfill({ contentType: 'text/html; charset=utf-8', body: fixture });
        outbound.push(route.request().url()); return route.abort();
      });
      await page.addInitScript(({ language, version }) => {
        const defaults = { enableLrrChecker: false, enableChineseHighlight: true, enableUncensoredLabel: false, uiLanguage: language };
        const store = Object.assign(defaults, JSON.parse(localStorage.getItem('highlight-test-gm') || '{}'));
        window.GM_info = { script: { version } };
        window.GM_getValue = (key, fallback) => key in store ? store[key] : fallback;
        window.GM_setValue = (key, value) => { store[key] = value; localStorage.setItem('highlight-test-gm', JSON.stringify(store)); };
        window.GM_registerMenuCommand = () => {};
        window.__gmRequests = 0;
        window.GM_xmlhttpRequest = () => { window.__gmRequests++; throw new Error('Unexpected network request with LRR/uncensored disabled'); };
        const NativeObserver = window.MutationObserver;
        window.__observerCreated = 0; window.__observerCallbacks = 0; window.__observerLast = 0;
        window.MutationObserver = class extends NativeObserver {
          constructor(callback) {
            super((records, observer) => { window.__observerCallbacks++; window.__observerLast = performance.now(); callback(records, observer); });
            window.__observerCreated++;
          }
        };
      }, { language, version });
      const load = async () => {
        await page.goto(url);
        await page.addScriptTag({ content: source });
        await page.locator('#eh-toolkit-launcher').waitFor();
      };
      const highlighted = async (selector, expected = true) => {
        await page.waitForFunction(({ selector, expected, red }) => {
          const node = document.querySelector(selector);
          return node && node.classList.contains('eh-translation-highlight') === expected && (getComputedStyle(node).color === red) === expected;
        }, { selector, expected, red });
      };
      await load();
      for (const selector of ['#compact-zh', '#extended-zh', '#minimal-zh', '#thumbnail-zh', '#name-zh']) await highlighted(selector, language === 'zh');
      for (const selector of ['#compact-en', '#name-en']) await highlighted(selector, language === 'en');
      for (const selector of ['#outside', '#outside a', '#outside .glink']) await highlighted(selector, false);
      assert.equal(await page.locator(language === 'zh' ? '#compact-zh' : '#compact-en').evaluate(n => getComputedStyle(n).fontWeight), '700');
      assert.equal(await page.locator('#compact-zh').evaluate(n => n.parentElement.classList.contains('eh-translation-highlight')), false);
      const counts = await page.evaluate(() => ({ styles: document.querySelectorAll('style').length, observers: window.__observerCreated }));
      await page.evaluate(language => document.querySelector('.gltm tbody').insertAdjacentHTML('beforeend', '<tr><td class="gl3t"><a href="/g/107/gggg/"><div class="glink" id="dynamic-zh">Dynamic Fictional Studies [' + (language === 'zh' ? '汉化' : 'English') + ']</div></a></td></tr>'), language);
      await highlighted('#dynamic-zh');
      // CharacterData, not innerHTML, exercises a text-node-only update.
      const updateSelector = language === 'zh' ? '#compact-en' : '#compact-zh';
      await page.evaluate(({ selector, tag }) => { document.querySelector(selector).firstChild.data = 'Updated Fictional Studies [' + tag + ']'; }, { selector: updateSelector, tag: language === 'zh' ? '汉化' : 'English' });
      await highlighted(updateSelector);
      await page.evaluate(({ selector, tag }) => { document.querySelector(selector).firstChild.data = 'Updated Fictional Studies [' + tag + ']'; }, { selector: updateSelector, tag: language === 'zh' ? 'English' : '汉化' });
      await highlighted(updateSelector, false);
      // Host class replacement should be repaired without a self-mutation loop.
      await page.evaluate(() => { document.querySelector('#dynamic-zh').className = 'glink host-refreshed'; });
      await highlighted('#dynamic-zh');
      await page.evaluate(() => {
        const old = document.querySelector('.gltm');
        const table = document.createElement('table'); table.className = 'itg gltm';
        table.innerHTML = '<tbody><tr><td class="gl3t"><a href="/g/108/hhhh/"><div class="glink" id="replacement-zh">Replacement Fictional Collection [汉化]</div></a></td></tr><tr><td class="gl3t"><a href="/g/109/iiii/"><div class="glink" id="replacement-en">Replacement Fictional Collection [English]</div></a></td></tr></tbody>';
        old.replaceWith(table);
      });
      await highlighted('#replacement-zh', language === 'zh'); await highlighted('#replacement-en', language === 'en');
      await page.evaluate(() => {
        for (let i = 0; i < 20; i++) {
          const span = document.createElement('span'); span.textContent = 'Unrelated 汉化'; document.querySelector('#outside').append(span); span.remove();
        }
      });
      await page.waitForFunction(() => performance.now() - window.__observerLast > 350);
      const stable = await page.evaluate(() => ({ styles: document.querySelectorAll('style').length, observers: window.__observerCreated, callbacks: window.__observerCallbacks, requests: window.__gmRequests }));
      assert.equal(stable.styles, counts.styles, 'repeated scans must not inject additional styles');
      assert.equal(stable.observers, counts.observers, 'repeated scans must not create additional observers');
      assert.ok(stable.callbacks < 200, `possible observer loop: ${stable.callbacks} callbacks`);
      assert.equal(stable.requests, 0);
      assert.equal(await page.locator('.eh-uncensored-marker').count(), 0);
      if (language === 'zh') {
        fs.mkdirSync(path.join(root, 'docs/ui-preview'), { recursive: true });
        await page.screenshot({ path: path.join(root, 'docs/ui-preview/favorites-highlighting.png'), fullPage: true });
      } else {
        // Save through the real settings handler, then reload (settings apply after refresh).
        await page.locator('#eh-toolkit-launcher').click();
        await page.locator('[data-eh-tab="settings"]').click();
        await page.locator('#cfg-enableChineseHighlight').uncheck();
        const save = page.locator('#eh-tb-save');
        page.on('dialog', dialog => dialog.accept());
        await Promise.all([page.waitForEvent('load'), save.click()]);
        await page.waitForFunction(() => JSON.parse(localStorage.getItem('highlight-test-gm') || '{}').enableChineseHighlight === false);
        await load();
        assert.equal(await page.locator('.eh-translation-highlight').count(), 0);
        await highlighted('#compact-zh', false);
        await page.locator('#eh-toolkit-launcher').click();
        await page.locator('[data-eh-tab="settings"]').click();
        await page.locator('#cfg-enableChineseHighlight').check();
        await Promise.all([page.waitForEvent('load'), page.locator('#eh-tb-save').click()]);
        await page.waitForFunction(() => JSON.parse(localStorage.getItem('highlight-test-gm') || '{}').enableChineseHighlight === true);
        await load(); await highlighted('#compact-en');
      }
      assert.deepEqual(errors, []); assert.deepEqual(outbound, []);
      await context.close();
    }
    console.log('Favorites highlighting browser checks passed: actual title nodes across layouts; host color override; dynamic insert/text/class/list replacement; unhighlight; stable observers/styles; zh/en settings on/off; LRR/uncensored disabled.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
