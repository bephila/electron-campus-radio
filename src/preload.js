const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
    startFFmpeg: (cameraId) => ipcRenderer.send("start-ffmpeg", cameraId),
    stopFFmpeg: (cameraId) => ipcRenderer.send("stop-ffmpeg", cameraId),
    onStreamStatus: (callback) => ipcRenderer.on("stream-status", (event, data) => callback(data)),
});
