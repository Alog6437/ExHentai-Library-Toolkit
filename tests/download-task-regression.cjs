const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

function harness({ failPages = [], fatalPage = 0, writeFail = false, parallel = 1, pageCount = 3, writeHook, renameHook, imageNames, imageNaming = 'original' } = {}) {
  const source = fs.readFileSync(path.join(__dirname, '../ExHentai_Library_Toolkit.user.js'), 'utf8');
  const failures = new Set(failPages), entries = [], calls = [], statuses = [], downloads = [];
  let aborted = 0, cleaned = 0, finished = 0;
  const intervals = new Map(); let intervalId = 0;
  class Element {
    constructor() { this.children = []; this.textContent = ''; this.disabled = false; }
    appendChild(node) { node.parent = this; this.children.push(node); }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(n => n !== this); }
  }
  const panel = new Element(), status = new Element(), button = new Element();
  const ctx = vm.createContext({
    recordRuntimeLog: () => {}, console, URL, TextEncoder, Uint8Array, galleryDlBusy: false, zipSinkFallbackReason: '', MEMORY_ZIP_LIMIT: 536870912,
    GALLERY_DL_FAST_RETRIES: 3, GALLERY_DL_RECOVERY_ROUNDS: 3,
    document: { createElement: () => new Element() },
    t: zh => zh, warn() {}, getCurrentGalleryInfo: () => ({ gid: '1', url: 'https://gallery.test/g/1', page_count: pageCount }),
    readGalleryDlPanelConfig: () => ({ galleryDlParallel: parallel, galleryDlOriginal: false, galleryDlImageNaming: imageNaming, galleryDlWriteMetadata: true }),
    sanitizeGalleryTitle: x => x, chooseGalleryTitle: () => 'test-gallery',
    updateGalleryDlStatus: (...args) => statuses.push(args.slice(1)), updateGalleryDlMetrics() {}, updateGalleryDlPreview() {},
    setGalleryDownloadBusy: x => { ctx.galleryDlBusy = x; }, saveGalleryDlConfig: async () => {},
    fetchGalleryApiMetadata: async () => ({ filecount: pageCount }), collectImagePageUrls: async () => Array.from({ length: pageCount }, (_, i) => 'page' + (i + 1)),
    cleanupGalleryDlTempFiles: async () => {}, createZipSink: async () => ({}),
    StreamingZipWriter: class {
      async add(name, data) { if (writeHook) await writeHook(name, data); if (writeFail && name === '002.jpg') throw new Error('disk quota exceeded'); entries.push({ name, data }); return entries.length - 1; }
      async rename(index, name) { if (renameHook) await renameHook(index, name); entries[index].name = name; }
      async finish() { finished++; return 'blob'; }
      async abort() { aborted++; }
      async cleanup() { cleaned++; }
    },
    retryGalleryOperation: async (fn, attempts) => {
      let last;
      for (let i = 0; i < attempts; i++) {
        try { return await fn(); } catch (e) { if (e.galleryFatal || e.galleryInterrupted) throw e; last = e; }
      }
      throw last;
    },
    resolveDownloadImageUrl: async page => ({ url: page, pageUrl: page, nlToken: 'next', original: true, originalFilename: imageNames ? imageNames[Number(page.slice(4)) - 1] : String(Number(page.slice(4))).padStart(3, '0') + '.jpg' }),
    galleryBinaryRequest: async (url, referer, progress, task) => {
      calls.push(url);
      if (Number(url.replace('page', '')) === fatalPage) { const e = new Error('IP blocked'); e.galleryFatal = true; e.galleryCode = 'ip-ban'; throw e; }
      if (failures.has(Number(url.replace('page', '')))) throw new Error('temporary image failure');
      if (task.stopped) throw task.error;
      progress({ loaded: 3 });
      return { data: new Uint8Array([Number(url.replace('page', '')), 2, 3]), finalUrl: url, contentType: 'image/jpeg' };
    },
    galleryRetryDelay: () => 0, sleepMs: async () => {},
    buildMetadata: () => ({}), buildEzeInfo: () => ({}), formatGalleryDlBytes: String,
    triggerZipDownload: (blob, name) => downloads.push(name), setTimeout: () => 1,
    setInterval: fn => { const id = ++intervalId; intervals.set(id, fn); return id; }, clearInterval: id => intervals.delete(id),
  });
  const metadataStart = source.indexOf('    function buildMetadata(');
  vm.runInContext(source.slice(metadataStart, source.indexOf('    function buildEzeInfo(', metadataStart)), ctx);
  const nameStart = source.indexOf('    function parseGalleryDispositionFilename(');
  vm.runInContext(source.slice(nameStart, source.indexOf('    function getCrc32Table(', nameStart)), ctx);
  const helperStart = source.indexOf('    function createGalleryDownloadTask(');
  vm.runInContext(source.slice(helperStart, source.indexOf('    function galleryRawRequest(', helperStart)), ctx);
  const start = source.indexOf('    async function startGalleryDlDownload(');
  const end = source.indexOf('    /* ================================================================', start);
  assert.ok(start >= 0 && end > start);
  vm.runInContext("'use strict';\n" + source.slice(start, end), ctx);
  const buttons = () => panel.children.flatMap(n => n.children);
  return { ctx, panel, status, button, entries, calls, statuses, downloads, failures, buttons, intervals,
    run: async () => { await ctx.startGalleryDlDownload(panel, status, button); assert.equal(intervals.size, 0, 'all task exits must clear the metrics interval'); },
    get aborted() { return aborted; }, get cleaned() { return cleaned; }, get finished() { return finished; } };
}
test('network keeps downloading while disk is blocked, then drains with correct filenames and bytes', async () => {
  let release, started = false;
  const gate = new Promise(resolve => { release = resolve; });
  const h = harness({ parallel: 1, pageCount: 8, writeHook: async name => {
    if (name === '001.jpg') { started = true; await gate; }
  } });
  const running = h.run();
  await until(() => started && h.calls.length >= 4);
  assert.equal(h.entries.length, 0, 'first disk write must still be pending');
  assert.equal(h.downloads.length, 0, 'must not finalize before disk drain');
  release(); await running;
  const images = h.entries.filter(e => e.name.endsWith('.jpg'));
  assert.equal(images.length, 8);
  for (let i = 0; i < images.length; i++) {
    assert.equal(images[i].name, String(i + 1).padStart(3, '0') + '.jpg');
    assert.equal(images[i].data[0], i + 1, 'each queued closure must retain its own image bytes');
  }
  assert.deepEqual(h.downloads, ['test-gallery.zip']);
});

