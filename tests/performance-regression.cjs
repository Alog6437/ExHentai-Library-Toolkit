const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../ExHentai_Library_Toolkit.user.js'), 'utf8');
test('unfinished downloads request native leave confirmation and remove it when settled', () => {
  const listeners = new Map();
  const ctx = load('    function warnBeforeLeavingDownload(', '    function galleryRawRequest(', {
    galleryDlBusy: false,
    window: {
      addEventListener: (name, fn) => listeners.set(name, fn),
      removeEventListener: (name, fn) => { if (listeners.get(name) === fn) listeners.delete(name); },
    },
  });
  let prevented = 0;
  const event = { preventDefault: () => prevented++ };
  ctx.warnBeforeLeavingDownload(event);
  assert.equal(prevented, 0);
  for (let task = 0; task < 2; task++) {
    ctx.setGalleryDownloadBusy(true);
    assert.equal(listeners.size, 1);
    listeners.get('beforeunload')(event);
    assert.equal(event.returnValue, '');
    // Cancelling the browser prompt keeps the task protected.
    assert.equal(ctx.galleryDlBusy, true);
    assert.equal(listeners.size, 1);
    ctx.setGalleryDownloadBusy(false);
    assert.equal(listeners.size, 0);
  }
  assert.equal(prevented, 2);
  for (const name of ['startGalleryMetadataDownload', 'startGalleryDlDownload']) {
    const start = source.indexOf('    async function ' + name + '(');
    const end = name === 'startGalleryMetadataDownload'
      ? source.indexOf('    async function startGalleryDlDownload(', start)
      : source.indexOf('    var CACHE_DURATION', start);
    const body = source.slice(start, end);
    assert.match(body, /setGalleryDownloadBusy\(true\)/);
    assert.match(body, /finally\s*\{[\s\S]*setGalleryDownloadBusy\(false\)/);
  }
});

function load(start, end, globals = {}) {
  const context = vm.createContext(globals);
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from);
  vm.runInContext(source.slice(from, to), context);
  return context;
}

test('own badge additions skip scans, but gallery changes and badge removals still scan', () => {
  const ctx = load('    function lrrMutationTouchesList(', '    function setupGalleryListObserver(');
  const node = ({ marker = false, list = false, gallery = false } = {}) => ({
    nodeType: 1,
    matches: selector => selector.includes('.eh-gallery-markers') ? marker : gallery,
    closest: selector => selector === '.itg' ? list : marker,
    querySelector: () => null,
  });
  const row = node({ list: true });
  const badge = node({ marker: true });
  assert.equal(ctx.lrrMutationTouchesList({ target: row, addedNodes: [badge], removedNodes: [] }), false);
  assert.equal(ctx.lrrMutationTouchesList({ target: badge, addedNodes: [{ nodeType: 3 }], removedNodes: [] }), false);
  assert.equal(ctx.lrrMutationTouchesList({ target: row, addedNodes: [], removedNodes: [badge] }), true);
  assert.equal(ctx.lrrMutationTouchesList({ target: row, addedNodes: [node()], removedNodes: [] }), true);
  assert.equal(ctx.lrrMutationTouchesList({ target: node(), addedNodes: [node({ gallery: true })], removedNodes: [] }), true);
  assert.equal(ctx.lrrMutationTouchesList({ target: node(), addedNodes: [node()], removedNodes: [] }), false);
});

test('one shared observer dispatches each scan once per mutation batch', () => {
  let observers = 0, callback, lrr = 0, tags = 0;
  const ctx = load('    function setupGalleryListObserver(', '    function setupLrrChecker(', {
    lrrDomObserver: null,
    MutationObserver: class { constructor(fn) { observers++; callback = fn; } observe() {} },
    document: { documentElement: {} },
    lrrMutationTouchesList: mutation => mutation.relevant,
    scheduleLrrDomScan: () => lrr++, scheduleUncensoredScan: () => tags++,
  });
  ctx.setupGalleryListObserver();
  ctx.setupGalleryListObserver();
  assert.equal(observers, 1);
  callback([{ relevant: false }]);
  assert.equal(lrr, 0);
  callback([{ relevant: true }, { relevant: true }]);
  assert.equal(lrr, 1);
  assert.equal(tags, 1);
});

