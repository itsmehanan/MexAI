const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('secureKeys', {
  status: () => ipcRenderer.invoke('keys:status'),
  save: (provider, key) => ipcRenderer.invoke('keys:save', provider, key),
  remove: provider => ipcRenderer.invoke('keys:remove', provider),
  clear: () => ipcRenderer.invoke('keys:clear'),
  setCustomEndpoint: url => ipcRenderer.invoke('keys:custom-endpoint', url),
  migrate: keys => ipcRenderer.invoke('keys:migrate', keys),
});

contextBridge.exposeInMainWorld('desktopUpdates', {
  status: () => ipcRenderer.invoke('updates:status'),
  check: () => ipcRenderer.invoke('updates:check'),
  restart: () => ipcRenderer.invoke('updates:restart'),
  onState: callback => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('updates:state', listener);
    return () => ipcRenderer.removeListener('updates:state', listener);
  },
});

contextBridge.exposeInMainWorld('folderSettings', {
  list: () => ipcRenderer.invoke('folders:list'),
  add: () => ipcRenderer.invoke('folders:add'),
  remove: folder => ipcRenderer.invoke('folders:remove', folder),
});
