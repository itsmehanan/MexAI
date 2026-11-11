const { createRenames } = require('./rename-tools.cjs');
const { createApprovals } = require('./approvals.cjs');
const { createFileTools } = require('./file-tools.cjs');
const { createFolderSettings } = require('./folder-settings.cjs');
const { app, BrowserWindow, dialog, utilityProcess, Tray, Menu, nativeImage, globalShortcut, screen, ipcMain, safeStorage, shell, autoUpdater: electronAutoUpdater } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { createVault } = require('./key-vault.cjs');
const { createUpdateController } = require('./update-controller.cjs');
const { setTimeout: delay } = require('node:timers/promises');

const SERVER_PORT = 3737;
const SERVER_HOST = '127.0.0.1';
const APP_URL = `http://${SERVER_HOST}:${SERVER_PORT}`;
const ISLAND_SIZES = { resting: [132, 40], listening: [260, 44], working: [380, 52], approval: [600, 300], update: [360, 52], command: [520, 102], result: [520, 102] };
let serverProcess, serverExitError, mainWindow, islandWindow, tray;
let quitting = false;
let failureReported = false;
let islandState = 'resting';
let activeIslandAgent = 'hanex';
let sendVoiceImmediately = false;
let islandPosition;
let resizeTimer, saveTimer, dragOrigin, vault, updateController, approvals;

app.setName('Hanex & Shumex');
app.setAppUserModelId('com.itsmehanan.hanexshumex');

function stopServer() {
  const child = serverProcess;
  serverProcess = undefined;
  child?.kill();
}
function reportFailure(error) {
  if (quitting || failureReported) return;
  failureReported = true;
  console.error(error);
  dialog.showErrorBox('Hanex & Shumex', `The desktop app could not start or its server stopped.\n\n${error.message}`);
  quitting = true;
  app.quit();
}
async function waitForServer() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (quitting) throw new Error('The app was closed during startup.');
    if (serverExitError) throw serverExitError;
    try {
      const response = await fetch(`${APP_URL}/api/status`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return;
    } catch { /* Server is still starting. */ }
    await delay(100);
  }
  throw new Error(`The Express server did not become ready at ${APP_URL} within 30 seconds.`);
}

function positionFile() { return path.join(app.getPath('userData'), 'island-position.json'); }
function readPosition() {
  try {
    const { centerX, y } = JSON.parse(fs.readFileSync(positionFile(), 'utf8'));
    const x = centerX;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    // Ignore positions from monitors that are no longer attached.
    if (screen.getAllDisplays().some(({ workArea: a }) => x >= a.x && x < a.x + a.width && y >= a.y && y < a.y + a.height)) {
      return { centerX: Math.round(x), y: Math.round(y) };
    }
  } catch { /* First launch or a stale preferences file. */ }
}
function savePosition() {
  if (!islandPosition) return;
  try { fs.writeFileSync(positionFile(), JSON.stringify(islandPosition)); }
  catch (error) { console.warn('Could not save island position:', error); }
}
function schedulePositionSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(savePosition, 200);
}
function defaultPosition() {
  const area = screen.getPrimaryDisplay().workArea;
  return { centerX: Math.round(area.x + area.width / 2), y: area.y + 12 };
}
function showIsland() {
  if (islandWindow && !islandWindow.isDestroyed()) islandWindow.showInactive();
}
function hideMain() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('island-chat:hidden');
  mainWindow.hide();
  showIsland();
}
function showMain() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  if (islandWindow && !islandWindow.isDestroyed()) { islandWindow.webContents.send('island:hidden'); islandWindow.hide(); }
}
function toggleMain() {
  if (mainWindow?.isVisible() && !mainWindow.isMinimized()) hideMain();
  else showMain();
}

