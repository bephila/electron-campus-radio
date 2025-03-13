// Get available video input devices (cameras)
async function getVideoDevices() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');

        document.querySelectorAll('.deviceSelect').forEach(select => {
            // Clear previous options
            select.innerHTML = "";

            videoDevices.forEach((device, index) => {
                let option = document.createElement('option');
                option.value = device.deviceId;
                option.textContent = device.label || `Camera ${index + 1}`;
                select.appendChild(option);
            });
        });
    } catch (error) {
        console.error("Error getting video devices:", error);
    }
}

// Toggle settings panel visibility
function showSettings(settingsId) {
    const settingsPanel = document.getElementById(settingsId);
    if (settingsPanel.style.display === 'block') {
        settingsPanel.style.display = 'none';
    } else {
        settingsPanel.style.display = 'block';
    }
}

// Start the selected camera stream
async function goLive(cameraId) {
    const videoElement = document.getElementById(cameraId);
    const selectElement = document.querySelector(`#deviceSelect${cameraId.charAt(3)}`);

    if (!selectElement) {
        console.error(`Device selection dropdown for ${cameraId} not found!`);
        return;
    }

    const selectedDeviceId = selectElement.value;

    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined },
            audio: false
        });

        videoElement.srcObject = stream;
        videoElement.dataset.stream = stream;
    } catch (error) {
        console.error("Error accessing video stream:", error);
    }
}

// Stop the video stream
function stopLive(cameraId) {
    const videoElement = document.getElementById(cameraId);
    if (videoElement.srcObject) {
        videoElement.srcObject.getTracks().forEach(track => track.stop());
        videoElement.srcObject = null;
    }
}

// Run on page load
window.onload = getVideoDevices;
