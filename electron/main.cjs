const { app, BrowserWindow, dialog, utilityProcess, Tray, Menu, nativeImage, globalShortcut, screen, ipcMain, safeStorage } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { createVault } = require('./key-vault.cjs');
const { setTimeout: delay } = require('node:timers/promises');

const SERVER_PORT = 3737;
const SERVER_HOST = '127.0.0.1';
const APP_URL = `http://${SERVER_HOST}:${SERVER_PORT}`;
const ISLAND_SIZES = { resting: [132, 40], listening: [260, 44], working: [380, 52], approval: [440, 72] };
let serverProcess, serverExitError, mainWindow, islandWindow, tray;
let quitting = false;
let failureReported = false;
let islandState = 'resting';
let islandPosition;
let resizeTimer, saveTimer, dragOrigin, vault;

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
  mainWindow.hide();
  showIsland();
}
function showMain() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  islandWindow?.hide();
}
function toggleMain() {
  if (mainWindow?.isVisible() && !mainWindow.isMinimized()) hideMain();
  else showMain();
}

function setIslandState(state) {
  if (!Object.hasOwn(ISLAND_SIZES, state) || !islandWindow || islandWindow.isDestroyed()) return;
  islandState = state;
  islandWindow.webContents.send('island:state', state);
  clearInterval(resizeTimer);
  const start = islandWindow.getBounds();
  const [width, height] = ISLAND_SIZES[state];
  // Keep the pill centered on its current location while its native window resizes.
  const centerX = start.x + start.width / 2;
  const started = Date.now();
  resizeTimer = setInterval(() => {
    if (!islandWindow || islandWindow.isDestroyed()) { clearInterval(resizeTimer); resizeTimer = undefined; return; }
    const t = Math.min((Date.now() - started) / 220, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    const w = Math.round(start.width + (width - start.width) * eased);
    const h = Math.round(start.height + (height - start.height) * eased);
    islandWindow.setBounds({ x: Math.round(centerX - w / 2), y: start.y, width: w, height: h });
    if (t === 1) {
      clearInterval(resizeTimer);
      resizeTimer = undefined;
      islandPosition = { centerX: Math.round(centerX), y: start.y };
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
  islandWindow.webContents.on('did-finish-load', () => islandWindow.webContents.send('island:state', islandState));
}
function validIslandSender(event) { return islandWindow && !islandWindow.isDestroyed() && event.sender === islandWindow.webContents; }
function setupIslandIpc() {
  ipcMain.on('island:open', event => { if (validIslandSender(event)) showMain(); });
  ipcMain.on('island:decision', (event, choice) => {
    if (!validIslandSender(event) || islandState !== 'approval' || !['approve', 'deny'].includes(choice)) return;
    // Demo only: no real task or authorization is connected yet.
    setIslandState('resting');
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
  const trustedChat = event => mainWindow && !mainWindow.isDestroyed() && event.sender === mainWindow.webContents && event.senderFrame === mainWindow.webContents.mainFrame && event.senderFrame.url.startsWith(`${APP_URL}/`);
  for (const [channel, action] of Object.entries({
    'keys:status': () => vault.status(),
    'keys:save': (provider, key) => vault.set(provider, key),
    'keys:remove': provider => vault.remove(provider),
    'keys:clear': () => vault.clear(),
    'keys:migrate': keys => vault.migrate(keys),
  })) ipcMain.handle(channel, (event, ...args) => {
    if (!trustedChat(event)) throw new Error('Unauthorized key request.');
    return action(...args);
  });
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
  // The utility process asks the main process directly; decrypted keys never travel to the renderer.
  child.on('message', message => {
    if (message?.type !== 'secure-key-request' || typeof message.id !== 'string') return;
    try { child.postMessage({ type: 'secure-key-response', id: message.id, key: vault.getForServer(message.provider) }); }
    catch { child.postMessage({ type: 'secure-key-response', id: message.id, error: 'Secure key storage is unavailable.' }); }
  });
  child.stdout?.pipe(process.stdout, { end: false });
  child.stderr?.pipe(process.stderr, { end: false });
  child.once('exit', code => {
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
    webPreferences: { preload: path.join(__dirname, 'chat-preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true },
  });
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('close', event => { if (!quitting) { event.preventDefault(); hideMain(); } });
  mainWindow.on('minimize', event => { event.preventDefault(); hideMain(); });
  mainWindow.on('closed', () => { mainWindow = null; });
  await mainWindow.loadURL(APP_URL);
}
app.on('before-quit', () => {
  quitting = true;
  clearInterval(resizeTimer);
  clearTimeout(saveTimer);
  savePosition();
  globalShortcut.unregisterAll();
  stopServer();
});
// The tray owns the app lifetime; closing a window must never terminate the server.
app.on('window-all-closed', () => {});
startDesktop().catch(reportFailure);