function setIslandState(state) {
  if (state === 'resting' && updateController?.getState().status === 'ready') state = 'update';
  if (!Object.hasOwn(ISLAND_SIZES, state) || !islandWindow || islandWindow.isDestroyed()) return;
  if (islandState === state) return;
  islandState = state;
  islandWindow.webContents.send('island:state', state);
  clearInterval(resizeTimer);
  const start = islandWindow.getBounds();
  const [width, height] = ISLAND_SIZES[state];
  // Keep the pill centered on its current location while its native window resizes.
  const centerX = start.x + start.width / 2;
  const area = screen.getAllDisplays().find(({ workArea: a }) => centerX >= a.x && centerX < a.x + a.width && start.y >= a.y && start.y < a.y + a.height)?.workArea || screen.getPrimaryDisplay().workArea;
  const targetX = Math.round(Math.max(area.x, Math.min(centerX - width / 2, area.x + area.width - width)));
  const started = Date.now();
  resizeTimer = setInterval(() => {
    if (!islandWindow || islandWindow.isDestroyed()) { clearInterval(resizeTimer); resizeTimer = undefined; return; }
    const t = Math.min((Date.now() - started) / 220, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    const w = Math.round(start.width + (width - start.width) * eased);
    const h = Math.round(start.height + (height - start.height) * eased);
    islandWindow.setBounds({ x: Math.round(start.x + (targetX - start.x) * eased), y: start.y, width: w, height: h });
    if (t === 1) {
      clearInterval(resizeTimer);
      resizeTimer = undefined;
      islandPosition = { centerX: Math.round(targetX + width / 2), y: start.y };
      schedulePositionSave();
    }
  }, 16);
}
function setupIsland() {
  const [width, height] = ISLAND_SIZES[islandState];
  islandPosition = readPosition() || defaultPosition();
  islandWindow = new BrowserWindow({
    x: Math.round(islandPosition.centerX - width / 2), y: islandPosition.y, width, height, frame: false, transparent: true, alwaysOnTop: true,
    resizable: false, skipTaskbar: true, show: false, hasShadow: false,
    webPreferences: { preload: path.join(__dirname, 'island-preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true },
  });
  islandWindow.setAlwaysOnTop(true, 'floating');
  islandWindow.loadFile(path.join(__dirname, 'island.html'));
  islandWindow.webContents.on('did-finish-load', () => { islandWindow.webContents.send('island:state', islandState); islandWindow.webContents.send('island:agent', activeIslandAgent); islandWindow.webContents.send('island:voice-setting', sendVoiceImmediately); });
}
function validIslandFrame(event) { return validIslandSender(event) && event.senderFrame === islandWindow.webContents.mainFrame; }
function validIslandSender(event) { return islandWindow && !islandWindow.isDestroyed() && event.sender === islandWindow.webContents; }
function setupIslandIpc() {
  ipcMain.on('island:expand', event => {
    if (validIslandFrame(event) && ['resting', 'update', 'result', 'command'].includes(islandState)) setIslandState('command');
  });
  ipcMain.on('island:collapse', event => {
    if (validIslandFrame(event) && ['command', 'result'].includes(islandState)) setIslandState('resting');
  });
  ipcMain.on('island:agent', (event, agent) => {
    if (!validIslandFrame(event) || !['hanex', 'shumex'].includes(agent)) return;
    mainWindow?.webContents.send('island-chat:agent', agent);
  });
  ipcMain.on('island:command', (event, payload) => {
    if (!validIslandFrame(event) || !payload || !['hanex', 'shumex'].includes(payload.agent) || typeof payload.text !== 'string' || !payload.text.trim() || payload.text.length > 10000 || typeof payload.id !== 'string' || payload.id.length > 100) return;
    if (!mainWindow || mainWindow.isDestroyed()) {
      islandWindow.webContents.send('island:chat', { phase: 'error', text: 'Chat is not ready.', id: payload.id });
      return;
    }
    mainWindow.webContents.send('island-chat:command', { agent: payload.agent, text: payload.text.trim(), id: payload.id });
  });
  ipcMain.on('island:restart-update', event => { if (validIslandSender(event) && event.senderFrame === islandWindow.webContents.mainFrame) updateController?.restart(); });
  ipcMain.on('island:open', event => { if (validIslandSender(event)) showMain(); });
  ipcMain.on('island:decision', (event, choice, id) => {
    if (!validIslandSender(event) || islandState !== 'approval' || !['approve', 'deny', 'always'].includes(choice)) return;
    if (approvals?.current()) { if (validIslandFrame(event)) approvals.decide(id, choice); }
    else if (['approve', 'deny'].includes(choice)) setIslandState('resting');
  });
  ipcMain.on('island:drag-start', event => {
    if (!validIslandSender(event)) return;
    // Ignore dragging while a state transition is resizing the window.
    if (resizeTimer) return;
    dragOrigin = { cursor: screen.getCursorScreenPoint(), bounds: islandWindow.getBounds() };
  });
  ipcMain.on('island:drag-move', event => {
    if (!validIslandSender(event) || !dragOrigin) return;
    const cursor = screen.getCursorScreenPoint();
    const x = Math.round(dragOrigin.bounds.x + cursor.x - dragOrigin.cursor.x);
    const y = Math.round(dragOrigin.bounds.y + cursor.y - dragOrigin.cursor.y);
    islandWindow.setPosition(x, y);
    islandPosition = { centerX: Math.round(x + dragOrigin.bounds.width / 2), y };
  });
  ipcMain.on('island:drag-end', event => {
    if (!validIslandSender(event) || !dragOrigin) return;
    dragOrigin = undefined;
    schedulePositionSave();
  });
}
function setupTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'tray.png'));
  if (icon.isEmpty()) throw new Error('Could not load the system tray icon.');
  tray = new Tray(icon);
  tray.setToolTip('Hanex & Shumex');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Hanex & Shumex', click: showMain },
    { label: 'Island demo states', submenu: [
      { label: 'Resting', click: () => { setIslandState('resting'); hideMain(); } },
      { label: 'Listening', click: () => { setIslandState('listening'); hideMain(); } },
      { label: 'Working', click: () => { setIslandState('working'); hideMain(); } },
      { label: 'Needs approval', click: () => { setIslandState('approval'); hideMain(); } },
    ] },
    { type: 'separator' },
    { label: 'Quit', click: () => { quitting = true; app.quit(); } },
  ]));
  tray.on('click', toggleMain);
}

