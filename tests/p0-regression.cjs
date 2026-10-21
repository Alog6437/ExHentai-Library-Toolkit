const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../ExHentai_Library_Toolkit.user.js'), 'utf8');

// 与其它回归测试一致：按函数边界切片，把纯逻辑载入独立上下文。
function slice(startMarker, endMarker, globals = {}) {
  const context = vm.createContext(globals);
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `缺少切片边界：${startMarker} → ${endMarker}`);
  vm.runInContext(source.slice(start, end), context);
  return context;
}

function matchingContext() {
  return slice('    function isLooseNoiseTag(', '    function renderLrrTitleResult(', { t: zh => zh });
}

/* ---------------- P0-1：裸卷标注必须参与身份校验 ---------------- */

test('bare volume markers are part of gallery identity, not just 上巻/下巻', () => {
  const ctx = matchingContext();
  const base = '[サークル (作者)] 長い作品名のタイトル';
  for (const [a, b] of [['上', '下'], ['前', '後'], ['中', '下'], ['番外', '上']]) {
    assert.equal(ctx.titleIdentityCompatible(`${base} ${a}`, `${base} ${b}`), false, `${a}/${b} identity`);
    assert.equal(ctx.isStrictCandidateMatch(`${base} ${a}`, `${base} ${b}`, []), false, `${a}/${b} strict`);
    assert.equal(
      ctx.isLooseCandidateMatch(`${base} ${a}`, '長い作品名のタイトル', `${base} ${b}`, ['artist:作者']),
      false,
      `${a}/${b} loose`
    );
  }

  // 括号写法同样要识别。
  assert.equal(ctx.titleIdentityCompatible('作品名(上)', '作品名(下)'), false);

  // 相同标注仍然相等，否则会破坏正常的重复识别。
  assert.equal(ctx.titleIdentityCompatible(`${base} 上`, `${base} 上`), true);
  assert.equal(ctx.titleIdentityCompatible(`${base} 上巻`, `${base} 上巻`), true);
});

test('bare-volume detection does not misfire on words that merely contain the characters', () => {
  const ctx = matchingContext();
  // 「上下巻」是一个作品（收录上下两卷），不能被拆成两个卷标注。
  assert.equal(ctx.titleIdentityCompatible('作品名 上下巻', '作品名 上下巻'), true);
  // 「以上」「前作」属于词内字符，不能当卷标注。
  assert.equal(ctx.titleIdentityCompatible('作品名 以上です', '作品名 以下です'), true);
  assert.equal(ctx.titleIdentityCompatible('作品名 前作の話', '作品名 前作の話'), true);
});

/* ---------------- 页数：只作提示，绝不参与判定 ---------------- */

test('page count never decides whether a gallery is already in the library', () => {
  const ctx = matchingContext();
  const title = '[Circle (Artist)] 長い作品名のタイトル';
  // 归档常被删掉汉化组页与广告页，所以同一作品在库内可能少 1~8 页。
  for (const pages of [10, 24, 25, 26, 40]) {
    const candidate = [{ id: 'arc-' + pages, title, tags: 'artist:artist', pagecount: pages }];
    assert.equal(ctx.isStrictCandidateMatch(title, title, []), true, `strict ${pages}`);
    assert.equal(ctx.isLooseCandidateMatch(title, '長い作品名のタイトル', title, []), true, `loose ${pages}`);
    const classified = ctx.classifyTitleCandidates(title, '長い作品名のタイトル', candidate);
    assert.equal(classified.hits.length, 1, `classified ${pages}`);
  }
});

test('page count hint explains removed pages without changing the verdict wording', () => {
  const ctx = slice('    var sitePageCounts = new Map();', '    function prependLrrMarker(', {
    CONFIG: { uiLanguage: 'zh' },
    t: zh => zh,
    extractGalleryIdentity: () => null,
  });

  assert.match(ctx.describePageCount(30, 30), /一致/);
  assert.match(ctx.describePageCount(30, 28), /差 2 页/);
  assert.match(ctx.describePageCount(30, 28), /仍视为同一作品/);
  // 30 页的容忍度是 max(4, 30*0.12≈4) = 4 页。
  assert.match(ctx.describePageCount(30, 26), /仍视为同一作品/);
  assert.match(ctx.describePageCount(30, 25), /差异较大/);
  // 站点页数未知时只报库内页数，不猜差异。
  assert.match(ctx.describePageCount(0, 24), /库内页数：24/);
  assert.equal(ctx.describePageCount(26, 0), '');
  assert.match(ctx.describePageCount(300, 120), /差异较大/);
});

/* ---------------- P0-2：内存回退必须有上限且可读 ---------------- */

test('in-memory ZIP fallback stops at a readable limit instead of exhausting the tab', async () => {
  const ctx = slice('    function MemoryZipSink()', '    function OpfsZipSink(', {
    t: zh => zh,
    formatGalleryDlBytes: bytes => (bytes / 1024 / 1024) + ' MB',
    MEMORY_ZIP_LIMIT: 8,
    // vm 上下文没有 Web 的 Blob，构造完成后即释放分片是这里要验证的行为。
    Blob,
  });

  const sink = new ctx.MemoryZipSink();
  await sink.write(new Uint8Array(4));
  assert.equal(sink.size, 4);

  let limitError = null;
  try {
    await sink.write(new Uint8Array(8));
  } catch (e) {
    limitError = e;
  }
  assert.ok(limitError, '超过上限必须拒绝写入');
  assert.equal(limitError.galleryFatal, true, '上限错误要终止任务，而不是重试 9 次');
  assert.match(limitError.message, /上限/);

  // 完成时释放分片：Blob 已快照字节，不能把整库继续留在内存里。
  const blob = await sink.finish();
  assert.ok(blob.size >= 4);
  assert.equal(sink.parts.length, 0);
  assert.equal(sink.size, 0);
});

