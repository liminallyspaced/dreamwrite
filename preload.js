const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('scriptdesk', {
  openProject: () => ipcRenderer.invoke('dialog:openProject'),
  openProjectFolder: () => ipcRenderer.invoke('dialog:openProjectFolder'),
  saveProject: (payload) => ipcRenderer.invoke('dialog:saveProject', payload),
  importFountain: () => ipcRenderer.invoke('dialog:importFountain'),
  importImage: () => ipcRenderer.invoke('dialog:importImage'),
  exportText: (payload) => ipcRenderer.invoke('dialog:exportText', payload),
  exportPdf: (payload) => ipcRenderer.invoke('export:pdf', payload),
  readText: (filePath) => ipcRenderer.invoke('fs:readText', filePath),
  writeText: (payload) => ipcRenderer.invoke('fs:writeText', payload),
  importAsset: (payload) => ipcRenderer.invoke('asset:import', payload),
  readAsset: (payload) => ipcRenderer.invoke('asset:read', payload),
  setProjectRoot: (payload) => ipcRenderer.invoke('project:setRoot', payload),
  getProjectRoot: () => ipcRenderer.invoke('project:getRoot'),
  getPaths: () => ipcRenderer.invoke('app:getPaths'),
  showItem: (filePath) => ipcRenderer.invoke('shell:showItem', filePath),
  onMenu: (handler) => {
    const channels = [
      'menu:new',
      'menu:open',
      'menu:openFolder',
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
      'menu:paper',
      'menu:help',
    ];
    channels.forEach((ch) => {
      ipcRenderer.on(ch, (_e, payload) => handler(ch, payload));
    });
  },
});