test('discard during a slow disk write waits for it before ZIP abort and cleanup', async () => {
  let release, started = false;
  const gate = new Promise(resolve => { release = resolve; });
  const h = harness({ parallel: 2, pageCount: 12, writeHook: async name => {
    if (name === '001.jpg') { started = true; await gate; }
  } });
  const running = h.run();
  await until(() => started && h.calls.length >= 3);
  click(h, '放弃并清理');
  for (let i = 0; i < 80; i++) await Promise.resolve();
  assert.equal(h.aborted, 0, 'must not abort sink while a disk write is still in flight');
  assert.equal(h.cleaned, 0);
  const requested = h.calls.length;
  release(); await running;
  assert.equal(h.calls.length, requested, 'stopped task must not schedule new requests');
  assert.equal(h.aborted, 1);
  assert.equal(h.cleaned, 1);
  assert.equal(h.downloads.length, 0);
});

async function until(predicate) {
  for (let i = 0; i < 2000; i++) { if (predicate()) return; await Promise.resolve(); }
  assert.fail('task did not reach the expected state');
}
function click(h, label) {
  const button = h.buttons().find(n => n.textContent === label);
  assert.ok(button, `missing control: ${label}`);
  assert.equal(button.disabled, false);
  button.onclick();
}

test('transparent pause retries count both attempts and completion bytes without inflating saved ZIP bytes', async () => {
  const h = harness({ pageCount: 1 });
  const metrics = [];
  h.ctx.updateGalleryDlMetrics = (_, data) => metrics.push(data);
  h.ctx.galleryBinaryRequest = async (_, __, progress) => {
    progress({ loaded: 3 });
    progress({ loaded: 0, requestStarted: true });
    progress({ loaded: 2 });
    return { data: new Uint8Array([1, 2, 3, 4]), finalUrl: 'image.jpg', contentType: 'image/jpeg' };
  };
  await h.run();
  assert.equal(metrics.at(-1).network_bytes, 7);
  assert.equal(metrics.at(-1).downloaded_bytes, 4);
});

