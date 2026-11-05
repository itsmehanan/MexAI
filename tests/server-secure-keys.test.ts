import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import http from 'node:http';

const secret = 'provider-super-secret';

test('server requests vault keys directly and redacts split streamed responses', async () => {
  process.env.MEXAI_SECURE_KEYS = '1';
  process.env.MEXAI_HOST = '127.0.0.1';
  process.env.MEXAI_PORT = '38769';
  process.env.NODE_ENV = 'production';
  const port = new EventEmitter() as EventEmitter & { postMessage: (data: any) => void };
  port.postMessage = data => { queueMicrotask(() => port.emit('message', { data: { type: 'secure-key-response', id: data.id, key: data.type === 'secure-endpoint-request' ? 'https://trusted.example/v1' : (missingKey ? '' : secret) } })); };
  (process as any).parentPort = port;
  const originalFetch = global.fetch;
  let authorization = '';
  const requests: { url: string; model: string }[] = [];
  let scenario = 'normal';
  let catalogCalls = 0;
  let missingKey = false;
  let audioPayload: any;
  global.fetch = async (_url, init) => {
    if (String(_url).includes('generativelanguage.googleapis.com') && String(_url).includes('generateContent')) { audioPayload = JSON.parse(String(init?.body)); return new Response(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: 'Turn on the lights' }] }, finishReason: 'STOP' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } }); }
    if (String(_url) === 'https://openrouter.ai/api/v1/models') { catalogCalls++; if (scenario === 'catalog-down') throw new Error('offline'); return new Response(JSON.stringify({data:[{id:'alpha:free',name:'Alpha',pricing:{prompt:'0',completion:'0'}},{id:'paid',pricing:{prompt:'1',completion:'0'}}]}), {status:200}); }
    authorization = (init?.headers as Record<string, string>).Authorization;
    const request = JSON.parse(String(init?.body));
    requests.push({ url: String(_url), model: request.model });
    if (scenario === 'fallback' && request.model === 'primary') return new Response(JSON.stringify({ error: { message: 'busy' } }), { status: 503 });
    if (scenario === 'empty' && request.model === 'primary') return new Response('data: [DONE]\n\n', { status: 200 });
    if (scenario === 'rate' && request.model === 'primary') return new Response(JSON.stringify({ error: { message: 'rate limited' } }), { status: 429 });
    if (['402', '408', '400', '500', '403'].includes(scenario) && request.model === 'primary') return new Response(JSON.stringify({ error: { message: 'model unavailable or no longer free' } }), { status: Number(scenario) });
    if (scenario === 'network' && request.model === 'primary') throw new Error('network failed');
    if (scenario === 'allfail') return new Response(JSON.stringify({ error: { message: 'model unavailable' } }), { status: 404 });
    if (scenario === 'invalid400' && request.model === 'primary') return new Response(JSON.stringify({ error: { message: 'invalid API key' } }), { status: 400 });
    if (scenario === 'sse-error' && request.model === 'primary') return new Response(`data: ${JSON.stringify({ error: { code: 402, message: 'no longer free' } })}\n\n`, { status: 200 });
    if (scenario === 'other' && request.model === 'primary') return new Response(JSON.stringify({ error: { message: 'model unavailable' } }), { status: 404 });
    if (scenario === 'free' && request.model === 'openrouter/free') return new Response(JSON.stringify({ error: { message: 'not available' } }), { status: 404 });
    if (scenario === 'bad' && request.model === 'primary') return new Response(JSON.stringify({ error: { message: 'bad credentials' } }), { status: 401 });
    if (scenario === 'truncated' && request.model === 'primary') return new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: 'A truncated partial answer from provider' } }] })}\n\n`, { status: 200 });
    if (scenario === 'partial' && request.model === 'primary') {
      let step = 0;
      return new Response(new ReadableStream({ pull(controller) { if (step++ === 0) controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ choices: [{ delta: { content: 'A partial answer from provider' } }] })}\n\n`)); else controller.error(Object.assign(new Error('busy'), { status: 503 })); } }), { status: 200 });
    }
    if (request.stream) {
      return new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: 'key provider-super-' } }] })}\n\ndata: ${JSON.stringify({ choices: [{ delta: { content: 'secret end' } }] })}\n\ndata: [DONE]\n\n`, { status: 200 });
    }
    return new Response(JSON.stringify({ choices: [{ message: { content: `Echo ${secret}` } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const { startServer } = await import('../server');
  const { server } = await startServer();
  const post = (route: string, body: object) => new Promise<string>((resolve, reject) => {
    const data = JSON.stringify(body);
    const request = http.request({ host: '127.0.0.1', port: 38769, path: route, method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } }, response => {
      let text = ''; response.setEncoding('utf8'); response.on('data', part => { text += part; }); response.on('end', () => resolve(text));
    });
    request.on('error', reject); request.end(data);
  });
  const postAudio = (type: string, data: Buffer) => new Promise<{status: number; body: any}>((resolve, reject) => {
    const request = http.request({ host: '127.0.0.1', port: 38769, path: '/api/voice/transcribe', method: 'POST', headers: { 'content-type': type, 'content-length': data.length } }, response => {
      let text = ''; response.setEncoding('utf8'); response.on('data', part => { text += part; }); response.on('end', () => resolve({status: response.statusCode || 0, body: JSON.parse(text)}));
    }); request.on('error', reject); request.end(data);
  });
  const get = (route: string) => new Promise<string>((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: 38769, path: route }, response => { let text = ''; response.setEncoding('utf8'); response.on('data', part => { text += part; }); response.on('end', () => resolve(text)); }).on('error', reject);
  });
  try {
    const audio = await postAudio('audio/webm;codecs=opus', Buffer.from('fake-audio'));
    assert.equal(audio.status, 200); assert.equal(audio.body.text, 'Turn on the lights');
    assert.equal(audioPayload.contents[0].parts[1].inlineData.data, Buffer.from('fake-audio').toString('base64'));
    assert(!JSON.stringify(audio.body).includes(secret));
    assert.equal((await postAudio('application/octet-stream', Buffer.from('fake'))).status, 415);
    missingKey = true;
    assert.equal((await postAudio('audio/webm', Buffer.from('fake'))).body.error, 'Add a Gemini API key in Settings to transcribe voice.');
    missingKey = false;
    const firstCatalog = JSON.parse(await get('/api/providers/openrouter/models'));
    assert.deepEqual(firstCatalog.models.map((m: any) => m.id), ['alpha:free']);
    await get('/api/providers/openrouter/models'); assert.equal(catalogCalls, 1);
    await get('/api/providers/openrouter/models?refresh=1'); assert.equal(catalogCalls, 2);
    const result = await post('/api/providers/test', { provider: 'openai' });
    assert.equal(authorization, `Bearer ${secret}`);
    assert(!result.includes(secret));
    const stream = await post('/api/chat/stream', { provider: 'openai', model: 'test', messages: [{ role: 'user', content: 'hello' }] });
    const joined = stream.split('\n').filter(line => line.startsWith('data: ')).map(line => JSON.parse(line.slice(6)).text || '').join('');
    assert(!joined.includes(secret));
    assert(joined.includes('[redacted]'));
    assert.equal(authorization, `Bearer ${secret}`);
    for (scenario of ['fallback', 'empty', 'rate', 'other', '402', '408', '400', '500', '403', 'network', 'sse-error']) {
      requests.length = 0;
      const output = await post('/api/chat/stream', { provider: 'openai', model: 'primary', messages: [{ role: 'user', content: 'hello' }], fallbacks: [{ provider: 'custom', model: 'backup', baseUrl: 'https://attacker.example/v1' }] });
      assert.deepEqual(requests.map(r => r.model), ['fallback', 'empty', 'rate'].includes(scenario) ? ['primary', 'primary', 'backup'] : ['primary', 'backup']);
      assert.equal(requests.at(-1)?.url, 'https://trusted.example/v1/chat/completions');
      assert(output.includes('"provider":"custom"'));
      assert(output.includes('"model":"backup"'));
    }
    scenario = 'normal'; requests.length = 0;
    await post('/api/chat/stream', { provider: 'openrouter', model: 'qwen/qwen3-coder:free', messages: [{ role: 'user', content: 'hello' }] });
    assert.equal(requests[0].url, 'https://openrouter.ai/api/v1/chat/completions');
    assert.equal(requests[0].model, 'qwen/qwen3-coder:free');
    requests.length = 0;
    await post('/api/chat/stream', { provider: 'openrouter', messages: [{ role: 'user', content: 'hello' }] });
    assert.equal(requests[0].model, 'openrouter/free');
    scenario = 'allfail'; requests.length = 0;
    const failed = await post('/api/chat/stream', { provider: 'openai', model: 'primary', messages: [], fallbacks: [{ provider: 'custom', model: 'backup' }] });
    assert.deepEqual(requests.map(r => r.model), ['primary', 'backup']);
    assert(failed.includes('openai / primary')); assert(failed.includes('custom / backup')); assert(failed.includes('HTTP 404'));
    missingKey = true; requests.length = 0;
    const missing = await post('/api/chat/stream', { provider: 'openai', model: 'primary', messages: [], fallbacks: [{ provider: 'custom', model: 'backup' }] });
    assert.equal(requests.length, 0); assert(missing.includes('Missing API key')); missingKey = false;
    scenario = 'invalid400'; requests.length = 0;
    const invalid = await post('/api/chat/stream', { provider: 'openai', model: 'primary', messages: [], fallbacks: [{ provider: 'custom', model: 'backup' }] });
    assert.deepEqual(requests.map(r => r.model), ['primary']); assert(invalid.includes('invalid or missing API key'));
    scenario = 'bad'; requests.length = 0;
    const rejected = await post('/api/chat/stream', { provider: 'openai', model: 'primary', messages: [], fallbacks: [{ provider: 'custom', model: 'backup' }] });
    assert.deepEqual(requests.map(r => r.model), ['primary']);
    assert(rejected.includes('bad credentials'));
    scenario = 'partial'; requests.length = 0;
    const partial = await post('/api/chat/stream', { provider: 'openai', model: 'primary', messages: [], fallbacks: [{ provider: 'custom', model: 'backup' }] });
    assert.deepEqual(requests.map(r => r.model), ['primary', 'backup']);
    assert(partial.includes('\"reset\":true'));
    assert(partial.includes('\"model\":\"backup\"'));
    scenario = 'truncated'; requests.length = 0;
    const truncated = await post('/api/chat/stream', { provider: 'openai', model: 'primary', messages: [], fallbacks: [{ provider: 'custom', model: 'backup' }] });
    assert.deepEqual(requests.map(r => r.model), ['primary', 'backup']); assert(truncated.includes('\"reset\":true'));
    scenario = 'free'; requests.length = 0;
    const free = await post('/api/chat/stream', { provider: 'openrouter', model: 'openrouter/free', messages: [] });
    assert.deepEqual(requests.map(r => r.model), ['openrouter/free', 'alpha:free']);
    assert(free.includes('\"model\":\"alpha:free\"'));
    assert.equal(catalogCalls, 3);
    scenario = 'catalog-down';
    const unavailable = JSON.parse(await get('/api/providers/openrouter/models?refresh=1'));
    assert(unavailable.error.includes('Could not load'));
  } finally {
    global.fetch = originalFetch;
    await new Promise<void>(resolve => server.close(() => resolve()));
    delete (process as any).parentPort;
  }
});
