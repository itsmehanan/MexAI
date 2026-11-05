const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const MAX = 256 * 1024, MAX_ENTRIES = 500;
function inside(root, target) { const r = path.relative(root, target); return r === '' || (!path.isAbsolute(r) && r !== '..' && !r.startsWith(`..${path.sep}`)); }
function relative(input, rootAllowed = false) {
  if (typeof input !== 'string' || !input || input.includes('\0') || path.isAbsolute(input) || /^[a-z]:/i.test(input) || input.includes(':') || input.split(/[\\/]/).includes('..')) throw new Error('Invalid relative path.');
  const normalized = path.normalize(input);
  if (!rootAllowed && normalized === '.') throw new Error('A file path is required.');
  return normalized;
}
async function checked(folder, input, allowMissing = false, rootAllowed = false) {
  const rel = relative(input, rootAllowed);
  const root = path.resolve(folder);
  let part = path.parse(root).root;
  const full = path.resolve(root, rel);
  if (!inside(root, full)) throw new Error('Path is outside the allowed folder.');
  const components = full.slice(part.length).split(path.sep).filter(Boolean);
  for (let i = 0; i < components.length; i++) {
    part = path.join(part, components[i]);
    let stat;
    try { stat = await fs.lstat(part); }
    catch (e) { if (allowMissing && e.code === 'ENOENT' && i === components.length - 1) break; throw e; }
    if (stat.isSymbolicLink()) throw new Error('Links and junctions are not allowed.');
  }
  const actualRoot = await fs.realpath(root);
  if (path.resolve(actualRoot).toLowerCase() !== root.toLowerCase()) throw new Error('Allowed folder changed or contains a link.');
  let actual;
  try { actual = await fs.realpath(full); }
  catch (e) { if (!allowMissing || e.code !== 'ENOENT') throw e; actual = path.join(await fs.realpath(path.dirname(full)), path.basename(full)); }
  if (!inside(actualRoot, actual)) throw new Error('Path is outside the allowed folder.');
  return actual;
}
function createFileTools({ folders, logFile, approve, trash }) {
  const audit = async record => { await fs.mkdir(path.dirname(logFile), { recursive: true }); await fs.appendFile(logFile, `${JSON.stringify({ timestamp: new Date().toISOString(), ...record })}\n`, { mode: 0o600 }); };
  async function execute(call, signal) {
    const cancelled = () => { if (signal?.aborted) throw new Error('Tool request cancelled.'); };
    const id = crypto.randomUUID(), name = call.name, args = call.arguments || {};
    const safeArgs = { ...args }; if (typeof safeArgs.content === 'string') safeArgs.content = `[${Buffer.byteLength(safeArgs.content)} bytes; sha256 ${crypto.createHash('sha256').update(safeArgs.content).digest('hex')}]`;
    await audit({ id, event: 'requested', name, arguments: safeArgs });
    try {
      cancelled();
      const definitions = { read_file: ['folder','path'], list_folder: ['folder','path'], search_files: ['folder','path','query'], write_file: ['folder','path','content'], move_file: ['source_folder','source_path','destination_folder','destination_path'], delete_file: ['folder','path'] };
      const keys = definitions[name];
      if (!keys || !args || typeof args !== 'object' || Array.isArray(args) || Object.keys(args).length !== keys.length || keys.some(k => typeof args[k] !== 'string' || args[k].includes('\0'))) throw new Error('Invalid tool arguments.');
      const allowed = await folders();
      for (const k of keys.filter(k => k.endsWith('folder'))) if (!allowed.includes(args[k])) throw new Error('Folder is not allowed.');
      if (name === 'write_file' && Buffer.byteLength(args.content) > MAX) throw new Error('Content exceeds 256 KiB.');
      if (name === 'search_files' && (!args.query.trim() || args.query.length > 4096)) throw new Error('Invalid search query.');
      const target = () => checked(args.folder, args.path, name === 'write_file', name === 'list_folder' || name === 'search_files');
      const source = () => checked(args.source_folder, args.source_path);
      const destination = () => checked(args.destination_folder, args.destination_path, true);
      if (['write_file','move_file','delete_file'].includes(name)) {
        const src = name === 'move_file' ? await source() : await target();
        const dst = name === 'move_file' ? await destination() : undefined;
        if (dst) { try { await fs.lstat(dst); throw new Error('Destination already exists.'); } catch (e) { if (e.code !== 'ENOENT') throw e; } }
        const stat = await fs.stat(src).catch(e => { if (name === 'write_file' && e.code === 'ENOENT') return null; throw e; });
        if (stat && !stat.isFile()) throw new Error('Only regular files may be changed.');
        const decision = await approve({ id, name, arguments: args, source: src, destination: dst, overwrite: !!stat }, signal);
        await audit({ id, event: 'decision', decision });
        if (decision !== 'approve') { await audit({ id, event: 'denied' }); return { status: 'denied', error: 'User denied the action.' }; }
        cancelled();
        const current = await folders();
        for (const k of keys.filter(k => k.endsWith('folder'))) if (!current.includes(args[k])) throw new Error('Folder permission was removed.');
        if (name === 'write_file') { const p = await target(); cancelled(); await fs.writeFile(p, args.content, { encoding: 'utf8', flag: 'w' }); }
        if (name === 'delete_file') { const p = await target(); cancelled(); await trash(p); }
        if (name === 'move_file') { const a = await source(), b = await destination(); try { await fs.lstat(b); throw new Error('Destination already exists.'); } catch (e) { if (e.code !== 'ENOENT') throw e; } cancelled();
          try { await fs.rename(a, b); }
          catch (error) {
            if (error.code !== 'EXDEV') throw error;
            const freshA = await source(), freshB = await destination(); cancelled();
            await fs.copyFile(freshA, freshB, require('node:fs').constants.COPYFILE_EXCL);
            try { const freshSource = await source(); cancelled(); await fs.unlink(freshSource); }
            catch { throw new Error('File was copied to the destination but the source could not be removed.'); }
          } }
        await audit({ id, event: 'completed', name });
        return { status: 'completed', result: { message: name === 'delete_file' ? 'Moved to Recycle Bin.' : 'Completed.' } };
      }
      let result;
      if (name === 'read_file') {
        const file = await fs.open(await target(), 'r');
        try { const stat = await file.stat(); if (!stat.isFile() || stat.size > MAX) throw new Error('Not a regular file or file exceeds 256 KiB.'); const buf = Buffer.alloc(MAX + 1); const { bytesRead } = await file.read(buf, 0, buf.length, 0); if (bytesRead > MAX) throw new Error('File exceeds 256 KiB.'); result = { path: args.path, content: new TextDecoder('utf-8', { fatal:true }).decode(buf.subarray(0,bytesRead)) }; } finally { await file.close(); }
      } else if (name === 'list_folder') {
        const entries = await fs.readdir(await target(), { withFileTypes: true }); if (entries.length > MAX_ENTRIES) throw new Error('Folder exceeds 500 entries.');
        result = { entries: entries.map(e => ({ name:e.name, type:e.isSymbolicLink() ? 'link' : e.isDirectory() ? 'folder' : e.isFile() ? 'file' : 'other' })) };
      } else {
        const base = await target(); const matches = []; let visited = 0;
        const walk = async dir => { const entries = await fs.readdir(await checked(args.folder, path.relative(args.folder, dir) || '.', false, true), { withFileTypes:true }); for (const e of entries) { if (++visited > MAX_ENTRIES) throw new Error('Search exceeded 500 entries.'); const rel = path.relative(args.folder, path.join(dir, e.name)); if (e.isSymbolicLink()) continue; if (e.isDirectory()) await walk(await checked(args.folder, rel, false, true)); else if (e.isFile()) { const p = await checked(args.folder, rel); const file = await fs.open(await checked(args.folder, rel), 'r'); let content; try { const stat = await file.stat(); if (!stat.isFile() || stat.size > MAX) continue; const buf = Buffer.alloc(MAX + 1); const {bytesRead} = await file.read(buf, 0, buf.length, 0); if (bytesRead > MAX) continue; content = buf.subarray(0, bytesRead).toString('utf8'); } finally { await file.close(); } if (content.includes(args.query) || e.name.includes(args.query)) matches.push(rel); } } };
        await walk(base); result = { matches };
      }
      await audit({ id, event: 'completed', name }); return { status: 'completed', result };
    } catch (error) { const message = error instanceof Error ? error.message : 'Tool failed.'; await audit({ id, event:'failed', name, error:message }); return { status:'failed', error:message }; }
  }
  execute.rejected = async call => audit({ id:crypto.randomUUID(), event:'failed', name:String(call?.name || '').slice(0,256), error:String(call?.reason || 'Invalid tool call').slice(0,300) });
  return execute;
}
module.exports = { createFileTools, checked };
