const { ipcRenderer } = require("electron");

document.addEventListener("DOMContentLoaded", () => {
    const liveMonitor = document.getElementById("liveMonitor");
    const liveStatus = document.getElementById("live-status");
    let mediaStreams = {}; // Store active camera streams
    let activeCameraId = null;
    let isStreaming = false;
    let rtmpUrl = "rtmp://localhost/live/stream";
    let draggedRow = null; // Track the dragged row for reordering

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

    function getActiveCamera() {
        for (const camId in mediaStreams) {
            const videoElement = document.getElementById(camId);
            if (mediaStreams[camId] && videoElement.srcObject && !videoElement.paused) {
                console.log(`Detected active camera: ${camId}`);
                return camId;
            }
        }
        return null;
    }

    async function goLive(cameraId) {
        try {
            console.log(`Attempting to start camera: ${cameraId}`);
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
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

    function stopLive(cameraId) {
        if (mediaStreams[cameraId]) {
            mediaStreams[cameraId].getTracks().forEach(track => track.stop());
            document.getElementById(cameraId).srcObject = null;
            delete mediaStreams[cameraId];
            if (activeCameraId === cameraId) activeCameraId = null;
            console.log(`Camera ${cameraId} stopped.`);
        }
    }

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

    document.getElementById("stop-stream").addEventListener("click", () => {
        if (!isStreaming) return;
        ipcRenderer.send("stop-ffmpeg");
        isStreaming = false;
        updateLiveStatus(false);
        console.log("Streaming stopped.");
    });

    ipcRenderer.on("stream-status", (event, status) => {
        updateLiveStatus(status);
    });

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

    // Process the playlist:
    // - If deckA is empty and the first queued item is audio, auto-play it.
    // - If the first item is video, do not auto-play; instead, load it into deckB for manual playback.
    // - When deckA is playing and deckB is empty, always queue the next item (song or video) into deckB.
    function processPlaylist() {
        const playlistTable = document.getElementById("playlist-items");
        const deckA = document.getElementById("deckA");
        const deckB = document.getElementById("deckB");

        // If Deck A is empty...
        if ((!deckA.src || deckA.src === "") && playlistTable.firstElementChild) {
            const firstRow = playlistTable.firstElementChild;
            if (firstRow.dataset.fileType === "audio") {
                const fileData = {
                    fileName: firstRow.dataset.fileName,
                    fileType: firstRow.dataset.fileType,
                    fileUrl: firstRow.dataset.fileUrl,
                    fileDuration: firstRow.dataset.fileDuration
                };
                deckA.src = fileData.fileUrl;
                deckA.play();
                console.log("Playing on Deck A:", fileData.fileName);
                firstRow.remove();
            } else {
                // If it's a video, don't auto-play; load it into deckB (if deckB is empty)
                if ((!deckB.src || deckB.src === "") && playlistTable.firstElementChild) {
                    const nextRow = playlistTable.firstElementChild;
                    const fileData = {
                        fileName: nextRow.dataset.fileName,
                        fileType: nextRow.dataset.fileType,
                        fileUrl: nextRow.dataset.fileUrl,
                        fileDuration: nextRow.dataset.fileDuration
                    };
                    deckB.src = fileData.fileUrl;
                    // Store file type info for later reference
                    deckB.dataset.fileType = fileData.fileType;
                    deckB.dataset.fileName = fileData.fileName;
                    console.log("Queued to Deck B (video):", fileData.fileName);
                    nextRow.remove();
                }
            }
        } else if (deckA.src && (!deckB.src || deckB.src === "") && playlistTable.firstElementChild) {
            // If Deck A is playing and Deck B is empty, queue the next track (song or video) into Deck B.
            const nextRow = playlistTable.firstElementChild;
            const fileData = {
                fileName: nextRow.dataset.fileName,
                fileType: nextRow.dataset.fileType,
                fileUrl: nextRow.dataset.fileUrl,
                fileDuration: nextRow.dataset.fileDuration
            };
            deckB.src = fileData.fileUrl;
            deckB.dataset.fileType = fileData.fileType;
            deckB.dataset.fileName = fileData.fileName;
            console.log("Queued to Deck B:", fileData.fileName);
            nextRow.remove();
        }
    }

    // When Deck A ends, shift the track from Deck B into Deck A (only if Deck B contains an audio track)
    // and then refill Deck B from the playlist.
    function shiftTracks() {
        const deckA = document.getElementById("deckA");
        const deckB = document.getElementById("deckB");
        if (deckB.src && deckB.src !== "") {
            deckA.src = deckB.src;
            deckA.play();
            console.log("Shifted track from Deck B to Deck A");
            // Update live-video-monitor to mirror deck A
            let liveMonitor = document.getElementById("liveMonitor");
            liveMonitor.src = deckB.src;
            liveMonitor.play();
            deckB.src = "";
            deckB.removeAttribute("data-file-type");
            deckB.removeAttribute("data-file-name");
            processPlaylist();
        }
    }    

    // loadToDeck always adds the file to the playlist.
    // For audio, trigger processPlaylist() so that auto-play happens if appropriate.
    function loadToDeck(fileData) {
        addToPlaylist(fileData);
        if (fileData.fileType === "audio") {
            processPlaylist();
        }
    }

    // ---- DRAG & DROP HANDLERS ---- //

    function handlePlaylistDrop(event) {
        event.preventDefault();
        event.stopPropagation();
        const dropZone = document.getElementById("playlist");
        dropZone.style.border = "";
        // If a row is being dragged (for reordering), handle that.
        if (draggedRow) {
            handlePlaylistRowDrop(event);
            draggedRow = null;
            updatePlaylistOrder();
            return;
        }
        const data = event.dataTransfer.getData("text/plain");
        if (!data) {
            console.warn("No data received from drag event.");
            return;
        }
        try {
            const fileData = JSON.parse(data);
            console.log("Dropped file from library:", fileData);
            loadToDeck(fileData);
        } catch (error) {
            console.error("Error parsing JSON in handlePlaylistDrop():", error);
        }
    }

    function handlePlaylistRowDrop(event) {
        event.preventDefault();
        event.stopPropagation();
        const dropZone = document.getElementById("playlist");
        dropZone.style.border = "";
        const targetRow = event.target.closest("tr");
        if (!targetRow || targetRow === draggedRow) return;
        const playlistItems = document.getElementById("playlist-items");
        playlistItems.insertBefore(draggedRow, targetRow);
        updatePlaylistOrder();
    }

    function dragItem(event) {
        const row = event.target.closest("tr");
        if (!row) {
            console.warn("Drag started outside a valid row.");
            return;
        }
        draggedRow = row;
        const fileData = {
            fileName: row.dataset.fileName,
            fileType: row.dataset.fileType,
            fileUrl: row.dataset.fileUrl,
            fileDuration: row.dataset.fileDuration || "--:--"
        };
        event.dataTransfer.setData("text/plain", JSON.stringify(fileData));
        console.log("Dragging item:", fileData);
    }

    function allowDrop(event) {
        event.preventDefault();
        event.stopPropagation();
        const dropZone = document.getElementById("playlist");
        dropZone.style.border = "2px dashed #ffaa00";
    }

    function updatePlaylistOrder() {
        const playlistItems = document.getElementById("playlist-items").children;
        console.log("Playlist order updated:", playlistItems);
    }

    // Attach drop and dragover events for the playlist container.
    document.getElementById("playlist").addEventListener("drop", handlePlaylistDrop);
    document.getElementById("playlist").addEventListener("dragover", allowDrop);

    // Attach drag & drop events for every row already in the playlist.
    document.querySelectorAll("#playlist-items tr").forEach(row => {
        row.setAttribute("draggable", true);
        row.addEventListener("dragstart", dragItem);
        row.addEventListener("dragover", allowDrop);
        row.addEventListener("drop", handlePlaylistRowDrop);
    });

    // ---- Helper: addToPlaylist (used when a file is dropped) ---- //
    function addToPlaylist(fileData) {
        const row = document.createElement("tr");
        row.dataset.fileName = fileData.fileName;
        row.dataset.fileType = fileData.fileType;
        row.dataset.fileUrl = fileData.fileUrl;
        row.dataset.fileDuration = fileData.fileDuration;
        row.setAttribute("draggable", true);
        row.addEventListener("dragstart", dragItem);
        row.addEventListener("dragover", allowDrop);
        row.addEventListener("drop", handlePlaylistRowDrop);

        const titleCell = document.createElement("td");
        titleCell.textContent = fileData.fileName;
        const typeCell = document.createElement("td");
        typeCell.textContent = fileData.fileType || "Audio";
        const lengthCell = document.createElement("td");
        lengthCell.textContent = fileData.fileDuration || "--:--";

        row.appendChild(titleCell);
        row.appendChild(typeCell);
        row.appendChild(lengthCell);

        // Remove the placeholder row if it exists.
        const placeholderRow = document.querySelector(".drop-placeholder");
        if (placeholderRow) placeholderRow.remove();

        document.getElementById("playlist-items").appendChild(row);
        console.log("File successfully added to playlist:", fileData.fileName);
    }

    // When Deck A ends, shift the track from Deck B into Deck A.
    document.getElementById("deckA").addEventListener("ended", shiftTracks);

    // ---- Attach click event for manually playing video files from the playlist ---- //
    document.getElementById("playlist-items").addEventListener("click", function(event) {
        const row = event.target.closest("tr");
        if (row && row.dataset.fileType === "video") {
            let deckA = document.getElementById("deckA");
            let liveMonitor = document.getElementById("liveMonitor");
            deckA.src = row.dataset.fileUrl;
            deckA.play();
            // Also update the live monitor with the same source
            liveMonitor.src = row.dataset.fileUrl;
            liveMonitor.play();
            console.log("Manually playing video:", row.dataset.fileName);
            row.remove();
        }
    });    
});
