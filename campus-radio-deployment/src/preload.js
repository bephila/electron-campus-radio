// src/preload.js
const { contextBridge, ipcRenderer } = require("electron");

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld(
  'electronAPI',
  {
    getFFmpegDevices: () => ipcRenderer.invoke("get-ffmpeg-devices"),
    getFFmpegPath: () => ipcRenderer.invoke("get-ffmpeg-path"),
    setFFmpegPath: () => ipcRenderer.invoke("set-ffmpeg-path"),
    startFFmpeg: (rtmpUrl, cameraName) => ipcRenderer.send("start-ffmpeg", rtmpUrl, cameraName),
    stopFFmpeg: () => ipcRenderer.send("stop-ffmpeg")
  }
);

// Add event listeners for status updates
ipcRenderer.on("stream-status", (event, data) => {
  if (window.onStreamStatus) {
    window.onStreamStatus(data);
  }
});

ipcRenderer.on("stream-error", (event, data) => {
  if (window.onStreamError) {
    window.onStreamError(data);
  }
});
