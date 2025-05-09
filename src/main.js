// src/main.js
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn, exec } = require('child_process');

let ffmpegProcess;
let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true,
      contextIsolation: false,
    }
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'public', 'index.html'));
}

// once Electron is ready, make the window
app.whenReady().then(createWindow);

// gracefully kill ffmpeg on quit
app.on('before-quit', () => {
  if (ffmpegProcess) ffmpegProcess.kill();
});


// — ipcMain handlers —

// 1) list dshow video devices
ipcMain.handle('get-ffmpeg-devices', async () => {
  return new Promise((resolve) => {
    exec('ffmpeg -list_devices true -f dshow -i dummy', (err, stdout, stderr) => {
      const deviceLines = stderr
        .split('\n')
        .filter(l => l.toLowerCase().includes('dshow') && l.includes('"') && !l.toLowerCase().includes('audio'));

      const devices = deviceLines
        .map(l => l.match(/"([^"]+)"/)?.[1]?.split('@')[0].trim())
        .filter(Boolean);

      resolve(devices);
    });
  });
});

// 2) start streaming from camera
ipcMain.on('start-ffmpeg', (_, rtmpUrl, cameraName) => {
  if (!cameraName) {
    mainWindow.webContents.send('stream-error', 'No camera selected');
    return;
  }

  ffmpegProcess = spawn('ffmpeg', [
    '-f', 'dshow',
    '-i', `video="${cameraName}"`,
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
});

// 3) stop streaming
ipcMain.on('stop-ffmpeg', () => {
  if (ffmpegProcess) {
    ffmpegProcess.kill();
    ffmpegProcess = null;
    mainWindow.webContents.send('stream-status', false);
  }
});

// 4) stream a file
ipcMain.on('start-ffmpeg-file', (_, rtmpUrl, filePath) => {
  if (!filePath) {
    mainWindow.webContents.send('stream-error', 'No file path provided');
    return;
  }

  ffmpegProcess = spawn('ffmpeg', [
    '-re',
    '-i', filePath,
    '-c:v', 'libx264',
    '-c:a', 'aac',
    '-f', 'flv',
    rtmpUrl
  ], { shell: true });

  ffmpegProcess.stderr.on('data', d => {
    mainWindow.webContents.send('stream-error', d.toString());
  });

  ffmpegProcess.on('close', code => {
    mainWindow.webContents.send('stream-status', false);
    ffmpegProcess = null;
  });

  mainWindow.webContents.send('stream-status', true);
});
