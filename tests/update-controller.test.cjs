const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createUpdateController } = require('../electron/update-controller.cjs');

test('updates check in background, deduplicate, and install only on request', async () => {
  const updater = new EventEmitter();
  let checks = 0, installs = 0, finish;
  updater.checkForUpdates = () => { checks++; return new Promise(resolve => { finish = resolve; }); };
  updater.quitAndInstall = (silent, runAfter) => { assert.equal(silent, false); assert.equal(runAfter, true); installs++; };
  const seen = [];
  const ctrl = createUpdateController({ app: { getVersion: () => '1.2.3' }, updater, onChange: s => seen.push(s), intervalMs: 15 });
  assert.equal(updater.autoInstallOnAppQuit, false);
  assert.equal(updater.autoDownload, true);
  assert.equal(ctrl.restart(), false);
  ctrl.start();
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(checks, 1); // timer/manual checks coalesce
  const manual = ctrl.check();
  updater.emit('update-available', { version: '1.2.4' });
  finish(); await manual;
  assert.equal(ctrl.getState().status, 'downloading');
  updater.emit('update-downloaded', { version: '1.2.4' });
  assert.equal(ctrl.getState().status, 'ready');
  assert.equal(installs, 0);
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(checks, 1); // do not check or replace a downloaded installer
  assert.equal(ctrl.restart(), true);
  assert.equal(ctrl.restart(), false);
  assert.equal(installs, 1);
  updater.emit('error', new Error('installer failed'));
  assert.equal(ctrl.getState().status, 'ready');
  assert(ctrl.getState().restartError);
  assert.equal(ctrl.restart(), true);
  assert.equal(installs, 2);
  assert(seen.some(s => s.status === 'ready'));
  ctrl.stop();
});

test('unavailable and failed checks do not install', async () => {
  const app = { getVersion: () => '0.1.0' };
  const unavailable = createUpdateController({ app, updater: null, onChange: () => {} });
  unavailable.start();
  assert.equal((await unavailable.check()).status, 'unavailable');
  assert.equal(unavailable.restart(), false);
  const updater = new EventEmitter();
  updater.checkForUpdates = async () => { throw new Error('offline'); };
  updater.quitAndInstall = () => { throw new Error('should not install'); };
  const ctrl = createUpdateController({ app, updater, onChange: () => {} });
  assert.equal((await ctrl.check()).status, 'error');
  assert.equal(ctrl.restart(), false);
  ctrl.stop();
});
