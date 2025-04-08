const { ipcRenderer } = require("electron");

let currentCamera = null; // tracks the camera used in the preview (e.g. "cam1")
const liveStatus = document.getElementById("live-status");

// Main initialization once DOM is ready.
document.addEventListener("DOMContentLoaded", async () => {
  // 1. Populate FFmpeg streaming device dropdown (if used)
  try {
    const ffmpegDevices = await ipcRenderer.invoke("get-ffmpeg-devices");
    console.log("DirectShow devices from FFmpeg:", ffmpegDevices);
    const streamSelect = document.getElementById("streamSelect");
    if (streamSelect) {
      ffmpegDevices.forEach(name => {
        const option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        streamSelect.appendChild(option);
      });
      document.getElementById("start-stream").addEventListener("click", async () => {
        console.log("Start Live Stream button clicked!");
        const ffmpegDeviceName = streamSelect.value;
        console.log("Selected FFmpeg device:", ffmpegDeviceName);
        // Map the FFmpeg device name to browser device ID.
        const browserDeviceId = await getBrowserDeviceIdForFFmpegName(ffmpegDeviceName);
        if (!browserDeviceId) {
          alert("No matching browser device found for the selected camera.");
          return;
        }
        console.log("Mapped to browser device ID:", browserDeviceId);
        // Update live monitor preview with the browser device stream.
        await updateCameraPreview("liveMonitor", browserDeviceId);
        const rtmpUrl = "rtmp://localhost/live/stream";
        console.log("Starting FFmpeg stream with:", rtmpUrl, ffmpegDeviceName);
        ipcRenderer.send("start-ffmpeg", rtmpUrl, ffmpegDeviceName);
      });
    }
  } catch (err) {
    console.error("Error fetching FFmpeg devices:", err);
  }

  // 2. Attach stop-stream listener.
  document.getElementById("stop-stream").addEventListener("click", () => {
    ipcRenderer.send("stop-ffmpeg");
  });

  // 3. Listen for stream status updates.
  ipcRenderer.on("stream-status", (event, status) => {
    updateLiveStatus(status);
  });

  // 4. Listen for stream errors.
  ipcRenderer.on("stream-error", (event, error) => {
    console.error("Streaming error:", error);
    alert(`Streaming error: ${error}`);
  });

  // 5. Populate available devices (browser side) for each preview camera.
  await populateCameraDevices();
});

//////////////////////////
// Helper Functions
//////////////////////////

// Update the live status UI.
function updateLiveStatus(status) {
  if (status) {
    liveStatus.textContent = "Live";
    liveStatus.classList.remove("live-off");
    liveStatus.classList.add("live-on");
  } else {
    liveStatus.textContent = "Offline";
    liveStatus.classList.remove("live-on");
    liveStatus.classList.add("live-off");
  }
}

// Map an FFmpeg DirectShow device name to a browser deviceId.
async function getBrowserDeviceIdForFFmpegName(ffmpegName) {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const videoDevices = devices.filter(d => d.kind === 'videoinput');
  const lowerName = ffmpegName.toLowerCase();
  for (let device of videoDevices) {
    if (device.label && device.label.toLowerCase().includes(lowerName)) {
      return device.deviceId;
    }
  }
  return null;
}

// Update the preview for a given camera element with a new stream.
async function updateCameraPreview(camId, deviceId) {
  try {
    const videoElement = document.getElementById(camId);
    if (videoElement.srcObject) {
      videoElement.srcObject.getTracks().forEach(track => track.stop());
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: { exact: deviceId } },
      audio: false
    });
    videoElement.srcObject = stream;
    videoElement.play();
    console.log(`Updated preview for ${camId} with device ${deviceId}`);
  } catch (error) {
    console.error(`Error updating preview for ${camId}:`, error);
  }
}

// Populate the available devices for each preview camera (cam1..cam4) in the browser.
async function populateCameraDevices() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoInputs = devices.filter(device => device.kind === 'videoinput');
    const videoDevices = videoInputs.map(device => ({
      label: device.label || `Camera ${videoInputs.indexOf(device) + 1}`,
      deviceId: device.deviceId
    }));
    ['cam1', 'cam2', 'cam3', 'cam4'].forEach(camId => {
      const videoEl = document.getElementById(camId);
      if (videoEl) {
        videoEl.dataset.availableDevices = JSON.stringify(videoDevices);
      }
    });
    console.log("Populated camera devices for previews.");
  } catch (error) {
    console.error("Error populating camera devices:", error);
  }
}

