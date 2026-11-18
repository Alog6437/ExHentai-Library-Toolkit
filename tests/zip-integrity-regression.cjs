const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

function loadZip(limit = 512 * 1024 * 1024) {
  const source = fs.readFileSync(path.join(__dirname, '../ExHentai_Library_Toolkit.user.js'), 'utf8');
  const start = source.indexOf('    function getCrc32Table(');
  const end = source.indexOf('    function buildMetadata(', start);
  assert.ok(start >= 0 && end > start);
  const ctx = vm.createContext({
    ArrayBuffer, Uint8Array, Uint32Array, DataView, TextEncoder, Blob,
    CRC32_TABLE: null, ZIP32_MAX: 0xffffffff, MEMORY_ZIP_LIMIT: limit,
    navigator: {}, t: zh => zh, formatGalleryDlBytes: n => String(n),
  });
  vm.runInContext(source.slice(start, end), ctx);
  return ctx;
}

// Independent ZIP reader: follow the central directory, validate local records,
// data descriptors, lengths and CRC, rather than relying on writer internals.
function unzipStored(bytes) {
  const b = Buffer.from(bytes);
  const end = b.length - 22;
  assert.equal(b.readUInt32LE(end), 0x06054b50);
  const count = b.readUInt16LE(end + 10);
  const cdSize = b.readUInt32LE(end + 12);
  let p = b.readUInt32LE(end + 16);
  assert.equal(p + cdSize, end);
  const files = new Map();
  const crc = data => {
    let value = 0xffffffff;
    for (const byte of data) {
      value ^= byte;
      for (let i = 0; i < 8; i++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
    }
    return (value ^ 0xffffffff) >>> 0;
  };
  for (let i = 0; i < count; i++) {
    assert.equal(b.readUInt32LE(p), 0x02014b50);
    assert.equal(b.readUInt16LE(p + 10), 0); // stored, not compressed
    const size = b.readUInt32LE(p + 24);
    const nameLength = b.readUInt16LE(p + 28);
    const extraLength = b.readUInt16LE(p + 30);
    const commentLength = b.readUInt16LE(p + 32);
    const name = b.subarray(p + 46, p + 46 + nameLength).toString('utf8');
    const local = b.readUInt32LE(p + 42);
    assert.equal(b.readUInt32LE(local), 0x04034b50);
    assert.equal(b.readUInt16LE(local + 6), 0x0808);
    const dataStart = local + 30 + b.readUInt16LE(local + 26) + b.readUInt16LE(local + 28);
    const data = b.subarray(dataStart, dataStart + size);
    assert.equal(crc(data), b.readUInt32LE(p + 16));
    assert.equal(b.readUInt32LE(dataStart + size), 0x08074b50);
    assert.equal(b.readUInt32LE(dataStart + size + 4), crc(data));
    assert.equal(b.readUInt32LE(dataStart + size + 8), size);
    assert.equal(files.has(name), false, 'duplicate ZIP filename');
    files.set(name, data);
    p += 46 + nameLength + extraLength + commentLength;
  }
  assert.equal(p, end);
  return files;
}

test('streamed ZIP round-trips binary images, Unicode metadata and empty entries', async () => {
  const ctx = loadZip();
  const sink = new ctx.MemoryZipSink();
  const zip = new ctx.StreamingZipWriter(sink);
  const image = Uint8Array.from({ length: 4096 }, (_, i) => i % 256);
  await zip.add('002.png', image);
  await zip.add('001.jpg', new Uint8Array([255, 216, 255, 217]));
  await zip.add('元数据.json', new TextEncoder().encode('{"title":"测试"}'));
  await zip.add('empty.txt', new Uint8Array());
  const blob = await zip.finish();
  const files = unzipStored(await blob.arrayBuffer());
  assert.equal(files.size, 4);
  assert.deepEqual(files.get('002.png'), Buffer.from(image));
  assert.equal(files.get('元数据.json').toString(), '{"title":"测试"}');
  assert.equal(files.get('empty.txt').length, 0);
  assert.equal(sink.parts.length, 0);
});

test('partial ZIP can be finalized with an explicit missing-page manifest', async () => {
  const ctx = loadZip();
  const zip = new ctx.StreamingZipWriter(new ctx.MemoryZipSink());
  await zip.add('001.jpg', new Uint8Array([1, 2, 3]));
  await zip.add('missing-pages.json', new TextEncoder().encode(JSON.stringify({ missing_pages: [2, 3] })));
  const files = unzipStored(await (await zip.finish()).arrayBuffer());
  assert.deepEqual(JSON.parse(files.get('missing-pages.json')), { missing_pages: [2, 3] });
  assert.equal(files.has('002.jpg'), false);
});

test('memory ZIP quota rejects before retaining the overflowing chunk', async () => {
  const ctx = loadZip(8);
  const sink = new ctx.MemoryZipSink();
  await sink.write(new Uint8Array(6));
  await assert.rejects(sink.write(new Uint8Array(3)), e => e.galleryFatal && e.galleryCode === 'memory-zip-limit');
  assert.equal(sink.size, 6);
  assert.equal(sink.parts.length, 1);
  await sink.abort();
  assert.equal(sink.parts.length, 0);
});
