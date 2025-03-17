document.addEventListener("DOMContentLoaded", async () => {
    const liveMonitor = document.getElementById("liveMonitor");
    const liveStatus = document.getElementById("live-status");
    let activeCameraId = null;

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

    async function getVideoDevices() {
        const devices = await navigator.mediaDevices.enumerateDevices();
        return devices.filter(device => device.kind === "videoinput");
    }

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
            videoElement.dataset.ready = "true";

            activeCameraId = cameraId;

            console.log(`Camera ${cameraId} is now live.`);
        } catch (error) {
            console.error(`Error accessing camera ${cameraId}:`, error);
        }
    }    

    function stopLive(cameraId) {
        const videoElement = document.getElementById(cameraId);
        if (videoElement.srcObject) {
            videoElement.srcObject.getTracks().forEach(track => track.stop());
            videoElement.srcObject = null;
        }
    }

    document.getElementById("start-stream").addEventListener("click", async () => {
        if (!activeCameraId) {
            alert("No camera is active. Please select a camera before streaming.");
            return;
        }

        console.log(`🚀 Starting stream from camera: ${activeCameraId}`);
        window.electronAPI.startFFmpeg(activeCameraId);

        let streamUrl = `http://localhost:8080/hls/${activeCameraId}/index.m3u8`;
        console.log(`Setting live monitor source to: ${streamUrl}`);

        let liveMonitor = document.getElementById("liveMonitor");
        liveMonitor.pause();
        liveMonitor.src = streamUrl;
        liveMonitor.load();
        liveMonitor.play();

        updateLiveStatus(true);
    });

    document.getElementById("stop-stream").addEventListener("click", () => {
        if (!activeCameraId) {
            alert("No active stream to stop.");
            return;
        }

        console.log(`🛑 Stopping stream for: ${activeCameraId}`);
        window.electronAPI.stopFFmpeg(activeCameraId);
        stopLive(activeCameraId);

        let liveMonitor = document.getElementById("liveMonitor");
        liveMonitor.src = "";
        liveMonitor.pause();

        updateLiveStatus(false);
        console.log("Streaming stopped.");
    });

    // **Handle Live Status Updates from Main Process**
    ipcRenderer.on("stream-status", (event, status) => {
        updateLiveStatus(status);
    });
});