//////////////////////////
// Global Functions for Inline HTML
//////////////////////////

// When the user clicks "Go Live" on a camera, show its stream in the live monitor.
window.goLive = async function(cameraId) {
  console.log(`goLive called for ${cameraId}`);
  const videoElement = document.getElementById(cameraId);
  const liveMonitor = document.getElementById("liveMonitor");
  try {
    let deviceId = videoElement.dataset.deviceId;
    if (!deviceId) {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(device => device.kind === 'videoinput');
      if (videoDevices.length > 0) {
        deviceId = videoDevices[0].deviceId;
        videoElement.dataset.deviceId = deviceId;
      }
    }
    if (!videoElement.dataset.ready || videoElement.dataset.ready === "false") {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: deviceId } },
        audio: false
      });
      videoElement.srcObject = stream;
      videoElement.play();
      videoElement.dataset.ready = "true";
    }
    // Set the live monitor to the same stream.
    liveMonitor.srcObject = videoElement.srcObject;
    liveMonitor.play();
    console.log(`Camera ${cameraId} is now live.`);
    currentCamera = cameraId;
  } catch (error) {
    console.error("Error in goLive:", error);
  }
};

// Stop a camera stream.
window.stopLive = function(cameraId) {
  const videoElement = document.getElementById(cameraId);
  const liveMonitor = document.getElementById("liveMonitor");
  if (videoElement.srcObject) {
    videoElement.srcObject.getTracks().forEach(track => track.stop());
    videoElement.srcObject = null;
    videoElement.dataset.ready = "false";
  }
  if (liveMonitor.srcObject === videoElement.srcObject) {
    liveMonitor.srcObject = null;
    liveMonitor.pause();
  }
  console.log(`Camera ${cameraId} stopped.`);
};

// Show the settings dropdown for selecting a camera for a preview.
window.showSettings = async function(button, settingsId, camId) {
  const videoElement = document.getElementById(camId);
  if (!videoElement) {
    console.error(`Video element with id "${camId}" not found.`);
    return;
  }
  let availableDevices = [];
  try {
    availableDevices = JSON.parse(videoElement.dataset.availableDevices || '[]');
  } catch (error) {
    console.error("Error parsing availableDevices for", camId, error);
    return;
  }
  if (!Array.isArray(availableDevices) || availableDevices.length === 0) {
    alert("No camera devices found!");
    return;
  }
  let existingMenu = document.getElementById(settingsId);
  if (existingMenu) {
    existingMenu.remove();
    return;
  }
  let settingsDiv = document.createElement("div");
  settingsDiv.id = settingsId;
  settingsDiv.className = "settings-menu";
  const select = document.createElement("select");
  select.classList.add("camera-select");
  availableDevices.forEach((device, index) => {
    const option = document.createElement("option");
    option.value = device.deviceId;
    option.textContent = device.label || `Camera ${index + 1}`;
    select.appendChild(option);
  });
  if (videoElement.dataset.deviceId) {
    select.value = videoElement.dataset.deviceId;
  }
  select.addEventListener("change", (event) => {
    const selectedDevice = event.target.value;
    videoElement.dataset.deviceId = selectedDevice;
    console.log(`Selected device for ${camId}: ${selectedDevice}`);
    updateCameraPreview(camId, selectedDevice);
    settingsDiv.remove();
  });
  settingsDiv.appendChild(select);
  document.body.appendChild(settingsDiv);
  const buttonRect = button.getBoundingClientRect();
  settingsDiv.style.position = "absolute";
  settingsDiv.style.left = `${buttonRect.left}px`;
  settingsDiv.style.top = `${buttonRect.bottom}px`;
  settingsDiv.style.zIndex = 9999;
  document.addEventListener('click', function handleOutsideClick(e) {
    if (!settingsDiv.contains(e.target) && e.target !== button) {
      settingsDiv.remove();
      document.removeEventListener('click', handleOutsideClick);
    }
  });
};
