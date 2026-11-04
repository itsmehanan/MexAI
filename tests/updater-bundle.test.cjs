const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('packaged updater bundle loads without node_modules', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mexai-updater-'));
  const bundle = path.join(dir, 'updater.cjs');
  fs.copyFileSync(path.join(__dirname, '../dist-electron/updater.cjs'), bundle);
  const original = Module._load;
  Module._load = function(request, parent, ...rest) {
    if (request === 'electron') return { app: {}, autoUpdater: {}, net: {}, session: {} };
    if (parent?.filename === bundle && !Module.builtinModules.includes(request)) throw new Error(`Unbundled dependency: ${request}`);
    return original.call(this, request, parent, ...rest);
  };
  try {
    const { NsisUpdater } = require(bundle);
    const updater = new NsisUpdater(undefined, { version: '1.2.3' });
    assert.equal(updater.currentVersion.version, '1.2.3');
    assert.equal(typeof updater.checkForUpdates, 'function');
  } finally {
    Module._load = original;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
