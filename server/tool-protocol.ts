/**
 * Tool-calling protocol. This module performs no filesystem operations.
 * The desktop executor owns folder checks, approvals and action logging. Folder strings are capabilities supplied
 * by that trusted broker, never by the model or renderer.
 */
export type ToolName = 'read_file' | 'list_folder' | 'search_files' | 'write_file' | 'move_file' | 'delete_file';
export type ToolStatus = 'completed' | 'failed' | 'denied';
export interface ToolCall { id: string; name: string; arguments: unknown }
export interface ToolResult { status: ToolStatus; result?: unknown; error?: string }
export interface ToolCard { id: string; name: string; arguments: unknown; status: 'running' | ToolStatus; result?: unknown; error?: string }
export interface ToolDefinition { name: ToolName; description: string; risk: 'safe' | 'approval'; parameters: { type: 'object'; properties: Record<string, { type: 'string'; description: string }>; required: string[]; additionalProperties: false } }
const folder = { type: 'string' as const, description: 'Exactly one of the allowed folder paths provided by the application.' };
const relativePath = { type: 'string' as const, description: 'A relative path within the selected folder.' };
function definition(name: ToolName, description: string, risk: ToolDefinition['risk'], properties: ToolDefinition['parameters']['properties']): ToolDefinition {
  return { name, description, risk, parameters: { type: 'object', properties, required: Object.keys(properties), additionalProperties: false } };
}
export const TOOL_DEFINITIONS: readonly ToolDefinition[] = [
  definition('read_file', 'Read a UTF-8 file in an allowed folder.', 'safe', { folder, path: relativePath }),
  definition('list_folder', 'List entries within an allowed folder. Use . for its root.', 'safe', { folder, path: relativePath }),
  definition('search_files', 'Search files within an allowed folder. Use . for its root.', 'safe', { folder, path: relativePath, query: { type: 'string', description: 'The text to search for.' } }),
  definition('write_file', 'Write a UTF-8 file in an allowed folder, subject to approval.', 'approval', { folder, path: relativePath, content: { type: 'string', description: 'The entire content to write.' } }),
  definition('move_file', 'Move a file between allowed folders, subject to approval.', 'approval', { source_folder: folder, source_path: relativePath, destination_folder: folder, destination_path: relativePath }),
  definition('delete_file', 'Move a file to the system Recycle Bin, subject to approval.', 'approval', { folder, path: relativePath }),
];
const definitions = new Map(TOOL_DEFINITIONS.map(item => [item.name, item]));
export function validateToolCall(name: string, value: unknown, allowedFolders: readonly string[]): Record<string, string> {
  const definition = definitions.get(name as ToolName);
  if (!definition) throw new Error('Unknown tool.');
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Tool arguments must be an object.');
  const args = value as Record<string, unknown>;
  const required = definition.parameters.required;
  if (Object.keys(args).length !== required.length || required.some(key => typeof args[key] !== 'string')) throw new Error('Invalid tool arguments.');
  for (const [key, item] of Object.entries(args)) {
    const text = item as string;
    if (text.includes('\0')) throw new Error('Invalid tool arguments.');
    if (key.endsWith('folder') && !allowedFolders.includes(text)) throw new Error('Folder is not allowed.');
    if (key.endsWith('path')) {
      if (!text || text.length > 4096 || /^[\\/]/.test(text) || /^[a-zA-Z]:/.test(text) || text.includes(':') || text.split(/[\\/]/).some(segment => segment === '..')) throw new Error('Path must stay within the selected folder.');
      if (text === '.' && !['list_folder', 'search_files'].includes(name)) throw new Error('A file path is required.');
    }
    if (key === 'query' && (!text.trim() || text.length > 4096)) throw new Error('Invalid search query.');
    if (key === 'content' && Buffer.byteLength(text, 'utf8') > 256 * 1024) throw new Error('File content exceeds the 256 KiB limit.');
  }
  return args as Record<string, string>;
}
export function offeredTools(provider: string, allowedFolders: readonly string[], openRouterSupportsTools = false): readonly ToolDefinition[] {
  if (!allowedFolders.length) return [];
  return provider === 'gemini' || (provider === 'openrouter' && openRouterSupportsTools) ? TOOL_DEFINITIONS : [];
}
export function geminiToolDeclarations(tools: readonly ToolDefinition[]) {
  return tools.map(({ name, description, parameters }) => ({ name, description, parametersJsonSchema: parameters }));
}
export function openRouterToolDeclarations(tools: readonly ToolDefinition[]) {
  return tools.map(({ name, description, parameters }) => ({ type: 'function' as const, function: { name, description, parameters } }));
}
export type ConversationStep = { kind: 'model'; text?: string; calls: ToolCall[]; providerData?: unknown } | { kind: 'tool'; call: ToolCall; result: ToolResult };
export interface ModelTurn { text?: string; calls?: ToolCall[]; providerData?: unknown }

