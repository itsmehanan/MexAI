import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import type { Server } from 'http';
import { randomUUID } from 'node:crypto';
import { getFreeOpenRouterModels } from './server/openrouter';
import { AGENT_SYSTEM_PROMPTS } from './server/prompts';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Electron supplies its app/resource directory; the web server keeps using its own directory.
const projectRoot = path.resolve(process.env.MEXAI_APP_ROOT || __dirname);
dotenv.config({ path: path.join(projectRoot, '.env') });

const app = express();
// Preserve the web defaults; Electron supplies a fixed loopback port and host.
const PORT = Number(process.env.MEXAI_PORT) || (process.env.NODE_ENV === 'production' ? (Number(process.env.PORT) || 8080) : 3000);
const HOST = process.env.MEXAI_HOST || '0.0.0.0';

app.use(express.json({ limit: '10mb' }));

export type ProviderType = 'gemini' | 'openai' | 'anthropic' | 'openrouter' | 'ollama' | 'custom';

function redact(value: string, secret?: string): string { return secret ? value.split(secret).join('[redacted]') : value; }

function formatErrorMessage(err: any, secret?: string): string {
  if (!err) return 'Unknown error occurred.';
  let message = err.message || String(err);
  try {
    const parsed = JSON.parse(message);
    if (parsed.error?.message) {
      return secret ? String(parsed.error.message).split(secret).join('[redacted]') : parsed.error.message;
    }
    if (parsed.error && typeof parsed.error === 'string') {
      return secret ? parsed.error.split(secret).join('[redacted]') : parsed.error;
    }
  } catch (jsonErr) {
    // Ordinary error messages are not JSON.
  }
  return secret ? String(message).split(secret).join('[redacted]') : message;
}

const keyPort = (process as any).parentPort;
const pendingKeys = new Map<string, { resolve: (key: string) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
if (process.env.MEXAI_SECURE_KEYS === '1' && keyPort) {
  keyPort.on('message', (event: any) => {
    const message = event.data;
    if (message?.type !== 'secure-key-response') return;
    const pending = pendingKeys.get(message.id);
    if (!pending) return;
    pendingKeys.delete(message.id);
    clearTimeout(pending.timer);
    if (message.error) pending.reject(new Error('Secure key storage is unavailable.'));
    else pending.resolve(typeof message.key === 'string' ? message.key : '');
  });
}
async function secureKey(provider: ProviderType, endpoint = false): Promise<string> {
  if (!keyPort) throw new Error('Secure key storage is unavailable.');
  const id = randomUUID();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pendingKeys.delete(id); reject(new Error('Secure key storage timed out.')); }, 5000);
    pendingKeys.set(id, { resolve, reject, timer });
    keyPort.postMessage({ type: endpoint ? 'secure-endpoint-request' : 'secure-key-request', id, provider });
  });
}
async function resolveApiKey(provider: ProviderType, customKey?: string): Promise<string> {
  const custom = process.env.MEXAI_SECURE_KEYS === '1' && provider !== 'ollama'
    ? await secureKey(provider) : customKey?.trim();
  if (custom) return custom;

  switch (provider) {
    case 'gemini':
      return process.env.GEMINI_API_KEY?.trim() || '';
    case 'openai':
      return process.env.OPENAI_API_KEY?.trim() || '';
    case 'custom':
      return process.env.CUSTOM_API_KEY?.trim() || '';
    case 'anthropic':
      return process.env.ANTHROPIC_API_KEY?.trim() || '';
    case 'openrouter':
      return process.env.OPENROUTER_API_KEY?.trim() || '';
    case 'ollama':
      return ''; // Not needed
    default:
      return '';
  }
}

// Check system status & environmental key availability
app.get('/api/status', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    hasEnvKey: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 5),
    defaultModel: 'gemini-3.8-flash',
    envKeys: {
      gemini: Boolean(process.env.GEMINI_API_KEY?.trim()),
      openai: Boolean(process.env.OPENAI_API_KEY?.trim()),
      custom: Boolean(process.env.CUSTOM_API_KEY?.trim()),
      anthropic: Boolean(process.env.ANTHROPIC_API_KEY?.trim()),
      openrouter: Boolean(process.env.OPENROUTER_API_KEY?.trim()),
      ollama: true, // Always testable locally
    },
  });
});

