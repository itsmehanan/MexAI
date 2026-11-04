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
  port.postMessage = data => { queueMicrotask(() => port.emit('message', { data: { type: 'secure-key-response', id: data.id, key: data.type === 'secure-endpoint-request' ? 'https://trusted.example/v1' : secret } })); };
  (process as any).parentPort = port;
  const originalFetch = global.fetch;
  let authorization = '';
  const requests: { url: string; model: string }[] = [];
  let scenario = 'normal';
  global.fetch = async (_url, init) => {
    authorization = (init?.headers as Record<string, string>).Authorization;
    const request = JSON.parse(String(init?.body));
    requests.push({ url: String(_url), model: request.model });
    if (scenario === 'fallback' && request.model === 'primary') return new Response(JSON.stringify({ error: { message: 'busy' } }), { status: 503 });
    if (scenario === 'empty' && request.model === 'primary') return new Response('data: [DONE]\n\n', { status: 200 });
    if (scenario === 'rate' && request.model === 'primary') return new Response(JSON.stringify({ error: { message: 'rate limited' } }), { status: 429 });
    if (scenario === 'bad' && request.model === 'primary') return new Response(JSON.stringify({ error: { message: 'bad credentials' } }), { status: 401 });
    if (scenario === 'partial') {
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
  try {
    const result = await post('/api/providers/test', { provider: 'openai' });
    assert.equal(authorization, `Bearer ${secret}`);
    assert(!result.includes(secret));
    const stream = await post('/api/chat/stream', { provider: 'openai', model: 'test', messages: [{ role: 'user', content: 'hello' }] });
    const joined = stream.split('\n').filter(line => line.startsWith('data: ')).map(line => JSON.parse(line.slice(6)).text || '').join('');
    assert(!joined.includes(secret));
    assert(joined.includes('[redacted]'));
    assert.equal(authorization, `Bearer ${secret}`);
    for (scenario of ['fallback', 'empty', 'rate']) {
      requests.length = 0;
      const output = await post('/api/chat/stream', { provider: 'openai', model: 'primary', messages: [{ role: 'user', content: 'hello' }], fallbacks: [{ provider: 'custom', model: 'backup', baseUrl: 'https://attacker.example/v1' }] });
      assert.deepEqual(requests.map(r => r.model), ['primary', 'primary', 'backup']);
      assert.equal(requests[2].url, 'https://trusted.example/v1/chat/completions');
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
    scenario = 'bad'; requests.length = 0;
    const rejected = await post('/api/chat/stream', { provider: 'openai', model: 'primary', messages: [], fallbacks: [{ provider: 'custom', model: 'backup' }] });
    assert.deepEqual(requests.map(r => r.model), ['primary']);
    assert(rejected.includes('bad credentials'));
    scenario = 'partial'; requests.length = 0;
    const partial = await post('/api/chat/stream', { provider: 'openai', model: 'primary', messages: [], fallbacks: [{ provider: 'custom', model: 'backup' }] });
    assert.deepEqual(requests.map(r => r.model), ['primary']);
    assert(partial.includes('busy'));
  } finally {
    global.fetch = originalFetch;
    await new Promise<void>(resolve => server.close(() => resolve()));
    delete (process as any).parentPort;
  }
});
