const {test}=require('node:test'); const assert=require('node:assert/strict'); const fs=require('node:fs/promises'); const path=require('node:path'); const os=require('node:os'); const {EventEmitter}=require('node:events'); const {createBrowserTools}=require('../electron/browser-tools.cjs');
test('isolated browser requires manual launch, blocks passwords, approves all interactions and logs outcomes',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'mex-browser-')); let url='https://etsy.com/shop', passwords=0, clicked=0, typed=0, approved=0, info={tag:'button',type:'',autocomplete:'',name:'',label:'Publish listing'}, states=[];
 const element={evaluate:async()=>({...info}),click:async()=>{clicked++;},fill:async()=>{typed++;}};
 const page={url:()=>url,isClosed:()=>false,frames:()=>[{locator:()=>({count:async()=>passwords})}],locator:selector=> selector==='body' ? {evaluate:async()=>({content:'Example page',elements:[]})} : {elementHandle:async()=>element},screenshot:async opts=>{assert.equal(opts.mask.length,1);return Buffer.from('png');},goto:async u=>{url=u;},bringToFront:async()=>{}};
 const context=Object.assign(new EventEmitter(),{pages:()=>[page],close:async()=>{context.emit('close');}}); let launchProfile, launchOpts; const chromium={launchPersistentContext:async(p,opts)=>{launchProfile=p;launchOpts=opts;return context;}}; let choice='deny', request;
 const service=createBrowserTools({chromium,profile:path.join(dir,'profile'),logFile:path.join(dir,'actions.jsonl'),approve:async r=>{request=r;approved++;return choice;},onState:s=>states.push(s),pause:async()=>{}});
 const call=(name,args={})=>service.execute({name,arguments:args},new AbortController().signal);
 try {
  assert.equal((await call('browser_read_page')).status,'failed'); await service.openManual(); assert.equal(launchProfile,path.join(dir,'profile')); assert.equal(launchOpts.headless,false);
  assert.equal((await call('browser_read_page')).status,'failed'); await service.enable();
  assert.equal((await call('browser_read_page')).result.text,'Example page'); const image=await call('browser_screenshot'); assert.equal(image.image.data,Buffer.from('png').toString('base64'));
  assert.equal((await call('browser_click',{selector:'button'})).status,'denied'); assert.equal(clicked,0); assert.equal(request.oneTime,true); assert.equal(request.arguments.site,'https://etsy.com'); assert.match(request.arguments.action,/Publish listing/);
  choice='approve'; assert.equal((await call('browser_click',{selector:'button'})).status,'completed'); assert.equal(clicked,1);
  info={tag:'input',type:'password',autocomplete:'',name:'password',label:'Password'}; assert.equal((await call('browser_type',{selector:'input',text:'secret'})).status,'failed'); assert.equal(typed,0);
  passwords=1; assert.equal((await call('browser_read_page')).status,'failed'); assert.equal((await call('browser_screenshot')).status,'failed'); assert.equal((await call('browser_click',{selector:'button'})).status,'failed'); passwords=0;
  info={tag:'input',type:'text',autocomplete:'',name:'title',label:'Title'}; assert.equal((await call('browser_type',{selector:'input',text:'A listing'})).status,'completed'); assert.equal(typed,1);
  assert.equal((await call('browser_open',{url:'https://gmail.com/'})).status,'completed'); assert.equal(url,'https://gmail.com/');
  await service.stop(); assert.equal((await call('browser_click',{selector:'button'})).status,'failed'); assert(states.includes(true)); assert.equal(states.at(-1),false);
  const log=await fs.readFile(path.join(dir,'actions.jsonl'),'utf8'); assert(log.includes('browser_click')); assert(log.includes('browser_screenshot')); assert(!log.includes('A listing')); assert(!log.includes('secret'));
 } finally {await fs.rm(dir,{recursive:true,force:true});}
});

test('approval queue cannot persist browser approvals',async()=>{
 const {createApprovals}=require('../electron/approvals.cjs'); const dir=await fs.mkdtemp(path.join(os.tmpdir(),'mex-approval-'));
 try {const a=createApprovals(path.join(dir,'permissions'),()=>{}); const request={id:'x',name:'browser_click',oneTime:true,arguments:{site:'https://example.com',action:'click'}}; const p=a.request(request); assert.equal(a.decide('x','always'),false); assert.equal(a.decide('x','approve'),true); assert.equal(await p,'approve'); const next=a.request({...request,id:'y'}); assert.equal(a.current().id,'y'); a.decide('y','deny'); assert.equal(await next,'deny');} finally {await fs.rm(dir,{recursive:true,force:true});}
});

test('stop during approval prevents action and closes browser',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'mex-browser-stop-')); let clicked=0, resolveApprove, requested; const reached=new Promise(r=>requested=r);
 const element={evaluate:async()=>({tag:'button',type:'',autocomplete:'',name:'',label:'Send'}),click:async()=>{clicked++;}};
 const page={url:()=> 'https://mail.example/inbox',isClosed:()=>false,frames:()=>[{locator:()=>({count:async()=>0})}],locator:()=>({elementHandle:async()=>element}),bringToFront:async()=>{}};
 const context=Object.assign(new EventEmitter(),{pages:()=>[page],close:async()=>{context.emit('close');}});
 const service=createBrowserTools({chromium:{launchPersistentContext:async()=>context},profile:path.join(dir,'profile'),logFile:path.join(dir,'log'),approve:async(_r,signal)=>new Promise(resolve=>{resolveApprove=resolve; signal.addEventListener('abort',()=>resolve('deny'),{once:true}); requested();}),pause:async()=>{}});
 try {await service.openManual(); await service.enable(); const action=service.execute({name:'browser_click',arguments:{selector:'button'}},new AbortController().signal); await reached; await service.stop(); resolveApprove('approve'); await action; assert.equal(clicked,0); assert.equal((await service.execute({name:'browser_read_page',arguments:{}},new AbortController().signal)).status,'failed');} finally {await fs.rm(dir,{recursive:true,force:true});}
});
