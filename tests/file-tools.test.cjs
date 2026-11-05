const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createFileTools } = require('../electron/file-tools.cjs');

test('file tools constrain paths, require approval, audit, and use trash', async () => {
 const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mexai-file-')); const root = path.join(dir, 'root'); const outside = path.join(dir,'outside'); await fs.mkdir(root); await fs.mkdir(outside);
 const logFile = path.join(dir, 'actions.jsonl'); let decision = 'deny', trashed = '';
 const run = createFileTools({ folders: async()=>[root], logFile, approve: async()=>decision, trash:async p=>{trashed=p; await fs.unlink(p);} });
 const call = (name, args) => run({name,arguments:{folder:root,...args}});
 try {
  await fs.writeFile(path.join(root,'file.txt'),'hello world'); await fs.writeFile(path.join(outside,'secret'),'secret');
  assert.equal((await call('read_file',{path:'file.txt'})).result.content,'hello world');
  assert.equal((await call('list_folder',{path:'.'})).status,'completed');
  assert.deepEqual((await call('search_files',{path:'.',query:'hello'})).result.matches,['file.txt']);
  assert.equal((await call('read_file',{path:'../outside/secret'})).status,'failed');
  try { await fs.symlink(outside,path.join(root,'link'),'dir'); assert.equal((await call('read_file',{path:'link/secret'})).status,'failed'); } catch(e) { if (e.code !== 'EPERM') throw e; }
  assert.equal((await call('write_file',{path:'new.txt',content:'private text'})).status,'denied');
  await assert.rejects(fs.stat(path.join(root,'new.txt')));
  decision='approve'; assert.equal((await call('write_file',{path:'new.txt',content:'private text'})).status,'completed');
  assert.equal((await run({name:'move_file',arguments:{source_folder:root,source_path:'new.txt',destination_folder:root,destination_path:'moved.txt'}})).status,'completed');
  assert.equal((await call('delete_file',{path:'moved.txt'})).status,'completed'); assert.equal(trashed,path.join(root,'moved.txt'));
  const log = await fs.readFile(logFile,'utf8'); assert(!log.includes('private text')); assert(log.includes('denied')); assert(log.includes('completed'));
 } finally { await fs.rm(dir,{recursive:true,force:true}); }
});


test('cancelling an approval cannot write a file', async () => {
 const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mexai-cancel-')); const root=path.join(dir,'root'); await fs.mkdir(root);
 const abort=new AbortController(); let requested; const ready=new Promise(resolve => {requested=resolve;});
 const run=createFileTools({folders:async()=>[root],logFile:path.join(dir,'log'),approve:async (_request, signal)=>{requested(); return new Promise(resolve=>signal.addEventListener('abort',()=>resolve('approve'),{once:true}));},trash:async()=>{}});
 try { const pending=run({name:'write_file',arguments:{folder:root,path:'cancelled.txt',content:'x'}},abort.signal); await ready; abort.abort(); const result=await pending; assert.equal(result.status,'failed'); await assert.rejects(fs.stat(path.join(root,'cancelled.txt'))); }
 finally { await fs.rm(dir,{recursive:true,force:true}); }
});
