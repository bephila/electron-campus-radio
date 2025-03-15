const { ipcRenderer } = require("electron");

document.addEventListener("DOMContentLoaded", async () => {
    const liveMonitor = document.getElementById("liveMonitor");
    const liveStatus = document.getElementById("live-status");
    let activeCameraId = null;

    function updateLiveStatus(status) {
        if (status) {
            liveStatus.textContent = "Live";
            liveStatus.classList.add("live-on");
            liveStatus.classList.remove("live-off");
        } else {
            liveStatus.textContent = "Offline";
            liveStatus.classList.add("live-off");
            liveStatus.classList.remove("live-on");
        }
    }

    // **Fetch Available Cameras**
    async function getVideoDevices() {
        const devices = await navigator.mediaDevices.enumerateDevices();
        return devices.filter(device => device.kind === "videoinput");
    }

    // **Start Live Streaming**
    document.getElementById("start-stream").addEventListener("click", async () => {
        const devices = await getVideoDevices();

        if (devices.length === 0) {
            alert("No cameras found!");
            return;
        }

        if (!activeCameraId) {
            alert("Please select a camera before streaming.");
            return;
        }

        const selectedDevice = devices.find(device => device.deviceId === activeCameraId);
        if (!selectedDevice) {
            alert("Selected camera not found.");
            return;
        }

        console.log(`Starting stream from camera: ${activeCameraId}`);
        ipcRenderer.send("start-ffmpeg", activeCameraId, selectedDevice.label);

        // Update live monitor source
        const videoSrc = `http://localhost:8080/hls/${activeCameraId}/index.m3u8`;
        startHLSStream(videoSrc);
    });

    // **Stop Live Streaming**
    document.getElementById("stop-stream").addEventListener("click", () => {
        if (!activeCameraId) {
            alert("No active stream to stop.");
            return;
        }

        ipcRenderer.send("stop-ffmpeg", activeCameraId);
        liveMonitor.src = "";
        updateLiveStatus(false);
    });

    // **Attach Event Listeners to Play Buttons**
    document.querySelectorAll(".icon-button.play").forEach(button => {
        button.addEventListener("click", async (event) => {
            const videoElement = event.target.closest(".camera").querySelector("video");
            const devices = await getVideoDevices();

            if (devices.length === 0) {
                alert("No cameras found!");
                return;
            }

            // Assign the first available camera if not set
            if (!videoElement.dataset.deviceId) {
                videoElement.dataset.deviceId = devices[0].deviceId;
            }

            activeCameraId = videoElement.dataset.deviceId;  // Fix: Set active camera
            console.log(`Play button clicked. Active camera set: ${activeCameraId}`);
        });
    });

    // **Update UI When Streaming Starts/Stops**
    ipcRenderer.on("stream-status", (event, { cameraId, status }) => {
        if (status) {
            updateLiveStatus(true);
        } else {
            updateLiveStatus(false);
        }
    });

});

// **Load HLS Stream**
function startHLSStream(videoSrc) {
    const video = document.getElementById("liveMonitor");

    if (Hls.isSupported()) {
        const hls = new Hls();
        hls.loadSource(videoSrc);
        hls.attachMedia(video);
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = videoSrc;
        video.play();
    }
}
