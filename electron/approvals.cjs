const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

function createApprovals(file, onChange) {
  const queue = [];
  function load() {
    try { const data = JSON.parse(fs.readFileSync(file, 'utf8')); return Array.isArray(data) ? data.filter(x => typeof x === 'string') : []; }
    catch (e) { if (e.code === 'ENOENT') return []; throw e; }
  }
  function save(data) {
    fs.mkdirSync(path.dirname(file), {recursive:true}); const tmp = `${file}.${randomUUID()}.tmp`;
    try { fs.writeFileSync(tmp, JSON.stringify(data), {mode:0o600,flag:'wx'}); fs.renameSync(tmp,file); }
    finally { try { fs.unlinkSync(tmp); } catch(e) { if (e.code !== 'ENOENT') throw e; } }
  }
  function scope(request) { const a = request.arguments; return JSON.stringify([request.name === 'rename_folder_batch' ? 'rename_folder' : request.name, ...(request.name === 'move_file' ? [a.source_folder,a.destination_folder] : request.name === 'rename_folder_batch' ? [a.folder, ...a.parents] : [a.folder])]); }
  function refresh() { onChange(queue[0]?.request || null); }
  function decide(id, choice) {
    const item = queue[0];
    if (!item || item.request.id !== id || !['approve','deny','always'].includes(choice)) return false;
    let result = choice === 'deny' ? 'deny' : 'approve';
    if (choice === 'always') { try { const key = scope(item.request), rules = load(); if (!rules.includes(key)) save([...rules,key]); } catch { result = 'deny'; } }
    queue.shift(); item.cleanup(); item.resolve(result); refresh(); return true;
  }
  async function request(request, signal) {
    if (signal?.aborted) return 'deny';
    if (load().includes(scope(request))) return 'approve';
    return new Promise(resolve => {
      let timer;
      const abort = () => {
        const index = queue.findIndex(item => item.request.id === request.id);
        if (index < 0) return;
        const [item] = queue.splice(index,1); item.cleanup(); resolve('deny'); if (index === 0) refresh();
      };
      const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort',abort); };
      queue.push({ request, resolve, cleanup });
      timer = setTimeout(abort, 600_000); signal?.addEventListener('abort',abort,{once:true});
      if (queue.length === 1) refresh();
    });
  }
  function revokeFolder(folder) {
    const rules = load(); const kept = rules.filter(rule => { try { return !JSON.parse(rule).slice(1).includes(folder); } catch { return false; } }); if (kept.length !== rules.length) save(kept);
    const previous = queue[0];
    for (let index = queue.length - 1; index >= 0; index--) {
      const item = queue[index]; if (!JSON.parse(scope(item.request)).slice(1).includes(folder)) continue;
      queue.splice(index,1); item.cleanup(); item.resolve('deny');
    }
    if (previous !== queue[0]) refresh();
  }
  return { request, decide, revokeFolder, current: () => queue[0]?.request || null };
}
module.exports = { createApprovals };
