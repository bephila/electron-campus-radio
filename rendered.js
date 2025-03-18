const { ipcRenderer } = require("electron");

document.addEventListener("DOMContentLoaded", () => {
    const liveMonitor = document.getElementById("liveMonitor");
    const liveStatus = document.getElementById("live-status");
    let mediaStreams = {}; // Store active camera streams
    let activeCameraId = null;
    let isStreaming = false;
    let rtmpUrl = "rtmp://localhost/live/stream";
    let currentDeck = "deckA"; // Track which deck should play next

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
                video: true, 
                audio: false
            });
    
            const videoElement = document.getElementById(cameraId);
            videoElement.srcObject = stream;
            videoElement.play();
            mediaStreams[cameraId] = stream;
            activeCameraId = cameraId;
    
            console.log(`Camera ${cameraId} is now live.`);
        } catch (error) {
            alert("Unable to access the camera. Please check permissions.");
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

    // **Auto Crossfade Between Decks**
    document.getElementById("fadeButton").addEventListener("click", function () {
        let deckA = document.getElementById("deckA");
        let deckB = document.getElementById("deckB");
        let fadeTime = 3000; // 3 seconds fade duration
    
        let startVolumeA = deckA.volume;
        let startVolumeB = deckB.volume;
    
        let fadeOut = setInterval(() => {
            if (deckA.volume > 0) {
                deckA.volume = Math.max(0, deckA.volume - 0.05);
            }
            if (deckB.volume < startVolumeB) {
                deckB.volume = Math.min(startVolumeB, deckB.volume + 0.05);
            }
            if (deckA.volume <= 0) {
                clearInterval(fadeOut);
                deckA.pause();
            }
        }, fadeTime / 20);
    });

    // **Auto-Load Songs to Decks**
    function loadToDeck(fileData) {
        let deckA = document.getElementById("deckA");
        let deckB = document.getElementById("deckB");
        let liveMonitor = document.getElementById("liveMonitor");

        if (fileData.fileType === "audio") {
            if (!deckA.src || currentDeck === "deckA") {
                deckA.src = fileData.fileUrl;
                deckA.play(); // Auto-play Deck A
                currentDeck = "deckB"; // Switch next song to Deck B
                console.log("Playing on Deck A:", fileData.fileName);
            } else {
                deckB.src = fileData.fileUrl;
                currentDeck = "deckA"; // Switch back to Deck A for the next song
                console.log("Queued to Deck B:", fileData.fileName);
            }
        } else if (fileData.fileType === "video") {
            liveMonitor.src = fileData.fileUrl;
            liveMonitor.play();
            console.log("Playing video on live monitor:", fileData.fileName);
        }
    }

    // **Auto-Play Next Deck When Current One Ends**
    document.getElementById("deckA").addEventListener("ended", function () {
        let deckB = document.getElementById("deckB");
        if (deckB.src) {
            deckB.play();
            currentDeck = "deckA"; // Switch next song back to Deck A
            console.log("Deck A finished. Playing Deck B.");
        }
    });

    document.getElementById("deckB").addEventListener("ended", function () {
        let deckA = document.getElementById("deckA");
        if (deckA.src) {
            deckA.play();
            currentDeck = "deckB"; // Switch next song back to Deck B
            console.log("Deck B finished. Playing Deck A.");
        }
    });

    // **Modify dropItem() to Auto-Send Songs to Decks**
    function dropItem(event) {
        event.preventDefault();
        event.stopPropagation();

        let data = event.dataTransfer.getData("text/plain");
        if (!data) {
            console.warn("No data received from drag event.");
            return;
        }

        try {
            let fileData = JSON.parse(data);
            console.log("Dropped file:", fileData);

            // Load song into Deck A or Deck B
            loadToDeck(fileData);
        } catch (error) {
            console.error("Error parsing JSON in dropItem():", error);
        }
    }

    // **Ensure playlist is a drop zone**
    document.getElementById("playlist").addEventListener("dragover", (event) => {
        event.preventDefault();
    });

    document.getElementById("playlist").addEventListener("drop", dropItem);
});
