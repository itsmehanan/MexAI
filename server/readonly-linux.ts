/** Linux-only, handle-anchored read primitives. Not connected to chat. */
import { promises as fs, constants } from 'node:fs';
import path from 'node:path';
import type { FileHandle } from 'node:fs/promises';

const MAX_BYTES = 256 * 1024;
const MAX_ENTRIES = 500;

function inside(root: string, target: string) {
  const rel = path.relative(root, target);
  return rel === '' || (!path.isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${path.sep}`));
}
function parts(requested: string): string[] {
  if (!requested || requested.includes('\0') || path.isAbsolute(requested)) throw new Error('A relative path is required.');
  const segments = requested.split('/').filter(s => s !== '' && s !== '.');
  if (segments.some(s => s === '..' || s.includes('\\'))) throw new Error('Invalid path.');
  return segments;
}
async function openedPath(handle: FileHandle): Promise<string> {
  const target = await fs.readlink(`/proc/self/fd/${handle.fd}`);
  if (!path.isAbsolute(target) || target.endsWith(' (deleted)')) throw new Error('Opened path is unavailable.');
  return target;
}
async function verify(handle: FileHandle, root: string) {
  if (!inside(root, await openedPath(handle))) throw new Error('Opened path is outside the allowed folder.');
}
async function openChild(parent: FileHandle, name: string, directory: boolean): Promise<FileHandle> {
  return fs.open(`/proc/self/fd/${parent.fd}/${name}`, constants.O_RDONLY | constants.O_NOFOLLOW | (directory ? constants.O_DIRECTORY : constants.O_NONBLOCK));
}
async function openRoot(folder: string): Promise<FileHandle> {
  if (process.platform !== 'linux') throw new Error('Race-resistant filesystem access is unavailable on this platform.');
  if (!path.isAbsolute(folder) || folder.includes('\0')) throw new Error('Invalid allowed folder.');
  const root = path.resolve(folder);
  let current = await fs.open('/', constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try {
    for (const part of root.split('/').filter(Boolean)) {
      const next = await openChild(current, part, true);
      await current.close(); current = next;
    }
    if (await openedPath(current) !== root) throw new Error('Allowed folder changed or contains a link.');
    return current;
  } catch (error) { await current.close(); throw error; }
}
async function openTarget(folder: string, relative: string, directory: boolean): Promise<FileHandle> {
  const root = path.resolve(folder);
  const segments = parts(relative);
  let current = await openRoot(folder);
  try {
    for (let i = 0; i < segments.length; i++) {
      const next = await openChild(current, segments[i], i < segments.length - 1 || directory);
      await current.close(); current = next;
      await verify(current, root);
    }
    await verify(current, root);
    return current;
  } catch (error) { await current.close(); throw error; }
}
export async function readFileConfined(folder: string, relative: string): Promise<string> {
  const file = await openTarget(folder, relative, false);
  try {
    const stat = await file.stat();
    if (!stat.isFile()) throw new Error('Not a regular file.');
    if (stat.size > MAX_BYTES) throw new Error('File exceeds the 256 KiB limit.');
    const buffer = Buffer.alloc(MAX_BYTES + 1);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    if (bytesRead > MAX_BYTES) throw new Error('File exceeds the 256 KiB limit.');
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, bytesRead));
  } finally { await file.close(); }
}
export async function listFolderConfined(folder: string, relative: string): Promise<{ name: string; type: string }[]> {
  const directory = await openTarget(folder, relative, true);
  try {
    // procfs points to this exact opened directory, not a re-resolved user path.
    const dir = await fs.opendir(`/proc/self/fd/${directory.fd}`);
    const entries: { name: string; type: string }[] = [];
    for await (const item of dir) {
      if (entries.length >= MAX_ENTRIES) throw new Error('Folder exceeds the 500 entry limit.');
      entries.push({ name: item.name, type: item.isDirectory() ? 'folder' : item.isFile() ? 'file' : item.isSymbolicLink() ? 'symlink' : 'other' });
    }
    return entries.sort((a, b) => a.name.localeCompare(b.name));
  } finally { await directory.close(); }
}