async function startDesktop() {
  await app.whenReady();
  vault = createVault(safeStorage, path.join(app.getPath('userData'), 'provider-keys.json'));
  const folderSettings = createFolderSettings(path.join(app.getPath('userData'), 'allowed-folders.json'), dialog, () => mainWindow);
  approvals = createApprovals(path.join(app.getPath('userData'), 'tool-approvals.json'), request => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('tools:approval', request);
    if (islandWindow && !islandWindow.isDestroyed()) {
      islandWindow.webContents.send('island:approval', request);
      setIslandState(request ? 'approval' : 'working');
    }
  });
  const trustedChat = event => mainWindow && !mainWindow.isDestroyed() && event.sender === mainWindow.webContents && event.senderFrame === mainWindow.webContents.mainFrame && event.senderFrame.url.startsWith(`${APP_URL}/`);
  for (const [channel, action] of Object.entries({
    'keys:status': () => vault.status(),
    'keys:save': (provider, key) => vault.set(provider, key),
    'keys:remove': provider => vault.remove(provider),
    'keys:clear': () => vault.clear(),
    'keys:custom-endpoint': url => vault.setCustomEndpoint(url),
    'keys:migrate': keys => vault.migrate(keys),
  })) ipcMain.handle(channel, (event, ...args) => {
    if (!trustedChat(event)) throw new Error('Unauthorized key request.');
    return action(...args);
  });
  for (const [channel, action] of Object.entries({
    'updates:status': () => updateController.getState(),
    'updates:check': () => updateController.check(),
    'updates:restart': () => updateController.restart(),
  })) ipcMain.handle(channel, (event) => {
    if (!trustedChat(event)) throw new Error('Unauthorized update request.');
    return action();
  });
  for (const [channel, action] of Object.entries({
    'folders:list': () => folderSettings.list(),
    'folders:add': () => folderSettings.add(),
    'folders:remove': folder => { approvals.revokeFolder(folder); return folderSettings.remove(folder); },
  })) ipcMain.handle(channel, (event, ...args) => {
    if (!trustedChat(event)) throw new Error('Unauthorized folder settings request.');
    return action(...args);
  });
  ipcMain.on('tools:decision', (event, id, choice) => { if (trustedChat(event)) approvals.decide(id, choice); });
  ipcMain.handle('tools:approval-current', event => { if (!trustedChat(event)) throw new Error('Unauthorized approval request.'); return approvals.current(); });
  ipcMain.handle('island:transcribe', async (event, bytes, type) => {
    if (!validIslandFrame(event)) throw new Error('Unauthorized transcription request.');
    const mime = typeof type === 'string' ? type.split(';')[0].toLowerCase() : '';
    if (!['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/wav'].includes(mime) || !(bytes instanceof Uint8Array) || !bytes.byteLength || bytes.byteLength > 4 * 1024 * 1024) throw new Error('Invalid audio recording.');
    const response = await fetch(`${APP_URL}/api/voice/transcribe`, { method: 'POST', headers: { 'Content-Type': mime }, body: Buffer.from(bytes), signal: AbortSignal.timeout(65_000) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || typeof result.text !== 'string') throw new Error(typeof result.error === 'string' ? result.error : 'Transcription failed.');
    return result.text;
  });
  ipcMain.on('island-chat:voice-setting', (event, enabled) => {
    if (!trustedChat(event) || typeof enabled !== 'boolean') return;
    sendVoiceImmediately = enabled;
    if (islandWindow && !islandWindow.isDestroyed()) islandWindow.webContents.send('island:voice-setting', enabled);
  });
  ipcMain.on('island-chat:active-agent', (event, agent) => {
    if (!trustedChat(event) || !['hanex', 'shumex'].includes(agent)) return;
    activeIslandAgent = agent;
    if (islandWindow && !islandWindow.isDestroyed()) islandWindow.webContents.send('island:agent', agent);
  });
  ipcMain.on('island-chat:status', (event, status) => {
    if (!trustedChat(event) || !status || !['working', 'result', 'error', 'rejected'].includes(status.phase) || !['hanex', 'shumex'].includes(status.agent) || typeof status.text !== 'string' || status.text.length > 1000 || (status.id !== undefined && (typeof status.id !== 'string' || status.id.length > 100))) return;
    if (!islandWindow || islandWindow.isDestroyed()) return;
    islandWindow.webContents.send('island:chat', status);
    if (status.phase !== 'rejected' && !approvals.current()) setIslandState(status.phase === 'working' ? 'working' : 'result');
  });
  let updater = null;
  if (app.isPackaged && process.platform === 'win32') {
    try { updater = require(path.join(app.getAppPath(), 'dist-electron', 'updater.cjs')).autoUpdater; }
    catch (error) { console.error('Could not initialize updates:', error.message); }
  }
  updateController = createUpdateController({ app, updater, onChange: state => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('updates:state', state);
    if (state.status === 'ready') setIslandState('update');
  } });
  electronAutoUpdater?.on('before-quit-for-update', () => { quitting = true; });
  setupIslandIpc();
  setupIsland();
  setupTray();
  if (!globalShortcut.register('Control+Shift+Space', toggleMain)) {
    console.warn('Could not register Ctrl+Shift+Space; the shortcut may already be in use.');
  }
  const projectRoot = app.getAppPath();
  const child = utilityProcess.fork(path.join(projectRoot, 'dist-electron', 'server.cjs'), [], {
    cwd: app.isPackaged ? process.resourcesPath : projectRoot,
    serviceName: 'Hanex & Shumex server', stdio: 'pipe',
    env: { ...process.env, NODE_ENV: app.isPackaged ? 'production' : 'development', MEXAI_APP_ROOT: projectRoot, MEXAI_HOST: SERVER_HOST, MEXAI_PORT: String(SERVER_PORT), MEXAI_SECURE_KEYS: '1' },
  });
  serverProcess = child;
  const activeTools = new Map();
  const renames = createRenames({ folders:() => folderSettings.list(), approve:(request, signal) => approvals.request(request, signal), logFile:path.join(app.getPath('userData'), 'rename-undo.jsonl') });
  ipcMain.handle('tools:undo-renames', event => { if (!trustedChat(event)) throw new Error('Unauthorized undo request.'); return renames.undo(); });
  const fileTools = createFileTools({ folders: () => folderSettings.list(), logFile: path.join(app.getPath('userData'), 'tool-activity.jsonl'), nativeImage, approve: (request, signal) => approvals.request(request, signal), trash: p => shell.trashItem(p) });
  // The utility process asks the main process directly; decrypted keys never travel to the renderer.
  child.on('message', message => {
    if (message?.type === 'tool-cancel' && typeof message.id === 'string') { activeTools.get(message.id)?.abort(); return; }
    if (message?.type === 'tool-request' && typeof message.id === 'string') {
      const controller = new AbortController(); activeTools.set(message.id, controller);
      Promise.resolve().then(async () => {
        if (message.action === 'list') return folderSettings.list();
        if (message.action === 'execute-batch') return renames.run(message.call, controller.signal);
        if (message.action === 'rejected') return fileTools.rejected(message.call);
        if (message.action === 'execute' && ['view_image', 'read_file', 'list_folder', 'search_files', 'write_file', 'move_file', 'delete_file'].includes(message.call?.name)) return fileTools(message.call, controller.signal);
        throw new Error('Tool is unavailable.');
      }).then(value => child.postMessage({ type: 'tool-response', id: message.id, value }), () => child.postMessage({ type: 'tool-response', id: message.id, error: 'Tool service failed.' })).finally(() => activeTools.delete(message.id));
      return;
    }
    if (!['secure-key-request', 'secure-endpoint-request'].includes(message?.type) || typeof message.id !== 'string') return;
    try { child.postMessage({ type: 'secure-key-response', id: message.id, key: message.type === 'secure-endpoint-request' ? vault.getCustomEndpoint() : vault.getForServer(message.provider) }); }
    catch { child.postMessage({ type: 'secure-key-response', id: message.id, error: 'Secure key storage is unavailable.' }); }
  });
  child.stdout?.pipe(process.stdout, { end: false });
  child.stderr?.pipe(process.stderr, { end: false });
  child.once('exit', code => {
    for (const controller of activeTools.values()) controller.abort();
    if (serverProcess === child) serverProcess = undefined;
    if (!quitting) {
      serverExitError = new Error(`The Express server exited unexpectedly (code ${code}). Port ${SERVER_PORT} may already be in use.`);
      reportFailure(serverExitError);
    }
  });
  await waitForServer();
  if (quitting) return;
  mainWindow = new BrowserWindow({
    title: 'Hanex & Shumex', width: 1280, height: 860, minWidth: 960, minHeight: 640,
    backgroundColor: '#0b0f17', show: false, autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'chat-preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, backgroundThrottling: false },
  });
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('close', event => { if (!quitting) { event.preventDefault(); hideMain(); } });
  mainWindow.on('minimize', event => { event.preventDefault(); hideMain(); });
  mainWindow.on('closed', () => { mainWindow = null; });
  updateController.start();
  await mainWindow.loadURL(APP_URL);
}
app.on('before-quit', () => {
  quitting = true;
  clearInterval(resizeTimer);
  updateController?.stop();
  clearTimeout(saveTimer);
  savePosition();
  globalShortcut.unregisterAll();
  stopServer();
});
// The tray owns the app lifetime; closing a window must never terminate the server.
app.on('window-all-closed', () => {});
startDesktop().catch(reportFailure);
