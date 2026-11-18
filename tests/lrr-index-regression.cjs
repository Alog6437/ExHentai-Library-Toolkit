const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const { test } = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '../ExHentai_Library_Toolkit.user.js'), 'utf8');
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
const title = '[Studio (Artist)] Weekend Sketchbook Vol.1';
const row = (id = 'a', extra = {}) => ({ arcid: id, title, tags: 'artist:Artist, source:https://e-hentai.org/g/12345/abcdef/', pagecount: 24, size: 200, ...extra });

function load(options = {}) {
  const store = options.store || new Map();
  const requests = [], writes = [], timers = [], rescans = [];
  const context = vm.createContext({
    CONFIG: { enableLrrChecker: true, enableAltSearch: true, lrrServerUrl: 'https://lrr.invalid', lrrApiKey: 'secret', requestTimeoutMs: 1000 },
    crypto: webcrypto, TextEncoder, URL, console, recordRuntimeLog: () => {},
    t: (zh, en) => en, getAuthorizationHeaderValue: key => 'Bearer ' + key,
    setTimeout: (fn, ms) => { const timer = { fn, ms }; timers.push(timer); return timer; }, clearTimeout: () => {},
    gmGet: async (key, fallback) => store.has(key) ? clone(store.get(key)) : fallback,
    gmSet: async (key, value) => { writes.push({ key, value: clone(value) }); store.set(key, clone(value)); },
    fetchLrrServerInfo: async () => ({ total_archives: 1 }),
    makeRequest: async options => { requests.push(options); return { status: 200, responseText: JSON.stringify([row()]) }; },
    clearLrrCache: () => {}, knownLrrTitleAliases: new Map(),
    rescanCurrentPage: value => rescans.push(value), confirm: () => true,
    ...options.globals,
  });
  const matcherStart = source.indexOf('    async function fetchAltSearchHttp(');
  vm.runInContext(source.slice(matcherStart, source.indexOf('    function handleResponse(', matcherStart)), context);
  const start = source.indexOf('    // LRR persistent library index');
  assert.ok(start >= 0, 'persistent index block exists');
  vm.runInContext(source.slice(start, source.indexOf('    // End LRR persistent library index.', start)), context);
  return { ctx: context, store, requests, writes, timers, rescans };
}

async function seed(h, rows = [row()], age = 0) {
  const scope = await h.ctx.getLrrIndexScope();
  const snapshot = h.ctx.buildLrrIndexSnapshot(rows, scope, rows.length, rows.length);
  snapshot.updatedAt -= age;
  h.store.set('eh-lrr-index-v1-' + scope, clone(snapshot));
  return { scope, snapshot };
}

test('index scope hashes server and credentials without storing the API key in its namespace', async () => {
  const { ctx } = load();
  const first = await ctx.getLrrIndexScope();
  assert.match(first, /^[a-f0-9]{64}$/);
  ctx.CONFIG.lrrApiKey = 'changed';
  assert.notEqual(await ctx.getLrrIndexScope(), first);
  ctx.CONFIG.lrrApiKey = 'secret'; ctx.CONFIG.lrrServerUrl += '/subpath';
  assert.notEqual(await ctx.getLrrIndexScope(), first);
});

test('snapshot validation rejects wrong scope, malformed metadata, duplicate IDs and changing counts', () => {
  const { ctx } = load();
  const snapshot = ctx.buildLrrIndexSnapshot([row()], 'scope', 1, 1);
  assert.equal(ctx.validateLrrIndexSnapshot(snapshot, 'scope'), true);
  assert.equal(ctx.validateLrrIndexSnapshot(snapshot, 'other'), false);
  for (const patch of [{ complete: false }, { count: 2 }, { version: 99 }, { updatedAt: 0 }]) {
    assert.equal(ctx.validateLrrIndexSnapshot({ ...snapshot, ...patch }, 'scope'), false);
  }
  for (const args of [[{}, 'scope', 1, 1], [[row()], 'scope', 1, 2], [[row()], 'scope', 0, 0], [[row(), row()], 'scope', 2, 2], [[row('a', { tags: null })], 'scope', 1, 1]]) {
    assert.throws(() => ctx.buildLrrIndexSnapshot(...args));
  }
});

test('saved snapshots survive a new script context and load only once per context', async () => {
  const first = load();
  await seed(first);
  const second = load({ store: first.store });
  await Promise.all([second.ctx.loadLrrLibraryIndex(), second.ctx.loadLrrLibraryIndex()]);
  assert.equal(second.ctx.lrrLibraryIndex.snapshot.count, 1);
  assert.equal(second.requests.length, 0);
  assert.equal(second.ctx.lookupLrrLibraryIndex('https://exhentai.org/g/12345/abcdef/', '').exactHits[0].id, 'a');
  const third = load({ store: first.store, globals: { CONFIG: { ...second.ctx.CONFIG, lrrApiKey: 'other-key' } } });
  await third.ctx.loadLrrLibraryIndex();
  assert.equal(third.ctx.lrrLibraryIndex.snapshot, null);
});

