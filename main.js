const { app, BrowserWindow, ipcMain } = require("electron");
const { spawn } = require("child_process");
const path = require("path");

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

    // Handle file drag-and-drop events
    ipcMain.on("file-dropped", (event, fileData) => {
        console.log("File received in main process:", fileData);
        mainWindow.webContents.send("add-to-playlist", fileData);
    });

// **Start FFmpeg Streaming with Selected Camera**
ipcMain.on("start-ffmpeg", (event, rtmpUrl, cameraId) => {
    if (!cameraId) {
        console.warn("No camera selected for streaming.");
        return;
    }

    if (ffmpegProcess) {
        console.warn("FFmpeg is already running.");
        return;
    }

    console.log(`Starting stream from camera: ${cameraId}`);

    ffmpegProcess = spawn("ffmpeg", [
        "-f", "dshow",
        "-i", `video=${cameraId}`, // Use the selected camera
        "-vcodec", "libx264",
        "-preset", "ultrafast",
        "-b:v", "3000k",
        "-maxrate", "3000k",
        "-bufsize", "6000k",
        "-pix_fmt", "yuv420p",
        "-g", "50",
        "-f", "flv",
        rtmpUrl,
    ]);

    ffmpegProcess.stdout.on("data", (data) => console.log(`FFmpeg: ${data}`));
    ffmpegProcess.stderr.on("data", (data) => console.error(`FFmpeg Error: ${data}`));
    ffmpegProcess.on("close", (code) => {
        console.log(`FFmpeg exited with code ${code}`);
        mainWindow.webContents.send("stream-status", false);
    });

    // Send "Live" status to the renderer
    mainWindow.webContents.send("stream-status", true);
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

// **Save Stream Session**
ipcMain.on("save-stream", () => {
    console.log("Saving live stream to file...");
    
    const saveProcess = spawn("ffmpeg", [
        "-i", rtmpUrl,
        "-c:v", "copy",
        "-c:a", "aac",
        "recorded_stream.mp4"
    ]);

    saveProcess.stdout.on("data", (data) => console.log(`Recording: ${data}`));
    saveProcess.stderr.on("data", (data) => console.error(`Recording Error: ${data}`));
    saveProcess.on("close", (code) => console.log(`Recording saved. Exit code: ${code}`));
});

app.on("before-quit", () => {
    if (ffmpegProcess) ffmpegProcess.kill();
});
