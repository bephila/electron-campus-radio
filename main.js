const { app, BrowserWindow, ipcMain } = require("electron");
const { spawn } = require("child_process");
const path = require("path");

let mainWindow;
let ffmpegProcesses = {}; // Store FFmpeg processes per camera

app.whenReady().then(() => {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, "preload.js"), // ✅ Load Preload
            nodeIntegration: false,
            contextIsolation: true, // ✅ Securely expose API
        },
    });

    mainWindow.loadFile("index.html");
});

// **Start Streaming with FFmpeg**
ipcMain.on("start-ffmpeg", (event, cameraId) => {
    console.log(`🚀 Starting FFmpeg for ${cameraId}`);

    const rtmpUrl = `rtmp://localhost/live/${cameraId}`;

    ffmpegProcesses[cameraId] = spawn("ffmpeg", [
        "-f", "dshow",
        "-i", `video=${cameraId}`,
        "-vcodec", "libx264",
        "-preset", "ultrafast",
        "-f", "flv",
        rtmpUrl,
    ]);

    ffmpegProcesses[cameraId].stderr.on("data", (data) => console.error(`FFmpeg Error (${cameraId}): ${data}`));
    ffmpegProcesses[cameraId].on("close", (code) => {
        console.log(`FFmpeg for ${cameraId} exited with code ${code}`);
        delete ffmpegProcesses[cameraId];
        event.sender.send("stream-status", { cameraId, status: false });
    });

    event.sender.send("stream-status", { cameraId, status: true });
});

// **Stop Streaming**
ipcMain.on("stop-ffmpeg", (event, cameraId) => {
    if (!ffmpegProcesses[cameraId]) {
        console.warn(`No FFmpeg process running for ${cameraId}`);
        return;
    }

    console.log(`🛑 Stopping FFmpeg for ${cameraId}`);
    ffmpegProcesses[cameraId].kill("SIGTERM");
    delete ffmpegProcesses[cameraId];
});
