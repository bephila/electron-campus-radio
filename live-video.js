async function startLiveVideo() {
    const cameras = ["cam1", "cam2", "cam3", "cam4"];
    try {
        // Initialize camera dropdown for selection
        cameras.forEach((id) => {
            const videoElement = document.getElementById(id);
            videoElement.dataset.ready = "false";
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
        if (videoElement.dataset.ready === "false") {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
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
    if (videoElement.srcObject) {
        videoElement.srcObject.getTracks().forEach(track => track.stop());
        videoElement.srcObject = null;
        videoElement.dataset.ready = "false";
    }
}

// Initialize setup without starting streams
window.onload = startLiveVideo;
