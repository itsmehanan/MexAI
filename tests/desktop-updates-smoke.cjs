const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const Module = require('node:module');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const root = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mexai-update-main-'));
Object.defineProperty(process, 'platform', { value: 'win32' });
process.resourcesPath = temp;
const windows = [];
const app = new EventEmitter();
Object.assign(app, { isPackaged: true, setName(){}, setAppUserModelId(){}, whenReady: async () => {}, getAppPath: () => root, getVersion: () => '1.0.0', getPath: () => temp, quit() { this.emit('before-quit'); } });
let tray, child, calls = 0, installs = 0;
const nativeUpdater = new EventEmitter();
const updater = new EventEmitter();
updater.checkForUpdates = async () => { calls++; updater.emit('checking-for-update'); updater.emit('update-not-available'); };
updater.quitAndInstall = () => { installs++; nativeUpdater.emit('before-quit-for-update'); app.quit(); };
class Window extends EventEmitter {
  constructor(options) { super(); this.options=options; this.bounds={ x:options.x || 0,y:options.y || 0,width:options.width,height:options.height }; this.visible=false; this.webContents=new EventEmitter(); this.webContents.mainFrame={url: options.frame === false ? 'file:///island.html' : 'http://127.0.0.1:3737/'}; this.sent=[]; this.webContents.send=(...args)=>this.sent.push(args); windows.push(this); }
  loadFile() { queueMicrotask(()=>this.webContents.emit('did-finish-load')); return Promise.resolve(); }
  loadURL() { queueMicrotask(()=>this.emit('ready-to-show')); return Promise.resolve(); }
  show(){this.visible=true;} showInactive(){this.visible=true;} hide(){this.visible=false;} focus(){} isVisible(){return this.visible;} isMinimized(){return false;} isDestroyed(){return false;}
  setAlwaysOnTop(){} getBounds(){return {...this.bounds};} setBounds(b){this.bounds={...b};} setPosition(x,y){this.bounds.x=x;this.bounds.y=y;}
}
class Tray extends EventEmitter { constructor(){super();tray=this;} setToolTip(){} setContextMenu(menu){this.menu=menu;} }
const ipcMain = new EventEmitter(); const handlers = {}; ipcMain.handle = (key, handler) => { handlers[key] = handler; };
const safeStorage = { isEncryptionAvailable: () => true, encryptString: s => Buffer.from(s), decryptString: b => b.toString() };
const electron = { app, BrowserWindow:Window, Tray, ipcMain, safeStorage, autoUpdater:nativeUpdater, Menu:{buildFromTemplate:t=>t}, nativeImage:{createFromPath:()=>({isEmpty:()=>false})}, globalShortcut:{register:()=>true,unregisterAll(){}}, screen:{getPrimaryDisplay:()=>({workArea:{x:0,y:0,width:1200,height:800}}),getAllDisplays:()=>[{workArea:{x:0,y:0,width:1200,height:800}}], getCursorScreenPoint:()=>({x:0,y:0})}, dialog:{showErrorBox:(_t,m)=>{throw Error(m)}}, utilityProcess:{fork:()=>{child=new EventEmitter();child.kill=()=>{child.killed=true};return child;}} };
const original = Module._load;
Module._load = function(request,...args){ if (request==='electron') return electron; if (request === path.join(root,'dist-electron/updater.cjs')) return { autoUpdater:updater }; return original.call(this,request,...args); };
global.fetch=async()=>({ok:true});
require(path.join(root, 'electron/main.cjs'));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 await wait(40);
 const [island, main] = windows;
 assert.equal(calls,1); assert.equal(updater.autoInstallOnAppQuit,false);
 assert.equal(installs,0);
 const chat={sender:main.webContents,senderFrame:main.webContents.mainFrame};
 const islandEvent={sender:island.webContents,senderFrame:island.webContents.mainFrame};
 assert.deepEqual(handlers['folders:list'](chat), []);
 assert.throws(()=>handlers['folders:list']({sender:island.webContents}));
 assert.throws(()=>handlers['folders:remove'](chat, '/not-selected'));
 assert.equal(handlers['updates:status'](chat).version,'1.0.0');
 assert.equal(handlers['updates:restart'](chat),false);
 assert.throws(()=>handlers['updates:restart']({sender:island.webContents}));
 let prevented=false; main.emit('close',{preventDefault(){prevented=true;}});
 assert(prevented); assert(island.visible); assert(!child.killed);
 updater.emit('update-downloaded',{version:'1.0.1'});
 await wait(260);
 assert(island.sent.some(([channel,state])=>channel==='island:state' && state==='update'));
 assert(main.sent.some(([channel,state])=>channel==='updates:state' && state.status==='ready'));
 assert.deepEqual([island.bounds.width,island.bounds.height],[360,52]);
 assert.equal(handlers['updates:status'](chat).status,'ready');
 tray.menu[1].submenu[0].click(); await wait(250);
 assert.equal(island.sent.at(-1)[1],'update');
 ipcMain.emit('island:restart-update',{sender:island.webContents, senderFrame:{}}); assert.equal(installs,0);
 ipcMain.emit('island:restart-update',islandEvent);
 assert.equal(installs,1); assert(child.killed);
 console.log('Packaged updater startup, UI/island status, explicit restart and cleanup passed.');
 fs.rmSync(temp,{recursive:true,force:true});
})().catch(e=>{console.error(e);process.exitCode=1});
