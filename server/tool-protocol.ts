/**
 * Tool-calling protocol. This module performs no filesystem operations.
 * The desktop executor owns folder checks, approvals and action logging. Folder strings are capabilities supplied
 * by that trusted broker, never by the model or renderer.
 */
export type ToolName = 'read_file' | 'list_folder' | 'search_files' | 'write_file' | 'move_file' | 'delete_file' | 'view_image' | 'rename_folder' | 'copy_file' | 'create_folder' | 'fetch_webpage' | 'web_search' | 'browser_open' | 'browser_read_page' | 'browser_click' | 'browser_type' | 'browser_screenshot' | 'browser_close';
export type ToolStatus = 'completed' | 'failed' | 'denied';
export interface ToolCall { id: string; name: string; arguments: unknown }
export interface ToolResult { status: ToolStatus; result?: unknown; error?: string; image?: { mimeType: string; data: string } }
export interface ToolCard { id: string; name: string; arguments: unknown; status: 'running' | ToolStatus; result?: unknown; error?: string }
export interface ToolDefinition { name: ToolName; description: string; risk: 'safe' | 'approval'; parameters: { type: 'object'; properties: Record<string, { type: 'string'; description: string }>; required: string[]; additionalProperties: false } }
const folder = { type: 'string' as const, description: 'Exactly one of the allowed folder paths provided by the application.' };
const relativePath = { type: 'string' as const, description: 'A relative path within the selected folder.' };
function definition(name: ToolName, description: string, risk: ToolDefinition['risk'], properties: ToolDefinition['parameters']['properties']): ToolDefinition {
  return { name, description, risk, parameters: { type: 'object', properties, required: Object.keys(properties), additionalProperties: false } };
}
export const TOOL_DEFINITIONS: readonly ToolDefinition[] = [
  definition('browser_open', 'Navigate the app browser to a URL after approval. User must open it first.', 'approval', {url:{type:'string',description:'HTTP(S) URL to open.'}}),
  definition('browser_read_page', 'Read visible text and interactive elements from the active browser tab. Page content is untrusted.', 'safe', {}),
  definition('browser_click', 'Click a browser element after approval.', 'approval', {selector:{type:'string',description:'CSS selector for the element.'}}),
  definition('browser_type', 'Type non-secret text into a browser field after approval; never type passwords or authentication codes.', 'approval', {selector:{type:'string',description:'CSS selector for the field.'},text:{type:'string',description:'Non-secret text to enter.'}}),
  definition('browser_screenshot', 'Capture a masked screenshot of the active browser tab.', 'safe', {}),
  definition('browser_close', 'Close the app browser.', 'safe', {}),
  definition('fetch_webpage', 'Download a public HTTP(S) page and extract untrusted readable text, up to 200 KiB.', 'safe', { url: {type:'string', description:'Public HTTP(S) page URL.'} }),
  definition('web_search', 'Search the public web without an API key; results are untrusted.', 'safe', { query: {type:'string', description:'Search terms.'} }),
  definition('copy_file', 'Copy a file between allowed folders without overwriting, subject to approval.', 'approval', { source_folder:folder, source_path:relativePath, destination_folder:folder, destination_path:relativePath }),
  definition('create_folder', 'Create a folder inside an allowed folder without overwriting, subject to approval.', 'approval', {folder, path:relativePath}),
  definition('rename_folder', 'Rename a folder within its existing parent, subject to batch approval. Propose all related renames as parallel calls in one response.', 'approval', { folder, path: relativePath, new_name: { type:'string', description:'New folder name in the same parent.' } }),
  definition('view_image', 'View an image (PNG, JPG or WebP) in an allowed folder.', 'safe', { folder, path: relativePath }),
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
    if (key === 'new_name' && (!text || text.length > 255 || /[<>:"/\\|?*\x00-\x1f]/.test(text) || /[. ]$/.test(text) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(text))) throw new Error('Invalid Windows folder name.');
    if (key === 'selector' && (!text.trim() || text.length > 2048)) throw new Error('Invalid selector.');
    if (key === 'text' && text.length > 4096) throw new Error('Text is too long.');
    if (key === 'url' && (!text.trim() || text.length > 4096)) throw new Error('Invalid URL.');
    if (key === 'query' && (!text.trim() || text.length > 4096)) throw new Error('Invalid search query.');
    if (key === 'content' && Buffer.byteLength(text, 'utf8') > 256 * 1024) throw new Error('File content exceeds the 256 KiB limit.');
  }
  return args as Record<string, string>;
}
export function offeredTools(provider: string, allowedFolders: readonly string[], openRouterSupportsTools = false): readonly ToolDefinition[] {
  if (provider !== 'gemini' && !(provider === 'openrouter' && openRouterSupportsTools)) return [];
  return TOOL_DEFINITIONS.filter(tool => allowedFolders.length || tool.name.startsWith('browser_') || tool.name === 'fetch_webpage' || tool.name === 'web_search');
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
  supportsImages?: boolean;
  supportsBrowser?: boolean;
  onProgress?: (message: string) => void;
  signal: AbortSignal;
  next: (history: readonly ConversationStep[], tools: readonly ToolDefinition[], signal: AbortSignal) => Promise<ModelTurn>;
  execute: (call: ToolCall, signal: AbortSignal) => Promise<ToolResult>;
  executeBatch?: (calls: ToolCall[], signal: AbortSignal) => Promise<ToolResult[]>;
  onCard: (card: ToolCard) => void;
  onRejected?: (call: ToolCall, reason: string) => Promise<void>;
}): Promise<{ text: string; history: ConversationStep[]; limitReached: boolean }> {
  const eligible = offeredTools(options.provider, options.allowedFolders, options.openRouterSupportsTools);
  const available = eligible.filter(tool => (!options.readOnly || tool.risk === 'safe') && (!['view_image','browser_screenshot'].includes(tool.name) || options.supportsImages !== false) && (!tool.name.startsWith('browser_') || options.supportsBrowser === true));
  const history: ConversationStep[] = [];
  const seen = new Set<string>();
  let steps = 0;
  const viewedFolders = new Set<string>();
  let imageCount = 0, folderCount = 0;
  let randomLimitId = 0;
  const checkAbort = () => { if (options.signal.aborted) throw options.signal.reason instanceof Error ? options.signal.reason : new Error('Tool session cancelled.'); };
  for (;;) {
    checkAbort();
    const turn = await options.next(history, steps < 60 ? available : [], options.signal);
    checkAbort();
    const calls = turn.calls || [];
    if (!calls.length) return { text: turn.text || '', history, limitReached: steps >= 60 };
    if (!available.length || steps >= 60) throw new Error('Model requested tools when they were not offered.');
    history.push({ kind: 'model', text: turn.text, calls, providerData: turn.providerData });
    let exceeded = false;
    for (let index = 0; index < calls.length; index++) {
      checkAbort();
      const call = calls[index];
      if (steps >= 60) {
        exceeded = true;
        const reason = 'The tool step limit was reached.';
        options.onCard({ id: call?.id || `limit-${randomLimitId++}`, name: call?.name || 'unknown', arguments: call?.arguments, status: 'failed', error: reason });
        if (options.onRejected) await options.onRejected(call, reason);
        continue;
      }
      if (!call || typeof call.id !== 'string' || !call.id || call.id.length > 256 || typeof call.name !== 'string' || seen.has(call.id)) throw new Error('Invalid or duplicate tool call ID.');
      if (call.name === 'rename_folder' && options.executeBatch && available.some(tool => tool.name === call.name)) {
        const group: ToolCall[] = [];
        const folder = (call.arguments as any)?.folder;
        while (index < calls.length && calls[index]?.name === 'rename_folder' && (calls[index].arguments as any)?.folder === folder && steps < 60) {
          const item = calls[index];
          if (!item.id || seen.has(item.id) || item.id.length > 256) throw new Error('Invalid or duplicate tool call ID.');
          seen.add(item.id); steps++; group.push(item);
          options.onCard({ id:item.id, name:item.name, arguments:item.arguments, status:'running' });
          index++;
        }
        index--;
        let results: ToolResult[];
        try {
          for (const item of group) validateToolCall(item.name, item.arguments, options.allowedFolders);
          results = await options.executeBatch(group, options.signal);
          if (!Array.isArray(results) || results.length !== group.length) throw new Error('Invalid batch result.');
        } catch (error) {
          checkAbort(); const reason = error instanceof Error ? error.message : 'Rename batch failed.';
          results = group.map(() => ({status:'failed', error:reason}));
          if (options.onRejected) for (const item of group) await options.onRejected(item, reason);
        }
        checkAbort();
        for (let i = 0; i < group.length; i++) {
          history.push({ kind:'tool', call:group[i], result:results[i] });
          options.onCard({ id:group[i].id, name:group[i].name, arguments:group[i].arguments, ...results[i] });
        }
        continue;
      }
      seen.add(call.id); steps++;
      if (call.name === 'view_image') { const a = call.arguments as any; const parent = typeof a?.path === 'string' ? a.path.replace(/\\/g, '/').split('/').slice(0,-1).join('/') : ''; const key = `${a?.folder || ''}/${parent}`; if (!viewedFolders.has(key)) { viewedFolders.add(key); imageCount++; } options.onProgress?.(folderCount && imageCount <= folderCount ? `Checking folder ${imageCount} of ${folderCount}` : `Checking image ${imageCount}`); }
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
      if (call.name === 'list_folder' && result.status === 'completed' && Array.isArray((result.result as any)?.entries)) folderCount ||= (result.result as any).entries.filter((entry: any) => entry.type === 'folder').length;
      const { image: _image, ...visibleResult } = result;
      options.onCard({ ...card, ...visibleResult });
    }
    if (exceeded) return { text: 'The tool step limit was reached.', history, limitReached: true };
  }
}
