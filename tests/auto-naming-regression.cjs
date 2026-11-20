const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
function load() {
  const source = fs.readFileSync(path.join(__dirname, '../ExHentai_Library_Toolkit.user.js'), 'utf8');
  const start = source.indexOf('    function parseGalleryDispositionFilename(');
  const end = source.indexOf('    function getCrc32Table(', start);
  assert.ok(start > 0 && end > start);
  const ctx = vm.createContext({ URL, t: (_, en) => en });
  vm.runInContext(source.slice(start, end), ctx);
  return ctx;
}
test('automatic naming retains naturally increasing original names, extension spelling and Unicode', () => {
  const c = load();
  for (const names of [['001.JPEG', '002.png', '010.webp'], ['page2.jpg', 'page10.jpg'], ['原图1.PNG', '原图2.PNG']]) {
    const plan = c.planGalleryImageNames(names, names.length);
    assert.equal(plan.prefixed, false);
    assert.deepEqual(Array.from(plan.paths), names);
  }
});
test('one out-of-order name prefixes every page with total-page digit width, not completion order', () => {
  const c = load();
  const names = Array.from({ length: 13 }, (_, i) => String(20 - i) + '.JPEG');
  const plan = c.planGalleryImageNames(names, 13);
  assert.equal(plan.prefixed, true);
  assert.deepEqual(Array.from(plan.paths), names.map((name, i) => String(i + 1).padStart(2, '0') + '_' + name));
  assert.equal(c.planGalleryImageNames(['z.jpg', 'a.png'], 2).paths[0], '1_z.jpg');
  assert.equal(c.planGalleryImageNames(['z.jpg', 'a.png'], 123).paths[1], '002_a.png');
});
test('duplicates and case/numeric ambiguities use a uniform prefix rather than renaming the basename', () => {
  const c = load();
  for (const names of [['same.JPEG', 'same.JPEG'], ['Cover.jpg', 'cover.JPG'], ['01.png', '1.png']]) {
    const plan = c.planGalleryImageNames(names, names.length);
    assert.equal(plan.prefixed, true);
    assert.deepEqual(Array.from(plan.paths), names.map((name, i) => (i + 1) + '_' + name));
  }
});
test('partial or unknown-name plans cannot falsely claim globally ordered originals', () => {
  const c = load();
  const plan = c.planGalleryImageNames(['a.JPEG', null, 'c.jpeg'], 13);
  assert.equal(plan.prefixed, true);
  assert.equal(plan.paths[0], '01_a.JPEG');
  assert.equal(plan.paths[2], '03_c.jpeg');
  assert.equal(c.planGalleryImageNames(['a.jpg', 'b.jpg'], 13).prefixed, true);
});
test('natural comparison is deterministic and does not lose precision on long numeric runs', () => {
  const c = load();
  assert.ok(c.compareGalleryNaturalNames('page9.jpg', 'page10.jpg') < 0);
  assert.ok(c.compareGalleryNaturalNames('x999999999999999999999.jpg', 'x1000000000000000000000.jpg') < 0);
  assert.equal(c.compareGalleryNaturalNames('Cover.JPG', 'cover.jpg'), 0);
  assert.equal(c.compareGalleryNaturalNames('01.png', '1.png'), 0);
});
