const { ipcRenderer } = require("electron");

let currentCamera = null;         // e.g., "cam1"
let currentBrowserLabel = null;   // e.g., "ASUS USB2.0 Webcam" (browser label)
const liveStatus = document.getElementById("live-status");

// On DOM load, populate devices for each cam preview
document.addEventListener("DOMContentLoaded", async () => {
  await populateCameraDevices();
  
  // Attach the "Start Live Stream" button logic
  document.getElementById("start-stream").addEventListener("click", async () => {
    if (!currentBrowserLabel) {
      alert("No active camera selected for streaming!");
      return;
    }
    console.log("User clicked Start Live Stream with browser label:", currentBrowserLabel);

    // Map the browser label to the FFmpeg device name
    const ffmpegDeviceName = await mapBrowserLabelToFFmpeg(currentBrowserLabel);
    if (!ffmpegDeviceName) {
      alert("Could not find a matching FFmpeg device for the current camera.");
      return;
    }

    // Start streaming
    console.log("Starting FFmpeg with device:", ffmpegDeviceName);
    const rtmpUrl = "rtmp://localhost/live/stream";
    ipcRenderer.send("start-ffmpeg", rtmpUrl, ffmpegDeviceName);
  });

  // Attach the "Stop Live Stream" button
  document.getElementById("stop-stream").addEventListener("click", () => {
    ipcRenderer.send("stop-ffmpeg");
  });

  // Listen for stream status
  ipcRenderer.on("stream-status", (event, status) => {
    if (status) {
      liveStatus.textContent = "Live";
      liveStatus.classList.remove("live-off");
      liveStatus.classList.add("live-on");
    } else {
      liveStatus.textContent = "Offline";
      liveStatus.classList.remove("live-on");
      liveStatus.classList.add("live-off");
    }
  });

  // Listen for stream errors
  ipcRenderer.on("stream-error", (event, error) => {
    console.error("Streaming error:", error);
    alert(`Streaming error: ${error}`);
  });
});

/**
 * Called when user clicks "Go Live" for a specific cam (cam1, cam2, etc.)
 */
async function goLive(camId) {
  console.log(`goLive called for ${camId}`);
  const videoEl = document.getElementById(camId);
  const liveMonitor = document.getElementById("liveMonitor");

  try {
    // If camX doesn't have a device yet, pick the first from its dataset
    const availableDevices = JSON.parse(videoEl.dataset.availableDevices || "[]");
    if (availableDevices.length === 0) {
      alert("No devices found for this camera slot.");
      return;
    }
    
    // Use the first device from the dataset, or you can pick a specific one
    const chosenDevice = availableDevices[0]; 
    const deviceId = chosenDevice.deviceId; 
    console.log(`Using deviceId=${deviceId} label=${chosenDevice.label} for ${camId}`);

    // Stop any existing stream on camId
    if (videoEl.srcObject) {
      videoEl.srcObject.getTracks().forEach(t => t.stop());
    }
    // Start local preview on camId
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: { exact: deviceId } },
      audio: false
    });
    videoEl.srcObject = stream;
    videoEl.play();

    // Also set the live monitor to show the same stream
    liveMonitor.srcObject = stream;
    liveMonitor.play();

    // Track which camera is active
    currentCamera = camId;
    // And store the browser label for streaming
    currentBrowserLabel = chosenDevice.label;
    console.log("Set currentBrowserLabel to:", currentBrowserLabel);
  } catch (err) {
    console.error(`Error in goLive(${camId}):`, err);
  }
}

/**
 * Called when user clicks "Stop" on a specific camera
 */
function stopLive(camId) {
  const videoEl = document.getElementById(camId);
  if (videoEl.srcObject) {
    videoEl.srcObject.getTracks().forEach(t => t.stop());
    videoEl.srcObject = null;
  }
  console.log(`Stopped preview for ${camId}`);
}

/**
 * For each camera (cam1..cam4), store an array of devices in dataset.availableDevices
 */
async function populateCameraDevices() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoInputs = devices.filter(d => d.kind === "videoinput");
    
    // Convert each device to { label, deviceId }
    const videoDevices = videoInputs.map(d => ({
      label: d.label || "Unnamed Camera",
      deviceId: d.deviceId
    }));

    // Assign the same list to each cam
    ["cam1","cam2","cam3","cam4"].forEach(camId => {
      const el = document.getElementById(camId);
      if (el) {
        el.dataset.availableDevices = JSON.stringify(videoDevices);
      }
    });
    console.log("Populated camera devices for cam1..cam4");
  } catch (err) {
    console.error("Error populating camera devices:", err);
  }
}

/**
 * Map a browser device label (e.g. "ASUS USB2.0 Webcam") to an FFmpeg device name
 */
async function mapBrowserLabelToFFmpeg(browserLabel) {
  // 1. Get the FFmpeg device list from the main process
  const ffmpegDevices = await ipcRenderer.invoke("get-ffmpeg-devices");
  // 2. Try to find a partial match ignoring case
  const lowerLabel = browserLabel.toLowerCase();
  for (let dev of ffmpegDevices) {
    if (dev.toLowerCase().includes(lowerLabel)) {
      return dev; // e.g. "ASUS USB2.0 Webcam"
    }
  }
  return null;
}