test('duplicate gallery links avoid repeated DOM resolution without skipping later valid titles', () => {
  let resolutions = 0;
  const links = [
    { href: '1/a', valid: false }, { href: '1/a', valid: true },
    { href: '1/a', valid: true }, { href: '2/b', valid: true },
    { href: '2/b', valid: true },
  ];
  const ctx = load('    function collectLrrGalleryEntries(', '    function collectGalleriesFromDom(', {
    document: { querySelectorAll: () => links },
    extractGalleryIdentity: href => { const [gid, token] = href.split('/'); return { gid, token }; },
    getLrrGalleryEntryFromLink: link => { resolutions++; return link.valid ? { key: link.href } : null; },
  });
  const entries = ctx.collectLrrGalleryEntries();
  assert.deepEqual(Array.from(entries, item => item.key), ['1/a', '2/b']);
  assert.equal(resolutions, 3);
});

test('UI watchdog restores removed panels and ancestors, ignores unrelated removals', () => {
  const ctx = load('    function removedFloatingUi(', '    function startUiWatchdog(');
  const removed = (matches, descendant) => ({ nodeType: 1, matches: () => matches, querySelector: () => descendant });
  assert.equal(ctx.removedFloatingUi({ removedNodes: [removed(false, null)] }), false);
  assert.equal(ctx.removedFloatingUi({ removedNodes: [{ nodeType: 3 }] }), false);
  assert.equal(ctx.removedFloatingUi({ removedNodes: [removed(true, null)] }), true);
  assert.equal(ctx.removedFloatingUi({ removedNodes: [removed(false, {})] }), true);
});

test('download rendering is throttled while final states and latest counters are preserved', () => {
  let now = 1000;
  const updates = [];
  const ctx = load('        var lastMetricsUpdate = 0;', '        async function worker(', {
    Date: { now: () => now },
    stats: { started: 1000, networkBytes: 0, savedBytes: 0, done: 0, total: 100, workers: 2 },
    statusBox: {}, updateGalleryDlMetrics: (_, metrics) => updates.push(metrics),
  });
  for (let i = 0; i < 1000; i++) {
    now = 1000 + i;
    ctx.stats.networkBytes = i;
    ctx.refreshMetrics('downloading');
  }
  assert.equal(updates.length, 10);
  ctx.stats.savedBytes = 999;
  ctx.stats.done = 100;
  ctx.refreshMetrics('zipping');
  ctx.refreshMetrics('done');
  assert.equal(updates.length, 12);
  assert.equal(updates.at(-1).downloaded_files, 100);
  assert.equal(updates.at(-1).downloaded_bytes, 999);
  assert.equal(updates.at(-1).status, 'done');
});

test('uncensored batches preserve matching, cache reuse, redraw and failure recovery', async () => {
  const requests = [], rendered = [];
  let entries = Array.from({ length: 26 }, (_, i) => ({ key: `${i + 1}/a`, galleryUrl: `${i + 1}/a`, titleElement: i + 1 }));
  const ctx = load('    function hasUncensoredTag(', '    function getAuthorizationHeaderValue(', {
    CONFIG: { enableUncensoredLabel: true }, window: { location: { hostname: 'exhentai.org' } },
    collectLrrGalleryEntries: () => entries,
    extractGalleryIdentity: url => ({ gid: url.split('/')[0], token: 'a' }),
    galleryTextRequest: async (_, method, body) => {
      const batch = JSON.parse(body).gidlist;
      requests.push(batch);
      return { text: JSON.stringify({ gmetadata: batch.map(([gid]) => ({ gid, tags: gid % 2 ? ['misc:uncensored'] : [] })).reverse() }) };
    },
    setTimeout: () => 1, clearTimeout: () => {}, warn: () => {},
  });
  ctx.renderUncensoredLabel = (title, value) => rendered.push({ title, value });
  assert.equal(ctx.hasUncensoredTag(['uncensored']), true);
  assert.equal(ctx.hasUncensoredTag(['not uncensored']), false);
  await ctx.scanUncensoredLabels();
  assert.deepEqual(requests.map(batch => batch.length), [25, 1]);
  assert.equal(rendered.filter(item => item.value).length, 13);
  rendered.length = 0;
  await ctx.scanUncensoredLabels();
  assert.equal(requests.length, 2);
  assert.equal(rendered.length, 26);
  entries = [{ key: '99/a', galleryUrl: '99/a', titleElement: 99 }];
  ctx.galleryTextRequest = async () => { throw new Error('Network failure'); };
  await ctx.scanUncensoredLabels();
  assert.equal(ctx.uncensoredScanBusy, false);
  ctx.CONFIG.enableUncensoredLabel = false;
  rendered.length = 0;
  await ctx.scanUncensoredLabels();
  assert.equal(rendered.length, 0);
});
