import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
const constants = { MODEL_STATIC: 'gemini-2.5-flash', MODEL_LIVE: 'gemini-2.5-flash-native-audio-preview-09-2025' };
const constructors = [];
class GoogleGenAI { constructor(options) { constructors.push(options); } }
let fetchImpl;
const compile = (path, require, globals = {}) => {
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const scope = { fetch: (...args) => fetchImpl(...args), ...globals };
  const exports = {}; new Function('require', 'exports', ...Object.keys(scope), code)(require, exports, ...Object.values(scope)); return exports;
};
const sdk = { GoogleGenAI, Modality: { AUDIO: 'AUDIO' }, Type: { OBJECT: 'OBJECT', STRING: 'STRING', NUMBER: 'NUMBER', ARRAY: 'ARRAY' } };
const client = compile('../src/services/gemini.ts', () => sdk);
const { createGeminiHandler, authorizeLocalDev } = compile('../server/geminiApi.ts', name => name === '@google/genai' ? sdk : name.endsWith('/gemini') ? client : constants);
const result = { chinese: '杯', pinyin: 'bēi', english: 'cup', sentence: '一个杯子。', sentencePinyin: 'yí ge bēizi', sentenceEnglish: 'A cup.' };
function setup(options = {}) {
  const calls = [];
  const ai = { authTokens: { async create(body) { calls.push(body); if (options.fail) throw new Error('private upstream detail'); return { name: options.token ?? 'auth_tokens/fixture' }; } },
    models: { async generateContent(body) { calls.push(body); if (options.fail) throw new Error('private upstream detail'); return { text: JSON.stringify(options.result ?? result) }; } } };
  const handler = createGeminiHandler({ authorize: () => true, getClient: () => ai, now: () => 0, ...options.handler });
  return { calls, async request(url, body = {}, overrides = {}) {
    const req = Readable.from([typeof body === 'string' ? body : JSON.stringify(body)]);
    Object.assign(req, { url: `/api/gemini/${url}`, method: 'POST', headers: { 'content-type': 'application/json' }, ...overrides });
    let status, payload, headers;
    const res = { writeHead(s, h) { status = s; headers = h; }, end(text) { payload = JSON.parse(text); } };
    await handler(req, res); return { status, payload, headers };
  } };
}
test('production handler denies by default before client initialization', async () => {
  const app = setup({ handler: { authorize: undefined, getClient() { assert.fail('unauthorized client initialization'); } } });
  assert.equal((await app.request('live-token')).status, 403);
});
test('development authorization requires loopback, exact host and origin', () => {
  const req = { socket: { remoteAddress: '127.0.0.1' }, headers: { host: 'localhost:3000', origin: 'http://localhost:3000' } };
  assert.equal(authorizeLocalDev(req), true);
  for (const [field, value] of [['origin', undefined], ['origin', 'https://example.invalid'], ['host', 'example.invalid']]) assert.equal(authorizeLocalDev({ ...req, headers: { ...req.headers, [field]: value } }), false);
  assert.equal(authorizeLocalDev({ ...req, socket: { remoteAddress: '192.0.2.1' } }), false);
});
test('Live token locks model/audio, one use, 60-second start and 10-minute lifetime', async () => {
  const app = setup(), response = await app.request('live-token');
  assert.equal(response.status, 200); assert.deepEqual(response.payload, { token: 'auth_tokens/fixture' });
  const config = app.calls[0].config;
  assert.equal(config.uses, 1); assert.equal(Date.parse(config.newSessionExpireTime), 60_000); assert.equal(Date.parse(config.expireTime), 600_000);
  assert.deepEqual(config.liveConnectConstraints, { model: constants.MODEL_LIVE, config: { responseModalities: ['AUDIO'] } });
  assert.equal(response.headers['Cache-Control'], 'no-store');
});
for (const [url, body, overrides, status] of [
  ['live-token', { model: 'arbitrary' }, {}, 400], ['snap', 'not json', {}, 400], ['snap', null, {}, 400],
  ['snap', { image: 'file:///private' }, {}, 400], ['snap', { image: '/9j/AAAA', prompt: 'override' }, {}, 400],
  ['snap', 'x'.repeat(3_000_001), {}, 413], ['live-token', {}, { method: 'GET' }, 405],
  ['live-token', {}, { headers: {} }, 415], ['unknown', {}, {}, 404],
]) test(`reject invalid request ${url}/${status}/${Object.keys(overrides)}`, async () => {
  const app = setup(); assert.equal((await app.request(url, body, overrides)).status, status); assert.equal(app.calls.length, 0);
});
test('Snap uses a fixed model/prompt and validates upstream shape', async () => {
  const app = setup(); assert.deepEqual((await app.request('snap', { image: '/9j/AAAA' })).payload, result);
  assert.equal(app.calls[0].model, constants.MODEL_STATIC); assert.equal(app.calls[0].contents[0].parts[0].inlineData.mimeType, 'image/jpeg');
  const invalid = setup({ result: { chinese: [] } }); assert.equal((await invalid.request('snap', { image: '/9j/AAAA' })).status, 502);
});
test('upstream errors and invalid tokens never disclose upstream details', async () => {
  for (const options of [{ fail: true }, { token: 'not-an-ephemeral-token' }]) {
    const response = await setup(options).request('live-token'); assert.equal(response.status, 502);
    assert.equal(JSON.stringify(response).includes('private upstream detail'), false);
  }
});
test('browser client uses only returned ephemeral token; failed backend fails closed', async () => {
  fetchImpl = async (url, options) => { assert.equal(url, '/api/gemini/live-token'); assert.equal(options.credentials, 'same-origin'); return { ok: true, json: async () => ({ token: 'auth_tokens/fixture' }) }; };
  await client.createLiveClient(); assert.deepEqual(constructors.at(-1), { apiKey: 'auth_tokens/fixture', httpOptions: { apiVersion: 'v1alpha' } });
  fetchImpl = async () => ({ ok: false }); await assert.rejects(client.createLiveClient(), /unavailable/);
  fetchImpl = async () => ({ ok: true, json: async () => ({ token: 'permanent-fixture' }) }); await assert.rejects(client.createLiveClient(), /Invalid session/);
});
test('browser Snap validates response and forwards cancellation', async () => {
  const controller = new AbortController();
  fetchImpl = async (url, options) => {
    assert.equal(url, '/api/gemini/snap');
    assert.equal(options.signal.aborted, false);
    controller.abort();
    assert.equal(options.signal.aborted, true);
    return { ok: true, json: async () => ({ radicals: 42 }) };
  };
  await assert.rejects(client.analyzePhoto('/9j/AAAA', controller.signal), /Invalid analysis/);
});

