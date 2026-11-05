const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {createApprovals} = require('../electron/approvals.cjs');

test('decisions, persistence, folder and operation scope, revocation and cancellation', async () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mexai-approval-')); const file=path.join(dir,'grants.json'); const states=[];
  try {
    const service=createApprovals(file, r=>states.push(r));
    const r=(id,name,folder) => ({id,name,arguments:{folder,path:'a',content:'test'},source:path.join(folder,'a'),overwrite:false});
    let pending=service.request(r('a','write_file','/allowed')); assert.equal(service.current().id,'a');
    assert.equal(service.decide('wrong','approve'),false); assert.equal(service.decide('a','deny'),true); assert.equal(await pending,'deny');
    pending=service.request(r('b','write_file','/allowed')); service.decide('b','always'); assert.equal(await pending,'approve');
    const restarted=createApprovals(file,()=>{}); assert.equal(await restarted.request(r('c','write_file','/allowed')),'approve');
    const abort = new AbortController(); pending=restarted.request(r('d','delete_file','/allowed'),abort.signal); abort.abort(); assert.equal(await pending,'deny');
    pending=restarted.request(r('e','write_file','/another')); restarted.revokeFolder('/another'); assert.equal(await pending,'deny');
    restarted.revokeFolder('/allowed'); const again=restarted.request(r('f','write_file','/allowed')); restarted.decide('f','deny'); assert.equal(await again,'deny');
    assert(states.some(v=>v?.id==='a')); assert.equal(service.current(),null);
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
