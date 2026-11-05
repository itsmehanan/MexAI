import { GoogleGenAI } from '@google/genai';
import { runToolLoop, geminiToolDeclarations, openRouterToolDeclarations, type ConversationStep, type ToolCall } from './tool-protocol';
import { randomUUID } from 'node:crypto';

export async function runToolModel(options: { provider: 'gemini' | 'openrouter'; model: string; key: string; messages: any[]; system: string; folders: string[]; signal: AbortSignal; onCard: (card: unknown) => void; onRejected?: (call: ToolCall, reason: string) => Promise<void>; execute: (call: ToolCall, signal: AbortSignal) => Promise<any> }): Promise<string> {
  const { provider, model, key, messages, system, folders, signal } = options;
  const ai = provider === 'gemini' ? new GoogleGenAI({ apiKey: key }) : undefined;
  const instruction = `${system}\n\nAllowed folders (use the exact folder string in tool calls): ${JSON.stringify(folders)}. Use only the provided tools. The application handles approvals for file changes.`;
  const next = async (history: readonly ConversationStep[], tools: readonly any[]) => {
    if (provider === 'gemini') {
      const contents: any[] = messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
      if (!contents.length) contents.push({ role:'user', parts:[{text:'Hello!'}] });
      for (const step of history) {
        if (step.kind === 'model') contents.push(step.providerData);
        else {
          const part = { functionResponse: { name: step.call.name, response: step.result } };
          const last = contents.at(-1);
          if (last?.role === 'user' && last.parts?.[0]?.functionResponse) last.parts.push(part);
          else contents.push({ role:'user', parts:[part] });
        }
      }
      const result = await ai!.models.generateContent({ model, contents, config: { systemInstruction: instruction, abortSignal: signal, ...(tools.length ? { tools: [{ functionDeclarations: geminiToolDeclarations(tools) }] } : {}) } });
      const content = result.candidates?.[0]?.content;
      const calls = (content?.parts || []).filter(p => p.functionCall).map(p => ({ id: p.functionCall?.id || randomUUID(), name: p.functionCall!.name || '', arguments: p.functionCall!.args || {} }));
      return { text: calls.length ? undefined : result.text, calls, providerData: content };
    }
    const conversation: any[] = [{ role:'system', content:instruction }, ...messages.map(m => ({ role:m.role === 'assistant' ? 'assistant' : 'user', content:m.content }))];
    for (const step of history) {
      if (step.kind === 'model') conversation.push(step.providerData);
      else conversation.push({ role:'tool', tool_call_id:step.call.id, content:JSON.stringify(step.result) });
    }
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', { method:'POST', headers: { Authorization:`Bearer ${key}`, 'Content-Type':'application/json', 'HTTP-Referer':'https://mexai.app', 'X-Title':'MexAI' }, body:JSON.stringify({ model, messages:conversation, ...(tools.length ? { tools:openRouterToolDeclarations(tools) } : {}) }), signal });
    if (!response.ok) { const body: any = await response.json().catch(() => ({})); throw Object.assign(new Error(body.error?.message || `OpenRouter HTTP ${response.status}`), { status:response.status }); }
    const body: any = await response.json(); const message = body.choices?.[0]?.message;
    if (!message) throw new Error('OpenRouter returned no message.');
    const calls = (message.tool_calls || []).map((call: any) => { let args; try { args = JSON.parse(call.function?.arguments || '{}'); } catch { args = null; } return { id:call.id, name:call.function?.name, arguments:args }; });
    return { text: calls.length ? undefined : message.content || '', calls, providerData:message };
  };
  const result = await runToolLoop({ provider, allowedFolders:folders, openRouterSupportsTools:true, signal, next, execute:options.execute, onCard:options.onCard, onRejected:options.onRejected });
  return result.text;
}