test('source lookup requires an approved host and complete gid/token identity', () => {
  const { ctx } = load();
  const snapshot = ctx.buildLrrIndexSnapshot([row(), row('b', { tags: 'artist:https://e-hentai.org/g/99999/abcdef/, source:https://evil.invalid/g/88888/abcdef/' })], 'scope', 2, 2);
  ctx.installLrrLibraryIndex(snapshot);
  for (const host of ['e-hentai.org', 'exhentai.org', 'g.e-hentai.org']) {
    assert.equal(ctx.lookupLrrLibraryIndex('https://' + host + '/g/12345/abcdef/?p=2', '').exactHits[0].id, 'a');
  }
  for (const url of ['https://evil.invalid/g/12345/abcdef/', 'https://e-hentai.org/g/12345/changed/', 'https://e-hentai.org/g/99999/abcdef/']) {
    assert.equal(ctx.lookupLrrLibraryIndex(url, '').exactHits.length, 0);
  }
});

test('protocol-less LANraragi source tags confirm the same gallery across supported hosts', () => {
  const { ctx } = load();
  for (const address of ['exhentai.org/g/3799818/f5421018e7', 'e-hentai.org/g/3799818/f5421018e7/', 'g.e-hentai.org/g/3799818/f5421018e7/', '//exhentai.org/g/3799818/f5421018e7/', 'https://exhentai.org/g/3799818/f5421018e7/']) {
    ctx.installLrrLibraryIndex(ctx.buildLrrIndexSnapshot([row('same', { tags: 'artist:Artist, Source: ' + address })], 'scope', 1, 1));
    const result = ctx.lookupLrrLibraryIndex('https://e-hentai.org/g/3799818/f5421018e7/', title);
    assert.equal(result.exactHits[0].id, 'same', address);
    assert.equal(result.hits.length, 0, 'source identity must take precedence over title');
  }
});

test('bare source parsing rejects lookalike hosts, other tags and mismatched gallery identities', () => {
  const { ctx } = load();
  for (const tags of ['source:exhentai.org.evil.invalid/g/3799818/f5421018e7/', 'source:evil.invalid/g/3799818/f5421018e7/', 'artist:exhentai.org/g/3799818/f5421018e7/', 'source:exhentai.org/g/3799818/other/', 'source:javascript:exhentai.org/g/3799818/f5421018e7/']) {
    ctx.installLrrLibraryIndex(ctx.buildLrrIndexSnapshot([row('not-source', { tags })], 'scope', 1, 1));
    assert.equal(ctx.lookupLrrLibraryIndex('https://e-hentai.org/g/3799818/f5421018e7/', '').exactHits.length, 0, tags);
  }
});

test('local title matching retains strict author and volume verification', () => {
  const { ctx } = load();
  ctx.installLrrLibraryIndex(ctx.buildLrrIndexSnapshot([row('good', { tags: 'artist:Artist' }), row('volume', { title: title.replace('Vol.1', 'Vol.2'), tags: '' }), row('author', { title: title.replace('(Artist)', '(Other)'), tags: 'artist:Other' })], 'scope', 3, 3));
  const result = ctx.lookupLrrLibraryIndex('https://e-hentai.org/g/7/abcdef/', title + ' [中国翻訳]');
  assert.deepEqual(Array.from(result.hits, item => item.id), ['good']);
  assert.equal(ctx.lookupLrrLibraryIndex('https://e-hentai.org/g/7/abcdef/', '[Different] Entirely Unrelated Work').hits.length, 0);
});

test('source-confirmed Japanese aliases remain usable for later locally checked galleries', () => {
  const { ctx } = load();
  const entry = row('romaji', { title: '[Studio (Artist)] Natsu no Toshokan', tags: 'artist:Artist' });
  ctx.installLrrLibraryIndex(ctx.buildLrrIndexSnapshot([entry], 'scope', 1, 1));
  ctx.lrrScanGeneration = 1;
  ctx.collectLrrGalleryEntries = () => [];
  const japanese = '[Studio (Artist)] 夏の図書館で過ごす休日';
  ctx.registerKnownLrrTitle(japanese, ctx.lrrLibraryIndex.snapshot.archives[0], 1);
  const result = ctx.lookupLrrLibraryIndex('https://e-hentai.org/g/76543/abcdef/', japanese + ' [中国翻訳]');
  assert.deepEqual(Array.from(result.hits, item => item.id), ['romaji']);
});

