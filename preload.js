const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('scriptdesk', {
  openProject: () => ipcRenderer.invoke('dialog:openProject'),
  saveProject: (payload) => ipcRenderer.invoke('dialog:saveProject', payload),
  importFountain: () => ipcRenderer.invoke('dialog:importFountain'),
  exportText: (payload) => ipcRenderer.invoke('dialog:exportText', payload),
  exportPdf: (payload) => ipcRenderer.invoke('export:pdf', payload),
  readText: (filePath) => ipcRenderer.invoke('fs:readText', filePath),
  writeText: (payload) => ipcRenderer.invoke('fs:writeText', payload),
  getPaths: () => ipcRenderer.invoke('app:getPaths'),
  showItem: (filePath) => ipcRenderer.invoke('shell:showItem', filePath),
  onMenu: (handler) => {
    const channels = [
      'menu:new',
      'menu:open',
      'menu:save',
      'menu:saveAs',
      'menu:importFountain',
      'menu:exportFountain',
      'menu:exportPdf',
      'menu:find',
      'menu:undo',
      'menu:redo',
      'menu:element',
      'menu:cycle',
      'menu:view',
      'menu:theme',
      'menu:focus',
      'menu:typewriter',
      'menu:paper',
      'menu:help',
    ];
    channels.forEach((ch) => {
      ipcRenderer.on(ch, (_e, payload) => handler(ch, payload));
    });
  },
});
