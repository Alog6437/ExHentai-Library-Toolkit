const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../ExHentai_Library_Toolkit.user.js'), 'utf8');
function load(globals = {}) {
  const context = vm.createContext({ altSearchInflight: new Map(), knownLrrTitleAliases: new Map(),
    collectLrrGalleryEntries: () => [], getLrrMarkerScope: () => null, ...globals });
  const start = source.indexOf('    async function fetchAltSearchHttp(');
  const end = source.indexOf('    function handleResponse(', start);
  vm.runInContext(source.slice(start, end), context);
  Object.assign(context, globals);
  return context;
}

const original = '[サークル (作者)] 夏の図書館～放課後の物語～ (オリジナル)';
const translated = original + ' [中国翻訳] [DL版]';

test('translation and edition suffixes match in both directions, including fullwidth brackets', () => {
  const ctx = load();
  for (const candidate of [translated, translated.replace(/\[/g, '［').replace(/\]/g, '］'), original + '.cbz']) {
    assert.equal(ctx.isStrictCandidateMatch(original, candidate), true);
    assert.equal(ctx.isStrictCandidateMatch(candidate, original), true);
  }
  assert.equal(ctx.isStrictCandidateMatch(original, original.replace('サークル (作者)', '別サークル (別人)')), false);
  assert.equal(ctx.isLooseCandidateMatch(original, '夏の図書館', '[サークル (作者)] 夏の図書館で出会った別の物語'), false);
});

test('fallback finds punctuation variants, rejects unrelated candidates and stops on a verified hit', async () => {
  const requests = [], markers = [], cache = new Map();
  const ctx = load({
    hasLrrMarker: () => false, lrrScanGeneration: 1,
    simpleHash: value => value, getCache: key => cache.get(key),
    setCache: (key, value) => cache.set(key, value),
    runAltSearchLimited: fn => fn(),
    prependLrrMarker: (...args) => markers.push(args),
    fetchAltSearchHttp: async query => {
      requests.push(query);
      return { hits: query === '放課後の物語'
        ? [{ id: 'saved', title: original.replace(/～/g, ' - ') }]
        : [{ id: 'wrong', title: '[サークル (作者)] 夏の図書館で出会った別の物語' }] };
    },
  });
  const title = ctx.extractLooseTitleParts(translated).shortTitle;
  const result = await ctx.performLooseTitleSearch(title, translated, {}, 1);
  assert.equal(result.success, true);
  assert.equal(result.hits[0].id, 'saved');
  assert.deepEqual(requests, [title, '放課後の物語']);
  assert.equal(markers[0][1], '(LRR ≈)');
  await ctx.performLooseTitleSearch(title, translated, {}, 1);
  assert.equal(requests.length, 2);
});

test('fallback requests are bounded and stale scans cannot add markers or cache misses', async () => {
  const ctx = load();
  assert.ok(ctx.buildLooseSearchQueries('alpha bravo charlie delta echo foxtrot').length <= 4);
  assert.deepEqual(Array.from(ctx.buildLooseSearchQueries('ab cd')), ['ab cd']);
  let requests = 0, writes = 0;
  Object.assign(ctx, {
    hasLrrMarker: () => false, lrrScanGeneration: 1, simpleHash: value => value,
    getCache: () => null, setCache: () => writes++, prependLrrMarker: () => writes++,
    runAltSearchLimited: fn => fn(),
    fetchAltSearchHttp: async () => { requests++; ctx.lrrScanGeneration++; return { hits: [] }; },
  });
  const result = await ctx.performLooseTitleSearch('夏の図書館～放課後の物語', translated, {}, 1);
  assert.equal(result.stale, true);
  assert.equal(requests, 1);
  assert.equal(writes, 0);
});

test('page rescan removes current strict and loose negative caches', () => {
  const ctx = load({ simpleHash: value => value, getGalleryTitlePlain: value => value });
  const parts = ctx.extractLooseTitleParts(translated);
  const cache = new Map([
    ['lrr-checker-v2-gallery', {}],
    ['lrr-checker-v5-alt-strict-' + translated + '|' + parts.author + ',' + parts.shortTitle, { altHit: false }],
    ['lrr-checker-v5-loose-' + translated + '|' + parts.shortTitle, { altHit: false }],
    ['unrelated', {}],
  ]);
  Object.assign(ctx, {
    collectLrrGalleryEntries: () => [{ galleryUrl: 'gallery', titleElement: translated }],
    localStorage: { getItem: key => cache.get(key) ?? null, removeItem: key => cache.delete(key) },
  });
  const start = source.indexOf('    function getAltCacheKeyFromTitle(');
  const end = source.indexOf('    function rescanCurrentPage(', start);
  assert.ok(end > start);
  vm.runInContext(source.slice(start, end), ctx);
  assert.equal(ctx.clearCurrentPageLrrCache(), 3);
  assert.deepEqual([...cache.keys()], ['unrelated']);
});

