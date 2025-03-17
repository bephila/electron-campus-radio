const { ipcRenderer } = require("electron");

document.addEventListener("DOMContentLoaded", () => {
    const liveMonitor = document.getElementById("liveMonitor");
    const liveStatus = document.getElementById("live-status");
    let mediaStreams = {}; // Store active camera streams
    let activeCameraId = null;
    let isStreaming = false;
    let rtmpUrl = "rtmp://localhost/live/stream";

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

    // **Check if any camera is currently playing**
    function getActiveCamera() {
        for (const camId of Object.keys(mediaStreams)) {
            const videoElement = document.getElementById(camId);
            if (mediaStreams[camId] && videoElement.srcObject && !videoElement.paused) {
                console.log(`Detected active camera: ${camId}`);
                return camId;
            }
        }
        return null;
    }

    // **Start a Specific Camera**
    async function goLive(cameraId) {
        try {
            console.log(`Attempting to start camera: ${cameraId}`);

            const stream = await navigator.mediaDevices.getUserMedia({
                video: true, // Gets the first available camera
                audio: false
            });

            const videoElement = document.getElementById(cameraId);
            videoElement.srcObject = stream;
            videoElement.play();
            mediaStreams[cameraId] = stream;
            activeCameraId = cameraId;

            console.log(`Camera ${cameraId} is now live.`);
        } catch (error) {
            console.error(`Error accessing camera ${cameraId}:`, error);
        }
    }

    // **Stop a Specific Camera**
    function stopLive(cameraId) {
        if (mediaStreams[cameraId]) {
            mediaStreams[cameraId].getTracks().forEach(track => track.stop());
            document.getElementById(cameraId).srcObject = null;
            delete mediaStreams[cameraId];
            if (activeCameraId === cameraId) activeCameraId = null;
            console.log(`Camera ${cameraId} stopped.`);
        }
    }

    // **Start Streaming Using an Active Camera**
    document.getElementById("start-stream").addEventListener("click", async () => {
        if (isStreaming) {
            console.warn("Streaming is already active.");
            return;
        }

        activeCameraId = getActiveCamera();

        if (!activeCameraId) {
            alert("No camera is active. Please start a camera before streaming.");
            return;
        }

        try {
            console.log(`Starting stream from camera: ${activeCameraId}`);

            const stream = document.getElementById(activeCameraId).srcObject;
            liveMonitor.srcObject = stream;
            liveMonitor.play();
            isStreaming = true;

            updateLiveStatus(true);
            ipcRenderer.send("start-ffmpeg", rtmpUrl, activeCameraId);
        } catch (error) {
            console.error("Error starting stream:", error);
        }
    });

    // **Stop Streaming**
    document.getElementById("stop-stream").addEventListener("click", () => {
        if (!isStreaming) return;

        ipcRenderer.send("stop-ffmpeg");
        isStreaming = false;
        updateLiveStatus(false);
        console.log("Streaming stopped.");
    });

    // **Handle Live Status Updates from Main Process**
    ipcRenderer.on("stream-status", (event, status) => {
        updateLiveStatus(status);
    });
});