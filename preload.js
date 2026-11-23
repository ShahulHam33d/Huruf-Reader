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
  },
  setAnnotationMode: (mode) => {
    ipcRenderer.send('tab-set-annotation-mode', mode);
  },
  onSetAnnotationMode: (callback) => {
    ipcRenderer.on('set-annotation-mode', (event, mode) => callback(mode));
  },
  onRequestCommit: (callback) => {
    ipcRenderer.on('request-commit-annotations', async (event, replyChannel) => {
      if (typeof callback === 'function') {
        try {
          await callback();
        } catch (e) {
          console.error('Error in commit-annotations callback:', e);
        }
      }
      if (replyChannel) {
        ipcRenderer.send(replyChannel);
      }
    });
  },
  pickImageStamp: () => {
    return ipcRenderer.invoke('pick-image-stamp');
  },
  reportStampError: (data) => {
    ipcRenderer.send('report-stamp-error', data);
  },
  undo: () => {
    ipcRenderer.send('tab-undo');
  },
  redo: () => {
    ipcRenderer.send('tab-redo');
  },
  onUndo: (callback) => {
    ipcRenderer.on('tab-do-undo', () => callback());
  },
  onRedo: (callback) => {
    ipcRenderer.on('tab-do-redo', () => callback());
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