test('prefix parsing handles events, Unicode and translator suffixes without losing real title words', () => {
  const ctx = load();
  const decorated = '(C104) 【Circle (Artist)】 English Lessons [After School] (Original) [某某汉化组] [Digital].cbz';
  const parts = ctx.extractLooseTitleParts(decorated);
  assert.equal(parts.author, 'Circle (Artist)');
  assert.equal(parts.shortTitle, 'English Lessons [After School]');
  assert.equal(ctx.isStrictCandidateMatch(decorated, '[Artist] English Lessons [After School] (Original)'), true);
  assert.equal(ctx.isStrictCandidateMatch(decorated, '[Artist] Lessons [After School] (Original)'), false);
  assert.equal(ctx.isStrictCandidateMatch(decorated, '[Artist] English Lessons [Before School] (Original)'), false);
  assert.equal(ctx.extractLooseTitleParts('夏の図書館の不思議な物語 [某某汉化组]').author, '');
  assert.equal(ctx.isLooseCandidateMatch('夏の図書館の不思議な物語 [某某汉化组]', '夏の図書館', '夏の図書館の不思議な物語.cbz'), true);
  assert.equal(ctx.isStrictCandidateMatch('[Ａｒｔｉｓｔ] Midnight\u200b Library', '[artist] Midnight Library'), true);
});

test('circle and artist aliases match, while different named artists and near names are rejected', () => {
  const ctx = load();
  const title = '真夜中の図書館で出会う不思議な物語';
  for (const author of ['Circle', 'Artist', 'New Circle (Artist)']) {
    assert.equal(ctx.isStrictCandidateMatch(`[Circle (Artist)] ${title}`, `[${author}] ${title}`), true, author);
  }
  for (const [a, b] of [['Circle (Artist)', 'Circle (Other)'], ['Artist', 'Artists'], ['Aki', 'Saki']]) {
    assert.equal(ctx.isLooseCandidateMatch(`[${a}] ${title}`, title, `[${b}] ${title}`), false, `${a}/${b}`);
  }
});

test('archive artist and group tags supply missing author evidence and expose conflicting artists', () => {
  const ctx = load();
  const title = '真夜中の図書館で出会う不思議な物語';
  const sourceTitle = `[Circle (Artist)] ${title}`;
  assert.equal(ctx.isStrictCandidateMatch(sourceTitle, title, 'artist:artist, language:english'), true);
  assert.equal(ctx.isStrictCandidateMatch(sourceTitle, title, ['group:circle']), true);
  assert.equal(ctx.isLooseCandidateMatch(sourceTitle, title, title, 'group:circle, artist:other'), false);
  assert.equal(ctx.isLooseCandidateMatch(sourceTitle, title, title, 'artist:other'), false);
  assert.equal(ctx.isLooseCandidateMatch(sourceTitle, title, `[Circle] ${title}`, 'artist:other'), false);
});

test('volume, chapter and story-part identities prevent false positives even for very similar titles', () => {
  const ctx = load();
  const base = '[Artist] 真夜中の図書館で出会う不思議な物語';
  for (const [a, b] of [['Vol. 02', '第2巻'], ['Vol. IV', '第4巻'], ['Vol. 1.5', '第1.5巻'], ['Chapter 12', '第十二話'], ['第02话', '第2話']]) {
    assert.equal(ctx.isStrictCandidateMatch(`${base} ${a}`, `${base} ${b}`), true, `${a}/${b}`);
  }
  for (const [a, b] of [['1', '2'], ['第1話', '第2話'], ['第1話', ''], ['第1巻', '第1話'],
    ['上巻', '下巻'], ['前編', '後編'], ['番外編', ''], ['総集編', ''], ['1-3', '1-4'], ['1.5', '1.6'], ['1.05', '1.5']]) {
    assert.equal(ctx.isLooseCandidateMatch(`${base} ${a}`, '図書館', `${base} ${b}`), false, `${a}/${b}`);
  }
});

