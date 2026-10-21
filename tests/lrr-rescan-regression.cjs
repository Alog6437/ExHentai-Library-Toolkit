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

const OK_BODY = JSON.stringify({ operation: 'shinobu_rescan', success: 1, new_pid: 42 });

test('content rescan posts to the Shinobu endpoint with API-key authorization', async () => {
  let request;
  const ctx = load({
    CONFIG: { lrrServerUrl: 'http://lrr.test', lrrApiKey: 'secret' },
    t: (zh) => zh,
    getAuthorizationHeaderValue: key => `Bearer encoded-${key}`,
    makeRequest: async options => {
      request = options;
      return { status: 200, responseText: OK_BODY };
    },
  });

  const result = await ctx.requestLrrContentRescan();
  assert.equal(request.method, 'POST');
  assert.equal(request.url, 'http://lrr.test/api/shinobu/rescan');
  assert.equal(request.headers.Authorization, 'Bearer encoded-secret');
  // 接管状态码才能读出 LANraragi 的 JSON 错误，不能再让 makeRequest 直接 reject。
  assert.equal(typeof request.validateStatus, 'function');
  assert.equal(request.validateStatus(401), true);
  assert.equal(result.new_pid, 42);
});

test('content rescan still rejects a missing server address', async () => {
  const ctx = load({ CONFIG: { lrrServerUrl: '', lrrApiKey: 'secret' }, t: (zh) => zh });
  await assert.rejects(() => ctx.requestLrrContentRescan(), /服务器地址/);
});

test('no API key configured means no Authorization header, but the call still happens', async () => {
  let request;
  const ctx = load({
    CONFIG: { lrrServerUrl: 'http://lrr.test', lrrApiKey: '' },
    t: (zh) => zh,
    getAuthorizationHeaderValue: () => 'Bearer should-not-be-used',
    makeRequest: async options => {
      request = options;
      return { status: 200, responseText: OK_BODY };
    },
  });

  const result = await ctx.requestLrrContentRescan();
  // 未启用密码的 LANraragi 允许匿名 API，脚本不应在本地拦下。
  assert.equal(request.headers.Authorization, undefined);
  assert.equal(result.success, 1);
});

test('unsuccessful payloads surface the LANraragi error message', async () => {
  const ctx = load({
    CONFIG: { lrrServerUrl: 'http://lrr.test', lrrApiKey: 'secret' },
    t: (zh) => zh,
    getAuthorizationHeaderValue: () => 'Bearer encoded',
    makeRequest: async () => ({ status: 200, responseText: JSON.stringify({ success: 0, error: 'Shinobu unavailable' }) }),
  });
  await assert.rejects(() => ctx.requestLrrContentRescan(), /Shinobu unavailable/);
});

test('http failures become actionable messages instead of raw status codes', async () => {
  async function rejectWith(status, body) {
    const ctx = load({
      CONFIG: { lrrServerUrl: 'http://lrr.test', lrrApiKey: 'secret' },
      t: (zh) => zh,
      getAuthorizationHeaderValue: () => 'Bearer encoded',
      makeRequest: async () => ({ status, responseText: body }),
    });
    try {
      await ctx.requestLrrContentRescan();
      return null;
    } catch (e) {
      return e.message;
    }
  }

  const unauthorized = await rejectWith(401, JSON.stringify({ errors: ['Unauthorized'] }));
  assert.match(unauthorized, /API Key/);
  assert.match(unauthorized, /401/);

  const forbidden = await rejectWith(403, '');
  assert.match(forbidden, /API Key/);
  assert.match(forbidden, /403/);

  const notFound = await rejectWith(404, '<html>404</html>');
  assert.match(notFound, /接口不存在/);
  assert.match(notFound, /404/);

  const badRequest = await rejectWith(400, JSON.stringify({ success: 0, error: 'Locked resource' }));
  assert.match(badRequest, /拒绝请求/);
  assert.match(badRequest, /400/);
  assert.match(badRequest, /Locked resource/);
});

test('empty or non-JSON success bodies are reported distinctly', async () => {
  const empty = load({
    CONFIG: { lrrServerUrl: 'http://lrr.test', lrrApiKey: '' },
    t: (zh) => zh,
    makeRequest: async () => ({ status: 200, responseText: '   ' }),
  });
  await assert.rejects(() => empty.requestLrrContentRescan(), /返回为空/);

  const notJson = load({
    CONFIG: { lrrServerUrl: 'http://lrr.test', lrrApiKey: '' },
    t: (zh) => zh,
    makeRequest: async () => ({ status: 200, responseText: 'OK' }),
  });
  await assert.rejects(() => notJson.requestLrrContentRescan(), /无效 JSON/);
});

test('a bare success:0 response does not leak raw JSON into the error text', async () => {
  const ctx = load({
    CONFIG: { lrrServerUrl: 'http://lrr.test', lrrApiKey: '' },
    t: (zh) => zh,
    makeRequest: async () => ({
      status: 200,
      responseText: JSON.stringify({ operation: 'shinobu_rescan', success: 0, new_pid: 7 }),
    }),
  });
  try {
    await ctx.requestLrrContentRescan();
    assert.fail('expected rejection');
  } catch (e) {
    assert.match(e.message, /未确认重扫成功/);
    assert.doesNotMatch(e.message, /"operation"/, '不能把整段 JSON 当错误文案');
  }
});

test('string success values are accepted for older LANraragi builds', async () => {
  const ctx = load({
    CONFIG: { lrrServerUrl: 'http://lrr.test', lrrApiKey: '' },
    t: (zh) => zh,
    makeRequest: async () => ({ status: 200, responseText: JSON.stringify({ success: '1', new_pid: '12' }) }),
  });
  const result = await ctx.requestLrrContentRescan();
  assert.equal(result.new_pid, '12');
});
