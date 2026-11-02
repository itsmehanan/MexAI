import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

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

function formatErrorMessage(err: any): string {
  if (!err) return 'Unknown error occurred.';
  let message = err.message || String(err);
  try {
    const parsed = JSON.parse(message);
    if (parsed.error?.message) {
      return parsed.error.message;
    }
  } catch {}
  return message;
}

// Check system status & if default key exists
app.get('/api/status', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    hasEnvKey: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 5),
    defaultModel: 'gemini-3.8-flash',
  });
});

// Validate an API Key
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
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
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

// Helper to run content stream with retry / fallback
async function getStreamWithFallback(
  ai: GoogleGenAI,
  modelName: string,
  contents: any[],
  systemInstruction: string
) {
  try {
    return await ai.models.generateContentStream({
      model: modelName,
      contents,
      config: { systemInstruction },
    });
  } catch (err: any) {
    const msg = String(err?.message || '');
    // If high demand spike (503), retry once or fallback to flash-lite
    if (msg.includes('503') || msg.includes('high demand') || msg.includes('UNAVAILABLE')) {
      await new Promise((r) => setTimeout(r, 600));
      try {
        return await ai.models.generateContentStream({
          model: 'gemini-3.1-flash-lite',
          contents,
          config: { systemInstruction },
        });
      } catch (fallbackErr) {
        throw fallbackErr;
      }
    }
    throw err;
  }
}

// Streaming Chat Endpoint via SSE
app.post('/api/chat/stream', async (req: Request, res: Response) => {
  const { agentId, messages, customKey, model } = req.body;
  const keyToUse = customKey?.trim() || process.env.GEMINI_API_KEY;

  if (!keyToUse) {
    res.status(400).json({
      error: 'No Gemini API key available. Please add your API key in Settings.',
    });
    return;
  }

  const agent = (agentId === 'shumex' ? 'shumex' : 'hanex') as 'hanex' | 'shumex';
  const systemInstruction = AGENT_SYSTEM_PROMPTS[agent];
  const modelName = model || 'gemini-3.8-flash';

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const ai = new GoogleGenAI({
      apiKey: keyToUse,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const formattedContents = (messages || []).map((m: any) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    if (formattedContents.length === 0) {
      formattedContents.push({
        role: 'user',
        parts: [{ text: 'Hello!' }],
      });
    }

    const responseStream = await getStreamWithFallback(
      ai,
      modelName,
      formattedContents,
      systemInstruction
    );

    for await (const chunk of responseStream) {
      const textChunk = chunk.text;
      if (textChunk) {
        res.write(`data: ${JSON.stringify({ text: textChunk })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (error: any) {
    console.error('Error in streaming chat:', error);
    res.write(
      `data: ${JSON.stringify({
        error: formatErrorMessage(error),
      })}\n\n`
    );
    res.end();
  }
});

// Non-streaming fallback endpoint
app.post('/api/chat', async (req: Request, res: Response) => {
  const { agentId, messages, customKey, model } = req.body;
  const keyToUse = customKey?.trim() || process.env.GEMINI_API_KEY;

  if (!keyToUse) {
    res.status(400).json({
      error: 'No Gemini API key available. Please add your API key in Settings.',
    });
    return;
  }

  const agent = (agentId === 'shumex' ? 'shumex' : 'hanex') as 'hanex' | 'shumex';
  const systemInstruction = AGENT_SYSTEM_PROMPTS[agent];
  const modelName = model || 'gemini-3.8-flash';

  try {
    const ai = new GoogleGenAI({
      apiKey: keyToUse,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const formattedContents = (messages || []).map((m: any) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    let response;
    try {
      response = await ai.models.generateContent({
        model: modelName,
        contents: formattedContents,
        config: { systemInstruction },
      });
    } catch (err: any) {
      const msg = String(err?.message || '');
      if (msg.includes('503') || msg.includes('high demand') || msg.includes('UNAVAILABLE')) {
        await new Promise((r) => setTimeout(r, 600));
        response = await ai.models.generateContent({
          model: 'gemini-3.1-flash-lite',
          contents: formattedContents,
          config: { systemInstruction },
        });
      } else {
        throw err;
      }
    }

    res.json({
      text: response.text || '',
    });
  } catch (error: any) {
    console.error('Error in chat:', error);
    res.status(500).json({
      error: formatErrorMessage(error),
    });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
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

  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

startServer();