test('full-title verification allows limited typos and omitted parody suffixes, but never a query-only match', () => {
  const ctx = load();
  const title = '真夜中の図書館で出会う不思議な物語';
  assert.equal(ctx.isStrictCandidateMatch(`[Artist] ${title}`, `[Artist] ${title.replace('真', '深')}`), true);
  assert.equal(ctx.isStrictCandidateMatch(`[Artist] ${title} (Original)`, `[Artist] ${title}`), true);
  assert.equal(ctx.isLooseCandidateMatch(`[Artist] ${title} (Original)`, title, `[Artist] ${title} (Other Work)`), false);
  assert.equal(ctx.isLooseCandidateMatch(`[Artist] ${title.repeat(5)} (Original)`, title, `[Artist] ${title.repeat(5)} (Other Work)`), false);
  assert.equal(ctx.isLooseCandidateMatch(`[Artist] ${title}`, '図書館', '[Artist] 図書館'), false);
  assert.equal(ctx.isLooseCandidateMatch('夏の図書館', '夏の図書館', '夏の図書館'), false);
  assert.equal(ctx.isStrictCandidateMatch('[Artist] 夏の図書館', '[Artist] 夏の図書館'), true);
  assert.equal(ctx.isStrictCandidateMatch('[Artist] 夏の空 (Very Long Shared Original Series Title)',
    '[Artist] 冬の空 (Very Long Shared Original Series Title)'), false);
  assert.equal(ctx.isLooseCandidateMatch('[Artist] alpha bravo charlie delta', 'alpha', '[Artist] delta charlie bravo alpha'), false);
  assert.equal(ctx.titleEditScore('a'.repeat(600), 'a'.repeat(599) + 'b'), 0);
});

function searchContext(overrides = {}) {
  const cache = new Map(), markers = [];
  const ctx = load({
    CONFIG: { lrrServerUrl: 'http://lrr.test', searchTimeoutMs: 1000 },
    URLSearchParams, lrrScanGeneration: 1, simpleHash: value => value,
    getCache: key => cache.get(key), setCache: (key, value) => cache.set(key, value),
    hasLrrMarker: () => false, runAltSearchLimited: fn => Promise.resolve().then(fn),
    prependLrrMarker: (...args) => markers.push(args), delay: async () => {},
    ...overrides,
  });
  return { ctx, cache, markers };
}

test('bounded CJK fragments retrieve typo candidates and always verify the full title', async () => {
  const title = '真夜中の図書館で出会う不思議な物語';
  const requests = [];
  const { ctx } = searchContext({ fetchAltSearchHttp: async query => {
    requests.push(query);
    return { hits: query === title ? [{ id: 'wrong', title: '[Artist] 図書館' }] :
      [{ id: 'saved', title: `[Artist] ${title.replace('真', '深')}` }] };
  } });
  const result = await ctx.performLooseTitleSearch(title, `[Artist] ${title}`, {}, 1);
  assert.equal(result.success, true);
  assert.equal(result.hits[0].id, 'saved');
  assert.equal(requests.length, 2);
  assert.ok(ctx.buildLooseSearchQueries(title).length <= 4);
});

test('search paginates to find later archives and treats punctuation as literal search text', async () => {
  const requests = [];
  const { ctx } = searchContext({ makeRequest: async options => {
    const url = new URL(options.url);
    requests.push(url);
    const start = Number(url.searchParams.get('start'));
    return { status: 200, responseText: JSON.stringify({ recordsFiltered: 2,
      data: [{ arcid: start ? 'saved' : 'wrong', title: start ? original : 'unrelated' }] }) };
  } });
  const result = await ctx.fetchAltSearchHttp('Circle,Title - Part: A?');
  assert.deepEqual(requests.map(url => url.searchParams.get('start')), ['0', '1']);
  assert.equal(requests[0].searchParams.get('filter'), 'Circle,Title - Part A');
  assert.equal(requests[0].searchParams.get('groupby_tanks'), 'false');
  assert.equal(result.hits[1].id, 'saved');
  assert.equal(result.incomplete, undefined);
});

