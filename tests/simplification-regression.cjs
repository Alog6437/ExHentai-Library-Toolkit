const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'ExHentai_Library_Toolkit.user.js'), 'utf8');
test('simplified defaults retain both highlights and image ZIP metadata but no favorites/search configuration', () => {
  const start = source.indexOf('  var DEFAULT_CONFIG =');
  const end = source.indexOf('  function gmGet(', start);
  const ctx = vm.createContext({}); vm.runInContext(source.slice(start, end), ctx);
  assert.equal(ctx.DEFAULT_CONFIG.enableChineseHighlight, true);
  assert.equal(ctx.DEFAULT_CONFIG.enableUncensoredLabel, true);
  assert.equal(ctx.DEFAULT_CONFIG.galleryDlWriteMetadata, true);
  for (const key of ['enableQuickFav', 'enableGlobalSearch', 'defaultFavcat']) assert.equal(Object.hasOwn(ctx.DEFAULT_CONFIG, key), false);
});
test('removed feature implementations and controls cannot be reactivated by old saved settings', () => {
  for (const name of ['setupDetailPageFav', 'setupListPageFav', 'setupGlobalSearch', 'testGalleryDownloader', 'startGalleryMetadataDownload', 'makeDraggable']) assert.doesNotMatch(source, new RegExp('function\\s+' + name + '\\s*\\('));
  for (const id of ['cfg-enableQuickFav', 'cfg-enableGlobalSearch', 'cfg-defaultFavcat', 'cfg-enableLogging', 'cfg-lrrDebugMode', 'eh-gdl-test', 'eh-gdl-metadata']) assert.equal(source.includes('id="' + id + '"'), false);
  assert.match(source, /id="eh-tb-export-logs"/);
  assert.match(source, /id="cfg-enableChineseHighlight"/);
  assert.match(source, /id="cfg-enableUncensoredLabel"/);
});
test('Chinese translation highlighting remains executable and respects its saved switch', () => {
  const start = source.indexOf('    function setupChineseHighlight(');
  const end = source.indexOf('    /* ===', start);
  assert.ok(start >= 0 && end > start);
  function title(textContent) { const classes = new Set(); return { textContent, querySelector() { return null; }, classes, classList: { toggle(name, on) { if (on) classes.add(name); else classes.delete(name); } } }; }
  const chinese = title('安全速写集 [汉化]'), english = title('Safe Sketchbook [English]');
  const ctx = vm.createContext({ CONFIG: { enableChineseHighlight: true, uiLanguage: 'zh' }, document: { getElementById() { return {}; }, querySelectorAll() { return [chinese, english]; } } });
  vm.runInContext(source.slice(start, end), ctx); ctx.setupChineseHighlight();
  assert.equal(chinese.classes.has('eh-translation-highlight'), true); assert.equal(english.classes.size, 0);
  chinese.classes.clear(); ctx.CONFIG.enableChineseHighlight = false; ctx.setupChineseHighlight();
  assert.equal(chinese.classes.size, 0);
});