test('synchronization coalesces concurrent callers and atomically persists a complete snapshot', async () => {
  const h = load();
  const a = h.ctx.syncLrrLibraryIndex(true), b = h.ctx.syncLrrLibraryIndex(true);
  assert.equal(a, b);
  assert.equal(await a, true);
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].url, 'https://lrr.invalid/api/archives');
  assert.equal(h.requests[0].headers.Authorization, 'Bearer secret');
  const snapshots = h.writes.filter(item => item.key.startsWith('eh-lrr-index-v1-'));
  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0].value.complete, true);
  assert.equal(JSON.stringify(snapshots).includes('secret'), false);
  assert.equal(h.ctx.lrrLibraryIndex.snapshot.count, 1);
  assert.ok(h.timers.some(timer => timer.ms === 30 * 60 * 1000));
});

test('a fresh saved index skips network, but manual sync refreshes same-count metadata', async () => {
  const h = load();
  await seed(h, [row('old')]);
  assert.equal(await h.ctx.syncLrrLibraryIndex(false), false);
  assert.equal(h.requests.length, 0);
  assert.equal(await h.ctx.syncLrrLibraryIndex(true), true);
  assert.equal(h.ctx.lrrLibraryIndex.snapshot.archives[0].id, 'a');
});

test('network, 204, malformed responses, duplicate IDs and storage failures preserve the previous snapshot', async () => {
  for (const failure of ['network', '204', 'json', 'object', 'duplicate', 'storage']) {
    const h = load();
    await seed(h, [row('old')]);
    await h.ctx.loadLrrLibraryIndex();
    const previous = h.ctx.lrrLibraryIndex.snapshot;
    if (failure === 'storage') {
      h.ctx.gmSet = async (key, value) => { if (key.startsWith('eh-lrr-index-v1-')) throw new Error('Quota exceeded'); h.store.set(key, clone(value)); };
    } else h.ctx.makeRequest = async () => {
      if (failure === 'network') throw new Error('Offline');
      return { status: failure === '204' ? 204 : 200, responseText: failure === 'json' ? '{' : failure === 'object' ? '{}' : JSON.stringify([row(), row()]) };
    };
    assert.equal(await h.ctx.syncLrrLibraryIndex(true), false, failure);
    assert.equal(h.ctx.lrrLibraryIndex.snapshot, previous, failure);
    assert.ok(h.ctx.lrrLibraryIndex.nextAttempt > Date.now(), failure);
    assert.match(h.ctx.lrrLibraryIndex.status, /retained/i);
  }
});

test('missing-file count differences are accepted only after verifying a stable full ID set', async () => {
  const h = load({ globals: { fetchLrrServerInfo: async () => ({ total_archives: 2 }) } });
  assert.equal(await h.ctx.syncLrrLibraryIndex(true), true);
  assert.equal(h.requests.length, 2);
  const changing = load({ globals: { fetchLrrServerInfo: async () => ({ total_archives: 2 }) } });
  let count = 0;
  changing.ctx.makeRequest = async () => ({ status: 200, responseText: JSON.stringify([row(String(++count))]) });
  assert.equal(await changing.ctx.syncLrrLibraryIndex(true), false);
  assert.equal(changing.ctx.lrrLibraryIndex.snapshot, null);
});

test('a sharp library reduction requires explicit confirmation before replacing saved data', async () => {
  const h = load();
  await seed(h, Array.from({ length: 10 }, (_, i) => row(String(i))), 31 * 60 * 1000);
  await h.ctx.loadLrrLibraryIndex();
  const previous = h.ctx.lrrLibraryIndex.snapshot;
  assert.equal(await h.ctx.syncLrrLibraryIndex(false), false);
  assert.equal(h.ctx.lrrLibraryIndex.snapshot, previous);
  h.ctx.confirm = () => false;
  assert.equal(await h.ctx.syncLrrLibraryIndex(true), false);
  assert.equal(h.ctx.lrrLibraryIndex.snapshot, previous);
  h.ctx.confirm = () => true;
  assert.equal(await h.ctx.syncLrrLibraryIndex(true), true);
  assert.equal(h.ctx.lrrLibraryIndex.snapshot.count, 1);
});

test('another tab can refresh the shared snapshot without this tab fetching the library again', async () => {
  const h = load();
  const { scope } = await seed(h, [row('old')], 31 * 60 * 1000);
  await h.ctx.loadLrrLibraryIndex();
  const fresh = h.ctx.buildLrrIndexSnapshot([row('new')], scope, 1, 1);
  h.store.set('eh-lrr-index-v1-' + scope, clone(fresh));
  assert.equal(await h.ctx.syncLrrLibraryIndex(false), false);
  assert.equal(h.requests.length, 0);
  assert.equal(h.ctx.lrrLibraryIndex.snapshot.archives[0].id, 'new');
});

