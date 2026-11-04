const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('island', {
  onState: callback => ipcRenderer.on('island:state', (_event, state) => callback(state)),
  open: () => ipcRenderer.send('island:open'),
  restartUpdate: () => ipcRenderer.send('island:restart-update'),
  decision: choice => ipcRenderer.send('island:decision', choice),
  dragStart: () => ipcRenderer.send('island:drag-start'),
  dragMove: () => ipcRenderer.send('island:drag-move'),
  dragEnd: () => ipcRenderer.send('island:drag-end'),
});
