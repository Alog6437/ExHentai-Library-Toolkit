const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../ExHentai_Library_Toolkit.user.js'), 'utf8');

function slice(startMarker, endMarker, globals = {}) {
  const context = vm.createContext(globals);
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `缺少切片边界：${startMarker} → ${endMarker}`);
  vm.runInContext(source.slice(start, end), context);
  return context;
}

test('archive links point at the LANraragi reader page', () => {
  const opened = [];
  const ctx = slice('    function openLrrArchive(', '    // 页数只作弱证据提示', {
    CONFIG: { lrrServerUrl: 'http://lrr.test:3000' },
    window: { open: (url, target, features) => opened.push({ url, target, features }) },
  });

  assert.equal(ctx.openLrrArchive('abc 123'), true);
  assert.equal(opened.length, 1);
  assert.equal(opened[0].url, 'http://lrr.test:3000/reader?id=abc%20123');
  assert.equal(opened[0].target, '_blank');
  assert.equal(opened[0].features, 'noopener');

  // 没有服务器地址或归档 ID 时不能打开半截 URL。
  assert.equal(ctx.openLrrArchive(''), false);
  ctx.CONFIG.lrrServerUrl = '';
  assert.equal(ctx.openLrrArchive('1234'), false);
  assert.equal(opened.length, 1);
});

test('search fallback uses the LANraragi filter parameter', () => {
  const opened = [];
  const ctx = slice('    function openLrrSearch(', '    // 徽标点击优先直接打开库内归档的介绍页', {
    CONFIG: { lrrServerUrl: 'http://lrr.test' },
    window: { open: (url, target, features) => opened.push({ url, target, features }) },
  });

  ctx.openLrrSearch('作品名 上');
  assert.equal(opened[0].url, 'http://lrr.test/search?filter=' + encodeURIComponent('作品名 上'));
  assert.doesNotMatch(opened[0].url, /[?&]search=/);
  assert.equal(opened[0].features, 'noopener');
});

test('clicking a badge opens the matched archive page, falling back to a search', () => {
  const calls = [];
  let clickHandler = null;
  const row = { isConnected: true, querySelectorAll: () => [] };
  const ctx = slice('    var sitePageCounts = new Map();', '    function getGalleryMarkerGroup(', {
    CONFIG: { uiLanguage: 'zh' },
    t: zh => zh,
    extractGalleryIdentity: () => null,
    getLrrMarkerScope: () => row,
    getGalleryTitlePlain: () => 'source',
    getGalleryMarkerGroup: () => ({ insertBefore: () => {}, firstChild: null }),
    document: {
      createElement: () => ({
        dataset: {},
        classList: { add() {} },
        addEventListener: (type, handler) => { if (type === 'click') clickHandler = handler; },
      }),
    },
    openLrrArchive: id => { calls.push({ archive: id }); return true; },
    openLrrSearch: keyword => calls.push({ search: keyword }),
  });
  const event = { preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {} };

  // 命中带归档 ID：点开介绍页，而不是再搜一次。
  ctx.prependLrrMarker(row, '(LRR ✔)', ['lrr-marker-downloaded'], 'urlfinder', [{ id: '1234' }], 'https://e-hentai.org/g/1/t/');
  clickHandler(event);
  assert.deepEqual(calls, [{ archive: '1234' }]);

  // 没有归档 ID 时退回搜索，并沿用原有搜索词。
  ctx.prependLrrMarker(row, '(LRR ≈)', [], 'alt', [{ title: 'Candidate' }], null, 'query');
  clickHandler(event);
  assert.deepEqual(calls[1], { search: 'query' });
});

test('badge tooltip promises the archive page when an id is known', () => {
  let marker = null;
  const row = { isConnected: true, querySelectorAll: () => [] };
  const ctx = slice('    var sitePageCounts = new Map();', '    function getGalleryMarkerGroup(', {
    CONFIG: { uiLanguage: 'zh' },
    t: zh => zh,
    extractGalleryIdentity: () => null,
    getLrrMarkerScope: () => row,
    getGalleryTitlePlain: () => 'source',
    getGalleryMarkerGroup: () => ({ insertBefore: () => {}, firstChild: null }),
    document: {
      createElement: () => {
        marker = { dataset: {}, classList: { add() {} }, addEventListener() {}, title: '' };
        return marker;
      },
    },
    openLrrArchive: () => true,
    openLrrSearch: () => {},
  });

  ctx.prependLrrMarker(row, '(LRR ✔)', [], 'urlfinder', [{ id: '1234', title: 'Library Copy' }], 'https://e-hentai.org/g/1/t/');
  assert.match(marker.title, /打开库内归档介绍页/);
  assert.doesNotMatch(marker.title, /点击在 LANraragi 中搜索/);
  assert.equal(marker.dataset.ehArchiveId, '1234');

  ctx.prependLrrMarker(row, '(LRR ≈)', [], 'alt', [{ title: 'Library Copy' }], null, 'query');
  assert.match(marker.title, /点击在 LANraragi 中搜索/);
  assert.equal(marker.dataset.ehArchiveId, '');
});
