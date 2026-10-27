const { contextBridge, ipcRenderer } = require('electron');

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
