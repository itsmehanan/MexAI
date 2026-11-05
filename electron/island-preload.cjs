const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('island', {
  onState: callback => ipcRenderer.on('island:state', (_event, state) => callback(state)),
  onChat: callback => ipcRenderer.on('island:chat', (_event, status) => callback(status)),
  onAgent: callback => ipcRenderer.on('island:agent', (_event, agent) => callback(agent)),
  expand: () => ipcRenderer.send('island:expand'),
  collapse: () => ipcRenderer.send('island:collapse'),
  selectAgent: agent => ipcRenderer.send('island:agent', agent),
  command: payload => ipcRenderer.send('island:command', payload),
  open: () => ipcRenderer.send('island:open'),
  restartUpdate: () => ipcRenderer.send('island:restart-update'),
  decision: choice => ipcRenderer.send('island:decision', choice),
  dragStart: () => ipcRenderer.send('island:drag-start'),
  dragMove: () => ipcRenderer.send('island:drag-move'),
  dragEnd: () => ipcRenderer.send('island:drag-end'),
});
