const { app, BrowserWindow, dialog, utilityProcess } = require('electron');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');

// A stable origin keeps the existing localStorage chat history and settings between launches.
const SERVER_PORT = 3737;
const SERVER_HOST = '127.0.0.1';
const APP_URL = `http://${SERVER_HOST}:${SERVER_PORT}`;
let serverProcess;
let serverExitError;
let mainWindow;
let quitting = false;
let failureReported = false;

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
  app.quit();
}

async function waitForServer() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (quitting) throw new Error('The app was closed during startup.');
    if (serverExitError) throw serverExitError;
    try {
      const response = await fetch(`${APP_URL}/api/status`, {
        signal: AbortSignal.timeout(1000),
      });
      if (response.ok) return;
    } catch {
      // The server may not have bound its port yet.
    }
    await delay(100);
  }
  throw new Error(`The Express server did not become ready at ${APP_URL} within 30 seconds.`);
}

async function startDesktop() {
  await app.whenReady();
  const projectRoot = app.getAppPath();
  const child = utilityProcess.fork(path.join(projectRoot, 'dist-electron', 'server.cjs'), [], {
    // An ASAR archive is not a real directory and cannot be a process's cwd.
    cwd: app.isPackaged ? process.resourcesPath : projectRoot,
    serviceName: 'Hanex & Shumex server',
    stdio: 'pipe',
    env: {
      ...process.env,
      NODE_ENV: app.isPackaged ? 'production' : 'development',
      MEXAI_APP_ROOT: projectRoot,
      MEXAI_HOST: SERVER_HOST,
      MEXAI_PORT: String(SERVER_PORT),
    },
  });
  serverProcess = child;
  child.stdout?.pipe(process.stdout, { end: false });
  child.stderr?.pipe(process.stderr, { end: false });
  child.once('exit', (code) => {
    if (serverProcess === child) serverProcess = undefined;
    if (!quitting) {
      serverExitError = new Error(`The Express server exited unexpectedly (code ${code}). Port ${SERVER_PORT} may already be in use.`);
      reportFailure(serverExitError);
    }
  });

  // Never show the chat until the existing API and UI server are ready.
  await waitForServer();
  if (quitting) return;

  mainWindow = new BrowserWindow({
    title: 'Hanex & Shumex',
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#0b0f17',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  await mainWindow.loadURL(APP_URL);
}

app.on('before-quit', () => {
  quitting = true;
  stopServer();
});
app.on('window-all-closed', () => app.quit());

startDesktop().catch(reportFailure);
