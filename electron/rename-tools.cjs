const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { checked } = require('./file-tools.cjs');

function validName(name) { return typeof name === 'string' && name.length > 0 && name.length <= 255 && !/[<>:"/\\|?*\x00-\x1f]/.test(name) && !/[. ]$/.test(name) && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name); }
function createRenames({ folders, approve, logFile }) {
  const log = async event => { await fs.mkdir(path.dirname(logFile), {recursive:true}); await fs.appendFile(logFile, JSON.stringify({ time:new Date().toISOString(), ...event })+'\n',{mode:0o600}); };
  let locked = false;
  async function exists(p) { try { await fs.lstat(p); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; } }
  async function validate(folder, source, name) {
    if (!validName(name) || typeof source !== 'string') throw new Error('Invalid Windows folder name.');
    const src = await checked(folder, source); const stat = await fs.stat(src);
    if (!stat.isDirectory() || path.resolve(src) === path.resolve(folder)) throw new Error('Only subfolders can be renamed.');
    const rel = path.relative(folder, path.join(path.dirname(src), name));
    const dest = await checked(folder, rel, true);
    if (await exists(dest)) throw new Error(`Destination already exists: ${dest}`);
    return { source:src, destination:dest, sourcePath:source, destinationPath:rel };
  }
  async function run(calls, signal) {
    if (locked) throw new Error('Another rename or undo is in progress.');
    locked = true;
    const batchId = randomUUID(); const results = calls.map(() => ({status:'failed', error:'Batch was not completed.'}));
    try {
      if (!Array.isArray(calls) || !calls.length || calls.length > 60) throw new Error('Invalid rename batch.');
      const folder = calls[0].arguments?.folder;
      if (!(await folders()).includes(folder)) throw new Error('Folder is not allowed.');
      const items = [];
      for (const call of calls) {
        const a = call?.arguments;
        if (call?.name !== 'rename_folder' || !a || Object.keys(a).sort().join(',') !== 'folder,new_name,path' || a.folder !== folder) throw new Error('Invalid rename batch.');
        items.push(await validate(folder, a.path, a.new_name));
      }
      const nested = (a,b) => { const r=path.relative(a,b); return r !== '' && !r.startsWith(`..${path.sep}`) && r !== '..' && !path.isAbsolute(r); };
      if (items.some((a,i) => items.some((b,j) => i !== j && nested(a.source,b.source)))) throw new Error('A batch cannot contain nested source folders.');
      if (new Set(items.map(x => x.source.toLowerCase())).size !== items.length || new Set(items.map(x => x.destination.toLowerCase())).size !== items.length) throw new Error('Duplicate source or destination in batch.');
      await log({event:'batch_requested', batchId, folder, renames:items});
      const decision = await approve({ id:batchId, name:'rename_folder_batch', arguments:{folder, parents:[...new Set(items.map(item => path.dirname(item.source)))].sort()}, renames:items, source:folder, overwrite:false },signal);
      await log({event:'batch_decision', batchId, decision});
      if (decision !== 'approve') return calls.map(() => ({status:'denied',error:'User denied the rename batch.'}));
      if (!(await folders()).includes(folder)) throw new Error('Folder permission was removed.');
      for (let i=0;i<items.length;i++) {
        if (signal?.aborted || !(await folders()).includes(folder)) break;
        try {
          const item = await validate(folder, calls[i].arguments.path, calls[i].arguments.new_name);
          await log({event:'rename_intent',batchId,folder,oldPath:item.sourcePath,newPath:item.destinationPath});
          if (signal?.aborted) break;
          await fs.rename(item.source,item.destination);
          await log({event:'renamed',batchId,folder,oldPath:item.sourcePath,newPath:item.destinationPath});
          results[i] = {status:'completed',result:{oldPath:item.sourcePath,newPath:item.destinationPath}};
        } catch (e) { results[i] = {status:'failed',error:e instanceof Error ? e.message : 'Rename failed.'}; }
      }
      return results;
    } finally { locked = false; }
  }
  async function undo() {
    if (locked) throw new Error('Another rename or undo is in progress.');
    locked = true;
    try {
      let records; try { records=(await fs.readFile(logFile,'utf8')).trim().split('\n').filter(Boolean).map(line=>JSON.parse(line)); } catch(e) { if (e.code==='ENOENT') throw new Error('No rename batch to undo.'); throw e; }
      const done = new Set(records.filter(e=>e.event==='undone').map(e=>`${e.batchId}\0${e.oldPath}\0${e.newPath}`));
      const last = [...records].reverse().find(e=>e.event==='renamed' && !done.has(`${e.batchId}\0${e.oldPath}\0${e.newPath}`));
      if (!last) throw new Error('No rename batch to undo.');
      if (!(await folders()).includes(last.folder)) throw new Error('Re-add the allowed folder before undoing.');
      const changes = records.filter(e=>e.event==='renamed' && e.batchId===last.batchId && !done.has(`${e.batchId}\0${e.oldPath}\0${e.newPath}`)).reverse();
      let count = 0;
      for (const change of changes) {
        if (!(await folders()).includes(change.folder)) throw new Error(`Undo stopped after ${count}: folder permission was removed.`);
        const current = await checked(change.folder, change.newPath);
        if (!(await fs.stat(current)).isDirectory()) throw new Error(`Undo stopped after ${count}: the renamed folder is missing.`);
        const original = await checked(change.folder, change.oldPath, true);
        if (await exists(original)) throw new Error(`Undo stopped after ${count}: original path already exists.`);
        await log({event:'undo_intent',batchId:change.batchId,folder:change.folder,oldPath:change.oldPath,newPath:change.newPath});
        await fs.rename(current, original);
        await log({event:'undone',batchId:change.batchId,folder:change.folder,oldPath:change.oldPath,newPath:change.newPath}); count++;
      }
      return { count };
    } finally { locked = false; }
  }
  return { run, undo };
}
module.exports = {createRenames, validName};