test('screenshot titles are retrieved using LANraragi substring semantics before local verification', async () => {
  const sourceTitle = '(C108) [乱視と君と。 (santa)] 彼女催眠4 [中国翻訳]';
  const savedTitle = '(C108) [乱視と君と。(santa)] 彼女催眠4 [中国翻訳]';
  const queries = [];
  const { ctx, markers } = searchContext({ makeRequest: async options => {
    const query = new URL(options.url).searchParams.get('filter');
    queries.push(query);
    // LRR Search.pm sets isexact for quoted terms: title lookup is term + NUL + ID,
    // whereas unquoted terms use *term*. A fixed HTTP response would hide this bug.
    const matches = query.split(',').filter(Boolean).every(term => {
      term = term.trim().toLowerCase();
      return term.startsWith('"') && term.endsWith('"')
        ? savedTitle.toLowerCase() === term.slice(1, -1)
        : savedTitle.toLowerCase().includes(term);
    });
    return { status: 200, responseText: JSON.stringify({ recordsFiltered: matches ? 1 : 0,
      data: matches ? [{ arcid: 'screenshot-archive', title: savedTitle, tags: 'artist:santa' }] : [] }) };
  } });
  assert.equal(ctx.isStrictCandidateMatch(sourceTitle, savedTitle), true);
  const result = await ctx.performLooseTitleSearch('彼女催眠4', sourceTitle, {}, 1);
  assert.equal(result.success, true);
  assert.equal(result.hits[0].id, 'screenshot-archive');
  assert.equal(queries[0], '彼女催眠4');
  assert.equal(markers[0][1], '(LRR ≈)');
});

test('search strips exclusion operators and skips operator-only queries rather than fetching the whole library', async () => {
  const queries = [];
  const { ctx } = searchContext({ makeRequest: async options => {
    queries.push(new URL(options.url).searchParams.get('filter'));
    return { status: 200, responseText: '{"data":[],"recordsFiltered":0}' };
  } });
  await ctx.fetchAltSearchHttp('- -Midnight Library,$ ?*');
  assert.deepEqual(queries, ['Midnight Library']);
  assert.equal((await ctx.fetchAltSearchHttp('"$*?_%:,')).incomplete, true);
  assert.equal(queries.length, 1);
});

test('new search cache namespace bypasses incorrect v6 negative results', async () => {
  const { ctx, cache } = searchContext({ fetchAltSearchHttp: async () => ({
    hits: [{ id: 'saved', title: '[Artist] Midnight Library' }],
  }) });
  cache.set('lrr-checker-v6-loose-http://lrr.test|[Artist] Midnight Library|Midnight Library', { altHit: false });
  cache.set('lrr-checker-v6-raw-http://lrr.test|Midnight Library', { altHit: false });
  const result = await ctx.performLooseTitleSearch('Midnight Library', '[Artist] Midnight Library', {}, 1);
  assert.equal(result.success, true);
  assert.equal(result.hits[0].id, 'saved');
  assert.match(ctx.getTitleSearchCacheKey('raw', 'Midnight Library'), /^lrr-checker-v8-raw-/);
});

test('pagination is bounded and detects repeated pages instead of claiming a complete miss', async () => {
  for (const repeated of [false, true]) {
    let requests = 0;
    const { ctx } = searchContext({ makeRequest: async () => ({ status: 200,
      responseText: JSON.stringify({ recordsFiltered: 1000,
        data: [{ arcid: repeated ? 'same' : String(++requests), title: 'unrelated' }] }) }) });
    const result = await ctx.fetchAltSearchHttp('title');
    assert.equal(result.incomplete, true);
    assert.equal(result.hits.length, repeated ? 1 : 3);
    if (!repeated) assert.equal(requests, 3);
  }
});

test('unfinished index, empty bodies and invalid responses never poison negative caches', async () => {
  for (const response of [{ status: 204, responseText: '' }, { status: 200, responseText: '' },
    { status: 200, responseText: '{"error":"index unavailable"}' }, { status: 200, responseText: 'invalid' }]) {
    const { ctx, cache } = searchContext({ makeRequest: async () => response });
    const result = await ctx.performLooseTitleSearch('Midnight Library', '[Artist] Midnight Library', {}, 1);
    assert.equal(result.success, false);
    assert.equal(cache.size, 0, JSON.stringify(response));
  }
});

