const { app, BrowserWindow, WebContentsView, Menu, dialog, ipcMain, session } = require('electron');
const path = require('path');
const fs = require('fs');
const commands = require('./commands');

const TAB_BAR_HEIGHT = 40;
let mainWindow = null;

// Tab state: [ { id, filePath, fileName, view, modified } ]
let tabs = [];
let activeTabId = null;

// Settings persistence
const settingsPath = path.join(app.getPath('userData'), 'settings.json');
let settings = loadSettings();

// Recovery storage
const recoveryDir = path.join(app.getPath('userData'), 'recovery');

function safeWriteRecoveryFile(tab, bytes) {
  if (!fs.existsSync(recoveryDir)) {
    fs.mkdirSync(recoveryDir, { recursive: true });
  }
  if (!tab.recoveryId) {
    tab.recoveryId = `rec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }
  const baseName = tab.recoveryId;
  const pdfPath = path.join(recoveryDir, `${baseName}.pdf`);
  const tmpPdfPath = path.join(recoveryDir, `${baseName}.tmp.pdf`);
  const jsonPath = path.join(recoveryDir, `${baseName}.json`);
  const tmpJsonPath = path.join(recoveryDir, `${baseName}.tmp.json`);

  const buffer = Buffer.from(bytes);
  fs.writeFileSync(tmpPdfPath, buffer);
  if (fs.existsSync(pdfPath)) {
    try { fs.unlinkSync(pdfPath); } catch (_) {}
  }
  fs.renameSync(tmpPdfPath, pdfPath);

  const cleanOriginalName = tab.fileName.startsWith('(recovered) ')
    ? tab.fileName.slice(12)
    : tab.fileName;

  const meta = {
    originalFilePath: tab.filePath || '',
    originalFileName: cleanOriginalName,
    timestamp: new Date().toISOString()
  };

  fs.writeFileSync(tmpJsonPath, JSON.stringify(meta, null, 2), 'utf8');
  if (fs.existsSync(jsonPath)) {
    try { fs.unlinkSync(jsonPath); } catch (_) {}
  }
  fs.renameSync(tmpJsonPath, jsonPath);
}

function deleteRecoveryPair(baseName) {
  if (!baseName) return;
  const files = [
    path.join(recoveryDir, `${baseName}.pdf`),
    path.join(recoveryDir, `${baseName}.json`),
    path.join(recoveryDir, `${baseName}.tmp.pdf`),
    path.join(recoveryDir, `${baseName}.tmp.json`)
  ];
  for (const f of files) {
    try {
      if (fs.existsSync(f)) {
        fs.unlinkSync(f);
      }
    } catch (err) {
      console.error(`Error deleting recovery file "${f}":`, err);
    }
  }
}

function cleanupTabRecovery(tab) {
  if (!tab || !tab.recoveryId) return;
  deleteRecoveryPair(tab.recoveryId);
  tab.recoveryId = null;
}

function cleanupOldRecoveryFiles() {
  if (!fs.existsSync(recoveryDir)) return;
  const now = Date.now();
  const maxAgeMs = 14 * 24 * 60 * 60 * 1000; // 14 days
  try {
    const files = fs.readdirSync(recoveryDir);
    for (const file of files) {
      const fullPath = path.join(recoveryDir, file);
      try {
        const stats = fs.statSync(fullPath);
        if (now - stats.mtimeMs > maxAgeMs) {
          fs.unlinkSync(fullPath);
        }
      } catch (_) {}
    }
  } catch (err) {
    console.error('Error cleaning up old recovery files:', err);
  }
}

async function openRecoveryFile(candidate) {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  const recoveryPdfPath = candidate.pdfPath;
  const cleanOriginalName = candidate.meta.originalFileName || path.basename(candidate.meta.originalFilePath || recoveryPdfPath);
  const fileName = `(recovered) ${cleanOriginalName}`;
  const originalFilePath = candidate.meta.originalFilePath || recoveryPdfPath;

  // 1. Read file buffer
  let fileBuffer;
  try {
    const stat = fs.statSync(recoveryPdfPath);
    if (!stat.isFile()) {
      throw new Error('Target is not a regular file');
    }
    fileBuffer = fs.readFileSync(recoveryPdfPath);
  } catch (err) {
    console.error(`Technical error reading recovery file "${recoveryPdfPath}":`, err);
    dialog.showErrorBox(
      'Corrupted Recovery File',
      `HurufReader cannot open recovered file "${fileName}".\n\nThe recovery file could not be read.`
    );
    return;
  }

  // 2. Junk byte trim
  const headerIndex = fileBuffer.subarray(0, 1024).indexOf('%PDF-');
  if (headerIndex > 0) {
    fileBuffer = fileBuffer.subarray(headerIndex);
  } else if (headerIndex === -1) {
    console.error(`Corrupted recovery PDF: Missing %PDF- header in "${recoveryPdfPath}"`);
    dialog.showErrorBox(
      'Corrupted Recovery File',
      `HurufReader cannot open recovered file "${fileName}".\n\nThe recovery file appears to be corrupted or is not a valid PDF document.`
    );
    return;
  }

  // 3. Validate with PDF.js probe
  try {
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const probeTask = pdfjsLib.getDocument({
      data: new Uint8Array(fileBuffer),
      isEvalSupported: false
    });
    await probeTask.promise;
  } catch (err) {
    if (err.name !== 'PasswordException') {
      console.error(`Technical error validating recovery PDF "${recoveryPdfPath}":`, err);
      dialog.showErrorBox(
        'Corrupted Recovery File',
        `HurufReader cannot open recovered file "${fileName}".\n\nThe recovery file appears to be corrupted and cannot be read.`
      );
      return;
    }
  }

  // 4. Create WebContentsView for the tab
  const tabId = 'tab_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);

  const tabView = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      navigateOnDragDrop: false
    }
  });

  tabView.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  tabView.webContents.on('will-navigate', (e) => e.preventDefault());

  tabView.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown') {
      if (input.control && input.key === 'Tab') {
        event.preventDefault();
        if (input.shift) switchPrevTab();
        else switchNextTab();
      } else if (input.control && input.key.toLowerCase() === 'w') {
        event.preventDefault();
        commands.closeTab();
      } else if (input.control && input.key.toLowerCase() === 'o') {
        event.preventDefault();
        commands.openFile();
      } else if (input.control && input.shift && input.key.toLowerCase() === 'd') {
        event.preventDefault();
        commands.setDarkMode();
      } else if (input.control && input.shift && input.key.toLowerCase() === 's') {
        event.preventDefault();
        commands.saveAs();
      }
    }
  });

  const tabObj = {
    id: tabId,
    filePath: originalFilePath,
    fileName,
    view: tabView,
    unsavedChanges: true,
    modified: true, // Marked with unsaved-change dot
    recoveryId: candidate.id,
    annotationMode: 0
  };

  tabs.push(tabObj);

  tabView.webContents.loadFile('viewer.html');

  tabView.webContents.on('did-finish-load', () => {
    tabView.webContents.send('load-document', {
      tabId,
      filePath: originalFilePath,
      fileName,
      buffer: fileBuffer,
      theme: {
        darkMode: settings.darkMode,
        invertColors: settings.invertColors
      },
      hasUnsavedChanges: true
    });
  });

  switchTab(tabId);
}

async function checkRecoveryOnStartup() {
  cleanupOldRecoveryFiles();

  if (!fs.existsSync(recoveryDir)) return;

  let files = [];
  try {
    files = fs.readdirSync(recoveryDir);
  } catch (err) {
    console.error('Error reading recovery dir:', err);
    return;
  }

  const jsonFiles = files.filter(f => f.endsWith('.json') && !f.endsWith('.tmp.json'));
  const candidates = [];

  for (const jf of jsonFiles) {
    const id = path.basename(jf, '.json');
    const pdfName = `${id}.pdf`;
    if (files.includes(pdfName)) {
      const jsonPath = path.join(recoveryDir, jf);
      const pdfPath = path.join(recoveryDir, pdfName);
      try {
        const metaStr = fs.readFileSync(jsonPath, 'utf8');
        const meta = JSON.parse(metaStr);
        candidates.push({ id, pdfPath, jsonPath, meta });
      } catch (err) {
        console.error(`Invalid recovery metadata in ${jf}:`, err);
      }
    }
  }

  if (candidates.length === 0) return;

  const choice = dialog.showMessageBoxSync(mainWindow, {
    type: 'question',
    buttons: ['Restore', 'Discard', 'Ask Me Later'],
    defaultId: 0,
    cancelId: 2,
    title: 'HurufReader',
    message: 'Restore unsaved documents? HurufReader closed unexpectedly.',
    detail: `${candidates.length} unsaved document${candidates.length > 1 ? 's' : ''} found.`
  });

  if (choice === 0) {
    // Restore
    for (const c of candidates) {
      await openRecoveryFile(c);
    }
  } else if (choice === 1) {
    // Discard
    for (const c of candidates) {
      deleteRecoveryPair(c.id);
    }
  } else {
    // Ask Me Later: keep files on disk
  }
}

function loadSettings() {
  try {
    if (fs.existsSync(settingsPath)) {
      const data = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      return {
        darkMode: Boolean(data.darkMode),
        invertColors: Boolean(data.invertColors)
      };
    }
  } catch (err) {
    console.error('Error loading settings:', err);
  }
  return { darkMode: false, invertColors: false };
}

function saveSettings() {
  try {
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving settings:', err);
  }
}

function broadcastTheme() {
  const themePayload = {
    darkMode: settings.darkMode,
    invertColors: settings.invertColors
  };

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('theme-updated', themePayload);
  }

  for (const tab of tabs) {
    if (tab.view && !tab.view.webContents.isDestroyed()) {
      tab.view.webContents.send('theme-updated', themePayload);
    }
  }
}

function getTabBounds() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return { x: 0, y: TAB_BAR_HEIGHT, width: 0, height: 0 };
  }
  const [width, height] = mainWindow.getContentSize();
  return {
    x: 0,
    y: TAB_BAR_HEIGHT,
    width: Math.max(0, width),
    height: Math.max(0, height - TAB_BAR_HEIGHT)
  };
}

function updateActiveTabBounds() {
  if (!activeTabId) return;
  const currentTab = tabs.find(t => t.id === activeTabId);
  if (currentTab && currentTab.view) {
    currentTab.view.setBounds(getTabBounds());
  }
}

function sendTabsState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const summary = tabs.map(t => ({
    id: t.id,
    fileName: t.fileName,
    filePath: t.filePath,
    modified: Boolean(t.unsavedChanges || t.modified),
    unsavedChanges: Boolean(t.unsavedChanges || t.modified)
  }));
  mainWindow.webContents.send('tabs-updated', {
    tabs: summary,
    activeTabId
  });
}

function switchTab(tabId) {
  const targetTab = tabs.find(t => t.id === tabId);
  if (!targetTab) return;

  if (activeTabId && activeTabId !== tabId) {
    const prevTab = tabs.find(t => t.id === activeTabId);
    if (prevTab && prevTab.view) {
      mainWindow.contentView.removeChildView(prevTab.view);
    }
  }

  activeTabId = tabId;
  mainWindow.contentView.addChildView(targetTab.view);
  targetTab.view.setBounds(getTabBounds());
  mainWindow.setTitle(`${targetTab.fileName} - HurufReader`);
  sendTabsState();
}

function switchNextTab() {
  if (tabs.length <= 1) return;
  const currentIndex = tabs.findIndex(t => t.id === activeTabId);
  const nextIndex = (currentIndex + 1) % tabs.length;
  switchTab(tabs[nextIndex].id);
}

function switchPrevTab() {
  if (tabs.length <= 1) return;
  const currentIndex = tabs.findIndex(t => t.id === activeTabId);
  const prevIndex = (currentIndex - 1 + tabs.length) % tabs.length;
  switchTab(tabs[prevIndex].id);
}

async function requestSaveTab(tab) {
  return new Promise((resolve) => {
    let handled = false;
    const timeout = setTimeout(() => {
      if (!handled) {
        handled = true;
        resolve(false);
      }
    }, 15000);

    const onSaveCompleted = (targetPath) => {
      if (!handled) {
        handled = true;
        clearTimeout(timeout);
        resolve(Boolean(targetPath));
      }
    };

    tab._onSaveComplete = onSaveCompleted;
    tab.view.webContents.send('request-save-pdf');
  });
}

async function requestCommitTab(tab) {
  if (!tab || !tab.view || tab.view.webContents.isDestroyed()) {
    return;
  }
  return new Promise((resolve) => {
    let handled = false;
    const timeout = setTimeout(() => {
      if (!handled) {
        handled = true;
        resolve();
      }
    }, 1000);

    const replyChannel = `tab-commit-done-${tab.id}-${Date.now()}`;
    ipcMain.once(replyChannel, () => {
      if (!handled) {
        handled = true;
        clearTimeout(timeout);
        resolve();
      }
    });

    tab.view.webContents.send('request-commit-annotations', replyChannel);
  });
}

async function closeTab(tabId) {
  const tab = tabs.find(t => t.id === tabId);
  if (!tab) return false;

  await requestCommitTab(tab);

  if (tab.unsavedChanges || tab.modified) {
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'question',
      buttons: ['Save As', 'Discard', 'Cancel'],
      defaultId: 0,
      cancelId: 2,
      title: 'HurufReader',
      message: `Do you want to save changes to "${tab.fileName}" before closing?`,
      detail: 'Your changes will be lost if you discard them.'
    });

    if (choice === 2) {
      // Cancel
      return false;
    } else if (choice === 0) {
      // Save As
      const saved = await requestSaveTab(tab);
      if (!saved) {
        return false; // User cancelled save dialog or save failed
      }
      tab.unsavedChanges = false;
      tab.modified = false;
      cleanupTabRecovery(tab);
    } else if (choice === 1) {
      // Discard
      tab.unsavedChanges = false;
      tab.modified = false;
      console.log(`[modified] Flag cleared for tab "${tab.fileName}": user chose Discard`);
      cleanupTabRecovery(tab);
    }
  } else {
    cleanupTabRecovery(tab);
  }

  // Remove tab view
  if (activeTabId === tabId) {
    mainWindow.contentView.removeChildView(tab.view);
  }

  const tabIndex = tabs.findIndex(t => t.id === tabId);
  tabs.splice(tabIndex, 1);

  if (tabs.length === 0) {
    activeTabId = null;
    mainWindow.setTitle('HurufReader');
  } else if (activeTabId === tabId) {
    const nextIndex = Math.min(tabIndex, tabs.length - 1);
    switchTab(tabs[nextIndex].id);
  }

  sendTabsState();
  return true;
}

function closeCurrentTab() {
  if (activeTabId) {
    closeTab(activeTabId);
  }
}

async function openPDFPath(selectedPath) {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  // 1. Check if same file is already open
  const normalizedTarget = path.resolve(selectedPath).toLowerCase();
  const existingTab = tabs.find(t => path.resolve(t.filePath).toLowerCase() === normalizedTarget);
  if (existingTab) {
    switchTab(existingTab.id);
    return;
  }

  const fileName = path.basename(selectedPath);

  // 2. Read file and check accessibility (Step 5)
  let fileBuffer;
  try {
    const stat = fs.statSync(selectedPath);
    if (!stat.isFile()) {
      throw new Error('Target is not a regular file');
    }
    fileBuffer = fs.readFileSync(selectedPath);
  } catch (err) {
    console.error(`File read error for "${selectedPath}":`, err);
    dialog.showErrorBox(
      'Cannot Open File',
      `Could not open "${fileName}".\n\nThe file was not found or you do not have permission to access it.`
    );
    return;
  }

  // 3. Leading junk bytes trim (Phase 0 logic kept for every file)
  const headerIndex = fileBuffer.subarray(0, 1024).indexOf('%PDF-');
  if (headerIndex > 0) {
    fileBuffer = fileBuffer.subarray(headerIndex);
    console.log(`Trimmed ${headerIndex} bytes before %PDF- header for "${fileName}"`);
  } else if (headerIndex === -1) {
    console.error(`Corrupted PDF: Missing %PDF- header in "${selectedPath}"`);
    dialog.showErrorBox(
      'Corrupted File',
      `HurufReader cannot open "${fileName}".\n\nThe file appears to be corrupted or is not a valid PDF document.`
    );
    return;
  }

  // 4. Validate file structure with PDF.js before creating tab (Step 5)
  try {
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const probeTask = pdfjsLib.getDocument({
      data: new Uint8Array(fileBuffer),
      isEvalSupported: false
    });
    await probeTask.promise;
  } catch (err) {
    if (err.name === 'PasswordException') {
      // Valid password-protected PDF; tab will show password prompt
    } else {
      console.error(`Technical error validating PDF "${selectedPath}":`, err);
      dialog.showErrorBox(
        'Corrupted File',
        `HurufReader cannot open "${fileName}".\n\nThe file appears to be corrupted and cannot be read.`
      );
      return;
    }
  }

  // 5. Create WebContentsView for the tab
  const tabId = 'tab_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);

  const tabView = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      navigateOnDragDrop: false
    }
  });

  // Block any remote navigation or new windows
  tabView.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  tabView.webContents.on('will-navigate', (e) => e.preventDefault());

  // Input event handling inside tab view for shortcuts
  tabView.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown') {
      if (input.control && input.key === 'Tab') {
        event.preventDefault();
        if (input.shift) switchPrevTab();
        else switchNextTab();
      } else if (input.control && input.key.toLowerCase() === 'w') {
        event.preventDefault();
        commands.closeTab();
      } else if (input.control && input.key.toLowerCase() === 'o') {
        event.preventDefault();
        commands.openFile();
      } else if (input.control && input.shift && input.key.toLowerCase() === 'd') {
        event.preventDefault();
        commands.setDarkMode();
      } else if (input.control && input.shift && input.key.toLowerCase() === 's') {
        event.preventDefault();
        commands.saveAs();
      }
    }
  });

  const tabObj = {
    id: tabId,
    filePath: selectedPath,
    fileName,
    view: tabView,
    unsavedChanges: false,
    modified: false,
    annotationMode: 0
  };

  tabs.push(tabObj);

  tabView.webContents.loadFile('viewer.html');

  tabView.webContents.on('did-finish-load', () => {
    tabView.webContents.send('load-document', {
      tabId,
      filePath: selectedPath,
      fileName,
      buffer: fileBuffer,
      theme: {
        darkMode: settings.darkMode,
        invertColors: settings.invertColors
      },
      hasUnsavedChanges: false
    });
  });

  switchTab(tabId);
}

async function handleOpenFile() {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open PDF',
    properties: ['openFile'],
    filters: [
      { name: 'PDF Files (*.pdf)', extensions: ['pdf'] }
    ]
  });

  if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
    return;
  }

  await openPDFPath(result.filePaths[0]);
}

function triggerSaveAs(tabId) {
  const targetId = tabId || activeTabId;
  if (!targetId) return false;
  const currentTab = tabs.find(t => t.id === targetId);
  if (currentTab && currentTab.view) {
    currentTab.view.webContents.send('request-save-pdf');
    return true;
  }
  return false;
}

function setTabAnnotationMode(tabId, mode) {
  const targetId = tabId || activeTabId;
  if (!targetId) return false;
  const currentTab = tabs.find(t => t.id === targetId);
  if (currentTab) {
    currentTab.annotationMode = mode;
    if (currentTab.view && !currentTab.view.webContents.isDestroyed()) {
      currentTab.view.webContents.send('set-annotation-mode', mode);
    }
    return true;
  }
  return false;
}

function undoTab(tabId) {
  const targetId = tabId || activeTabId;
  if (!targetId) return false;
  const currentTab = tabs.find(t => t.id === targetId);
  if (currentTab && currentTab.view && !currentTab.view.webContents.isDestroyed()) {
    currentTab.view.webContents.send('tab-do-undo');
    return true;
  }
  return false;
}

function redoTab(tabId) {
  const targetId = tabId || activeTabId;
  if (!targetId) return false;
  const currentTab = tabs.find(t => t.id === targetId);
  if (currentTab && currentTab.view && !currentTab.view.webContents.isDestroyed()) {
    currentTab.view.webContents.send('tab-do-redo');
    return true;
  }
  return false;
}

// Initialize Command Layer
commands.initCommands({
  openPDFPath,
  handleOpenFile,
  closeTab,
  switchTab,
  triggerSaveAs,
  toggleDarkMode,
  toggleInvertColors,
  setTabAnnotationMode,
  undo: undoTab,
  redo: redoTab,
  getActiveTabId: () => activeTabId
});

function toggleDarkMode(forceVal) {
  settings.darkMode = typeof forceVal === 'boolean' ? forceVal : !settings.darkMode;
  saveSettings();
  broadcastTheme();
  updateMenu();
  return settings.darkMode;
}

function toggleInvertColors(forceVal) {
  settings.invertColors = typeof forceVal === 'boolean' ? forceVal : !settings.invertColors;
  saveSettings();
  broadcastTheme();
  updateMenu();
  return settings.invertColors;
}

function updateMenu() {
  const menuTemplate = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open...',
          accelerator: 'Ctrl+O',
          click: () => commands.openFile()
        },
        {
          label: 'Save As...',
          accelerator: 'Ctrl+Shift+S',
          click: () => commands.saveAs()
        },
        {
          label: 'Close Tab',
          accelerator: 'Ctrl+W',
          click: () => commands.closeTab()
        },
        { type: 'separator' },
        {
          label: 'Exit',
          accelerator: 'Alt+F4',
          click: () => app.quit()
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        {
          label: 'Undo',
          accelerator: 'Ctrl+Z',
          click: () => commands.undo()
        },
        {
          label: 'Redo',
          accelerator: 'Ctrl+Y',
          click: () => commands.redo()
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Dark Mode',
          type: 'checkbox',
          checked: settings.darkMode,
          accelerator: 'Ctrl+Shift+D',
          click: (item) => commands.setDarkMode(item.checked)
        },
        {
          label: 'Invert Page Colors',
          type: 'checkbox',
          checked: settings.invertColors,
          click: (item) => commands.setInvertColors(item.checked)
        }
      ]
    },
    {
      label: 'Window',
      submenu: [
        {
          label: 'Next Tab',
          accelerator: 'Ctrl+Tab',
          click: () => switchNextTab()
        },
        {
          label: 'Previous Tab',
          accelerator: 'Ctrl+Shift+Tab',
          click: () => switchPrevTab()
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 850,
    title: 'HurufReader',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      navigateOnDragDrop: false
    }
  });

  // Block any remote navigation or new windows
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (e) => e.preventDefault());

  // Input event handling on main window
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown') {
      if (input.control && input.key === 'Tab') {
        event.preventDefault();
        if (input.shift) switchPrevTab();
        else switchNextTab();
      } else if (input.control && input.key.toLowerCase() === 'w') {
        event.preventDefault();
        commands.closeTab();
      } else if (input.control && input.key.toLowerCase() === 'o') {
        event.preventDefault();
        commands.openFile();
      } else if (input.control && input.shift && input.key.toLowerCase() === 'd') {
        event.preventDefault();
        commands.setDarkMode();
      }
    }
  });

  // Strict CSP to prevent any network requests or remote content loads
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self' data:; worker-src 'self' blob:; object-src 'none'; connect-src 'self' blob:;"
        ]
      }
    });
  });

  updateMenu();

  mainWindow.loadFile('index.html');

  mainWindow.webContents.on('did-finish-load', async () => {
    broadcastTheme();
    sendTabsState();
    await checkRecoveryOnStartup();
  });

  mainWindow.on('resize', updateActiveTabBounds);
  mainWindow.on('maximize', updateActiveTabBounds);
  mainWindow.on('unmaximize', updateActiveTabBounds);

  // Unsaved changes check on window close (Step 2)
  mainWindow.on('close', async (e) => {
    if (tabs.length === 0) {
      return;
    }

    e.preventDefault();

    for (const tab of tabs) {
      await requestCommitTab(tab);
    }

    const modifiedTabs = tabs.filter(t => t.unsavedChanges || t.modified);
    if (modifiedTabs.length === 0) {
      for (const tab of tabs) {
        cleanupTabRecovery(tab);
      }
      mainWindow.destroy();
      return;
    }

    for (const tab of [...modifiedTabs]) {
      switchTab(tab.id);
      const choice = dialog.showMessageBoxSync(mainWindow, {
        type: 'question',
        buttons: ['Save As', 'Discard', 'Cancel'],
        defaultId: 0,
        cancelId: 2,
        title: 'HurufReader',
        message: `Do you want to save changes to "${tab.fileName}" before closing?`,
        detail: 'Your changes will be lost if you discard them.'
      });

      if (choice === 2) {
        // Cancel close - keep recovery files intact
        return;
      } else if (choice === 0) {
        // Save As
        const saved = await requestSaveTab(tab);
        if (!saved) {
          // User cancelled save dialog - keep recovery files intact
          return;
        }
        tab.unsavedChanges = false;
        tab.modified = false;
        cleanupTabRecovery(tab);
      } else if (choice === 1) {
        // Discard
        tab.unsavedChanges = false;
        tab.modified = false;
        console.log(`[modified] Flag cleared for tab "${tab.fileName}": user chose Discard on app close`);
        cleanupTabRecovery(tab);
      }
    }

    // All modified tabs resolved, clean up any remaining unmodified tabs
    for (const tab of tabs) {
      cleanupTabRecovery(tab);
    }
    mainWindow.destroy();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    tabs = [];
    activeTabId = null;
  });
}

// IPC Handlers
ipcMain.on('tab-switch', (event, tabId) => {
  commands.switchTab(tabId);
});

ipcMain.on('tab-close', (event, tabId) => {
  commands.closeTab(tabId);
});

ipcMain.on('tab-open-dialog', () => {
  commands.openFile();
});

ipcMain.on('tab-request-close', (event) => {
  const senderTab = tabs.find(t => t.view && t.view.webContents === event.sender);
  if (senderTab) {
    commands.closeTab(senderTab.id);
  }
});

ipcMain.on('tab-set-annotation-mode', (event, mode) => {
  const senderTab = tabs.find(t => t.view && t.view.webContents === event.sender) ||
                    tabs.find(t => t.id === activeTabId);
  if (senderTab) {
    commands.setAnnotationMode(senderTab.id, mode);
  }
});

ipcMain.on('tab-undo', (event, tabId) => {
  const senderTab = tabs.find(t => t.view && t.view.webContents === event.sender) ||
                    tabs.find(t => t.id === activeTabId);
  const targetId = tabId || (senderTab ? senderTab.id : activeTabId);
  commands.undo(targetId);
});

ipcMain.on('tab-redo', (event, tabId) => {
  const senderTab = tabs.find(t => t.view && t.view.webContents === event.sender) ||
                    tabs.find(t => t.id === activeTabId);
  const targetId = tabId || (senderTab ? senderTab.id : activeTabId);
  commands.redo(targetId);
});

ipcMain.on('tab-set-modified', (event, isModified) => {
  const senderTab = tabs.find(t => t.view && t.view.webContents === event.sender);
  if (senderTab) {
    const nextVal = Boolean(isModified);
    if (senderTab.unsavedChanges !== nextVal) {
      senderTab.unsavedChanges = nextVal;
      senderTab.modified = nextVal;
      if (nextVal) {
        console.log(`[modified] Flag set for tab "${senderTab.fileName}": annotation change in viewer`);
      } else {
        console.log(`[modified] Flag cleared for tab "${senderTab.fileName}": reset from viewer`);
      }
      sendTabsState();
    }
  }
});

ipcMain.handle('dialog-open-file', async () => {
  await commands.openFile();
});

ipcMain.handle('save-pdf-bytes', async (event, bytesArray) => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return { success: false, error: 'Window closed' };
  }

  const senderTab = tabs.find(t => t.view && t.view.webContents === event.sender) ||
                    tabs.find(t => t.id === activeTabId);

  if (!bytesArray || bytesArray.length === 0) {
    dialog.showErrorBox('Save Error', 'No document data received to save.');
    if (senderTab && senderTab._onSaveComplete) {
      senderTab._onSaveComplete(null);
    }
    return { success: false, error: 'Empty data' };
  }

  const currentOpenedFilePath = senderTab ? senderTab.filePath : null;

  const defaultName = currentOpenedFilePath
    ? path.basename(currentOpenedFilePath, path.extname(currentOpenedFilePath)) + '_highlighted.pdf'
    : 'document_highlighted.pdf';

  const defaultDir = currentOpenedFilePath ? path.dirname(currentOpenedFilePath) : app.getPath('documents');

  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save As',
    defaultPath: path.join(defaultDir, defaultName),
    filters: [
      { name: 'PDF Files (*.pdf)', extensions: ['pdf'] }
    ]
  });

  if (result.canceled || !result.filePath) {
    if (senderTab && senderTab._onSaveComplete) {
      senderTab._onSaveComplete(null);
    }
    return { success: false, canceled: true };
  }

  const targetPath = result.filePath;

  // Never overwrite original file
  if (currentOpenedFilePath && path.resolve(targetPath).toLowerCase() === path.resolve(currentOpenedFilePath).toLowerCase()) {
    dialog.showErrorBox(
      'Cannot Overwrite Original',
      'Saving over the original file is not permitted in HurufReader. Please choose a different file name or path.'
    );
    if (senderTab && senderTab._onSaveComplete) {
      senderTab._onSaveComplete(null);
    }
    return { success: false, error: 'Cannot overwrite original file' };
  }

  try {
    const buffer = Buffer.from(bytesArray);
    fs.writeFileSync(targetPath, buffer);
    if (senderTab) {
      senderTab.unsavedChanges = false;
      senderTab.modified = false;
      console.log(`[modified] Flag cleared for tab "${senderTab.fileName}": Save As completed successfully`);
      cleanupTabRecovery(senderTab);
      if (senderTab._onSaveComplete) {
        senderTab._onSaveComplete(targetPath);
      }
    }
    sendTabsState();
    return { success: true, filePath: targetPath };
  } catch (err) {
    console.error(`Error saving file to "${targetPath}":`, err);
    dialog.showErrorBox('Error Saving File', `Failed to save PDF file:\n${err.message}`);
    if (senderTab && senderTab._onSaveComplete) {
      senderTab._onSaveComplete(null);
    }
    return { success: false, error: err.message };
  }
});

ipcMain.handle('save-recovery-bytes', async (event, bytesArray) => {
  const senderTab = tabs.find(t => t.view && t.view.webContents === event.sender) ||
                    tabs.find(t => t.id === activeTabId);
  if (!senderTab || !bytesArray || bytesArray.length === 0) {
    return { success: false, error: 'No tab or data' };
  }
  try {
    safeWriteRecoveryFile(senderTab, bytesArray);
    return { success: true };
  } catch (err) {
    console.error('Error saving recovery file:', err);
    return { success: false, error: err.message };
  }
});

const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

async function pickImageStampDialog() {
  if (!mainWindow || mainWindow.isDestroyed()) return null;

  let result;
  try {
    result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Image Stamp',
      properties: ['openFile'],
      filters: [
        { name: 'Images (*.png, *.jpg, *.jpeg)', extensions: ['png', 'jpg', 'jpeg'] }
      ]
    });
  } catch (err) {
    console.error('Error showing open image dialog:', err);
    return null;
  }

  if (!result || result.canceled || !result.filePaths || result.filePaths.length === 0) {
    return null;
  }

  const selectedPath = result.filePaths[0];
  const fileName = path.basename(selectedPath);

  try {
    const stat = fs.statSync(selectedPath);
    if (!stat.isFile()) {
      throw new Error('Target is not a regular file');
    }
    if (stat.size > MAX_IMAGE_SIZE_BYTES) {
      dialog.showErrorBox(
        'Image Exceeds Size Limit',
        `The file "${fileName}" exceeds the 10 MB size limit (size: ${(stat.size / (1024 * 1024)).toFixed(2)} MB).`
      );
      return null;
    }

    const ext = path.extname(selectedPath).toLowerCase();
    if (!['.png', '.jpg', '.jpeg'].includes(ext)) {
      dialog.showErrorBox(
        'Invalid Image Format',
        `The file "${fileName}" is not a supported format. Please select a PNG or JPEG image.`
      );
      return null;
    }

    const bytes = fs.readFileSync(selectedPath);

    // Validate magic bytes: PNG must start with 89 50 4E 47 0D 0A 1A 0A, JPEG must start with FF D8 FF
    const isPng = bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a;

    const isJpeg = bytes.length >= 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff;

    if (!isPng && !isJpeg) {
      dialog.showErrorBox(
        'Invalid Image',
        `${fileName}\n\nThis file is not a valid PNG or JPEG image.`
      );
      return null;
    }

    const mimeType = isPng ? 'image/png' : 'image/jpeg';

    return {
      name: fileName,
      mimeType,
      bytes
    };
  } catch (err) {
    console.error(`Error reading image "${selectedPath}":`, err);
    dialog.showErrorBox(
      'Cannot Read Image',
      `Could not read image "${fileName}".\n\n${err.message || String(err)}`
    );
    return null;
  }
}

ipcMain.handle('pick-image-stamp', async () => {
  return await pickImageStampDialog();
});

ipcMain.on('report-stamp-error', (event, data) => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const fileName = data && data.fileName ? data.fileName : 'Image';
  console.error(`Stamp error reported for "${fileName}":`, data && data.error);
  dialog.showErrorBox(
    'Invalid Image',
    `${fileName}\n\nThis file is not a valid PNG or JPEG image.`
  );
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