test('successful task writes each image once, exports full ZIP and releases busy state', async () => {
  const h = harness();
  await h.run();
  assert.deepEqual(h.entries.map(e => e.name), ['001.jpg', '002.jpg', '003.jpg', 'metadata.json', 'info.json']);
  assert.deepEqual(h.downloads, ['test-gallery.zip']);
  assert.equal(h.aborted, 0);
  assert.equal(h.finished, 1);
  assert.equal(h.ctx.galleryDlBusy, false);
  assert.equal(h.panel.children.length, 0);
});

test('exhausted retries retain successes and export a truthful partial ZIP manifest', async () => {
  const h = harness({ failPages: [2] });
  const running = h.run();
  await until(() => h.buttons().some(b => b.textContent === '导出部分 ZIP'));
  assert.equal(h.ctx.galleryDlBusy, true);
  assert.equal(h.aborted, 0);
  assert.deepEqual(h.entries.map(e => e.name), ['001.jpg', '003.jpg']);
  click(h, '导出部分 ZIP');
  await running;
  assert.deepEqual(h.downloads, ['test-gallery.partial.zip']);
  const manifest = JSON.parse(Buffer.from(h.entries.find(e => e.name === 'missing-pages.json').data).toString());
  assert.equal(manifest.downloaded_pages, 2);
  assert.equal(manifest.total_pages, 3);
  assert.equal(manifest.refresh_resume_supported, false);
  assert.equal(manifest.missing_pages.length, 1);
  assert.equal(manifest.missing_pages[0].page, 2);
});

test('manual recovery only fetches missing pages and never appends duplicate ZIP entries', async () => {
  const h = harness({ failPages: [2] });
  const running = h.run();
  await until(() => h.buttons().some(b => b.textContent === '重试失败页'));
  h.failures.clear();
  click(h, '重试失败页');
  await running;
  assert.equal(h.calls.filter(x => x === 'page1').length, 1);
  assert.equal(h.calls.filter(x => x === 'page3').length, 1);
  assert.equal(h.entries.filter(e => e.name.endsWith('.jpg')).length, 3);
  assert.equal(new Set(h.entries.map(e => e.name)).size, h.entries.length);
  assert.deepEqual(h.downloads, ['test-gallery.zip']);
});

test('site-level failures preserve the usable ZIP for partial export', async () => {
  const h = harness({ fatalPage: 2 });
  const running = h.run();
  await until(() => h.buttons().some(b => b.textContent === '导出部分 ZIP'));
  assert.equal(h.aborted, 0);
  assert.deepEqual(h.entries.map(e => e.name), ['001.jpg']);
  click(h, '导出部分 ZIP');
  await running;
  const manifest = JSON.parse(Buffer.from(h.entries.find(e => e.name === 'missing-pages.json').data).toString());
  assert.deepEqual(manifest.missing_pages.map(e => e.page), [2, 3]);
  assert.deepEqual(h.downloads, ['test-gallery.partial.zip']);
});

test('discarding retained work aborts and cleans the ZIP without exporting', async () => {
  const h = harness({ failPages: [2] });
  const running = h.run();
  await until(() => h.buttons().some(b => b.textContent === '重试失败页'));
  click(h, '放弃并清理');
  await running;
  assert.equal(h.aborted, 1);
  assert.equal(h.cleaned, 1);
  assert.equal(h.finished, 0);
  assert.equal(h.downloads.length, 0);
  assert.equal(h.ctx.galleryDlBusy, false);
});

test('pausing after a saved entry keeps it and resumes without duplicate entries', async () => {
  const h = harness();
  const running = h.run();
  await until(() => h.entries.length === 1);
  click(h, '暂停');
  const savedCount = h.entries.length;
  for (let i = 0; i < 30; i++) await Promise.resolve();
  assert.equal(h.entries.length, savedCount);
  assert.equal(h.ctx.galleryDlBusy, true);
  click(h, '继续');
  await running;
  assert.equal(h.entries.filter(e => e.name.endsWith('.jpg')).length, 3);
  assert.equal(new Set(h.entries.map(e => e.name)).size, h.entries.length);
  assert.deepEqual(h.downloads, ['test-gallery.zip']);
});

