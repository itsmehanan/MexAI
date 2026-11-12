const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createVault } = require('../electron/key-vault.cjs');

test('vault encrypts, migrates idempotently, masks status, and fails closed', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mexai-vault-'));
  try {
    let available = true;
    const safeStorage = { isEncryptionAvailable: () => available, getSelectedStorageBackend: () => 'gnome_libsecret', encryptString: s => Buffer.from(s.split('').reverse().join('')), decryptString: b => b.toString().split('').reverse().join('') };
    const file = path.join(dir, 'keys.json');
    const vault = createVault(safeStorage, file);
    assert.equal(vault.status().gemini, false);
    assert.equal(vault.migrate({ gemini: 'original-secret', openai: 'openai-secret' }).gemini, true);
    assert(!fs.readFileSync(file, 'utf8').includes('original-secret'));
    assert.equal(vault.getForServer('gemini'), 'original-secret');
    assert.deepEqual(vault.status(), { gemini: true, openai: true, anthropic: false, openrouter: false, custom: false });
    vault.set('gemini', 'replacement');
    vault.migrate({ gemini: 'stale-legacy' });
    assert.equal(vault.getForServer('gemini'), 'replacement');
    assert.throws(() => vault.set('invalid', 'secret'));
    assert.throws(() => vault.migrate({ openai: 4 }));
    available = false;
    assert.throws(() => vault.set('gemini', 'bad'));
    assert.throws(() => vault.status());
    available = true;
    assert.equal(vault.getForServer('gemini'), 'replacement');
    assert.throws(() => vault.setCustomEndpoint('http://example.com/v1'));
    assert.throws(() => vault.setCustomEndpoint('https://user:pass@example.com/v1'));
    assert.equal(vault.setCustomEndpoint('https://example.com/v1/'), 'https://example.com/v1');
    vault.set('custom', 'custom-secret');
    assert.equal(vault.getCustomEndpoint(), 'https://example.com/v1');
    assert.equal(vault.getForServer('custom'), 'custom-secret');
    vault.remove('gemini');
    assert.equal(vault.getForServer('gemini'), '');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
