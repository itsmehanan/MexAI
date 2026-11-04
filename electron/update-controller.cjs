// Isolated from the windows and renderer so update policy can be tested without Electron.
function createUpdateController({ app, updater, onChange, intervalMs = 4 * 60 * 60 * 1000 }) {
  let state = { version: app.getVersion(), status: updater ? 'idle' : 'unavailable' };
  let checking = null;
  let timer;
  let restartRequested = false;
  const snapshot = () => ({ ...state });
  const publish = (patch) => { state = { ...state, ...patch }; onChange(snapshot()); };
  if (updater) {
    updater.autoDownload = true;
    // Closing from the tray must never install an update without an explicit restart.
    updater.autoInstallOnAppQuit = false;
    updater.autoRunAppAfterInstall = true;
    updater.on('checking-for-update', () => { if (state.status !== 'ready') publish({ status: 'checking' }); });
    updater.on('update-available', info => { if (state.status !== 'ready') publish({ status: 'downloading', availableVersion: info.version }); });
    updater.on('update-not-available', () => { if (state.status !== 'ready') publish({ status: 'not-available' }); });
    updater.on('update-downloaded', info => publish({ status: 'ready', availableVersion: info.version }));
    updater.on('error', () => {
      if (state.status === 'ready') { restartRequested = false; publish({ restartError: 'Could not launch the installer. Please try again.' }); }
      else publish({ status: 'error' });
    });
  }
  async function check() {
    if (!updater || state.status === 'ready' || state.status === 'downloading') return snapshot();
    if (checking) { await checking; return snapshot(); }
    // Set before calling the updater so a synchronous exception is visible too.
    publish({ status: 'checking' });
    checking = Promise.resolve().then(() => updater.checkForUpdates()).then(result => {
      if (state.status === 'checking') publish({ status: result == null ? 'unavailable' : 'not-available' });
    }).catch(() => {
      if (state.status !== 'ready') publish({ status: 'error' });
    }).finally(() => { checking = null; });
    await checking;
    return snapshot();
  }
  function start() {
    if (!updater) return;
    void check();
    timer = setInterval(() => { void check(); }, intervalMs);
    timer.unref?.();
  }
  function restart() {
    if (!updater || state.status !== 'ready' || restartRequested) return false;
    restartRequested = true;
    publish({ restartError: undefined });
    try { updater.quitAndInstall(false, true); return true; }
    catch { restartRequested = false; publish({ status: 'ready', restartError: 'Could not launch the installer. Please try again.' }); return false; }
  }
  return { getState: snapshot, check, start, restart, stop: () => clearInterval(timer) };
}
module.exports = { createUpdateController };
