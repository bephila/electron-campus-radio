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
      enableRemoteModule: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'public', 'index.html'));
  mainWindow.webContents.openDevTools();
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
      '-bufsize', '5000k',
      '-pix_fmt', 'yuv420p',
      '-g', '60',
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
  return new Promise((resolve) => {
    exec(`${getFFmpegPath()} -list_devices true -f dshow -i dummy`, (err, stdout, stderr) => {
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

      resolve(devices);
    });
  });
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