test('concurrent workers preserve successful entries across manual failed-page recovery', async () => {
  const h = harness({ failPages: [2], parallel: 3 });
  const running = h.run();
  await until(() => h.buttons().some(b => b.textContent === '重试失败页'));
  assert.deepEqual(h.entries.map(e => e.name).sort(), ['001.jpg', '003.jpg']);
  h.failures.clear();
  click(h, '重试失败页');
  await running;
  assert.equal(h.calls.filter(x => x === 'page1').length, 1);
  assert.equal(h.calls.filter(x => x === 'page3').length, 1);
  assert.equal(new Set(h.entries.map(e => e.name)).size, h.entries.length);
  assert.deepEqual(h.downloads, ['test-gallery.zip']);
});

test('original Unicode names and JPEG extensions stay at ZIP root with truthful metadata and unchanged bytes', async () => {
  const names = ['原图.JPEG', '第二张.JPEG', 'cover%20final.jpeg'];
  const h = harness({ imageNames: names, parallel: 3 });
  await h.run();
  const expected = names;
  const images = h.entries.filter(e => !e.name.endsWith('.json'));
  assert.deepEqual(images.map(e => e.name).sort(), [...expected].sort());
  for (const image of images) {
    const page = names.indexOf(image.name) + 1;
    assert.deepEqual(Array.from(image.data), [page, 2, 3]);
  }
  const metadata = JSON.parse(new TextDecoder().decode(h.entries.find(e => e.name === 'metadata.json').data));
  assert.equal(metadata.filename_pattern, '{original_filename}');
  assert.deepEqual(metadata.image_files, names.map((name, i) => ({ page: i + 1, path: expected[i], original_filename: name })));
});

test('auto mode decides globally from authoritative gallery-order names, not worker completion order', async () => {
  for (const [names, expected, prefixed] of [
    [['a.JPEG', 'b.JPEG', 'c.jpeg'], ['a.JPEG', 'b.JPEG', 'c.jpeg'], false],
    [['z.JPEG', 'a.JPEG', 'b.jpeg'], ['1_z.JPEG', '2_a.JPEG', '3_b.jpeg'], true],
    [['same.JPEG', 'same.JPEG', 'last.jpeg'], ['1_same.JPEG', '2_same.JPEG', '3_last.jpeg'], true],
  ]) {
    const h = harness({ imageNames: names, imageNaming: 'auto', parallel: 3 });
    await h.run();
    const images = h.entries.filter(e => !e.name.endsWith('.json'));
    assert.deepEqual(images.map(e => e.name).sort(), [...expected].sort());
    for (const image of images) assert.equal(image.data[0], expected.indexOf(image.name) + 1);
    const metadata = JSON.parse(new TextDecoder().decode(h.entries.find(e => e.name === 'metadata.json').data));
    assert.equal(metadata.image_naming, 'auto');
    assert.equal(metadata.auto_prefixed, prefixed);
    assert.deepEqual(metadata.image_files.map(e => e.path), expected);
  }
});

test('partial auto export uses original total-page width and uniformly prefixes known successful pages', async () => {
  const h = harness({ imageNaming: 'auto', pageCount: 13, imageNames: Array.from({ length: 13 }, (_, i) => 'original' + (i + 1) + '.JPEG'), failPages: [2] });
  const running = h.run();
  await until(() => h.buttons().some(b => b.textContent === '导出部分 ZIP'));
  click(h, '导出部分 ZIP'); await running;
  const images = h.entries.filter(e => !e.name.endsWith('.json'));
  assert.equal(images.length, 12);
  assert.ok(images.every(e => /^\d{2}_original/.test(e.name)));
  assert.equal(images.some(e => e.name.startsWith('02_')), false);
  assert.ok(images.some(e => e.name === '13_original13.JPEG'));
});

