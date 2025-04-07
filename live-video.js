let activeCameraId = null;
// Initialize all cameras on page load
async function startLiveVideo() {
    const cameras = ["cam1", "cam2", "cam3", "cam4"];
    try {
        // Get available video input devices
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');

        if (videoDevices.length === 0) {
            console.warn("No cameras found.");
            return;
        }

        // Assign default cameras
        cameras.forEach((id, index) => {
            const videoElement = document.getElementById(id);
            videoElement.dataset.ready = "false";
            videoElement.dataset.deviceId = videoDevices[index]?.deviceId || "";
        });
    } catch (error) {
        console.error("Error setting up cameras:", error);
    }
}

// Function to start a specific camera stream when Go Live is clicked
async function goLive(cameraId) {
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
                video: { deviceId: deviceId ? { exact: deviceId } : undefined }
            });
            videoElement.srcObject = stream;
            videoElement.play();
            videoElement.dataset.ready = "true";
        }

<<<<<<< HEAD
        // Set the selected camera as the live preview
        liveMonitor.srcObject = videoElement.srcObject;
        liveMonitor.play();

        // Store the active camera for streaming
        activeCameraId = cameraId;
=======
        if (!deckA.dataset.fileType || deckA.dataset.fileType !== "video") {
            liveMonitor.srcObject = videoElement.srcObject;
            liveMonitor.play();
        }

>>>>>>> 48603a79265a2c666ce291be34cd43d956441169
    } catch (error) {
        console.error("Error accessing camera:", error);
    }
}


// Function to stop a specific camera stream
function stopLive(cameraId) {
    const videoElement = document.getElementById(cameraId);
    const liveMonitor = document.getElementById("liveMonitor");

    if (videoElement.srcObject) {
        // Stop all tracks from the selected camera
        videoElement.srcObject.getTracks().forEach(track => track.stop());
        videoElement.srcObject = null;
        videoElement.dataset.ready = "false";
    }

    // If the Live Monitor is playing the same stream, stop it too
    if (liveMonitor.srcObject === videoElement.srcObject) {
        liveMonitor.srcObject = null;
        liveMonitor.pause();
    }
}

// Global variable to track which camera is currently active
async function showSettings(button, settingsId, camId) {
  // Toggle off if already open
  const existingMenu = document.getElementById(settingsId);
  if (existingMenu) {
    existingMenu.remove();
    return;
  }

  try {
    // 1. Enumerate cameras
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(d => d.kind === "videoinput");
    if (videoDevices.length === 0) {
      alert("No camera devices found!");
      return;
    }

    // 2. Create the dropdown container
    const settingsDiv = document.createElement("div");
    settingsDiv.id = settingsId;
    settingsDiv.className = "settings-menu";

    // 3. Create a <select> for camera choices
    const select = document.createElement("select");
    select.classList.add("camera-select");

    // Optionally strip out the "@device_pnp..." parts for readability
    videoDevices.forEach((device, index) => {
      const friendlyLabel = getFriendlyName(device.label, `Camera ${index + 1}`);
      const option = document.createElement("option");
      option.value = device.deviceId;       // the actual deviceId
      option.textContent = friendlyLabel;   // user-friendly label
      select.appendChild(option);
    });

    // 4. If a device is already saved on the video element, pre-select it
    const videoElement = document.getElementById(camId);
    if (videoElement.dataset.deviceId) {
      select.value = videoElement.dataset.deviceId;
    }

    // 5. Handle user selection
    select.addEventListener("change", (e) => {
      const chosenDeviceId = e.target.value;
      videoElement.dataset.deviceId = chosenDeviceId;
      // Immediately update the camera preview
      updateCameraPreview(camId, chosenDeviceId);
    });

    settingsDiv.appendChild(select);

    // 6. Position the dropdown near the button
    const buttonRect = button.getBoundingClientRect();
    settingsDiv.style.position = "absolute";
    settingsDiv.style.left = `${buttonRect.left}px`;
    settingsDiv.style.top = `${buttonRect.bottom}px`;
    settingsDiv.style.zIndex = 9999;

    document.body.appendChild(settingsDiv);
  } catch (err) {
    console.error("Error enumerating devices:", err);
  }
}

// Helper to remove any @device_pnp... suffix for a friendlier label
function getFriendlyName(label, fallback) {
  if (!label) return fallback;
  const atIndex = label.indexOf('@');
  if (atIndex > -1) {
    return label.substring(0, atIndex).trim();
  }
  return label.trim();
}

// Update the preview for a given camera element
async function updateCameraPreview(camId, deviceId) {
  try {
    const videoElement = document.getElementById(camId);

    // Stop any existing stream
    if (videoElement.srcObject) {
      videoElement.srcObject.getTracks().forEach(track => track.stop());
    }

    // Request a new stream with the selected device
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: { exact: deviceId } },
      audio: false
    });

    videoElement.srcObject = stream;
    videoElement.play();
  } catch (error) {
    console.error(`Error updating preview for ${camId}:`, error);
  }
}


// Update the live monitor preview (assumes liveMonitor is a separate video element)
async function updateLiveMonitor(deviceId) {
  try {
    const liveMonitor = document.getElementById("liveMonitor");
    if (liveMonitor.srcObject) {
      liveMonitor.srcObject.getTracks().forEach(track => track.stop());
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: { exact: deviceId } },
      audio: false
    });
    liveMonitor.srcObject = stream;
    liveMonitor.play();
  } catch (error) {
    console.error("Error updating live monitor:", error);
  }
}

  
  // Optional: A helper to update the live preview for a given camera element
  async function updateCameraPreview(camId, deviceId) {
    try {
      const videoElement = document.getElementById(camId);
      // Stop existing stream if any
      if (videoElement.srcObject) {
        videoElement.srcObject.getTracks().forEach(track => track.stop());
      }
  
      // Request new stream
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: deviceId } },
        audio: false
      });
  
      videoElement.srcObject = stream;
      videoElement.play();
    } catch (error) {
      console.error(`Error updating preview for ${camId}:`, error);
    }
  }
  
  
// Initialize setup on page load
window.onload = startLiveVideo;