test('strict and loose searches share raw requests, validate tags and separate server caches', async () => {
  let requests = 0;
  const { ctx, cache, markers } = searchContext({ fetchAltSearchHttp: async () => {
    requests++;
    return { hits: [{ id: 'saved', title: 'Midnight Library', tags: 'artist:artist' }] };
  } });
  const results = await Promise.all([
    ctx.performAlternativeSearch('Midnight Library', '[Artist] Midnight Library', {}, 1),
    ctx.performLooseTitleSearch('Midnight Library', '[Artist] Midnight Library', {}, 1),
  ]);
  assert.ok(results.every(result => result.success));
  assert.equal(requests, 1);
  assert.equal(markers.length, 2);
  // A different source uses the same raw candidates but must receive its own author verification.
  const rejected = await ctx.performAlternativeSearch('Midnight Library', '[Other] Midnight Library', {}, 1);
  assert.equal(rejected.success, false);
  assert.equal(requests, 1);
  ctx.CONFIG.lrrServerUrl = 'http://other.test';
  await ctx.performLooseTitleSearch('Midnight Library', '[Artist] Midnight Library', {}, 1);
  assert.equal(requests, 2);
  assert.ok(cache.size > 0);
});

test('stale queued and finished searches cannot write caches or markers, including strict searches', async () => {
  let release;
  const { ctx, cache, markers } = searchContext({ fetchAltSearchHttp: () => new Promise(resolve => { release = resolve; }) });
  const pending = ctx.performAlternativeSearch('Midnight Library', '[Artist] Midnight Library', {}, 1);
  await Promise.resolve();
  ctx.lrrScanGeneration++;
  release({ hits: [{ id: 'saved', title: '[Artist] Midnight Library' }] });
  assert.equal((await pending).stale, true);
  assert.equal(cache.size, 0);
  assert.equal(markers.length, 0);
  assert.equal((await ctx.performLooseTitleSearch('Midnight Library', '[Artist] Midnight Library', {}, 1)).stale, true);
});

test('manual page rescan also removes current raw search caches so newly added archives can be found', () => {
  const { ctx, cache } = searchContext();
  Object.assign(ctx, { getGalleryTitlePlain: value => value,
    collectLrrGalleryEntries: () => [{ galleryUrl: 'gallery', titleElement: translated }],
    localStorage: { getItem: key => cache.get(key) ?? null, removeItem: key => cache.delete(key) },
  });
  const parts = ctx.extractLooseTitleParts(translated);
  const queries = [parts.author + ',' + parts.shortTitle, ...ctx.buildLooseSearchQueries(parts.shortTitle)];
  for (const query of queries) cache.set(ctx.getTitleSearchCacheKey('raw', query), { altHit: false });
  cache.set(ctx.getTitleSearchCacheKey('loose', translated + '|' + parts.shortTitle), { altHit: false });
  cache.set('unrelated', {});
  const start = source.indexOf('    function getAltCacheKeyFromTitle(');
  vm.runInContext(source.slice(start, source.indexOf('    function rescanCurrentPage(', start)), ctx);
  assert.equal(ctx.clearCurrentPageLrrCache(), queries.length + 1);
  assert.deepEqual([...cache.keys()], ['unrelated']);
});

test('negative title cache expires sooner than a verified positive result', () => {
  const values = new Map();
  const ctx = vm.createContext({ Date: { now: () => 600001 }, CACHE_DURATION: 1800000,
    LRR_NEGATIVE_CACHE_EXPIRE: 300000, localStorage: { getItem: key => values.get(key), removeItem: key => values.delete(key) } });
  const start = source.indexOf('    function getCache(');
  vm.runInContext(source.slice(start, source.indexOf('    function setCache(', start)), ctx);
  values.set('negative', JSON.stringify({ timestamp: 1, data: { altHit: false } }));
  values.set('positive', JSON.stringify({ timestamp: 1, data: { altHit: true } }));
  values.set('lrr-checker-v6-raw-candidates', JSON.stringify({ timestamp: 1, data: { altHit: true } }));
  values.set('lrr-checker-v7-raw-candidates', JSON.stringify({ timestamp: 1, data: { altHit: true } }));
  assert.equal(ctx.getCache('negative'), null);
  assert.equal(ctx.getCache('positive').altHit, true);
  assert.equal(ctx.getCache('lrr-checker-v6-raw-candidates'), null);
  assert.equal(ctx.getCache('lrr-checker-v7-raw-candidates'), null);
});