test('auto finalization patch failure aborts instead of exporting inconsistent filenames', async () => {
  const h = harness({ imageNaming: 'auto', imageNames: ['z.jpg', 'a.jpg', 'b.jpg'], renameHook: async () => { throw new Error('patch disk failure'); } });
  await h.run();
  assert.equal(h.downloads.length, 0); assert.equal(h.aborted, 1); assert.equal(h.cleaned, 1);
  assert.equal(h.ctx.galleryDlBusy, false);
});

test('numbered mode handles repeated original names without collisions and records original-to-output mapping', async () => {
  const h = harness({ imageNames: ['same.JPEG', 'same.JPEG', 'last.jpeg'], imageNaming: 'sequential', parallel: 3 });
  await h.run();
  const images = h.entries.filter(e => !e.name.endsWith('.json'));
  assert.deepEqual(images.map(e => e.name).sort(), ['001.JPEG', '002.JPEG', '003.jpeg']);
  for (const image of images) assert.equal(image.data[0], parseInt(image.name, 10));
  const metadata = JSON.parse(new TextDecoder().decode(h.entries.find(e => e.name === 'metadata.json').data));
  assert.equal(metadata.image_naming, 'sequential');
  assert.equal(metadata.filename_pattern, '{page:03d}{original_extension}');
  assert.deepEqual(metadata.image_files.map(e => e.path), ['001.JPEG', '002.JPEG', '003.jpeg']);
  assert.deepEqual(metadata.image_files.map(e => e.original_filename), ['same.JPEG', 'same.JPEG', 'last.jpeg']);
});

test('partial numbered mode preserves missing page gaps instead of renumbering successful pages', async () => {
  const h = harness({ failPages: [2], imageNaming: 'sequential' });
  const running = h.run();
  await until(() => h.buttons().some(b => b.textContent === '导出部分 ZIP'));
  click(h, '导出部分 ZIP'); await running;
  assert.deepEqual(h.entries.filter(e => !e.name.endsWith('.json')).map(e => e.name), ['001.jpg', '003.jpg']);
});

test('duplicate original names never overwrite or invent paths, including case-insensitive collisions', async () => {
  for (const duplicate of ['cover.JPEG', 'COVER.jpeg']) {
    const h = harness({ imageNames: ['cover.JPEG', duplicate, 'last.jpeg'], parallel: 3 });
    const running = h.run();
    await until(() => h.buttons().some(b => b.textContent === '导出部分 ZIP'));
    click(h, '导出部分 ZIP'); await running;
    const images = h.entries.filter(e => !e.name.endsWith('.json'));
    assert.equal(images.length, 2);
    assert.ok(images.every(e => !e.name.includes('/')));
    assert.equal(images.filter(e => e.name.toLowerCase() === 'cover.jpeg').length, 1);
    const manifest = JSON.parse(new TextDecoder().decode(h.entries.find(e => e.name === 'missing-pages.json').data));
    assert.equal(manifest.missing_pages.length, 1);
    assert.match(manifest.missing_pages[0].error, /原文件名重复/);
  }
});

test('unknown original filename remains a missing page rather than receiving an invented name', async () => {
  const h = harness({ imageNames: ['cover.JPEG', null, 'last.jpeg'] });
  const running = h.run();
  await until(() => h.buttons().some(b => b.textContent === '导出部分 ZIP'));
  click(h, '导出部分 ZIP'); await running;
  assert.deepEqual(h.entries.filter(e => !e.name.endsWith('.json')).map(e => e.name), ['cover.JPEG', 'last.jpeg']);
  const manifest = JSON.parse(new TextDecoder().decode(h.entries.find(e => e.name === 'missing-pages.json').data));
  assert.equal(manifest.missing_pages[0].page, 2);
});

test('ZIP write failure stops scheduling images and never exports corrupted data', async () => {
  const h = harness({ writeFail: true });
  await h.run();
  // Already-active network work may finish before the asynchronous disk failure;
  // the task must still stop, clean up and never export a damaged archive.
  assert.ok(h.calls.includes('page2'));
  assert.ok(h.calls.length <= 3);
  assert.equal(h.aborted, 1);
  assert.equal(h.cleaned, 1);
  assert.equal(h.downloads.length, 0);
  assert.equal(h.ctx.galleryDlBusy, false);
  assert.ok(h.statuses.some(s => String(s[2]).includes('disk quota exceeded')));
});
