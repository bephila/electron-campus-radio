// src/main.js
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn, exec } = require('child_process');
const fs = require('fs');
const { getFFmpegPath, saveFFmpegPath } = require('./config');

let ffmpegProcess;
let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      sandbox: true,
      worldSafeExecuteJavaScript: true
    }
  });

  // Load the index.html file
  mainWindow.loadFile(path.join(__dirname, '..', 'public', 'index.html'));

  // Open DevTools
  mainWindow.webContents.openDevTools();

  // Log when the window is ready
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('Main window loaded');
    // Verify that electronAPI is available
    mainWindow.webContents.executeJavaScript(`
      console.log('Checking electronAPI availability:', window.electronAPI ? 'Available' : 'Not available');
      if (window.electronAPI) {
        console.log('Available methods:', Object.keys(window.electronAPI));
      }
    `);
  });

  // Log any console messages from the renderer
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`Renderer Console [${level}]: ${message}`);
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// gracefully kill ffmpeg on quit
app.on('before-quit', () => {
  if (ffmpegProcess) ffmpegProcess.kill();
});

// IPC Handlers
ipcMain.on('start-ffmpeg', async (_, rtmpUrl, cameraName) => {
  if (!cameraName) {
    mainWindow.webContents.send('stream-error', 'No camera selected');
    return;
  }

  try {
    const ffmpegPath = getFFmpegPath();
    
    // Get the list of available devices
    const devices = await ipcMain.invoke('get-ffmpeg-devices');
    const selectedDevice = devices.find(d => d.name === cameraName);
    
    if (!selectedDevice) {
      mainWindow.webContents.send('stream-error', `Camera "${cameraName}" not found in FFmpeg devices`);
      return;
    }

    ffmpegProcess = spawn(ffmpegPath, [
      '-f', 'dshow',
      '-i', `video="${selectedDevice.fullName}"`,
      '-vcodec', 'libx264',
      '-preset', 'ultrafast',
      '-tune', 'zerolatency',
      '-b:v', '2500k',
      '-maxrate', '2500k',
      '-bufsize', '1000k',
      '-pix_fmt', 'yuv420p',
      '-g', '15',
      '-sc_threshold', '0',
      '-f', 'flv',
      rtmpUrl
    ], { shell: true });

    ffmpegProcess.stderr.on('data', d => {
      mainWindow.webContents.send('stream-error', d.toString());
    });

    mainWindow.webContents.send('stream-status', true);
  } catch (error) {
    mainWindow.webContents.send('stream-error', error.message);
  }
});

ipcMain.on('stop-ffmpeg', () => {
  if (ffmpegProcess) {
    ffmpegProcess.kill();
    ffmpegProcess = null;
    mainWindow.webContents.send('stream-status', false);
  }
});

ipcMain.handle('get-ffmpeg-devices', async () => {
  try {
    const ffmpegPath = getFFmpegPath();
    if (!ffmpegPath) {
      throw new Error('FFmpeg path not found');
    }

    return new Promise((resolve, reject) => {
      exec(`${ffmpegPath} -list_devices true -f dshow -i dummy`, (err, stdout, stderr) => {
        if (err) {
          console.error('Error getting FFmpeg devices:', err);
          reject(err);
          return;
        }

        const deviceLines = stderr
          .split('\n')
          .filter(l => l.toLowerCase().includes('dshow') && l.includes('"') && !l.toLowerCase().includes('audio'));

        const devices = deviceLines
          .map(l => {
            const match = l.match(/"([^"]+)"/);
            if (match) {
              const fullName = match[1];
              // Extract just the camera name without the @ symbol and any additional info
              const name = fullName.split('@')[0].trim();
              return {
                name: name,
                fullName: fullName
              };
            }
            return null;
          })
          .filter(Boolean);

        if (devices.length === 0) {
          console.warn('No FFmpeg devices found');
        }

        resolve(devices);
      });
    });
  } catch (error) {
    console.error('Error in get-ffmpeg-devices handler:', error);
    throw error;
  }
});

// Add new IPC handler for FFmpeg path configuration
ipcMain.handle('get-ffmpeg-path', async () => {
  try {
    return getFFmpegPath();
  } catch (error) {
    return null;
  }
});

ipcMain.handle('set-ffmpeg-path', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Select FFmpeg executable',
    properties: ['openFile'],
    filters: [
      { name: 'Executable', extensions: ['exe'] }
    ]
  });

  if (canceled || !filePaths.length) {
    return false;
  }

  const selectedPath = filePaths[0];
  if (saveFFmpegPath(selectedPath)) {
    return selectedPath;
  }
  return false;
});
