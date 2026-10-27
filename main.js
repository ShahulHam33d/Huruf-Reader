const { app, BrowserWindow, Menu, dialog, ipcMain, session } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;
let currentOpenedFilePath = null;

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
  mainWindow.webContents.on('will-navigate', (e) => {
    e.preventDefault();
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

  // Set native menu
  const menuTemplate = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open...',
          accelerator: 'Ctrl+O',
          click: () => handleOpenFile()
        },
        {
          label: 'Save As...',
          accelerator: 'Ctrl+Shift+S',
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('request-save-pdf');
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Exit',
          accelerator: 'Alt+F4',
          click: () => app.quit()
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);

  mainWindow.loadFile('index.html');

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
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

  const selectedPath = result.filePaths[0];
  try {
    let fileBuffer = fs.readFileSync(selectedPath);
    const headerIndex = fileBuffer.subarray(0, 1024).indexOf('%PDF-');
    if (headerIndex > 0) {
      fileBuffer = fileBuffer.subarray(headerIndex);
      console.log(`Trimmed ${headerIndex} bytes before %PDF- header`);
    }
    currentOpenedFilePath = selectedPath;
    const fileName = path.basename(selectedPath);
    mainWindow.setTitle(`${fileName} - HurufReader`);

    mainWindow.webContents.send('open-pdf', {
      buffer: fileBuffer,
      filePath: selectedPath,
      fileName: fileName
    });
  } catch (err) {
    dialog.showErrorBox('Error Opening File', `Failed to read PDF file:\n${err.message}`);
  }
}

// IPC Handlers
ipcMain.handle('dialog-open-file', async () => {
  await handleOpenFile();
});

ipcMain.handle('save-pdf-bytes', async (event, bytesArray) => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return { success: false, error: 'Window closed' };
  }

  if (!bytesArray || bytesArray.length === 0) {
    dialog.showErrorBox('Save Error', 'No document data received to save.');
    return { success: false, error: 'Empty data' };
  }

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
    return { success: false, canceled: true };
  }

  const targetPath = result.filePath;

  // Never overwrite the original file
  if (currentOpenedFilePath && path.resolve(targetPath).toLowerCase() === path.resolve(currentOpenedFilePath).toLowerCase()) {
    dialog.showErrorBox(
      'Cannot Overwrite Original',
      'Saving over the original file is not permitted in HurufReader. Please choose a different file name or path.'
    );
    return { success: false, error: 'Cannot overwrite original file' };
  }

  try {
    const buffer = Buffer.from(bytesArray);
    fs.writeFileSync(targetPath, buffer);
    return { success: true, filePath: targetPath };
  } catch (err) {
    dialog.showErrorBox('Error Saving File', `Failed to save PDF file:\n${err.message}`);
    return { success: false, error: err.message };
  }
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
