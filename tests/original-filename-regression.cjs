const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../ExHentai_Library_Toolkit.user.js'), 'utf8');
function load() {
  const ctx = vm.createContext({ URL, t: (_, en) => en });
  const start = source.indexOf('    function parseGalleryDispositionFilename(');
  assert.ok(start > 0);
  vm.runInContext(source.slice(start, source.indexOf('    function getCrc32Table(', start)), ctx);
  return ctx;
}
test('disposition names retain original extension, case, spaces, percent characters and quoted semicolons', () => {
  const c = load();
  for (const name of ['Cover.JPEG', '原图.jpeg', 'A B.PNG', 'page%20one.jpg', 'cover; final.JPG']) {
    assert.equal(c.parseGalleryDispositionFilename('Content-Disposition: attachment; filename="' + name + '"\r\n'), name);
  }
  assert.equal(c.parseGalleryDispositionFilename('Content-Type: image/jpeg'), null);
});
test('RFC5987 UTF-8 extended filename wins and malformed encoding safely falls back to legacy', () => {
  const c = load();
  assert.equal(c.parseGalleryDispositionFilename("Content-Disposition: attachment; filename=legacy.jpg; filename*=UTF-8''%E5%8E%9F%E5%9B%BE.JPEG"), '原图.JPEG');
  assert.equal(c.parseGalleryDispositionFilename("Content-Disposition: attachment; filename*=UTF-8'en'%E5%8E%9F%E5%9B%BE.jpeg; filename=legacy.jpg"), '原图.jpeg');
  assert.equal(c.parseGalleryDispositionFilename("Content-Disposition: attachment; filename*=UTF-8''%ZZ; filename=legacy.JPG"), 'legacy.JPG');
});
test('unsafe names are rejected instead of silently sanitized or allowed to escape the ZIP directory', () => {
  const c = load();
  for (const name of ['', '.', '..', '../cover.jpg', 'a/b.jpg', 'a\\b.jpg', 'nul.jpg', 'CON.PNG', 'cover.jpg ', 'cover.jpg.', 'a\u0000b.jpg', 'cover:evil.jpg', 'x?.jpg']) assert.throws(() => c.validateGalleryImageFilename(name), /unsafe|unavailable/i, name);
  assert.equal(c.validateGalleryImageFilename('原图 (封面) [A].JPEG'), '原图 (封面) [A].JPEG');
});
test('URL filename decoding preserves case and jpeg extension and rejects endpoint names or unknown names', () => {
  const c = load();
  assert.equal(c.galleryUrlFilename('https://cdn.invalid/path/%E5%8E%9F%E5%9B%BE.JPEG?token=secret'), '原图.JPEG');
  assert.equal(c.galleryUrlFilename('https://cdn.invalid/path/a%2520b.JPG'), 'a%20b.JPG');
  for (const url of ['https://site.invalid/fullimg.php?gid=1', 'https://cdn.invalid/hash', 'https://cdn.invalid/a%ZZ.jpg', 'data:image/png,test']) assert.equal(c.galleryUrlFilename(url), null);
});
test('filename selection preserves authoritative header name and uses page original before CDN-generated names', () => {
  const c = load(), page = { original: true, originalFilename: 'Original.JPEG' };
  assert.equal(c.chooseGalleryImageFilename(page, { headers: 'Content-Disposition: attachment; filename="Uploaded.jpeg"', finalUrl: 'https://cdn.invalid/generated.jpg', contentType: 'image/jpeg' }), 'Uploaded.jpeg');
  assert.equal(c.chooseGalleryImageFilename(page, { finalUrl: 'https://cdn.invalid/generated.jpg', contentType: 'image/jpeg' }), 'Original.JPEG');
  assert.equal(c.chooseGalleryImageFilename(page, { headers: 'Content-Disposition: attachment; filename="Uploaded.jpeg"', finalUrl: 'https://cdn.invalid/%2e%2e%2fevil.jpg', contentType: 'image/jpeg' }), 'Uploaded.jpeg');
});
test('displayed compressed images use their actual format without renaming an original JPEG into a pretend WebP', () => {
  const c = load();
  const resolved = { original: false, originalFilename: 'Original.JPEG', displayedFilename: 'displayed.webp' };
  assert.equal(c.chooseGalleryImageFilename(resolved, { finalUrl: 'https://cdn.invalid/displayed.webp', contentType: 'image/webp' }), 'displayed.webp');
  assert.throws(() => c.chooseGalleryImageFilename({}, { headers: 'Content-Disposition: attachment; filename="wrong.jpeg"', contentType: 'image/webp' }), /conflict|unconfirmed/i);
  assert.throws(() => c.chooseGalleryImageFilename({}, { finalUrl: 'https://site.invalid/fullimg.php', contentType: 'image/jpeg' }), /unsafe|unavailable/i);
});
test('optional numbered names preserve extension case and use stable gallery page order and width', () => {
  const c = load();
  assert.equal(c.createGalleryImagePath(0, '原图.JPEG', 'sequential', 13), '001.JPEG');
  assert.equal(c.createGalleryImagePath(12, 'last.jpeg', 'sequential', 13), '013.jpeg');
  assert.equal(c.createGalleryImagePath(0, '封面.PNG', 'sequential', 1000), '0001.PNG');
  assert.equal(c.createGalleryImagePath(999, 'last.webp', 'sequential', 1000), '1000.webp');
  assert.equal(c.createGalleryImagePath(3, '原图.JPEG', 'original', 13), '原图.JPEG');
  assert.equal(c.createGalleryImagePath(3, '原图.JPEG', 'invalid', 13), '原图.JPEG');
  assert.throws(() => c.createGalleryImagePath(0, 'unknown', 'sequential', 13), /extension/);
});

test('original filenames are placed directly at ZIP root without page directories', () => {
  const c = load();
  assert.equal(c.createGalleryImagePath(0, 'cover.JPEG'), 'cover.JPEG');
  assert.equal(c.createGalleryImagePath(1, 'cover.JPEG'), 'cover.JPEG');
  assert.equal(c.createGalleryImagePath(9999, '原图.PNG'), '原图.PNG');
  assert.throws(() => c.createGalleryImagePath(-1, 'cover.jpg'));
  assert.throws(() => c.createGalleryImagePath(0, '../cover.jpg'));
});
