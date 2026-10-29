const { contextBridge, ipcRenderer } = require('electron');

// API for Main Window (Tab bar and empty state)
contextBridge.exposeInMainWorld('tabBarAPI', {
  switchTab: (tabId) => ipcRenderer.send('tab-switch', tabId),
  closeTab: (tabId) => ipcRenderer.send('tab-close', tabId),
  openFileDialog: () => ipcRenderer.send('tab-open-dialog'),
  onTabsUpdated: (callback) => {
    ipcRenderer.on('tabs-updated', (event, data) => callback(data));
  },
  onThemeUpdated: (callback) => {
    ipcRenderer.on('theme-updated', (event, data) => callback(data));
  }
});

// API for Document Viewer (inside each tab's WebContentsView)
contextBridge.exposeInMainWorld('viewerAPI', {
  onLoadDocument: (callback) => {
    ipcRenderer.on('load-document', (event, data) => callback(data));
  },
  setModified: (isModified) => {
    ipcRenderer.send('tab-set-modified', isModified);
  },
  closeCurrentTab: () => {
    ipcRenderer.send('tab-request-close');
  },
  savePDFBytes: (bytes) => {
    return ipcRenderer.invoke('save-pdf-bytes', bytes);
  },
  onRequestSave: (callback) => {
    ipcRenderer.on('request-save-pdf', () => callback());
  },
  onThemeUpdated: (callback) => {
    ipcRenderer.on('theme-updated', (event, data) => callback(data));
  }
});

// Legacy API retained for Phase 0 compatibility
contextBridge.exposeInMainWorld('hurufAPI', {
  onOpenPDF: (callback) => {
    ipcRenderer.on('open-pdf', (event, data) => callback(data));
  },
  onRequestSave: (callback) => {
    ipcRenderer.on('request-save-pdf', () => callback());
  },
  savePDFBytes: (bytes) => {
    return ipcRenderer.invoke('save-pdf-bytes', bytes);
  },
  openFileDialog: () => {
    return ipcRenderer.invoke('dialog-open-file');
  }
});