test('createZipSink records why it fell back to memory', async () => {
  const ctx = slice('    // 内存回退的原因', '    function StreamingZipWriter(', {
    OpfsZipSink: { create: async () => { throw new Error('OPFS unavailable'); } },
    MemoryZipSink: function () { this.mode = 'memory'; },
    warn: () => {},
  });

  const sink = await ctx.createZipSink('.eh-pure-1-1.zip');
  assert.equal(sink.mode, 'memory');
  assert.match(ctx.zipSinkFallbackReason, /OPFS unavailable/);
});

/* ---------------- 查重：插件故障不能被当成「库里没有」 ---------------- */

function processGalleryContext(overrides = {}) {
  const markers = [];
  const cacheWrites = [];
  const failures = [];
  const seen = new Set();
  const ctx = slice('    async function processGallery(', '    async function fetchAltSearchHttp(', Object.assign({
    t: zh => zh,
    CONFIG: { enableAltSearch: false },
    lrrScanGeneration: 1,
    normalizeGalleryUrls: url => [url],
    isUrlfinderHit: result => !!(result && result.data && result.data.id),
    urlfinderReportedFailure: result => !!(result && typeof result.error === 'string' && result.error),
    debugLog: () => {},
    hasLrrMarker: () => false,
    prependLrrMarker: (titleElement, text) => markers.push(text),
    setCache: (key, data) => cacheWrites.push({ key, data }),
    handleResponse: () => ({ success: false }),
    noticeLrrLookupFailure: error => failures.push(error),
    seenGalleryUrls: seen,
    lrrLookupRetries: new Map(),
  }, overrides));
  return { ctx, markers, cacheWrites, failures, seen };
}

test('URLFinder plugin failures leave rows unmarked and write no cache', async () => {
  const { ctx, markers, cacheWrites, failures, seen } = processGalleryContext({
    requestUrlfinder: async () => ({ success: 0, error: 'index unavailable' }),
  });
  seen.add('https://e-hentai.org/g/1/t/');

  const result = await ctx.processGallery({ galleryUrl: 'https://e-hentai.org/g/1/t/', titleElement: {}, cacheKey: 'k', generation: 1 });
  assert.equal(result.success, false);
  // 不在库里就不该有任何标记：失败只进面板状态，不贴红标。
  assert.deepEqual(markers, []);
  assert.equal(failures.length, 1);
  // 故障期间不能写未命中缓存，否则会长时间显示「库里没有」。
  assert.equal(cacheWrites.length, 0);
  // 失败条目要从已处理集合移除，下一次扫描自动重试。
  assert.equal(seen.has('https://e-hentai.org/g/1/t/'), false);
});

test('a genuine URLFinder miss is cached with the short-lived miss marker', async () => {
  const { ctx, markers, cacheWrites } = processGalleryContext({
    requestUrlfinder: async () => ({ success: 1, data: null }),
  });

  const result = await ctx.processGallery({ galleryUrl: 'https://e-hentai.org/g/1/t/', titleElement: {}, cacheKey: 'k', generation: 1 });
  assert.equal(result.success, true);
  assert.equal(cacheWrites.length, 1);
  // 未命中只写 miss 标记（走 5 分钟负缓存），不写完整结果。
  assert.equal(cacheWrites[0].data.miss, true);
  assert.deepEqual(markers, []);
});

test('success:0 without an error message is treated as "not found", not as a failure', async () => {
  const { ctx, markers, cacheWrites, failures } = processGalleryContext({
    requestUrlfinder: async () => ({ success: 0 }),
  });

  const result = await ctx.processGallery({ galleryUrl: 'https://e-hentai.org/g/1/t/', titleElement: {}, cacheKey: 'k', generation: 1 });
  assert.equal(result.success, true);
  assert.equal(failures.length, 0);
  assert.deepEqual(markers, []);
  assert.equal(cacheWrites.length, 1);
  assert.equal(cacheWrites[0].data.miss, true);
});

test('only an explicit plugin error counts as a failure', () => {
  const ctx = slice('    function urlfinderReportedFailure(', '    function delay(');
  assert.equal(ctx.urlfinderReportedFailure({ success: 0 }), false);
  assert.equal(ctx.urlfinderReportedFailure({ success: 1, data: null }), false);
  assert.equal(ctx.urlfinderReportedFailure({ success: 0, error: 'plugin disabled' }), true);
  assert.equal(ctx.urlfinderReportedFailure({ error: 'boom' }), true);
  assert.equal(ctx.urlfinderReportedFailure(null), false);
});

test('a failing gallery is retried at most twice per page', async () => {
  const { ctx, seen, failures } = processGalleryContext({
    requestUrlfinder: async () => ({ error: 'boom' }),
  });
  const gallery = { galleryUrl: 'https://e-hentai.org/g/1/t/', titleElement: {}, cacheKey: 'k', generation: 1 };

  // 第 1、2 次失败：从已处理集合移除，下一轮扫描会重试。
  for (let attempt = 1; attempt <= 2; attempt++) {
    seen.add(gallery.galleryUrl);
    await ctx.processGallery(gallery);
    assert.equal(seen.has(gallery.galleryUrl), false, `attempt ${attempt} should retry`);
  }
  // 第 3 次失败后不再自动重发，避免 LRR 长时间不可用时反复扫整页。
  seen.add(gallery.galleryUrl);
  await ctx.processGallery(gallery);
  assert.equal(seen.has(gallery.galleryUrl), true, 'retry budget exhausted');
  assert.equal(failures.length, 3);
});
