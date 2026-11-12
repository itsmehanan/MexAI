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

contextBridge.exposeInMainWorld('islandChat', {
  onHidden: callback => {
    const listener = () => callback();
    ipcRenderer.on('island-chat:hidden', listener);
    return () => ipcRenderer.removeListener('island-chat:hidden', listener);
  },
  onCommand: callback => {
    const listener = (_event, command) => callback(command);
    ipcRenderer.on('island-chat:command', listener);
    return () => ipcRenderer.removeListener('island-chat:command', listener);
  },
  onAgent: callback => {
    const listener = (_event, agent) => callback(agent);
    ipcRenderer.on('island-chat:agent', listener);
    return () => ipcRenderer.removeListener('island-chat:agent', listener);
  },
  voiceSetting: enabled => ipcRenderer.send('island-chat:voice-setting', enabled),
  activeAgent: agent => ipcRenderer.send('island-chat:active-agent', agent),
  status: status => ipcRenderer.send('island-chat:status', status),
});

contextBridge.exposeInMainWorld('toolApprovals', {
  current: () => ipcRenderer.invoke('tools:approval-current'),
  undoRenames: () => ipcRenderer.invoke('tools:undo-renames'),
  onApproval: callback => { const listener = (_event, request) => callback(request); ipcRenderer.on('tools:approval', listener); return () => ipcRenderer.removeListener('tools:approval', listener); },
  decide: (id, choice) => ipcRenderer.send('tools:decision', id, choice),
});

contextBridge.exposeInMainWorld('browserControl', {
  open: () => ipcRenderer.invoke('browser:open-manual'),
  enable: () => ipcRenderer.invoke('browser:enable'),
  stop: () => ipcRenderer.invoke('browser:stop'),
  onStop: callback => { const listener = () => callback(); ipcRenderer.on('browser:stop-request',listener); return () => ipcRenderer.removeListener('browser:stop-request',listener); },
});
