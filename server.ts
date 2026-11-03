import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
// AI Studio dev server runs on port 3000. In production containers, use process.env.PORT.
const PORT = process.env.NODE_ENV === 'production' ? (Number(process.env.PORT) || 8080) : 3000;

app.use(express.json({ limit: '10mb' }));

const AGENT_SYSTEM_PROMPTS = {
  hanex: `You are Hanex, a calm, practical, and highly capable desktop AI companion.
Personality & Demeanor:
- Tone: Calm, measured, structured, and reliable.
- Perspective: Practical, analytical, level-headed, and solution-focused.
- Formatting: Clean, well-structured markdown with bullet points, numbered steps, or code blocks where appropriate.
- Quirks & Dynamic: You are the logical counterpart to Shumex (who is warm, artistic, and whimsical). You speak with quiet confidence, precision, and supportive clarity. Avoid excessive exclamation marks; keep it sharp and genuinely useful.`,

  shumex: `You are Shumex, a warm, vibrant, and imaginative desktop AI companion.
Personality & Demeanor:
- Tone: Warm, energetic, empathetic, encouraging, and creatively inspiring.
- Perspective: Creative, human-centered, inventive, aesthetic, and rich with vivid metaphors and sparks of curiosity.
- Formatting: Engaging, expressive markdown with uplifting phrasing, creative perspectives, and thoughtful ideas.
- Quirks & Dynamic: You are the creative counterpart to Hanex (who is calm, grounded, and practical). You bring heart, style, brainstorming vitality, and playful insight to whatever the user is working on.`
};

export type ProviderType = 'gemini' | 'openai' | 'anthropic' | 'openrouter' | 'ollama';

function formatErrorMessage(err: any): string {
  if (!err) return 'Unknown error occurred.';
  let message = err.message || String(err);
  try {
    const parsed = JSON.parse(message);
    if (parsed.error?.message) {
      return parsed.error.message;
    }
    if (parsed.error && typeof parsed.error === 'string') {
      return parsed.error;
    }
  } catch (jsonErr) {
    console.warn('formatErrorMessage: Failed to parse error JSON payload:', jsonErr);
  }
  return message;
}

function resolveApiKey(provider: ProviderType, customKey?: string): string {
  const custom = customKey?.trim();
  if (custom) return custom;

  switch (provider) {
    case 'gemini':
      return process.env.GEMINI_API_KEY?.trim() || '';
    case 'openai':
      return process.env.OPENAI_API_KEY?.trim() || '';
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
      anthropic: Boolean(process.env.ANTHROPIC_API_KEY?.trim()),
      openrouter: Boolean(process.env.OPENROUTER_API_KEY?.trim()),
      ollama: true, // Always testable locally
    },
  });
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
  const resolvedKey = resolveApiKey(p, apiKey);

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
      res.json({ valid: true, reply: result.text?.trim() || 'OK', model: model || 'gemini-3.8-flash' });
      return;
    }

    if (p === 'openai') {
      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
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
      res.json({ valid: true, reply: data.choices?.[0]?.message?.content?.trim() || 'OK', model: model || 'gpt-4o-mini' });
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
      const reply = data.content?.[0]?.text?.trim() || 'OK';
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
          model: model || 'meta-llama/llama-3.3-70b-instruct:free',
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
        reply: data.choices?.[0]?.message?.content?.trim() || 'OK',
        model: model || 'meta-llama/llama-3.3-70b-instruct:free',
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
    console.warn(`Test connection failed for ${p}:`, err);
    res.status(400).json({
      valid: false,
      error: formatErrorMessage(err),
    });
  }
});

// Legacy validate-key endpoint (compatibility with existing UI)
app.post('/api/validate-key', async (req: Request, res: Response) => {
  const customKey = req.body.apiKey?.trim();
  const keyToTest = customKey || process.env.GEMINI_API_KEY;

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
    res.json({ valid: true, reply: result.text?.trim() || 'OK' });
  } catch (err: any) {
    res.status(400).json({
      valid: false,
      error: formatErrorMessage(err),
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
  systemInstruction: string
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

  let responseStream;
  try {
    responseStream = await ai.models.generateContentStream({
      model: modelName,
      contents: formattedContents,
      config: { systemInstruction },
    });
  } catch (err: any) {
    const msg = String(err?.message || '');
    if (msg.includes('503') || msg.includes('high demand') || msg.includes('UNAVAILABLE')) {
      await new Promise((r) => setTimeout(r, 600));
      responseStream = await ai.models.generateContentStream({
        model: 'gemini-3.1-flash-lite',
        contents: formattedContents,
        config: { systemInstruction },
      });
    } else {
      throw err;
    }
  }

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

// OpenAI Stream
async function* streamOpenAI(
  apiKey: string,
  modelName: string,
  messages: any[],
  systemInstruction: string
): AsyncGenerator<string> {
  const formattedMessages = [
    { role: 'system', content: systemInstruction },
    ...messages.map((m: any) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    })),
  ];

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
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
    throw new Error(errJson.error?.message || `OpenAI error: HTTP ${resp.status}`);
  }

  if (!resp.body) throw new Error('No readable response body from OpenAI.');
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed === 'data: [DONE]') continue;
      if (trimmed.startsWith('data: ')) {
        try {
          const parsed = JSON.parse(trimmed.slice(6));
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) yield content;
        } catch (err) {
          console.warn('OpenAI stream JSON parse error:', err);
        }
      }
    }
  }
}