test('URLFinder plugin failures still allow a verified title match without an error badge', async () => {
  const { ctx, markers } = searchContext({
    CONFIG: { enableAltSearch: true, lrrServerUrl: 'http://lrr.test' },
    getGalleryTitlePlain: () => '[Artist] Midnight Library',
    fetchAltSearchHttp: async () => ({ hits: [{ id: 'saved', title: '[Artist] Midnight Library' }] }),
    normalizeGalleryUrls: url => [url], requestUrlfinder: async () => { throw new Error('plugin unavailable'); },
    debugLog: () => {}, console: { error: () => {} }, isUrlfinderHit: () => false,
  });
  const from = source.indexOf('    async function processGallery(');
  vm.runInContext(source.slice(from, source.indexOf('    async function fetchAltSearchHttp(', from)), ctx);
  const start = source.indexOf('    function handleResponse(');
  vm.runInContext(source.slice(start, source.indexOf('    function getLrrGalleryEntryFromLink(', start)), ctx);
  const result = await ctx.processGallery({ galleryUrl: 'gallery', titleElement: {}, cacheKey: 'exact', generation: 1 });
  assert.equal(result.success, true);
  assert.equal(result.titleFallback, true);
  assert.equal(markers.length, 1);
  assert.equal(markers[0][1], '(LRR ≈)');
});

test('possible matches warn about near titles and other volumes without promoting them to verified duplicates', async () => {
  for (const [sourceTitle, candidateTitle, reason] of [
    ['[Artist] Midnight Library Adventure', '[Artist] Midnight Library Adventures After', 'same-author'],
    ['[舞影 (美影)] やらせてやるって言ってんの! [中国翻訳]', '[舞影 (美影)] やらせてやるって言ってんの! 2 [中国翻訳]', 'series'],
    ['[Artist] Midnight Library Adventure', '[Different] Midnight Library Adventure', 'author'],
    ['Midnight Library Adventure', 'Midnight Library Adventuring', 'title'],
  ]) {
    const { ctx, markers, cache } = searchContext({ fetchAltSearchHttp: async () => ({
      hits: [{ id: 'possible', title: candidateTitle }],
    }) });
    const title = ctx.extractLooseTitleParts(sourceTitle).shortTitle;
    assert.equal(ctx.isLooseCandidateMatch(sourceTitle, title, candidateTitle), false, candidateTitle);
    const result = await ctx.performLooseTitleSearch(title, sourceTitle, {}, 1);
    assert.equal(result.success, true, candidateTitle);
    assert.equal(result.possible, true, candidateTitle);
    assert.equal(result.hits[0].possibleReason, reason);
    assert.equal(markers.at(-1)[1], '(LRR ?)');
    assert.equal(markers.at(-1)[2][0], 'lrr-marker-possible');
    assert.equal(cache.get(ctx.getTitleSearchCacheKey('loose', sourceTitle + '|' + title)).altKind, 'possible');
    const cached = await ctx.performLooseTitleSearch(title, sourceTitle, {}, 1);
    assert.equal(cached.cached, true);
    assert.equal(cached.possible, true);
    assert.equal(markers.at(-1)[1], '(LRR ?)');
  }
});

test('sharing only an author, a short common title or a query keyword does not produce a possible badge', async () => {
  for (const [a, b] of [
    ['[舞影 (美影)] やらせてやるって言ってんの!', '[舞影 (美影)] メイドさんの秘密の日記'],
    ['夏の図書館', '夏の図書館'],
    ['[Artist] Midnight Library Adventure', '[Artist] Library'],
  ]) {
    const { ctx, markers } = searchContext({ fetchAltSearchHttp: async () => ({ hits: [{ id: 'unrelated', title: b }] }) });
    const result = await ctx.performLooseTitleSearch(ctx.extractLooseTitleParts(a).shortTitle, a, {}, 1);
    assert.equal(result.success, false, `${a}/${b}`);
    assert.equal(markers.length, 0);
  }
});

test('a possible candidate does not stop fallback queries from finding a verified title', async () => {
  const sourceTitle = '[Artist] Midnight Library Adventure';
  const { ctx, markers } = searchContext({ fetchAltSearchHttp: async query => ({ hits: [{ id: query,
    title: query === 'Midnight Library Adventure' ? '[Artist] Midnight Library Adventures After' : sourceTitle }] }) });
  const result = await ctx.performLooseTitleSearch('Midnight Library Adventure', sourceTitle, {}, 1);
  assert.equal(result.success, true);
  assert.equal(result.possible, false);
  assert.equal(markers.length, 1);
  assert.equal(markers[0][1], '(LRR ≈)');
});

