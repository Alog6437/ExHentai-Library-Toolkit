const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../ExHentai_Library_Toolkit.user.js'), 'utf8');
function load(globals = {}) {
  const context = vm.createContext(globals);
  const start = source.indexOf('    function isLooseNoiseTag(');
  const end = source.indexOf('    function handleResponse(', start);
  vm.runInContext(source.slice(start, end), context);
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
