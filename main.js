const { app, BrowserWindow, ipcMain, desktopCapturer } = require("electron");
const { spawn } = require("child_process");

let ffmpegProcess;
const rtmpUrl = "rtmp://localhost/live/stream";
let mainWindow = null;

app.whenReady().then(() => {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
    });

    mainWindow.loadFile("index.html");
});

ipcMain.handle("get-ffmpeg-devices", async () => {
  try {
    const { exec } = require('child_process');

    return new Promise((resolve, reject) => {
      exec('ffmpeg -list_devices true -f dshow -i dummy', (error, stdout, stderr) => {
        console.log('Raw FFmpeg Output:', stderr);

        // Filter lines that mention dshow, have quotes, and do not mention audio
        const deviceLines = stderr
          .split('\n')
          .filter(line =>
            line.toLowerCase().includes('dshow') &&
            line.includes('"') &&
            !line.toLowerCase().includes('audio')
          );

        console.log('Filtered deviceLines:', deviceLines);

        // Extract whatever is between quotes
        let extractedDevices = deviceLines
          .map(line => {
            const match = line.match(/"([^"]+)"/);
            return match ? match[1].trim() : null;
          })
          .filter(Boolean); // Remove nulls

        // Make device names user friendly by removing any text after an '@'
        extractedDevices = extractedDevices.map(deviceName => {
          const atIndex = deviceName.indexOf('@');
          if (atIndex !== -1) {
            return deviceName.substring(0, atIndex).trim();
          }
          return deviceName;
        });

        console.log('Parsed Devices:', extractedDevices);
        resolve(extractedDevices);
      });
    });
  } catch (error) {
    console.error('Device Detection Error:', error);
    return [];
  }
});

  
// **Start FFmpeg Streaming with Selected Camera**
ipcMain.on("start-ffmpeg", (event, rtmpUrl, cameraDeviceName) => {
    if (!cameraDeviceName) {
        console.warn("No camera selected for streaming.");
        mainWindow.webContents.send("stream-error", "No camera selected");
        return;
    }

    console.log(`Attempting to stream from device: ${cameraDeviceName}`);

    try {
        ffmpegProcess = spawn("ffmpeg", [
            "-f", "dshow",
            "-i", `video="${cameraDeviceName}"`,
            "-vcodec", "libx264",
            "-preset", "ultrafast",
            "-tune", "zerolatency",
            "-b:v", "2500k",
            "-maxrate", "2500k",
            "-bufsize", "5000k",
            "-pix_fmt", "yuv420p",
            "-g", "60",
            "-sc_threshold", "0",
            "-f", "flv",
            rtmpUrl
        ], { shell: true });

        // More detailed logging
        ffmpegProcess.stdout.on("data", (data) => console.log(`FFmpeg stdout: ${data}`));
        ffmpegProcess.stderr.on("data", (data) => {
            console.error(`FFmpeg stderr: ${data}`);
            mainWindow.webContents.send("stream-error", data.toString());
        });

        mainWindow.webContents.send("stream-status", true);
    } catch (error) {
        console.error("Streaming Setup Error:", error);
        mainWindow.webContents.send("stream-error", error.toString());
    }
});

// **Stop FFmpeg Streaming**
ipcMain.on("stop-ffmpeg", () => {
    if (ffmpegProcess) {
        ffmpegProcess.kill();
        console.log("FFmpeg process stopped.");
        ffmpegProcess = null;

        // Send "Offline" status to the renderer
        mainWindow.webContents.send("stream-status", false);
    }
});

app.on("before-quit", () => {
    if (ffmpegProcess) ffmpegProcess.kill();
});