function timedClient(fetch) {
  const timers = new Map();
  const api = compile('../src/services/gemini.ts', () => sdk, {
    fetch,
    setTimeout(fn, delay) { const id = {}; timers.set(id, { fn, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
  });
  return { api, timers, expire() {
    assert.equal(timers.size, 1, 'request must have a deadline');
    const timer = [...timers.values()][0];
    assert.equal(timer.delay, 30_000);
    timer.fn();
  } };
}
const untilAborted = signal => new Promise((_, reject) => {
  if (signal.aborted) reject(signal.reason);
  else signal.addEventListener('abort', () => reject(signal.reason), { once: true });
});
for (const mode of ['snap', 'live-token', 'response-body']) {
  test(`browser request times out and releases timer: ${mode}`, async () => {
    let signal;
    const app = timedClient(async (_, options) => {
      signal = options.signal;
      return mode === 'response-body' ? { ok: true, json: () => untilAborted(signal).catch(() => {
        throw new DOMException('Body read aborted', 'AbortError');
      }) } : untilAborted(signal);
    });
    const request = mode === 'live-token' ? app.api.createLiveClient() : app.api.analyzePhoto('/9j/AAAA');
    const rejection = assert.rejects(request, /AI service request timed out\. Please try again\./);
    await Promise.resolve();
    app.expire();
    await rejection;
    assert.equal(signal.aborted, true);
    assert.equal(app.timers.size, 0);
  });
}
for (const alreadyAborted of [false, true]) {
  test(`caller cancellation is preserved and listener removed (pre-aborted: ${alreadyAborted})`, async () => {
    const controller = new AbortController(), reason = new Error('fixture cancellation');
    let listeners = 0;
    const source = controller.signal;
    const signal = {
      get aborted() { return source.aborted; }, get reason() { return source.reason; },
      addEventListener(...args) { listeners++; source.addEventListener(...args); },
      removeEventListener(...args) { listeners--; source.removeEventListener(...args); },
    };
    const app = timedClient(async (_, options) => untilAborted(options.signal));
    if (alreadyAborted) controller.abort(reason);
    const request = app.api.analyzePhoto('/9j/AAAA', signal);
    const rejection = assert.rejects(request, error => error === reason);
    if (!alreadyAborted) controller.abort(reason);
    await rejection;
    assert.equal(app.timers.size, 0);
    assert.equal(listeners, 0);
  });
}
for (const outcome of ['success', 'http-error', 'network-error', 'json-error']) {
  test(`request releases timer after ${outcome}`, async () => {
    const app = timedClient(async () => {
      if (outcome === 'network-error') throw new Error('fixture network error');
      return { ok: outcome !== 'http-error', json: async () => {
        if (outcome === 'json-error') throw new Error('fixture JSON error');
        return result;
      } };
    });
    if (outcome === 'success') assert.deepEqual(await app.api.analyzePhoto('/9j/AAAA'), result);
    else await assert.rejects(app.api.analyzePhoto('/9j/AAAA'));
    assert.equal(app.timers.size, 0);
  });
}
