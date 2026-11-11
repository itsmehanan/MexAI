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

test('view_image enforces formats and size, scales and returns private image data', async () => {
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'mexai-img-')); const root=path.join(dir,'root'); await fs.mkdir(root);
 let resize;
 const nativeImage={createFromBuffer:()=>({isEmpty:()=>false,getSize:()=>({width:1600,height:800}),resize:opts=>{resize=opts;return {getSize:()=>({width:opts.width,height:opts.height}),toPNG:()=>Buffer.from('small image')};}})};
 const run=createFileTools({folders:async()=>[root],logFile:path.join(dir,'log'),approve:async()=> 'deny',trash:async()=>{},nativeImage});
 try {
  await fs.writeFile(path.join(root,'x.png'),Buffer.from([137,80,78,71,13,10,26,10,0]));
  const ok=await run({name:'view_image',arguments:{folder:root,path:'x.png'}});
  assert.equal(ok.status,'completed'); assert.equal(resize.width,768); assert.equal(resize.height,384); assert.equal(ok.image.data,Buffer.from('small image').toString('base64'));
  await fs.writeFile(path.join(root,'bad.png'),'not png'); assert.equal((await run({name:'view_image',arguments:{folder:root,path:'bad.png'}})).status,'failed');
  await fs.writeFile(path.join(root,'large.png'),Buffer.alloc(10*1024*1024+1)); assert.equal((await run({name:'view_image',arguments:{folder:root,path:'large.png'}})).status,'failed');
  assert(!(await fs.readFile(path.join(dir,'log'),'utf8')).includes(ok.image.data));
 } finally {await fs.rm(dir,{recursive:true,force:true});}
});

test('copy and create require approval and never overwrite, with folder and link checks', async () => {
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'mexai-copy-')); const root=path.join(dir,'root'), other=path.join(dir,'other'); await fs.mkdir(root); await fs.mkdir(other); await fs.writeFile(path.join(root,'src'),'source'); await fs.writeFile(path.join(other,'exists'),'keep');
 let choice='deny', requests=[]; const run=createFileTools({folders:async()=>[root,other],logFile:path.join(dir,'log'),approve:async req=>{requests.push(req);return choice;},trash:async()=>{}});
 const copy=(destination='new')=>({name:'copy_file',arguments:{source_folder:root,source_path:'src',destination_folder:other,destination_path:destination}});
 const create=(folder=root,p='newdir')=>({name:'create_folder',arguments:{folder,path:p}});
 try {
  assert.equal((await run(copy())).status,'denied'); assert.equal((await run(create())).status,'denied');
  choice='approve'; assert.equal((await run(copy())).status,'completed'); assert.equal(await fs.readFile(path.join(other,'new'),'utf8'),'source');
  assert.equal((await run(copy('exists'))).status,'failed'); assert.equal(await fs.readFile(path.join(other,'exists'),'utf8'),'keep');
  assert.equal((await run(create())).status,'completed'); assert.equal((await run(create())).status,'failed');
  assert.equal((await run(create(dir,'outside'))).status,'failed'); assert.equal((await run(create(root,'../escape'))).status,'failed');
  await fs.symlink(other,path.join(root,'link'),'dir'); assert.equal((await run(create(root,'link/escape'))).status,'failed');
  assert.equal(requests[0].source,path.join(root,'src')); assert.equal(requests[0].destination,path.join(other,'new'));
 } finally {await fs.rm(dir,{recursive:true,force:true});}
});
