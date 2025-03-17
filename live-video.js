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
            console.warn(`No device assigned for ${cameraId}. Selecting default.`);
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

        // Set the selected camera as the live preview
        liveMonitor.srcObject = videoElement.srcObject;
        liveMonitor.play();
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

// Settings - Change camera input
async function showSettings(settingsId, camId, event) {
    // Get available video input devices
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(device => device.kind === 'videoinput');

    if (videoDevices.length === 0) {
        alert("No video devices found.");
        return;
    }

    // Remove existing settings dropdown if already open
    let existingMenu = document.getElementById(settingsId);
    if (existingMenu) {
        existingMenu.remove();
        return;
    }

    // Create a new dropdown menu for camera selection
    let settingsDiv = document.createElement("div");
    settingsDiv.id = settingsId;
    settingsDiv.className = "settings-menu";

    const select = document.createElement("select");

    // Populate dropdown with available cameras
    videoDevices.forEach((device, index) => {
        const option = document.createElement("option");
        option.value = device.deviceId;
        option.textContent = device.label || `Camera ${index + 1}`;
        select.appendChild(option);
    });

    // Preselect the current camera if it exists
    const videoElement = document.getElementById(camId);
    if (videoElement && videoElement.dataset.deviceId) {
        select.value = videoElement.dataset.deviceId;
    }

    // Set up event listener to switch the camera when selected
    select.addEventListener("change", async (event) => {
        const selectedDeviceId = event.target.value;
        videoElement.dataset.deviceId = selectedDeviceId;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { deviceId: { exact: selectedDeviceId } }
            });

            // Set the new stream to the video element
            videoElement.srcObject = stream;
            videoElement.play();
        } catch (error) {
            console.error("Error accessing the selected camera:", error);
        }
    });

    // Append dropdown to settings menu
    settingsDiv.appendChild(select);
    document.body.appendChild(settingsDiv);

    // Position settings menu near the button
    const button = event.target;
    settingsDiv.style.position = "absolute";
    settingsDiv.style.left = button.getBoundingClientRect().left + "px";
    settingsDiv.style.top = button.getBoundingClientRect().bottom + "px";
}

// Initialize setup on page load
window.onload = startLiveVideo;