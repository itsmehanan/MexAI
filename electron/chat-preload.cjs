const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('secureKeys', {
  status: () => ipcRenderer.invoke('keys:status'),
  save: (provider, key) => ipcRenderer.invoke('keys:save', provider, key),
  remove: provider => ipcRenderer.invoke('keys:remove', provider),
  clear: () => ipcRenderer.invoke('keys:clear'),
  migrate: keys => ipcRenderer.invoke('keys:migrate', keys),
});
