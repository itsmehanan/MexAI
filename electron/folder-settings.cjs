const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

// Configuration only: this module does not grant file access to the agent.
function createFolderSettings(file, dialog, getWindow) {
  function read() {
    let raw;
    try { raw = fs.readFileSync(file, 'utf8'); }
    catch (error) { if (error.code === 'ENOENT') return []; throw error; }
    const data = JSON.parse(raw);
    if (!Array.isArray(data.folders) || data.folders.some(p => typeof p !== 'string' || !path.isAbsolute(p) || p.includes('\0'))) throw new Error('Invalid folder settings.');
    return [...new Set(data.folders)];
  }
  function write(folders) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temp = `${file}.${randomUUID()}.tmp`;
    try {
      fs.writeFileSync(temp, JSON.stringify({ folders }), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      fs.renameSync(temp, file);
    } finally { try { fs.unlinkSync(temp); } catch (e) { if (e.code !== 'ENOENT') throw e; } }
  }
  return {
    list: read,
    async add() {
      const selected = await dialog.showOpenDialog(getWindow(), { title: 'Choose an allowed folder', properties: ['openDirectory'] });
      if (selected.canceled || !selected.filePaths.length) return read();
      const folder = fs.realpathSync(selected.filePaths[0]);
      if (!fs.statSync(folder).isDirectory()) throw new Error('Select a folder.');
      const folders = read();
      if (!folders.includes(folder)) { folders.push(folder); write(folders); }
      return folders;
    },
    remove(folder) {
      if (typeof folder !== 'string') throw new Error('Invalid folder.');
      const folders = read();
      if (!folders.includes(folder)) throw new Error('Folder not found.');
      const result = folders.filter(item => item !== folder);
      write(result);
      return result;
    },
  };
}
module.exports = { createFolderSettings };