// Audio is processed in memory and sent only to Gemini; the key never reaches a renderer.
app.post('/api/voice/transcribe', express.raw({ type: ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/wav'], limit: '4mb' }), async (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store');
  const mime = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (!['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/wav'].includes(mime)) { res.status(415).json({ error: 'Unsupported audio format.' }); return; }
  if (!Buffer.isBuffer(req.body) || !req.body.length) { res.status(400).json({ error: 'No audio was recorded.' }); return; }
  let key = '';
  try {
    key = await resolveApiKey('gemini');
    if (!key) { res.status(400).json({ error: 'Add a Gemini API key in Settings to transcribe voice.' }); return; }
    const ai = new GoogleGenAI({ apiKey: key });
    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [
        { text: 'Transcribe the speech in this audio exactly. Return only the transcript, without commentary. If there is no intelligible speech, return an empty response.' },
        { inlineData: { mimeType: mime, data: req.body.toString('base64') } },
      ] }],
      config: { abortSignal: AbortSignal.timeout(60_000) },
    });
    const text = redact(result.text?.trim() || '', key);
    if (!text) { res.status(422).json({ error: 'No speech was detected.' }); return; }
    res.json({ text: text.slice(0, 10000) });
  } catch (error) {
    console.warn('Voice transcription failed.');
    res.status(502).json({ error: `Gemini transcription failed: ${formatErrorMessage(error, key).slice(0, 300)}` });
  }
});

// OpenRouter's public catalog; only verified zero-priced models are returned.
app.get('/api/providers/openrouter/models', async (req: Request, res: Response) => {
  try { res.json({ models: await getFreeOpenRouterModels(req.query.refresh === '1') }); }
  catch { res.status(502).json({ error: 'Could not load the OpenRouter model catalog. Please try refreshing.' }); }
});

// Fetch installed Ollama models
app.post('/api/providers/ollama/models', async (req: Request, res: Response) => {
  const baseUrl = (req.body.baseUrl?.trim() || 'http://localhost:11434').replace(/\/+$/, '');
  try {
    const resp = await fetch(`${baseUrl}/api/tags`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });
    if (!resp.ok) {
      res.status(resp.status).json({
        models: [],
        error: `Ollama returned HTTP ${resp.status} at ${baseUrl}/api/tags`,
      });
      return;
    }
    const data: any = await resp.json();
    const models = (data.models || []).map((m: any) => ({
      id: m.name || m.model,
      name: m.name || m.model,
      provider: 'ollama',
      description: m.details ? `${m.details.family || ''} ${m.details.parameter_size || ''}`.trim() : 'Local model',
    }));
    res.json({ models });
  } catch (err: any) {
    console.warn('Ollama model fetch failed:', err);
    res.status(500).json({
      models: [],
      error: `Could not reach Ollama server at ${baseUrl}. Ensure Ollama is running. (${err.message})`,
    });
  }
});