test('a later failed query preserves an earlier possible candidate, while a stale failure cannot write markers', async () => {
  for (const stale of [false, true]) {
    let requests = 0;
    const { ctx, markers, cache } = searchContext({ fetchAltSearchHttp: async () => {
      if (++requests === 1) return { hits: [{ id: 'possible', title: '[Artist] Midnight Library Adventures After' }] };
      if (stale) ctx.lrrScanGeneration++;
      throw new Error('search temporarily unavailable');
    } });
    const result = await ctx.performLooseTitleSearch('Midnight Library Adventure', '[Artist] Midnight Library Adventure', {}, 1);
    if (stale) {
      assert.equal(result.stale, true);
      assert.equal(markers.length, 0);
      assert.equal([...cache.keys()].filter(key => key.includes('-loose-')).length, 0);
    } else {
      assert.equal(result.possible, true);
      assert.equal(markers[0][1], '(LRR ?)');
    }
  }
});

function pageContext(titles) {
  const rows = titles.map(title => ({ title, isConnected: true, marker: null,
    querySelector() { return this.marker; } }));
  const marker = (text, classes, hits) => ({ text, hits, dataset: { lrrScore: String(hits[0]?.similarity || 0) },
    classList: { contains: name => classes.includes(name) } });
  const { ctx, cache } = searchContext({
    CONFIG: { lrrServerUrl: 'http://lrr.test', enableAltSearch: true },
    collectLrrGalleryEntries: () => rows.map(titleElement => ({ titleElement })),
    getLrrMarkerScope: row => row, getGalleryTitlePlain: row => row.title,
    hasLrrMarker: (row, confirmedOnly) => !!row.marker && (!confirmedOnly ||
      row.marker.classList.contains('lrr-marker-downloaded') || row.marker.classList.contains('lrr-marker-file')),
    prependLrrMarker: (row, text, classes, type, hits) => { row.marker = marker(text, classes, hits); },
    fetchAltSearchHttp: async () => ({ hits: [] }),
    log: () => {}, isUrlfinderHit: result => !!result.data?.id,
    extractUrlfinderHit: result => result.data,
  });
  const start = source.indexOf('    function handleResponse(');
  vm.runInContext(source.slice(start, source.indexOf('    function getLrrGalleryEntryFromLink(', start)), ctx);
  return { ctx, rows, cache };
}

test('a confirmed same-page archive supplies a Japanese alias even after an earlier empty search', async () => {
  const saved = '[舞影 (美影)] やらせてやるって言ってんの! [中国翻訳]';
  const other = '[舞影 (美影)] やらせてやるって言ってんの！ [中国翻訳]';
  const unrelated = '[舞影 (美影)] メイドさんの秘密の日記';
  const { ctx, rows } = pageContext([saved, other, unrelated]);
  await ctx.handleResponse({}, rows[1], 'new-gallery', 1);
  assert.equal(rows[1].marker, null);
  ctx.handleResponse({ data: { id: 'saved', title: '[Maikage (Mikage)] Yarasete Yarutte Ittenno!', tags: 'artist:mikage' } }, rows[0], 'saved-gallery', 1);
  assert.equal(rows[0].marker.text, '(LRR ✔)');
  assert.equal(rows[1].marker.text, '(LRR ≈)');
  assert.equal(rows[1].marker.hits[0].id, 'saved');
  assert.match(rows[1].marker.hits[0].title, /Yarasete/);
  assert.equal(rows[2].marker, null);
  assert.equal(ctx.knownLrrTitleAliases.size, 1);
});

test('possible page hints can be upgraded by source URL results and cannot propagate as library evidence', () => {
  const { ctx, rows } = pageContext(['[Artist] Midnight Library Adventure 1', '[Artist] Midnight Library Adventure 2']);
  ctx.handleResponse({ data: { id: 'first', title: rows[0].title } }, rows[0], 'first-gallery', 1);
  assert.equal(rows[1].marker.text, '(LRR ?)');
  assert.equal(ctx.knownLrrTitleAliases.size, 1);
  ctx.handleResponse({ data: { id: 'second', title: rows[1].title } }, rows[1], 'second-gallery', 1);
  assert.equal(rows[1].marker.text, '(LRR ✔)');
  assert.equal(rows[1].marker.hits[0].id, 'second');
});

