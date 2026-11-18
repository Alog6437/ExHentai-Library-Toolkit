const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '../ExHentai_Library_Toolkit.user.js'), 'utf8');
function load() {
  const start = source.indexOf('    function createGallerySpeedMeter(');
  assert.ok(start >= 0, 'speed meter must be independently testable');
  const end = source.indexOf('\n    function ', start + 12);
  assert.ok(end > start);
  const ctx = vm.createContext({});
  vm.runInContext(source.slice(start, end), ctx);
  let now = 0;
  const meter = ctx.createGallerySpeedMeter(() => now);
  return { meter, advance(ms) { now += ms; }, set(ms) { now = ms; } };
}

test('speed meter aggregates concurrent traffic and separates rolling from session averages', () => {
  const h = load();
  h.advance(1000); h.meter.addBytes(1000); h.meter.addBytes(4000);
  const s = h.meter.snapshot();
  assert.equal(s.totalBytes, 5000);
  assert.equal(s.currentBps, 1000); // Fixed five-second window, including startup warm-up.
  assert.equal(s.averageBps, 5000);
  assert.equal(s.activeMs, 1000);
});

test('idle snapshots decay to zero without requiring another progress event', () => {
  const h = load(); h.advance(1000); h.meter.addBytes(5000);
  h.advance(4999); assert.equal(h.meter.snapshot().currentBps, 1000);
  h.advance(1); assert.equal(h.meter.snapshot().currentBps, 0);
  assert.equal(h.meter.snapshot().averageBps, 5000 / 6);
});

test('pause freezes average duration and resume does not revive old samples', () => {
  const h = load(); h.advance(1000); h.meter.addBytes(5000); h.meter.suspend('pause');
  h.advance(60000);
  let s = h.meter.snapshot();
  assert.equal(s.currentBps, 0); assert.equal(s.averageBps, 5000); assert.equal(s.activeMs, 1000);
  h.meter.resume('pause');
  assert.equal(h.meter.snapshot().currentBps, 0);
  h.advance(1000); h.meter.addBytes(1000); s = h.meter.snapshot();
  assert.equal(s.activeMs, 2000); assert.equal(s.averageBps, 3000); assert.equal(s.currentBps, 200);
});

test('overlapping pause and recovery reasons never double-count or resume prematurely', () => {
  const h = load(); h.advance(2000); h.meter.addBytes(4000);
  h.meter.suspend('pause'); h.advance(1000); h.meter.suspend('recovery');
  h.advance(1000); h.meter.resume('pause'); h.advance(1000);
  assert.equal(h.meter.snapshot().suspended, true);
  assert.equal(h.meter.snapshot().activeMs, 2000);
  h.meter.resume('recovery'); h.advance(1000);
  assert.equal(h.meter.snapshot().suspended, false);
  assert.equal(h.meter.snapshot().activeMs, 3000);
  assert.equal(h.meter.snapshot().averageBps, 4000 / 3);
});

test('duplicate suspend and unknown resume do not distort elapsed time', () => {
  const h = load(); h.advance(1000); h.meter.suspend('pause'); h.advance(1000);
  h.meter.suspend('pause'); h.meter.resume('absent'); h.advance(1000);
  assert.equal(h.meter.snapshot().activeMs, 1000);
  h.meter.resume('pause'); h.advance(1000);
  assert.equal(h.meter.snapshot().activeMs, 2000);
});

test('backward clock observations cannot reduce elapsed duration or produce negative speeds', () => {
  const h = load(); h.advance(2000); h.meter.addBytes(1000);
  assert.equal(h.meter.snapshot().activeMs, 2000);
  h.set(1000);
  assert.equal(h.meter.snapshot().activeMs, 2000);
  assert.ok(h.meter.snapshot().averageBps >= 0);
});

test('zero elapsed time stays finite, and retry traffic is counted as network not ZIP bytes', () => {
  const h = load();
  assert.equal(h.meter.snapshot().averageBps, 0);
  h.meter.addBytes(1000); assert.ok(Number.isFinite(h.meter.snapshot().averageBps));
  h.advance(1000); h.meter.addBytes(1000);
  assert.equal(h.meter.snapshot().totalBytes, 2000);
  assert.equal(h.meter.snapshot().averageBps, 2000);
});
