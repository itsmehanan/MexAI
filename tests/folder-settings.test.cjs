const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createFolderSettings } = require('../electron/folder-settings.cjs');

test('folder selection defaults to none, persists, removes, and rejects malformed settings', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mexai-folders-'));
  try {
    const file = path.join(root, 'settings.json');
    const folder = path.join(root, 'chosen'); fs.mkdirSync(folder);
    let choice = { canceled: true, filePaths: [] };
    const controller = createFolderSettings(file, { showOpenDialog: async () => choice }, () => ({}));
    assert.deepEqual(controller.list(), []);
    assert.deepEqual(await controller.add(), []);
    choice = { canceled: false, filePaths: [folder] };
    assert.deepEqual(await controller.add(), [fs.realpathSync(folder)]);
    assert.deepEqual(await controller.add(), [fs.realpathSync(folder)]);
    assert.deepEqual(createFolderSettings(file, {}, () => ({})).list(), [fs.realpathSync(folder)]);
    assert.throws(() => controller.remove('not selected'));
    assert.deepEqual(controller.remove(fs.realpathSync(folder)), []);
    fs.writeFileSync(file, '{"folders":["relative"]}');
    assert.throws(() => controller.list(), /Invalid/);
    await assert.rejects(() => controller.add());
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
