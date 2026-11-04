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
  port.postMessage = data => { queueMicrotask(() => port.emit('message', { data: { type: 'secure-key-response', id: data.id, key: secret } })); };
  (process as any).parentPort = port;
  const originalFetch = global.fetch;
  let authorization = '';
  global.fetch = async (_url, init) => {
    authorization = (init?.headers as Record<string, string>).Authorization;
    const request = JSON.parse(String(init?.body));
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
  } finally {
    global.fetch = originalFetch;
    await new Promise<void>(resolve => server.close(() => resolve()));
    delete (process as any).parentPort;
  }
});
