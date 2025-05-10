const { ipcRenderer } = require("electron");

// Expose FFmpeg functions directly to window
window.startFFmpeg = (rtmpUrl, cameraName) => {
  ipcRenderer.send("start-ffmpeg", rtmpUrl, cameraName);
};

window.stopFFmpeg = () => {
  ipcRenderer.send("stop-ffmpeg");
};

window.getFFmpegDevices = () => {
  return ipcRenderer.invoke("get-ffmpeg-devices");
};

// Add new FFmpeg configuration functions
window.getFFmpegPath = () => {
  return ipcRenderer.invoke("get-ffmpeg-path");
};

window.setFFmpegPath = () => {
  return ipcRenderer.invoke("set-ffmpeg-path");
};

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
