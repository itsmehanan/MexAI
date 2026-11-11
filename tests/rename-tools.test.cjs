const {test} = require('node:test'); const assert=require('node:assert/strict'); const fs=require('node:fs/promises'); const os=require('node:os'); const path=require('node:path');
const {createRenames,validName}=require('../electron/rename-tools.cjs');
test('folder rename batch approval, no overwrite, partial undo and log',async()=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'mexai-rename-')); const root=path.join(temp,'root'); await fs.mkdir(root); await fs.mkdir(path.join(root,'one')); await fs.mkdir(path.join(root,'two'));
 let decision='deny', approvals=0, last; const logFile=path.join(temp,'undo.jsonl');
 const renames=createRenames({folders:async()=>[root],logFile,approve:async request=>{approvals++;last=request;return decision;}});
 const calls=['one','two'].map((name,i)=>({id:String(i),name:'rename_folder',arguments:{folder:root,path:name,new_name:`snoopy ${i+1}`}}));
 try {
  for(const bad of ['CON','abc.','abc ','a/b','NUL.txt','a:b','..']) assert(!validName(bad));
  assert((await renames.run(calls)).every(r=>r.status==='denied')); assert.equal(approvals,1); assert.equal(last.renames.length,2);
  decision='approve'; assert((await renames.run(calls)).every(r=>r.status==='completed')); assert.equal(approvals,2);
  const entries=(await fs.readFile(logFile,'utf8')).trim().split('\n').map(JSON.parse); assert.equal(entries.filter(e=>e.event==='renamed').length,2);
  await fs.mkdir(path.join(root,'one')); await assert.rejects(renames.undo(),/original path already exists/);
  assert.equal((await fs.stat(path.join(root,'two'))).isDirectory(),true);
  await fs.rmdir(path.join(root,'one')); const res=await renames.undo(); assert.equal(res.count,1);
  await assert.rejects(renames.undo(),/No rename batch/);
  await assert.rejects(renames.run([{id:'x',name:'rename_folder',arguments:{folder:root,path:'one',new_name:'two'}}]),/already exists/);
 } finally {await fs.rm(temp,{recursive:true,force:true});}
});
