const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const Module = require('node:module');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const root = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'island-smoke-'));
const windows = [];
const app = new EventEmitter();
Object.assign(app, { isPackaged: false, setName(){}, setAppUserModelId(){}, whenReady: async () => {}, getAppPath: () => root, getVersion: () => '0.0.0', getPath: () => temp, quit() { this.emit('before-quit'); } });
let shortcut, tray, child;
class Window extends EventEmitter {
  constructor(options) { super(); this.options=options; this.bounds={ x:options.x || 0,y:options.y || 0,width:options.width,height:options.height }; this.visible=false; this.webContents=new EventEmitter(); this.sent=[]; this.webContents.send=(...args)=>this.sent.push(args); windows.push(this); }
  loadFile() { queueMicrotask(()=>this.webContents.emit('did-finish-load')); return Promise.resolve(); }
  loadURL() { queueMicrotask(()=>this.emit('ready-to-show')); return Promise.resolve(); }
  show(){this.visible=true;} showInactive(){this.visible=true;} hide(){this.visible=false;} focus(){} isVisible(){return this.visible;} isMinimized(){return false;} isDestroyed(){return false;}
  setAlwaysOnTop(){} getBounds(){return {...this.bounds};} setBounds(b){this.bounds={...b};} setPosition(x,y){this.bounds.x=x;this.bounds.y=y;}
}
class Tray extends EventEmitter { constructor(){super();tray=this;} setToolTip(){} setContextMenu(menu){this.menu=menu;} }
const ipcMain = new EventEmitter();
const handlers = {};
ipcMain.handle = (name, fn) => { handlers[name] = fn; };
let cursor = { x: 500, y: 30 };
let unregistered = false;
const safeStorage = { isEncryptionAvailable: () => true, getSelectedStorageBackend: () => 'gnome_libsecret', encryptString: s => Buffer.from(s), decryptString: b => b.toString() };
const electron = { app, BrowserWindow:Window, Tray, ipcMain, safeStorage, shell:{trashItem:async p=>fs.promises.unlink(p)}, Menu:{buildFromTemplate:t=>t}, nativeImage:{createFromPath:()=>({isEmpty:()=>false})}, globalShortcut:{register:(key,cb)=>{assert.equal(key,'Control+Shift+Space');shortcut=cb;return true;},unregisterAll:()=>{unregistered=true;}}, screen:{getPrimaryDisplay:()=>({workArea:{x:0,y:0,width:1200,height:800}}),getAllDisplays:()=>[{workArea:{x:0,y:0,width:1200,height:800}}], getCursorScreenPoint:()=>cursor}, dialog:{showErrorBox:(_t,m)=>{throw Error(m)}}, utilityProcess:{fork:()=>{child=new EventEmitter();child.kill=()=>{child.killed=true};return child;}} };
const mockPage={ url:()=> 'https://example.com/', isClosed:()=>false, frames:()=>[{locator:()=>({count:async()=>0})}], locator:()=>({evaluate:async()=>({content:'Hello',elements:[]})}), bringToFront:async()=>{} };
const browserContext=Object.assign(new EventEmitter(), {pages:()=>[mockPage],close:async()=>browserContext.emit('close')});
const playwright={chromium:{launchPersistentContext:async(profile,options)=>{assert.equal(profile,path.join(temp,'browser-profile')); assert.equal(options.headless,false); return browserContext;}}};
const original=Module._load;
Module._load=function(request,...args){return request==='electron'?electron:request==='playwright-core'?playwright:original.call(this,request,...args)};
global.fetch=async()=>({ok:true});
require(path.join(root, 'electron/main.cjs'));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 await wait(20);
 const [island, main]=windows;
 main.webContents.mainFrame = { url: 'http://127.0.0.1:3737/' };
 const trusted = { sender: main.webContents, senderFrame: main.webContents.mainFrame };
 assert.throws(() => handlers['keys:status']({ sender: island.webContents }));
 handlers['keys:save'](trusted, 'gemini', 'test-secret');
 assert.throws(() => handlers['keys:custom-endpoint']({ sender: island.webContents }, 'https://attacker.example/v1'));
 handlers['keys:custom-endpoint'](trusted, 'https://trusted.example/v1');
 assert.equal(handlers['keys:status'](trusted).gemini, true);
 let serverKey; child.postMessage = message => { serverKey = message; };
 child.emit('message', { type: 'secure-key-request', id: '123', provider: 'gemini' });
 assert.equal(serverKey.key, 'test-secret');
 child.emit('message', { type: 'secure-endpoint-request', id: '124', provider: 'custom' });
 assert.equal(serverKey.key, 'https://trusted.example/v1');
 assert(!JSON.stringify(handlers['keys:status'](trusted)).includes('test-secret'));
 const allowedFolder = path.join(temp, 'allowed'); fs.mkdirSync(allowedFolder); fs.writeFileSync(path.join(allowedFolder, 'hello.txt'), 'hello');
 electron.dialog.showOpenDialog = async () => ({ canceled:false, filePaths:[allowedFolder] });
 await handlers['folders:add'](trusted);
 child.emit('message', { type:'tool-request', id:'tools-list', action:'list' }); await wait(20);
 assert.deepEqual(serverKey.value, [fs.realpathSync(allowedFolder)]);
 child.emit('message', { type:'tool-request', id:'tools-read', action:'execute', call:{name:'read_file',arguments:{folder:fs.realpathSync(allowedFolder),path:'hello.txt'}} }); await wait(30);
 assert.equal(serverKey.value.status,'completed'); assert.equal(serverKey.value.result.content,'hello');
 child.emit('message', {type:'tool-request',id:'tools-copy',action:'execute',call:{name:'copy_file',arguments:{source_folder:fs.realpathSync(allowedFolder),source_path:'hello.txt',destination_folder:fs.realpathSync(allowedFolder),destination_path:'copy.txt'}}}); await wait(30);
 const copyApproval=handlers['tools:approval-current'](trusted); assert.equal(copyApproval.name,'copy_file'); ipcMain.emit('tools:decision',trusted,copyApproval.id,'approve'); await wait(30); assert.equal(serverKey.value.status,'completed'); assert.equal(fs.readFileSync(path.join(allowedFolder,'copy.txt'),'utf8'),'hello');

 child.emit('message', { type:'tool-request', id:'tools-write', action:'execute', call:{name:'write_file',arguments:{folder:fs.realpathSync(allowedFolder),path:'no.txt',content:'x'}} }); await wait(30);
 const approval = handlers['tools:approval-current'](trusted); assert.equal(approval.name,'write_file'); assert.equal(approval.arguments.content,'x');
 ipcMain.emit('tools:decision',trusted,approval.id,'deny'); await wait(30);
 assert.equal(serverKey.value.status,'denied'); assert(!fs.existsSync(path.join(allowedFolder,'no.txt')));
 child.emit('message', { type:'tool-request', id:'tools-write-2', action:'execute', call:{name:'write_file',arguments:{folder:fs.realpathSync(allowedFolder),path:'yes.txt',content:'hello'}} }); await wait(30);
 const approval2 = handlers['tools:approval-current'](trusted); ipcMain.emit('tools:decision',trusted,approval2.id,'approve'); await wait(30);
 assert.equal(serverKey.value.status,'completed'); assert.equal(fs.readFileSync(path.join(allowedFolder,'yes.txt'),'utf8'),'hello');
 child.emit('message', { type:'tool-request', id:'tools-delete', action:'execute', call:{name:'delete_file',arguments:{folder:fs.realpathSync(allowedFolder),path:'yes.txt'}} }); await wait(30);
 const approval3 = handlers['tools:approval-current'](trusted); ipcMain.emit('tools:decision',trusted,approval3.id,'approve'); await wait(30);
 assert.equal(serverKey.value.status,'completed'); assert(!fs.existsSync(path.join(allowedFolder,'yes.txt')));

 assert(fs.readFileSync(path.join(temp,'tool-activity.jsonl'),'utf8').includes('read_file'));
 tray.menu[1].submenu[0].click(); await wait(260); shortcut();

 assert.equal(windows.length,2); assert.equal(main.visible,true); assert.equal(island.visible,false);
 assert.equal(island.options.frame,false); assert.equal(island.options.transparent,true); assert.equal(island.options.alwaysOnTop,true);
 assert.deepEqual([island.bounds.width,island.bounds.height],[132,40]); assert(Math.abs(island.bounds.x-534) <= 2);
 let prevented=false; main.emit('close',{preventDefault(){prevented=true}}); assert(prevented); assert.equal(main.visible,false); assert.equal(island.visible,true); assert(!child.killed);
 ipcMain.emit('island:open',{sender:{}}); assert.equal(main.visible,false); // untrusted sender ignored
 ipcMain.emit('island:open',{sender:island.webContents}); assert(main.visible); assert(!island.visible);
 main.emit('minimize',{preventDefault(){prevented=true}}); assert(!main.visible); assert(island.visible);
 shortcut(); assert(main.visible); shortcut(); assert(island.visible);
 const demos=tray.menu[1].submenu;
 for (const [index,w,h,state] of [[1,260,44,'listening'],[2,380,52,'working'],[3,600,300,'approval']]) { demos[index].click(); await wait(260); assert.deepEqual([island.bounds.width,island.bounds.height],[w,h]); assert.deepEqual(island.sent.at(-1),['island:state',state]); }
 ipcMain.emit('island:decision',{sender:island.webContents},'approve'); await wait(260); assert.equal(island.bounds.width,132);
 island.webContents.mainFrame = { url: 'file:///island.html' };
 const islandEvent = { sender: island.webContents, senderFrame: island.webContents.mainFrame };
 child.emit('message', { type:'tool-request', id:'island-write', action:'execute', call:{name:'write_file',arguments:{folder:fs.realpathSync(allowedFolder),path:'island.txt',content:'island'}} }); await wait(30);
 const islandApproval = handlers['tools:approval-current'](trusted); assert.equal(islandApproval.name,'write_file');
 ipcMain.emit('island:decision',islandEvent,'always',islandApproval.id); await wait(260);
 assert.equal(serverKey.value.status,'completed'); assert.equal(fs.readFileSync(path.join(allowedFolder,'island.txt'),'utf8'),'island');
 child.emit('message', { type:'tool-request', id:'always-write', action:'execute', call:{name:'write_file',arguments:{folder:fs.realpathSync(allowedFolder),path:'second.txt',content:'auto'}} }); await wait(30);
 assert.equal(serverKey.value.status,'completed'); assert.equal(handlers['tools:approval-current'](trusted),null);
 const folder = fs.realpathSync(allowedFolder); fs.mkdirSync(path.join(folder,'design1')); fs.mkdirSync(path.join(folder,'design2'));
 const batch = ['design1','design2'].map((old,i)=>({id:`rename-${i}`,name:'rename_folder',arguments:{folder,path:old,new_name:`snoopy ${i+1}`}}));
 child.emit('message',{type:'tool-request',id:'rename-batch',action:'execute-batch',call:batch}); await wait(50);
 const renameApproval=handlers['tools:approval-current'](trusted); assert.equal(renameApproval.name,'rename_folder_batch'); assert.equal(renameApproval.renames.length,2);
 ipcMain.emit('island:decision',islandEvent,'approve',renameApproval.id); await wait(80);
 assert.equal(serverKey.value[0].status,'completed'); assert(fs.existsSync(path.join(folder,'snoopy 1')));
 const undone = await handlers['tools:undo-renames'](trusted); assert.equal(undone.count,2); assert(fs.existsSync(path.join(folder,'design1')));
 assert.throws(()=>handlers['browser:open-manual']({sender:island.webContents}));
 await handlers['browser:open-manual'](trusted); await handlers['browser:enable'](trusted); await wait(260);
 assert.equal(island.visible,true); assert(island.sent.some(x=>x[0]==='island:state' && x[1]==='browser'));
 child.emit('message',{type:'tool-request',id:'browser-read',action:'execute',call:{name:'browser_read_page',arguments:{}}}); await wait(1000);
 assert.equal(serverKey.value.status,'completed'); assert.equal(serverKey.value.result.text,'Hello');
 ipcMain.emit('island:browser-stop',islandEvent); await wait(80); assert(main.sent.some(x=>x[0]==='browser:stop-request'));


 tray.menu[1].submenu[0].click(); await wait(260);

 ipcMain.emit('island:expand', { sender: island.webContents, senderFrame: {} }); await wait(20); assert.equal(island.bounds.width,132);
 ipcMain.emit('island:expand', islandEvent); await wait(260); assert.deepEqual([island.bounds.width,island.bounds.height],[520,102]);
 ipcMain.emit('island-chat:voice-setting', trusted, true); assert.deepEqual(island.sent.at(-1), ['island:voice-setting', true]);
 await assert.rejects(() => handlers['island:transcribe']({sender:island.webContents, senderFrame:{}}, new Uint8Array([1]), 'audio/webm'));
 await assert.rejects(() => handlers['island:transcribe'](islandEvent, new Uint8Array([1]), 'text/plain'));
 const savedFetch = global.fetch;
 global.fetch = async (url, options) => { assert.match(url, /api\/voice\/transcribe$/); assert.equal(options.headers['Content-Type'], 'audio/webm'); assert.deepEqual([...options.body], [1, 2]); return { ok:true, json: async () => ({text:'hello'}) }; };
 assert.equal(await handlers['island:transcribe'](islandEvent, new Uint8Array([1, 2]), 'audio/webm;codecs=opus'), 'hello');
 global.fetch = savedFetch;
 ipcMain.emit('island:agent', islandEvent, 'shumex'); assert.deepEqual(main.sent.at(-1), ['island-chat:agent', 'shumex']);
 ipcMain.emit('island-chat:active-agent', trusted, 'shumex'); assert.deepEqual(island.sent.at(-1), ['island:agent', 'shumex']);
 ipcMain.emit('island:command', islandEvent, { agent: 'shumex', text: '  hello  ', id: 'request1' });
 assert.deepEqual(main.sent.at(-1), ['island-chat:command', { agent: 'shumex', text: 'hello', id: 'request1' }]);
 const sentCount = main.sent.length;
 ipcMain.emit('island:command', { sender: island.webContents, senderFrame: {} }, { agent: 'shumex', text: 'hello', id: 'bad' });
 ipcMain.emit('island:command', islandEvent, { agent: 'unknown', text: 'hello', id: 'bad' }); assert.equal(main.sent.length, sentCount);
 ipcMain.emit('island-chat:status', { sender: island.webContents, senderFrame: island.webContents.mainFrame }, { phase: 'working', agent: 'shumex', text: 'busy' });
 assert.equal(island.bounds.width, 520);
 ipcMain.emit('island-chat:status', trusted, { phase: 'working', agent: 'shumex', text: 'busy', id: 'request1' }); await wait(260); assert.deepEqual([island.bounds.width,island.bounds.height],[380,52]);
 ipcMain.emit('island-chat:status', trusted, { phase: 'result', agent: 'shumex', text: 'done', id: 'request1' }); await wait(260); assert.deepEqual([island.bounds.width,island.bounds.height],[520,102]);
 assert(island.sent.some(([name,data]) => name === 'island:chat' && data.phase === 'result' && data.text === 'done'));
 ipcMain.emit('island:collapse', islandEvent); await wait(260); assert.equal(island.bounds.width,132);
 const x=island.bounds.x; ipcMain.emit('island:drag-start',{sender:island.webContents}); cursor={x:560,y:70}; ipcMain.emit('island:drag-move',{sender:island.webContents}); ipcMain.emit('island:drag-end',{sender:island.webContents}); assert.equal(island.bounds.x,x+60); await wait(230);
 const pos=JSON.parse(fs.readFileSync(path.join(temp,'island-position.json'))); assert.equal(pos.centerX,island.bounds.x+66); assert.equal(pos.y,island.bounds.y);
 tray.menu.at(-1).click(); assert(child.killed); assert(unregistered);
 fs.rmSync(temp, { recursive: true, force: true });
 console.log('Island lifecycle, states, IPC, drag persistence, shortcut and tray quit passed.');
})().catch(e=>{console.error(e);process.exitCode=1});
