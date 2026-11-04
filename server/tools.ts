import { promises as fs, constants as fsConstants } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export type RiskLevel = 'safe' | 'needs_approval';
export type ToolStatus = 'completed' | 'failed' | 'denied';
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: { type: 'object'; properties: Record<string, { type: 'string'; description: string }>; required: string[]; additionalProperties: false };
  risk: RiskLevel;
}
export interface ToolResult { ok: boolean; result?: unknown; error?: string }

// Filesystem tools are intentionally confined to an explicitly supplied workspace.
// This module does not grant access to a model or create approval endpoints by itself.
// Do not expose it to untrusted callers yet: path validation and open are separate
// operations, so a concurrently changed parent symlink can race the boundary check.
export const tools: readonly ToolDefinition[] = [
  {
    name: 'read_file', description: 'Read a UTF-8 text file within the workspace.', risk: 'safe',
    inputSchema: { type: 'object', properties: { path: { type: 'string', description: 'Path relative to the workspace root.' } }, required: ['path'], additionalProperties: false },
  },
  {
    name: 'list_folder', description: 'List the immediate entries of a folder within the workspace.', risk: 'safe',
    inputSchema: { type: 'object', properties: { path: { type: 'string', description: 'Path relative to the workspace root; use . for the root.' } }, required: ['path'], additionalProperties: false },
  },
];
const MAX_FILE_BYTES = 256 * 1024;
const MAX_ENTRIES = 500;

function validateInput(input: unknown): string {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Input must be an object containing only a path.');
  const entries = Object.entries(input);
  if (entries.length !== 1 || entries[0][0] !== 'path' || typeof entries[0][1] !== 'string') throw new Error('Input must contain only a string path.');
  const value = entries[0][1];
  if (!value || value.includes('\0') || path.isAbsolute(value)) throw new Error('Path must be a non-empty relative path.');
  return value;
}
function assertInside(root: string, target: string) {
  const relative = path.relative(root, target);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error('Path is outside the workspace.');
}
async function resolveInside(root: string, requested: string): Promise<string> {
  const actualRoot = await fs.realpath(root);
  const candidate = path.resolve(actualRoot, requested);
  assertInside(actualRoot, candidate);
  const actualPath = await fs.realpath(candidate);
  assertInside(actualRoot, actualPath);
  return actualPath;
}

/** Append-only JSON lines; errors are propagated so actions fail closed if auditing is unavailable. */
export async function appendActivity(logFile: string, event: Record<string, unknown>): Promise<void> {
  await fs.mkdir(path.dirname(logFile), { recursive: true });
  await fs.appendFile(logFile, `${JSON.stringify({ timestamp: new Date().toISOString(), ...event })}\n`, { encoding: 'utf8', mode: 0o600 });
}

export async function executeTool(options: { name: string; input: unknown; workspace: string; logFile: string; approved?: boolean }): Promise<ToolResult> {
  const { name, input, workspace, logFile } = options;
  const callId = randomUUID();
  const definition = tools.find(tool => tool.name === name);
  // A start record must exist before any filesystem action.
  await appendActivity(logFile, { callId, name, input, event: 'requested', risk: definition?.risk ?? 'unknown' });
  try {
    if (!definition) throw new Error('Unknown tool.');
    if (definition.risk === 'needs_approval' && options.approved !== true) {
      await appendActivity(logFile, { callId, name, event: 'denied', reason: 'approval required' });
      return { ok: false, error: 'Approval required.' };
    }
    const requested = validateInput(input);
    const resolved = await resolveInside(workspace, requested);
    let result: unknown;
    if (name === 'read_file') {
      const file = await fs.open(resolved, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW || 0));
      try {
        const stat = await file.stat();
        if (!stat.isFile()) throw new Error('Path is not a regular file.');
        if (stat.size > MAX_FILE_BYTES) throw new Error('File exceeds the 256 KiB limit.');
        // Read at most the limit plus one byte even if the file grows after stat.
        const buffer = Buffer.alloc(MAX_FILE_BYTES + 1);
        const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
        if (bytesRead > MAX_FILE_BYTES) throw new Error('File exceeds the 256 KiB limit.');
        result = { path: requested, content: new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, bytesRead)) };
      } finally { await file.close(); }
    } else {
      const dir = await fs.opendir(resolved);
      const entries: { name: string; type: string }[] = [];
      for await (const item of dir) {
        if (entries.length >= MAX_ENTRIES) throw new Error('Folder exceeds the 500 entry limit.');
        entries.push({ name: item.name, type: item.isDirectory() ? 'folder' : item.isFile() ? 'file' : item.isSymbolicLink() ? 'symlink' : 'other' });
      }
      result = { path: requested, entries: entries.sort((a, b) => a.name.localeCompare(b.name)) };
    }
    await appendActivity(logFile, { callId, name, event: 'completed' });
    return { ok: true, result };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await appendActivity(logFile, { callId, name, event: 'failed', error: message });
    return { ok: false, error: message };
  }
}