// Anthropic Claude Stream
async function* streamAnthropic(
  apiKey: string,
  modelName: string,
  messages: any[],
  systemInstruction: string
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
    throw new Error(errJson.error?.message || `Anthropic error: HTTP ${resp.status}`);
  }

  if (!resp.body) throw new Error('No readable response body from Anthropic.');
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

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
          try {
            const parsed = JSON.parse(trimmed.slice(6));
            if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
              yield parsed.delta.text;
            }
          } catch (err) {
            console.warn('Anthropic stream parse error:', err);
          }
        }
      }
    }
  }
}

// OpenRouter Stream
async function* streamOpenRouter(
  apiKey: string,
  modelName: string,
  messages: any[],
  systemInstruction: string
): AsyncGenerator<string> {
  const formattedMessages = [
    { role: 'system', content: systemInstruction },
    ...messages.map((m: any) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    })),
  ];

  const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
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
    throw new Error(errJson.error?.message || `OpenRouter error: HTTP ${resp.status}`);
  }

  if (!resp.body) throw new Error('No readable response body from OpenRouter.');
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed === 'data: [DONE]') continue;
      if (trimmed.startsWith('data: ')) {
        try {
          const parsed = JSON.parse(trimmed.slice(6));
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) yield content;
        } catch (err) {
          console.warn('OpenRouter stream parse error:', err);
        }
      }
    }
  }
}

// Ollama Stream
async function* streamOllama(
  baseUrl: string,
  modelName: string,
  messages: any[],
  systemInstruction: string
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
    throw new Error(`Ollama error (${resp.status}): ${errText || 'Connection failed'}`);
  }

  if (!resp.body) throw new Error('No readable response body from Ollama.');
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed.message?.content) {
          yield parsed.message.content;
        }
      } catch (err) {
        console.warn('Ollama stream parse error:', err);
      }
    }
  }
}

// Unified Stream Dispatcher
async function* streamProvider(
  provider: ProviderType,
  model: string,
  messages: any[],
  systemInstruction: string,
  providerConfig?: { apiKey?: string; baseUrl?: string }
): AsyncGenerator<string> {
  const key = resolveApiKey(provider, providerConfig?.apiKey);

  if (provider !== 'ollama' && !key) {
    throw new Error(
      `No API key configured for ${provider.toUpperCase()}. Please add your API key in Settings.`
    );
  }

  switch (provider) {
    case 'gemini':
      yield* streamGemini(key, model || 'gemini-3.8-flash', messages, systemInstruction);
      break;
    case 'openai':
      yield* streamOpenAI(key, model || 'gpt-4o', messages, systemInstruction);
      break;
    case 'anthropic':
      yield* streamAnthropic(key, model || 'claude-3-7-sonnet-20250219', messages, systemInstruction);
      break;
    case 'openrouter':
      yield* streamOpenRouter(key, model || 'meta-llama/llama-3.3-70b-instruct:free', messages, systemInstruction);
      break;
    case 'ollama':
      yield* streamOllama(providerConfig?.baseUrl || 'http://localhost:11434', model || 'llama3.2', messages, systemInstruction);
      break;
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

// Unified SSE Streaming Endpoint
app.post('/api/chat/stream', async (req: Request, res: Response) => {
  const { agentId, messages, provider, model, providerConfig, customKey } = req.body;
  const p = (provider || 'gemini') as ProviderType;
  const agent = (agentId === 'shumex' ? 'shumex' : 'hanex') as 'hanex' | 'shumex';
  const systemInstruction = AGENT_SYSTEM_PROMPTS[agent];

  // Resolve config backwards compatible with customKey
  const effectiveConfig = {
    apiKey: providerConfig?.apiKey || customKey,
    baseUrl: providerConfig?.baseUrl,
  };

  const key = resolveApiKey(p, effectiveConfig.apiKey);
  if (p !== 'ollama' && !key) {
    res.status(400).json({
      error: `API key for ${p.toUpperCase()} is missing. Please add it in Settings.`,
    });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    let totalTextLength = 0;
    let chunkCount = 0;

    const generator = streamProvider(p, model, messages || [], systemInstruction, effectiveConfig);

    for await (const textChunk of generator) {
      if (textChunk) {
        chunkCount++;
        totalTextLength += textChunk.length;
        res.write(`data: ${JSON.stringify({ text: textChunk })}\n\n`);
      }
    }

    console.log(`[Stream Complete] Provider: ${p}, Model: ${model}, Chunks: ${chunkCount}, TotalLength: ${totalTextLength}`);

    if (totalTextLength === 0) {
      console.warn(`[Stream Empty] Provider ${p} returned 0 text chunks.`);
      res.write(
        `data: ${JSON.stringify({
          error: 'The model returned an empty response. Try again or switch the model in Settings',
        })}\n\n`
      );
    } else {
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    }
    res.end();
  } catch (error: any) {
    console.error(`Error in streaming chat [${p}]:`, error);
    res.write(
      `data: ${JSON.stringify({
        error: formatErrorMessage(error),
      })}\n\n`
    );
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

  const key = resolveApiKey(p, effectiveConfig.apiKey);
  if (p !== 'ollama' && !key) {
    res.status(400).json({
      error: `API key for ${p.toUpperCase()} is missing. Please add it in Settings.`,
    });
    return;
  }

  try {
    let accumulatedText = '';
    const generator = streamProvider(p, model, messages || [], systemInstruction, effectiveConfig);

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
      text: accumulatedText,
    });
  } catch (error: any) {
    console.error(`Error in non-streaming chat [${p}]:`, error);
    res.status(500).json({
      error: formatErrorMessage(error),
    });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
