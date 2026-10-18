const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../ExHentai_Library_Toolkit.user.js'), 'utf8');

function load(globals = {}) {
  const context = vm.createContext(globals);
  const start = source.indexOf('    async function requestLrrContentRescan(');
  const end = source.indexOf('    function extractUrlfinderHit(', start);
  assert.ok(start >= 0 && end > start);
  vm.runInContext(source.slice(start, end), context);
  return context;
}

test('content rescan posts to the Shinobu endpoint with API-key authorization', async () => {
  let request;
  const ctx = load({
    CONFIG: { lrrServerUrl: 'http://lrr.test', lrrApiKey: 'secret' },
    t: (zh) => zh,
    getAuthorizationHeaderValue: key => `Bearer encoded-${key}`,
    makeRequest: async options => {
      request = options;
      return { responseText: JSON.stringify({ operation: 'shinobu_rescan', success: 1, new_pid: 42 }) };
    },
  });

  const result = await ctx.requestLrrContentRescan();
  assert.equal(request.method, 'POST');
  assert.equal(request.url, 'http://lrr.test/api/shinobu/rescan');
  assert.equal(request.headers.Authorization, 'Bearer encoded-secret');
  assert.equal(result.new_pid, 42);
});

test('content rescan requires configuration and rejects unsuccessful responses', async () => {
  const missingKey = load({
    CONFIG: { lrrServerUrl: 'http://lrr.test', lrrApiKey: '' },
    t: (zh) => zh,
  });
  await assert.rejects(() => missingKey.requestLrrContentRescan(), /API Key/);

  const failed = load({
    CONFIG: { lrrServerUrl: 'http://lrr.test', lrrApiKey: 'secret' },
    t: (zh) => zh,
    getAuthorizationHeaderValue: () => 'Bearer encoded',
    makeRequest: async () => ({ responseText: JSON.stringify({ success: 0, error: 'Shinobu unavailable' }) }),
  });
  await assert.rejects(() => failed.requestLrrContentRescan(), /Shinobu unavailable/);
});