/** Each call is counted, including malformed or denied calls. Never retries actions. */
export async function runToolLoop(options: {
  provider: string;
  allowedFolders: readonly string[];
  openRouterSupportsTools?: boolean;
  readOnly?: boolean;
  signal: AbortSignal;
  next: (history: readonly ConversationStep[], tools: readonly ToolDefinition[], signal: AbortSignal) => Promise<ModelTurn>;
  execute: (call: ToolCall, signal: AbortSignal) => Promise<ToolResult>;
  onCard: (card: ToolCard) => void;
  onRejected?: (call: ToolCall, reason: string) => Promise<void>;
}): Promise<{ text: string; history: ConversationStep[]; limitReached: boolean }> {
  const eligible = offeredTools(options.provider, options.allowedFolders, options.openRouterSupportsTools);
  const available = options.readOnly ? eligible.filter(tool => tool.risk === 'safe') : eligible;
  const history: ConversationStep[] = [];
  const seen = new Set<string>();
  let steps = 0;
  let randomLimitId = 0;
  const checkAbort = () => { if (options.signal.aborted) throw new Error('Tool session cancelled.'); };
  for (;;) {
    checkAbort();
    const turn = await options.next(history, steps < 15 ? available : [], options.signal);
    checkAbort();
    const calls = turn.calls || [];
    if (!calls.length) return { text: turn.text || '', history, limitReached: steps >= 15 };
    if (!available.length || steps >= 15) throw new Error('Model requested tools when they were not offered.');
    history.push({ kind: 'model', text: turn.text, calls, providerData: turn.providerData });
    let exceeded = false;
    for (const call of calls) {
      checkAbort();
      if (steps >= 15) {
        exceeded = true;
        const reason = 'The tool step limit was reached.';
        options.onCard({ id: call?.id || `limit-${randomLimitId++}`, name: call?.name || 'unknown', arguments: call?.arguments, status: 'failed', error: reason });
        if (options.onRejected) await options.onRejected(call, reason);
        continue;
      }
      if (!call || typeof call.id !== 'string' || !call.id || call.id.length > 256 || typeof call.name !== 'string' || seen.has(call.id)) throw new Error('Invalid or duplicate tool call ID.');
      seen.add(call.id); steps++;
      const card: ToolCard = { id: call.id, name: call.name, arguments: call.arguments, status: 'running' };
      options.onCard(card);
      let result: ToolResult;
      let invoked = false;
      try {
        if (!available.some(tool => tool.name === call.name)) throw new Error('Tool was not offered.');
        validateToolCall(call.name, call.arguments, options.allowedFolders);
        invoked = true;
        result = await options.execute(call, options.signal);
        if (!result || !['completed', 'failed', 'denied'].includes(result.status)) throw new Error('Invalid tool result.');
      } catch (error) {
        checkAbort();
        result = { status: 'failed', error: error instanceof Error ? error.message : 'Tool failed.' };
        if (!invoked && options.onRejected) await options.onRejected(call, result.error!);
      }
      checkAbort();
      history.push({ kind: 'tool', call, result });
      options.onCard({ ...card, ...result });
    }
    if (exceeded) return { text: 'The tool step limit was reached.', history, limitReached: true };
  }
}
