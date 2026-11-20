// Real userscript + real ZIP download; all gallery/API/image responses are local mocks.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const source = fs.readFileSync(path.join(__dirname, '../ExHentai_Library_Toolkit.user.js'), 'utf8');
const origin = 'https://toolkit-preview.invalid';
const html = '<!doctype html><html><meta charset="utf-8"><body><h1 id="gn">Safe filenames</h1><div id="gj">原名验收</div><table id="gdd"><tr><td>Length:</td><td>3 pages</td></tr></table><div id="gdt">' + [1, 2, 3].map(i => '<a href="/s/preview/12345-' + i + '">Page ' + i + '</a>').join('') + '</div></body></html>';
function readZip(bytes) {
  const b = Buffer.from(bytes), end = b.length - 22;
  assert.equal(b.readUInt32LE(end), 0x06054b50);
  const count = b.readUInt16LE(end + 10), files = new Map();
  let p = b.readUInt32LE(end + 16);
  for (let i = 0; i < count; i++) {
    assert.equal(b.readUInt32LE(p), 0x02014b50);
    assert.equal(b.readUInt16LE(p + 10), 0, 'images must not be recompressed');
    const size = b.readUInt32LE(p + 24), n = b.readUInt16LE(p + 28), extra = b.readUInt16LE(p + 30), comment = b.readUInt16LE(p + 32);
    const name = b.subarray(p + 46, p + 46 + n).toString('utf8'), local = b.readUInt32LE(p + 42);
    assert.equal(files.has(name), false);
    assert.equal(b.subarray(local + 30, local + 30 + b.readUInt16LE(local + 26)).toString('utf8'), name, 'local and central filenames must match');
    const start = local + 30 + b.readUInt16LE(local + 26) + b.readUInt16LE(local + 28);
    files.set(name, b.subarray(start, start + size));
    p += 46 + n + extra + comment;
  }
  assert.equal(p, end);
  return files;
}
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    for (const { namingMode, reverse = false, memory = false } of [
      { namingMode: 'auto' }, { namingMode: 'auto', reverse: true },
      { namingMode: 'auto', reverse: true, memory: true },
      { namingMode: 'original' }, { namingMode: 'sequential' },
    ]) {
    const context = await browser.newContext({ acceptDownloads: true });
    const page = await context.newPage(), errors = [], outbound = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', route => route.request().url() === origin + '/g/12345/preview/' ? route.fulfill({ contentType: 'text/html; charset=utf-8', body: html }) : (outbound.push(route.request().url()), route.abort()));
    await page.addInitScript(({ version, reverse, memory }) => {
      if (memory) Object.defineProperty(navigator.storage, 'getDirectory', { value: undefined });
      const store = Object.assign({ enableLrrChecker: false, enableChineseHighlight: false, enableUncensoredLabel: false }, JSON.parse(sessionStorage.getItem('mock-gm') || '{}'));
      window.GM_info = { script: { version } };
      window.GM_getValue = (key, fallback) => key in store ? store[key] : fallback;
      window.GM_setValue = (key, value) => { store[key] = value; sessionStorage.setItem('mock-gm', JSON.stringify(store)); };
      window.GM_xmlhttpRequest = options => {
        let aborted = false;
        const timer = setTimeout(() => {
          if (aborted) return;
          const binary = options.responseType === 'arraybuffer', u = new URL(options.url);
          const index = Number(u.searchParams.get('page') || (u.pathname.match(/12345-(\d+)$/) || [])[1] || 1);
          let text = '';
          if (u.pathname.includes('/api.php')) text = JSON.stringify({ gmetadata: [{ gid: 12345, token: 'preview', title: 'Safe filenames', title_jpn: '原名验收', filecount: '3', tags: [] }] });
          else if (u.pathname.includes('/s/')) text = '<div id="i2"><div>封面 image.jpeg :: 1000 x 1000 :: 5 B</div></div><img id="img" src="https://toolkit-preview.invalid/display.jpg"><a href="/fullimg.php?page=' + index + '">Original</a>';
          else if (u.pathname.includes('/g/')) text = document.documentElement.outerHTML;
          const bytes = new Uint8Array([255, 216, index, 255, 217]);
          const headers = binary ? 'Content-Type: image/jpeg\r\n' + (index < 3 ? "Content-Disposition: attachment; filename*=UTF-8''%E5%8E%9F%E5%9B%BE" + (reverse ? 3 - index : index) + '.JPEG' : '') : 'Content-Type: text/html';
          if (binary && options.onprogress) options.onprogress({ loaded: bytes.length, total: bytes.length, lengthComputable: true });
          options.onload({ status: 200, responseText: text, response: binary ? bytes.buffer : text, responseHeaders: headers, finalUrl: options.url });
        }, 10);
        return { abort() { aborted = true; clearTimeout(timer); if (options.onabort) options.onabort(); } };
      };
    }, { version: source.match(/^\/\/ @version\s+(\S+)/m)[1], reverse, memory });
    await page.goto(origin + '/g/12345/preview/');
    await page.addScriptTag({ content: source });
    await page.locator('#eh-toolkit-launcher').click();
    assert.equal(await page.locator('#cfg-galleryDlImageNaming').inputValue(), 'auto', 'default naming must be automatic');
    await page.locator('#cfg-galleryDlImageNaming').selectOption(namingMode);
    const downloaded = page.waitForEvent('download', { timeout: 20000 });
    await page.locator('#eh-gdl-download').click();
    const download = await downloaded;
    const files = readZip(fs.readFileSync(await download.path()));
    const originalNames = reverse ? ['原图2.JPEG', '原图1.JPEG', '封面 image.jpeg'] : ['原图1.JPEG', '原图2.JPEG', '封面 image.jpeg'];
    const names = namingMode === 'sequential' ? ['001.JPEG', '002.JPEG', '003.jpeg'] : namingMode === 'auto' && reverse ? originalNames.map((name, i) => (i + 1) + '_' + name) : originalNames;
    for (let i = 0; i < names.length; i++) assert.deepEqual([...files.get(names[i])], [255, 216, i + 1, 255, 217]);
    assert.equal(files.size, 5, 'three images plus two metadata files');
    assert.ok([...files.keys()].every(name => !name.includes('/')), 'all images and metadata must be at ZIP root');
    const metadata = JSON.parse(files.get('metadata.json').toString('utf8'));
    assert.deepEqual(metadata.image_files.map(f => f.path), names);
    assert.deepEqual(metadata.image_files.map(f => f.original_filename), originalNames);
    if (namingMode === 'auto') assert.equal(metadata.auto_prefixed, reverse);
    assert.equal(metadata.image_naming, namingMode);
    await page.reload();
    await page.addScriptTag({ content: source });
    await page.locator('#eh-toolkit-launcher').click();
    assert.equal(await page.locator('#cfg-galleryDlImageNaming').inputValue(), namingMode, 'naming choice must survive reload');
    assert.deepEqual(errors, []); assert.deepEqual(outbound, []);
    console.log('Naming browser checks passed: ' + namingMode + ', persisted selection, real ZIP at root, original extensions, ordered metadata and unchanged bytes.');
    await context.close();
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