test('all confirmed aliases for an archive remain usable, and stale scans cannot register new aliases', () => {
  const { ctx } = pageContext([]);
  ctx.registerKnownLrrTitle('[Artist] Unrelated Saved Title', { id: 'same', title: 'Library Title' }, 1);
  ctx.registerKnownLrrTitle('[Artist] Midnight Library Adventure', { id: 'same', title: 'Library Title' }, 1);
  assert.equal(ctx.getKnownLrrTitleMatches('[Artist] Midnight Library Adventure', '').hits.length, 1);
  ctx.registerKnownLrrTitle('[Artist] Another Title', { id: 'stale', title: 'Another Title' }, 0);
  assert.equal(ctx.knownLrrTitleAliases.size, 2);
  ctx.CONFIG.lrrServerUrl = 'http://another-library.test';
  assert.equal(ctx.getKnownLrrTitleMatches('[Artist] Midnight Library Adventure', '').hits.length, 0);
});

test('a late same-page confirmation survives an earlier URLFinder failure and unfinished title search', async () => {
  const { ctx, rows } = pageContext(['[Artist] Midnight Library Adventure', '[Artist] Midnight Library Adventure']);
  let release, started;
  const searching = new Promise(resolve => { started = resolve; });
  Object.assign(ctx, {
    normalizeGalleryUrls: url => [url], requestUrlfinder: async () => { throw new Error('plugin unavailable'); },
    fetchAltSearchHttp: () => new Promise(resolve => { release = resolve; started(); }),
    debugLog: () => {}, console: { error: () => {} },
  });
  const start = source.indexOf('    async function processGallery(');
  vm.runInContext(source.slice(start, source.indexOf('    async function fetchAltSearchHttp(', start)), ctx);
  const pending = ctx.processGallery({ galleryUrl: 'target', titleElement: rows[1], cacheKey: 'target', generation: 1 });
  await searching;
  ctx.handleResponse({ data: { id: 'confirmed', title: rows[0].title } }, rows[0], 'confirmed-gallery', 1);
  assert.equal(rows[1].marker.text, '(LRR ≈)');
  release({ hits: [] });
  assert.equal((await pending).success, true);
  assert.equal(rows[1].marker.text, '(LRR ≈)');
});

test('possible cache metadata survives compaction and expires sooner than verified matches', () => {
  const ctx = vm.createContext({});
  const start = source.indexOf('    function minimizeCacheData(');
  vm.runInContext(source.slice(start, source.indexOf('    function isQuotaExceeded(', start)), ctx);
  const item = ctx.minimizeCacheData({ altHit: true, altKind: 'possible', altHits: [{ id: 'possible', possibleReason: 'series' }] });
  assert.equal(item.altKind, 'possible');
  const values = new Map([['possible', JSON.stringify({ timestamp: 1, data: item })],
    ['verified', JSON.stringify({ timestamp: 1, data: { altHit: true, altKind: 'verified' } })]]);
  Object.assign(ctx, { Date: { now: () => 600001 }, CACHE_DURATION: 1800000, LRR_NEGATIVE_CACHE_EXPIRE: 300000,
    localStorage: { getItem: key => values.get(key), removeItem: key => values.delete(key) } });
  const cacheStart = source.indexOf('    function getCache(');
  vm.runInContext(source.slice(cacheStart, source.indexOf('    function setCache(', cacheStart)), ctx);
  assert.equal(ctx.getCache('possible'), null);
  assert.equal(ctx.getCache('verified').altKind, 'verified');
});

test('possible and failed lookup badges use different symbols and explain the candidate', () => {
  let inserted;
  const row = { isConnected: true, querySelectorAll: () => [] };
  const { ctx } = searchContext({ t: zh => zh, getLrrMarkerScope: () => row, getGalleryTitlePlain: () => 'source',
    getGalleryMarkerGroup: () => ({ insertBefore: node => { inserted = node; }, firstChild: null }),
    document: { createElement: () => ({ dataset: {}, classList: { add() {} }, addEventListener() {} }) } });
  const start = source.indexOf('    function prependLrrMarker(');
  vm.runInContext(source.slice(start, source.indexOf('    function getGalleryMarkerGroup(', start)), ctx);
  ctx.prependLrrMarker(row, '(LRR ?)', ['lrr-marker-possible'], 'possible', [{ id: 'saved', title: 'Library Candidate', possibleReason: 'series', similarity: 0.9 }]);
  assert.match(inserted.title, /库中可能已有/);
  assert.match(inserted.title, /卷号/);
  assert.match(inserted.title, /Library Candidate/);
  assert.equal(inserted.dataset.lrrScore, '0.9');
  ctx.prependLrrMarker(row, '(LRR !)', ['lrr-marker-error'], 'error', []);
  assert.match(inserted.title, /请求失败/);
  assert.doesNotMatch(inserted.title, /可能已有/);
});