test('an active other-tab lease defers synchronization without downloading metadata', async () => {
  const h = load();
  const scope = await h.ctx.getLrrIndexScope();
  h.store.set('eh-lrr-index-lease-v1-' + scope, { owner: 'other-tab', until: Date.now() + 60000 });
  assert.equal(await h.ctx.syncLrrLibraryIndex(true), false);
  assert.equal(h.requests.length, 0);
  assert.ok(h.timers.some(timer => timer.ms > 1000 && timer.ms <= 61000));
});

test('expired or superseded leases cannot publish a late response over another tab', async () => {
  for (const expired of [false, true]) {
    const h = load(); const scope = await h.ctx.getLrrIndexScope();
    h.ctx.makeRequest = async () => {
      const key = 'eh-lrr-index-lease-v1-' + scope;
      const own = h.store.get(key);
      h.store.set(key, expired ? { ...own, until: 0 } : { owner: 'newer-tab', until: Date.now() + 60000 });
      return { status: 200, responseText: JSON.stringify([row()]) };
    };
    assert.equal(await h.ctx.syncLrrLibraryIndex(true), false);
    assert.equal(h.ctx.lrrLibraryIndex.snapshot, null);
    assert.equal(h.writes.filter(item => item.key.startsWith('eh-lrr-index-v1-')).length, 0);
  }
});

test('failed synchronization releases expired seen misses only once per snapshot', async () => {
  const h = load(); await seed(h, [row()], 31 * 60 * 1000);
  await h.ctx.loadLrrLibraryIndex();
  let rescans = 0; h.ctx.rescanCurrentPage = () => rescans++;
  h.ctx.makeRequest = async () => { throw new Error('offline'); };
  assert.equal(await h.ctx.syncLrrLibraryIndex(true), false);
  assert.equal(rescans, 1);
  assert.equal(await h.ctx.syncLrrLibraryIndex(true), false);
  assert.equal(rescans, 1);
});

test('configuration changes and library count drift reject in-flight synchronization', async () => {
  for (const mode of ['credentials', 'count']) {
    const h = load(); let count = 0;
    h.ctx.fetchLrrServerInfo = async () => ({ total_archives: mode === 'count' ? ++count : 1 });
    h.ctx.makeRequest = async () => {
      if (mode === 'credentials') h.ctx.CONFIG.lrrApiKey = 'replacement-key';
      return { status: 200, responseText: JSON.stringify([row()]) };
    };
    assert.equal(await h.ctx.syncLrrLibraryIndex(true), false);
    assert.equal(h.ctx.lrrLibraryIndex.snapshot, null);
    assert.equal(h.writes.filter(item => item.key.startsWith('eh-lrr-index-v1-')).length, 0);
  }
});

test('local results bypass remote requests, while an expired local miss falls back remotely', async () => {
  const h = load();
  await seed(h);
  await h.ctx.loadLrrLibraryIndex();
  const markers = []; let remote = 0;
  Object.assign(h.ctx, {
    lrrScanGeneration: 1, getGalleryTitlePlain: element => element.textContent,
    normalizeGalleryUrls: url => [url], debugLog: () => {},
    requestUrlfinder: async () => { remote++; return { success: 0 }; },
    urlfinderReportedFailure: () => false, isUrlfinderHit: () => false,
    setCache: () => {}, handleResponse: () => ({ success: true }),
    prependLrrMarker: (...args) => markers.push(args), registerKnownLrrTitle: () => {},
  });
  const start = source.indexOf('    async function processGallery(');
  vm.runInContext(source.slice(start, source.indexOf('    async function fetchAltSearchHttp(', start)), h.ctx);
  const gallery = { galleryUrl: 'https://exhentai.org/g/12345/abcdef/', titleElement: { textContent: '' }, generation: 1, cacheKey: 'test' };
  assert.equal((await h.ctx.processGallery(gallery)).localIndex, true);
  assert.equal(markers.length, 1);
  const miss = { ...gallery, galleryUrl: 'https://e-hentai.org/g/2/abcdef/' };
  assert.equal((await h.ctx.processGallery(miss)).localIndex, true);
  assert.equal(remote, 0);
  h.ctx.lrrLibraryIndex.snapshot.updatedAt -= 31 * 60 * 1000;
  assert.equal((await h.ctx.processGallery(miss)).success, true);
  assert.equal(remote, 1);
  assert.equal((await h.ctx.processGallery({ ...gallery, generation: 0 })).stale, true);
  assert.equal(markers.length, 1);
});

test('disabled checking and missing server never fetch or schedule background synchronization', async () => {
  for (const patch of [{ enableLrrChecker: false }, { lrrServerUrl: '' }]) {
    const h = load(); Object.assign(h.ctx.CONFIG, patch);
    h.ctx.startLrrIndexSync();
    assert.equal(await h.ctx.syncLrrLibraryIndex(true), false);
    assert.equal(h.requests.length, 0);
    assert.equal(h.timers.length, 0);
  }
});
