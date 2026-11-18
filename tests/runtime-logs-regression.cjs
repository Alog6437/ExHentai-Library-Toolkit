const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '../ExHentai_Library_Toolkit.user.js'), 'utf8');
function load() {
  const downloads = [], output = [];
  const originalConsole = Object.fromEntries(['log', 'warn', 'error'].map(level => [level, (...args) => output.push({ level, args })]));
  const ctx = vm.createContext({
    CONFIG: { lrrApiKey: 'private/+ key', lrrServerUrl: 'https://user:server-pass@lrr.invalid/?api_key=server-key', enableLogging: false, lrrDebugMode: false, enableLrrChecker: true },
    TextEncoder, URL, Blob, console: originalConsole,
    location: { href: 'https://e-hentai.org/g/12345/abcdef/?access_token=page-secret' },
    navigator: { userAgent: 'Test Browser' }, GM_info: { script: { version: 'test-version' } },
    triggerZipDownload: (blob, name) => downloads.push({ blob, name }),
  });
  const start = source.indexOf('    // Runtime diagnostics');
  const end = source.indexOf('    // End runtime diagnostics', start);
  assert.ok(start >= 0 && end > start, 'diagnostic module exists');
  vm.runInContext(source.slice(start, end), ctx);
  const wrappers = source.indexOf('    function debugLog(');
  vm.runInContext(source.slice(wrappers, source.indexOf('    var galleryDlBusy', wrappers)), ctx);
  return { ctx, downloads, output, originalConsole };
}

test('runtime logs start automatically and capture debug output even with console switches off', () => {
  const h = load();
  assert.equal(h.ctx.buildRuntimeLogExport().entries[0].event, 'runtime.started');
  h.ctx.debugLog('debug event'); h.ctx.log('info event'); h.ctx.warn('warning'); h.ctx.errLog('failure');
  assert.equal(h.output.length, 0);
  const report = h.ctx.buildRuntimeLogExport();
  assert.equal(report.count, 5); assert.equal(report.version, 'test-version');
  assert.ok(report.sessionStartedAt && report.exportedAt);
  h.ctx.CONFIG.enableLogging = true; h.ctx.CONFIG.lrrDebugMode = true;
  h.ctx.log('shown'); h.ctx.debugLog('also shown');
  assert.equal(h.output.length, 2);
  assert.equal(h.ctx.console.log, h.originalConsole.log, 'host console is not monkey patched');
});

test('export redacts keys, encoded keys, headers, query credentials, URL userinfo and nested errors', () => {
  const h = load();
  const error = new Error('private/+ key ' + encodeURIComponent('private/+ key') + ' Bearer bearer-secret\nAuthorization: Basic base64-secret');
  h.ctx.recordRuntimeLog('error', 'privacy', {
    error, nested: { apiKey: 'object-secret', access_token: 'token-secret', cookie: 'cookie-secret', password: 'password-secret' },
    url: 'https://alice:login-secret@lrr.invalid/api?token=query-secret&api_key=query-key&visible=ok',
    message: 'Cookie: header-cookie\npassword=inline-secret',
  });
  const text = JSON.stringify(h.ctx.buildRuntimeLogExport());
  for (const secret of ['private/+ key', encodeURIComponent('private/+ key'), 'bearer-secret', 'base64-secret', 'object-secret', 'token-secret', 'cookie-secret', 'password-secret', 'login-secret', 'query-secret', 'query-key', 'header-cookie', 'inline-secret', 'server-pass', 'server-key', 'page-secret']) {
    assert.equal(text.includes(secret), false, 'must redact ' + secret);
  }
  assert.match(text, /visible=ok/);
  assert.match(text, /12345\/abcdef/);
  assert.match(text, /REDACTED/);
});

test('binary and API payloads are omitted, circular objects and hostile getters never break logging', () => {
  const h = load(); const cyclic = { label: 'useful' }; cyclic.self = cyclic;
  const hostile = {}; Object.defineProperty(hostile, 'bad', { enumerable: true, get() { throw new Error('getter'); } });
  h.ctx.recordRuntimeLog('info', 'payload', { cyclic, hostile, binary: new Uint8Array([1, 2]), responseText: 'private-response', body: 'private-body', data: 'private-data' });
  const text = JSON.stringify(h.ctx.buildRuntimeLogExport());
  assert.match(text, /Circular/); assert.match(text, /Unreadable/);
  for (const secret of ['private-response', 'private-body', 'private-data']) assert.equal(text.includes(secret), false);
  assert.match(text, /Binary omitted/);
});

test('bounded memory retains newest entries and reports dropped history', () => {
  const h = load(); h.ctx.RUNTIME_LOG_MAX_ENTRIES = 3;
  for (let i = 0; i < 5; i++) h.ctx.recordRuntimeLog('info', 'entry-' + i, { value: i });
  const report = h.ctx.buildRuntimeLogExport();
  assert.equal(report.count, 3); assert.equal(report.totalEntries, 6); assert.equal(report.droppedEntries, 3);
  assert.deepEqual(Array.from(report.entries, entry => entry.event), ['entry-2', 'entry-3', 'entry-4']);
  assert.ok(report.retainedBytes <= report.limits.bytes);
  h.ctx.RUNTIME_LOG_MAX_BYTES = 400;
  h.ctx.recordRuntimeLog('info', 'after-byte-cap', { text: 'short' });
  assert.ok(h.ctx.buildRuntimeLogExport().retainedBytes <= 400);
});

test('oversized diagnostics truncate safely rather than retaining full inputs', () => {
  const h = load();
  h.ctx.recordRuntimeLog('info', 'large', Object.fromEntries(Array.from({ length: 40 }, (_, i) => ['field' + i, 'x'.repeat(20000)])));
  const report = h.ctx.buildRuntimeLogExport();
  assert.equal(report.truncatedEntries, 1);
  assert.ok(report.retainedBytes < 50000);
  assert.ok(JSON.stringify(report).length < 50000);
});

test('string and collection truncation is counted, not silently reported as complete', () => {
  const h = load();
  h.ctx.recordRuntimeLog('info', 'long-string', 'x'.repeat(6000));
  h.ctx.recordRuntimeLog('info', 'many-items', Array.from({ length: 50 }, (_, i) => i));
  h.ctx.recordRuntimeLog('info', 'many-fields', Object.fromEntries(Array.from({ length: 50 }, (_, i) => ['field' + i, i])));
  assert.equal(h.ctx.buildRuntimeLogExport().truncatedEntries, 3);
});

test('one-click export downloads valid JSON with session metadata and export event', async () => {
  const h = load(); h.ctx.recordRuntimeLog('warn', 'sync.failed', { reason: 'offline' });
  h.ctx.exportRuntimeLogs();
  assert.equal(h.downloads.length, 1);
  const { blob, name } = h.downloads[0];
  assert.match(name, /^eh-toolkit-runtime-.*\.json$/);
  assert.match(blob.type, /application\/json/);
  const report = JSON.parse(await blob.text());
  assert.equal(report.entries.at(-1).event, 'diagnostics.export');
  assert.equal(report.entries.some(entry => entry.event === 'sync.failed'), true);
  assert.equal(report.config.lrrApiKey, undefined);
  assert.equal(report.droppedEntries, 0);
  assert.equal(report.count, report.entries.length);
});

test('a new script context starts an independent session without old events', () => {
  const first = load(); first.ctx.recordRuntimeLog('info', 'first-session-only', {});
  const second = load();
  assert.equal(second.ctx.buildRuntimeLogExport().count, 1);
  assert.equal(JSON.stringify(second.ctx.buildRuntimeLogExport()).includes('first-session-only'), false);
});