// Test connection endpoint for all providers
app.post('/api/providers/test', async (req: Request, res: Response) => {
  const { provider, apiKey, baseUrl, model } = req.body;
  const p = (provider || 'gemini') as ProviderType;
  let resolvedKey: string;
  try { resolvedKey = await resolveApiKey(p, apiKey); }
  catch { res.status(503).json({ valid: false, error: 'Secure key storage is unavailable.' }); return; }

  if (p !== 'ollama' && !resolvedKey) {
    res.status(400).json({
      valid: false,
      error: `API key is required to test ${p.toUpperCase()}.`,
    });
    return;
  }

  try {
    if (p === 'gemini') {
      const ai = new GoogleGenAI({
        apiKey: resolvedKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
      });
      const result = await ai.models.generateContent({
        model: model || 'gemini-3.8-flash',
        contents: 'Ping test. Reply with OK.',
      });
      res.json({ valid: true, reply: redact(result.text?.trim() || 'OK', resolvedKey), model: model || 'gemini-3.8-flash' });
      return;
    }

    if (p === 'openai' || p === 'custom') {
      if (p === 'custom' && (typeof model !== 'string' || !model.trim())) throw new Error('Enter a custom model name in Settings.');
      const endpoint = p === 'custom' ? await customEndpoint() : 'https://api.openai.com/v1';
      const resp = await fetch(`${endpoint}/chat/completions`, {
        redirect: 'error',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resolvedKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: model || 'gpt-4o-mini',
          messages: [{ role: 'user', content: 'Ping test. Reply with OK.' }],
          max_tokens: 10,
        }),
      });
      if (!resp.ok) {
        const errJson: any = await resp.json().catch(() => ({}));
        throw new Error(errJson.error?.message || `OpenAI returned status ${resp.status}`);
      }
      const data: any = await resp.json();
      res.json({ valid: true, reply: redact(data.choices?.[0]?.message?.content?.trim() || 'OK', resolvedKey), model: model || 'gpt-4o-mini' });
      return;
    }

    if (p === 'anthropic') {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': resolvedKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: model || 'claude-3-5-haiku-20241022',
          max_tokens: 10,
          messages: [{ role: 'user', content: 'Ping test. Reply with OK.' }],
        }),
      });
      if (!resp.ok) {
        const errJson: any = await resp.json().catch(() => ({}));
        throw new Error(errJson.error?.message || `Anthropic returned status ${resp.status}`);
      }
      const data: any = await resp.json();
      const reply = redact(data.content?.[0]?.text?.trim() || 'OK', resolvedKey);
      res.json({ valid: true, reply, model: model || 'claude-3-5-haiku-20241022' });
      return;
    }

    if (p === 'openrouter') {
      const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resolvedKey}`,
          'HTTP-Referer': 'https://hanex-and-shumex.local',
          'X-Title': 'Hanex & Shumex Desktop',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: model || 'openrouter/free',
          messages: [{ role: 'user', content: 'Ping test. Reply with OK.' }],
          max_tokens: 10,
        }),
      });
      if (!resp.ok) {
        const errJson: any = await resp.json().catch(() => ({}));
        throw new Error(errJson.error?.message || `OpenRouter returned status ${resp.status}`);
      }
      const data: any = await resp.json();
      res.json({
        valid: true,
        reply: redact(data.choices?.[0]?.message?.content?.trim() || 'OK', resolvedKey),
        model: model || 'openrouter/free',
      });
      return;
    }

    if (p === 'ollama') {
      const host = (baseUrl?.trim() || 'http://localhost:11434').replace(/\/+$/, '');
      const resp = await fetch(`${host}/api/tags`, { method: 'GET' });
      if (!resp.ok) {
        throw new Error(`Ollama returned status ${resp.status} at ${host}`);
      }
      const data: any = await resp.json();
      const count = data.models?.length || 0;
      res.json({
        valid: true,
        reply: `Connected. Found ${count} installed model${count === 1 ? '' : 's'}.`,
        model: count > 0 ? data.models[0].name : 'none',
      });
      return;
    }

    res.status(400).json({ valid: false, error: `Unsupported provider: ${provider}` });
  } catch (err: any) {
    console.warn(`Test connection failed for ${p}.`);
    res.status(400).json({
      valid: false,
      error: formatErrorMessage(err, resolvedKey),
    });
  }
});

// Legacy validate-key endpoint (compatibility with existing UI)
app.post('/api/validate-key', async (req: Request, res: Response) => {
  let keyToTest: string;
  try { keyToTest = await resolveApiKey('gemini', req.body.apiKey); }
  catch { res.status(503).json({ valid: false, error: 'Secure key storage is unavailable.' }); return; }

  if (!keyToTest) {
    res.status(400).json({ valid: false, error: 'No API key provided to test.' });
    return;
  }

  try {
    const ai = new GoogleGenAI({
      apiKey: keyToTest,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
    });
    const result = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: 'Ping test. Reply with simply "OK".',
    });
    res.json({ valid: true, reply: redact(result.text?.trim() || 'OK', keyToTest) });
  } catch (err: any) {
    res.status(400).json({
      valid: false,
      error: formatErrorMessage(err, keyToTest),
    });
  }
});

// =========================================================================
// PROVIDER STREAMING GENERATORS
// =========================================================================

// Gemini Stream
async function* streamGemini(
  apiKey: string,
  modelName: string,
  messages: any[],
  systemInstruction: string,
  signal?: AbortSignal
): AsyncGenerator<string> {
  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
  });

  const formattedContents = messages.map((m: any) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  if (formattedContents.length === 0) {
    formattedContents.push({ role: 'user', parts: [{ text: 'Hello!' }] });
  }

  const responseStream = await ai.models.generateContentStream({
    model: modelName,
    contents: formattedContents,
    config: { systemInstruction, abortSignal: signal },
  });

  let chunkCount = 0;
  for await (const chunk of responseStream) {
    chunkCount++;
    const textChunk = chunk.text;
    const candidate = chunk.candidates?.[0];
    if (chunk.promptFeedback?.blockReason) {
      throw new Error(`Response blocked by safety filters (${chunk.promptFeedback.blockReason})`);
    }
    if (candidate?.finishReason && candidate.finishReason !== 'STOP' && !textChunk && chunkCount === 1) {
      throw new Error(`Model stopped with reason: ${candidate.finishReason}`);
    }
    if (textChunk) {
      yield textChunk;
    }
  }
}

class ProviderHttpError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

async function customEndpoint(): Promise<string> {
  const endpoint = process.env.MEXAI_SECURE_KEYS === '1' ? await secureKey('custom', true) : (process.env.CUSTOM_BASE_URL || '');
  if (!endpoint) throw new Error('Configure the custom endpoint in Settings first.');
  let url: URL;
  try { url = new URL(endpoint); } catch { throw new Error('Invalid custom endpoint.'); }
  if (url.username || url.password || url.search || url.hash || !(url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) throw new Error('Custom endpoint must use HTTPS or localhost HTTP.');
  return url.toString().replace(/\/+$/, '');
}

// OpenAI Stream
async function* streamOpenAI(
  apiKey: string,
  modelName: string,
  messages: any[],
  systemInstruction: string,
  endpoint = 'https://api.openai.com/v1',
  signal?: AbortSignal
): AsyncGenerator<string> {
  const formattedMessages = [
    { role: 'system', content: systemInstruction },
    ...messages.map((m: any) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    })),
  ];

  const resp = await fetch(`${endpoint}/chat/completions`, {
    signal,
    redirect: 'error',
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: modelName,
      messages: formattedMessages,
      stream: true,
    }),
  });

  if (!resp.ok) {
    const errJson: any = await resp.json().catch(() => ({}));
    throw new ProviderHttpError(resp.status, errJson.error?.message || `OpenAI error: HTTP ${resp.status}`);
  }

  if (!resp.body) throw new Error('No readable response body from OpenAI.');
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let completed = false;
  let hadContent = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (trimmed === 'data: [DONE]') { completed = true; continue; }
      if (trimmed.startsWith('data: ')) {
        let parsed: any;
        try { parsed = JSON.parse(trimmed.slice(6)); } catch { continue; }
        if (parsed.error) throw new ProviderHttpError(Number(parsed.error.code) || 500, parsed.error.message || 'Provider stream error.');
        const content = parsed.choices?.[0]?.delta?.content;
        if (content) { hadContent = true; yield content; }
      }
    }
  }
  if (!completed) throw new Error(hadContent ? 'Stream ended before completion.' : 'Empty response.');
}

// Anthropic Claude Stream
async function* streamAnthropic(
  apiKey: string,
  modelName: string,
  messages: any[],
  systemInstruction: string,
  signal?: AbortSignal
): AsyncGenerator<string> {
  // Anthropic messages cannot contain 'system' role; pass system at top level
  const formattedMessages: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const m of messages) {
    formattedMessages.push({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content || '...',
    });
  }

  if (formattedMessages.length === 0) {
    formattedMessages.push({ role: 'user', content: 'Hello!' });
  }

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    signal,
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: modelName,
      max_tokens: 4096,
      system: systemInstruction,
      messages: formattedMessages,
      stream: true,
    }),
  });

  if (!resp.ok) {
    const errJson: any = await resp.json().catch(() => ({}));
    throw new ProviderHttpError(resp.status, errJson.error?.message || `Anthropic error: HTTP ${resp.status}`);
  }

  if (!resp.body) throw new Error('No readable response body from Anthropic.');
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let completed = false;
  let hadContent = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() || '';

    for (const part of parts) {
      const lines = part.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('data: ')) {
          let parsed: any;
          try { parsed = JSON.parse(trimmed.slice(6)); } catch { continue; }
          if (parsed.type === 'message_stop') completed = true;
          if (parsed.type === 'error' || parsed.error) throw new ProviderHttpError(Number(parsed.error?.code) || 500, parsed.error?.message || 'Anthropic stream error.');
          if (parsed.type === 'content_block_delta' && parsed.delta?.text) { hadContent = true; yield parsed.delta.text; }
        }
      }
    }
  }
  if (!completed) throw new Error(hadContent ? 'Stream ended before completion.' : 'Empty response.');
}

// OpenRouter Stream
async function* streamOpenRouter(
  apiKey: string,
  modelName: string,
  messages: any[],
  systemInstruction: string,
  signal?: AbortSignal
): AsyncGenerator<string> {
  const formattedMessages = [
    { role: 'system', content: systemInstruction },
    ...messages.map((m: any) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    })),
  ];

  const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    signal,
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://hanex-and-shumex.local',
      'X-Title': 'Hanex & Shumex Desktop',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: modelName,
      messages: formattedMessages,
      stream: true,
    }),
  });

  if (!resp.ok) {
    const errJson: any = await resp.json().catch(() => ({}));
    throw new ProviderHttpError(resp.status, errJson.error?.message || `OpenRouter error: HTTP ${resp.status}`);
  }

  if (!resp.body) throw new Error('No readable response body from OpenRouter.');
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let completed = false;
  let hadContent = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (trimmed === 'data: [DONE]') { completed = true; continue; }
      if (trimmed.startsWith('data: ')) {
        let parsed: any;
        try { parsed = JSON.parse(trimmed.slice(6)); } catch { continue; }
        if (parsed.error) throw new ProviderHttpError(Number(parsed.error.code) || 500, parsed.error.message || 'OpenRouter stream error.');
        const content = parsed.choices?.[0]?.delta?.content;
        if (content) { hadContent = true; yield content; }
      }
    }
  }
  if (!completed) throw new Error(hadContent ? 'Stream ended before completion.' : 'Empty response.');
}

// Ollama Stream
async function* streamOllama(
  baseUrl: string,
  modelName: string,
  messages: any[],
  systemInstruction: string,
  signal?: AbortSignal
): AsyncGenerator<string> {
  const host = (baseUrl || 'http://localhost:11434').replace(/\/+$/, '');
  const formattedMessages = [
    { role: 'system', content: systemInstruction },
    ...messages.map((m: any) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    })),
  ];

  const resp = await fetch(`${host}/api/chat`, {
    signal,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: modelName || 'llama3.2',
      messages: formattedMessages,
      stream: true,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new ProviderHttpError(resp.status, `Ollama error (${resp.status}): ${errText || 'Connection failed'}`);
  }

  if (!resp.body) throw new Error('No readable response body from Ollama.');
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let completed = false;
  let hadContent = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let parsed: any;
      try { parsed = JSON.parse(trimmed); } catch { continue; }
      if (parsed.done) completed = true;
      if (parsed.error) throw new Error(String(parsed.error));
      if (parsed.message?.content) { hadContent = true; yield parsed.message.content; }
    }
  }
  if (!completed) throw new Error(hadContent ? 'Stream ended before completion.' : 'Empty response.');
}

// Unified Stream Dispatcher
async function* streamProvider(
  provider: ProviderType,
  model: string,
  messages: any[],
  systemInstruction: string,
  providerConfig?: { apiKey?: string; baseUrl?: string },
  key: string = '',
  signal?: AbortSignal
): AsyncGenerator<string> {

  if (provider !== 'ollama' && !key) {
    throw new Error(
      `No API key configured for ${provider.toUpperCase()}. Please add your API key in Settings.`
    );
  }

  switch (provider) {
    case 'gemini':
      yield* streamGemini(key, model || 'gemini-3.8-flash', messages, systemInstruction, signal);
      break;
    case 'openai':
      yield* streamOpenAI(key, model || 'gpt-4o', messages, systemInstruction, undefined, signal);
      break;
    case 'custom':
      if (!model?.trim()) throw new Error('Enter a custom model name in Settings.');
      yield* streamOpenAI(key, model, messages, systemInstruction, await customEndpoint(), signal);
      break;
    case 'anthropic':
      yield* streamAnthropic(key, model || 'claude-3-7-sonnet-20250219', messages, systemInstruction, signal);
      break;
    case 'openrouter':
      yield* streamOpenRouter(key, model || 'openrouter/free', messages, systemInstruction, signal);
      break;
    case 'ollama':
      yield* streamOllama(providerConfig?.baseUrl || 'http://localhost:11434', model || 'llama3.2', messages, systemInstruction, signal);
      break;
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

function isCredentialError(error: any): boolean {
  const status = Number(error?.status ?? error?.statusCode ?? error?.code);
  const message = formatErrorMessage(error).toLowerCase();
  if (/\b(?:invalid|incorrect|missing|expired|revoked|unauthorized)\b.{0,40}\b(?:api[ -]?key|credential|token)\b|\b(?:api[ -]?key|credential|token)\b.{0,40}\b(?:invalid|incorrect|missing|expired|revoked|not valid)\b/.test(message)) return true;
  return status === 401;
}
const DEFAULT_CHAT_MODELS: Record<ProviderType, string> = {
  gemini: 'gemini-3.8-flash', openai: 'gpt-4o', anthropic: 'claude-3-7-sonnet-20250219',
  openrouter: 'openrouter/free', ollama: 'llama3.2', custom: '',
};

// Each failed answer is replaced before the next model starts, never concatenated.
app.post('/api/chat/stream', async (req: Request, res: Response) => {
  const { agentId, messages, provider, model, providerConfig, customKey } = req.body;
  const p = (provider || 'gemini') as ProviderType;
  const systemInstruction = AGENT_SYSTEM_PROMPTS[agentId === 'shumex' ? 'shumex' : 'hanex'];
  const supported = new Set(['gemini', 'openai', 'anthropic', 'openrouter', 'ollama', 'custom']);
  const primary = { provider: p, model: typeof model === 'string' && model.trim() ? model.trim() : (DEFAULT_CHAT_MODELS[p] || ''), providerConfig: { apiKey: providerConfig?.apiKey || customKey, baseUrl: providerConfig?.baseUrl } };
  const candidates = [primary];
  const seen = new Set([`${p}:${primary.model}`]);
  if (Array.isArray(req.body.fallbacks)) {
    for (const item of req.body.fallbacks.slice(0, 20)) {
      if (!item || !supported.has(item.provider) || typeof item.model !== 'string' || !item.model.trim() || item.model.length > 256) continue;
      const id = `${item.provider}:${item.model.trim()}`;
      if (seen.has(id)) continue;
      seen.add(id);
      candidates.push({ provider: item.provider, model: item.model.trim(), providerConfig: { apiKey: undefined, baseUrl: item.baseUrl } });
    }
  }
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  const disconnect = new AbortController();
  res.on('close', () => disconnect.abort());
  const send = (value: object) => { if (!disconnect.signal.aborted) res.write(`data: ${JSON.stringify(value)}\n\n`); };
  const tried: string[] = [];
  let freeModels: Awaited<ReturnType<typeof getFreeOpenRouterModels>> | undefined;
  let catalogError = false;
  let addedFree = false;
  let stoppedForKey = false;
  const retried = new Set<string>();
  for (let index = 0; index < candidates.length && !disconnect.signal.aborted; index++) {
    const candidate = candidates[index];
    const label = `${candidate.provider} / ${candidate.model || '(default)'}`;
    let key = '';
    let reason = '';
    let committed = false;
    try {
      if (!supported.has(candidate.provider)) throw new Error('Unsupported provider.');
      key = await resolveApiKey(candidate.provider, candidate.providerConfig.apiKey);
      if (candidate.provider !== 'ollama' && !key) {
        stoppedForKey = true;
        throw new Error('Missing API key. Add it in Settings.');
      }
      let pending = '';
      const signal = AbortSignal.any([disconnect.signal, AbortSignal.timeout(120_000)]);
      const stream = streamProvider(candidate.provider, candidate.model, messages || [], systemInstruction, candidate.providerConfig, key, signal);
      for await (const chunk of stream) {
        if (disconnect.signal.aborted) break;
        pending += chunk;
        if (key && pending.includes(key)) pending = redact(pending, key);
        if (!committed && pending.trim()) {
          committed = true;
          send({ answeringModel: { provider: candidate.provider, model: candidate.model } });
        }
        if (committed) {
          const n = key ? Math.max(0, pending.length - key.length + 1) : pending.length;
          if (n) { send({ text: pending.slice(0, n) }); pending = pending.slice(n); }
        }
      }
      if (disconnect.signal.aborted) break;
      if (!committed) throw new Error('Empty response.');
      if (pending) send({ text: redact(pending, key) });
      send({ done: true }); res.end(); return;
    } catch (error: any) {
      if (disconnect.signal.aborted) break;
      let status = Number(error?.status ?? error?.statusCode ?? error?.code);
      if (!status && typeof error?.message === 'string') {
        try { status = Number(JSON.parse(error.message)?.error?.code); } catch { /* Not a JSON provider error. */ }
      }
      const detail = formatErrorMessage(error, key).replace(/\s+/g, ' ').slice(0, 300) || 'Request failed.';
      reason = Number.isInteger(status) && status >= 400 && status <= 599 ? `HTTP ${status}: ${detail}` : detail;
      if (isCredentialError(error)) stoppedForKey = true;
      tried.push(`${label}: ${reason}`);
      if (committed) send({ reset: true });
      // Preserve the single retry for transient throttling, overload and empty replies.
      const retryId = `${candidate.provider}:${candidate.model}`;
      const transient = status === 429 || status === 503 || detail === 'Empty response.';
      if (!stoppedForKey && !committed && transient && !retried.has(retryId)) {
        retried.add(retryId);
        candidates.splice(index + 1, 0, candidate);
        continue;
      }
    }
    if (stoppedForKey) break;
    if (candidate.provider === 'openrouter' && !addedFree) {
      try {
        freeModels ||= await getFreeOpenRouterModels(true);
        if (candidate.model === 'openrouter/free' || candidate.model.endsWith(':free') || freeModels.some(m => m.id === candidate.model)) {
          addedFree = true;
          for (const free of freeModels) {
            const id = `openrouter:${free.id}`;
            if (seen.has(id)) continue;
            seen.add(id);
            candidates.push({ provider: 'openrouter', model: free.id, providerConfig: { apiKey: undefined, baseUrl: undefined } });
          }
        }
      } catch { catalogError = true; }
    }
  }
  if (!disconnect.signal.aborted && !res.writableEnded) {
    const prefix = stoppedForKey ? 'Stopped: invalid or missing API key.' : 'No model could complete the request.';
    const catalogNote = catalogError ? '\nCould not load the OpenRouter free-model catalog.' : '';
    send({ error: `${prefix}\nTried:\n${tried.map(item => `• ${item}`).join('\n')}${catalogNote}` });
    res.end();
  }
});

// Unified Non-Streaming Fallback Endpoint
app.post('/api/chat', async (req: Request, res: Response) => {
  const { agentId, messages, provider, model, providerConfig, customKey } = req.body;
  const p = (provider || 'gemini') as ProviderType;
  const agent = (agentId === 'shumex' ? 'shumex' : 'hanex') as 'hanex' | 'shumex';
  const systemInstruction = AGENT_SYSTEM_PROMPTS[agent];

  const effectiveConfig = {
    apiKey: providerConfig?.apiKey || customKey,
    baseUrl: providerConfig?.baseUrl,
  };

  let key: string;
  try { key = await resolveApiKey(p, effectiveConfig.apiKey); }
  catch { res.status(503).json({ error: 'Secure key storage is unavailable.' }); return; }
  if (p !== 'ollama' && !key) {
    res.status(400).json({
      error: `API key for ${p.toUpperCase()} is missing. Please add it in Settings.`,
    });
    return;
  }

  try {
    let accumulatedText = '';
    const generator = streamProvider(p, model, messages || [], systemInstruction, effectiveConfig, key);

    for await (const textChunk of generator) {
      if (textChunk) {
        accumulatedText += textChunk;
      }
    }

    if (!accumulatedText.trim()) {
      res.status(500).json({
        error: 'The model returned an empty response. Try again or switch the model in Settings',
      });
      return;
    }

    res.json({
      text: redact(accumulatedText, key),
    });
  } catch (error: any) {
    console.error(`Error in non-streaming chat [${p}].`);
    res.status(500).json({
      error: formatErrorMessage(error, key),
    });
  }
});

export async function startServer() {
  let vite;
  if (process.env.NODE_ENV !== 'production') {
    const { createServer } = await import('vite');
    vite = await createServer({
      root: projectRoot,
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(projectRoot, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  try {
    const server = await new Promise<Server>((resolve, reject) => {
      const httpServer = app.listen(PORT, HOST);
      httpServer.once('error', reject);
      httpServer.once('listening', () => {
        httpServer.off('error', reject);
        console.log(`Server listening on http://${HOST}:${PORT}`);
        resolve(httpServer);
      });
    });
    return { server, vite };
  } catch (error) {
    await vite?.close();
    throw error;
  }
}

// Keep the CLI entry point without starting a listener when this module is imported.
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  startServer().catch((error) => {
    console.error('Failed to start server:', error);
    process.exitCode = 1;
  });
}
