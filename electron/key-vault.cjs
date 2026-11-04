const fs = require('node:fs');
const path = require('node:path');
const PROVIDERS = ['gemini', 'openai', 'anthropic', 'openrouter'];

function createVault(safeStorage, file) {
  function check() {
    if (!safeStorage.isEncryptionAvailable() || (process.platform === 'linux' && safeStorage.getSelectedStorageBackend?.() === 'basic_text')) {
      throw new Error('Secure key storage is unavailable. Your existing keys have not been migrated.');
    }
  }
  function read() {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid key vault');
      return parsed;
    } catch (error) {
      if (error.code === 'ENOENT') return {};
      throw new Error('Could not read the encrypted key vault.');
    }
  }
  function write(data) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temp = `${file}.${process.pid}.tmp`;
    try {
      fs.writeFileSync(temp, JSON.stringify(data), { mode: 0o600 });
      fs.renameSync(temp, file);
    } finally { try { fs.unlinkSync(temp); } catch {} }
  }
  function validProvider(provider) { if (!PROVIDERS.includes(provider)) throw new Error('Invalid provider.'); }
  return {
    status() { check(); const data = read(); return Object.fromEntries(PROVIDERS.map(p => [p, typeof data[p] === 'string' && data[p].length > 0])); },
    set(provider, key) {
      check(); validProvider(provider);
      if (typeof key !== 'string' || !key.trim() || key.length > 16384) throw new Error('Enter a valid API key.');
      const data = read(); data[provider] = safeStorage.encryptString(key.trim()).toString('base64'); write(data);
      return true;
    },
    remove(provider) { check(); validProvider(provider); const data = read(); delete data[provider]; write(data); return true; },
    clear() { check(); write({}); return true; },
    migrate(keys) {
      check();
      if (!keys || typeof keys !== 'object' || Array.isArray(keys)) throw new Error('Invalid migration data.');
      const data = read();
      for (const [provider, key] of Object.entries(keys)) {
        validProvider(provider);
        if (typeof key !== 'string' || key.length > 16384) throw new Error('Invalid migration key.');
        // A retry must never overwrite a newer key already stored securely.
        if (key.trim() && !data[provider]) data[provider] = safeStorage.encryptString(key.trim()).toString('base64');
      }
      write(data);
      return Object.fromEntries(PROVIDERS.map(p => [p, Boolean(data[p])]));
    },
    getForServer(provider) {
      check(); validProvider(provider); const encrypted = read()[provider];
      return encrypted ? safeStorage.decryptString(Buffer.from(encrypted, 'base64')) : '';
    },
  };
}
module.exports = { createVault };
