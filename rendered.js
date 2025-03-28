    const { ipcRenderer } = require("electron");

    document.addEventListener("DOMContentLoaded", () => {
        const liveMonitor = document.getElementById("liveMonitor");
        const liveStatus = document.getElementById("live-status");
        const playlistDropZone = document.getElementById("playlist");
        const deckA = document.getElementById("deckA");
        const deckB = document.getElementById("deckB");
        const seekControl = document.getElementById("seekA"); // Seek Bar
        let mediaStreams = {}; // Store active camera streams
        let activeCameraId = null;
        let isStreaming = false;
        let rtmpUrl = "rtmp://localhost/live/stream";
        let draggedRow = null; // Track the dragged row for reordering
        let lastSeekTimeUpdate = 0; // Used to prevent excessive updates
        let isScrubbing = false; // Track if user is scrubbing the seek bar

        // **Sync Live Monitor when Deck A plays a video**
        deckA.addEventListener("play", () => {
            if (deckA.dataset.fileType === "video") {
                liveMonitor.src = deckA.src;
                liveMonitor.play();
                deckA.muted = true;
                console.log("Video playing – deckA muted.");
            } else if (deckA.dataset.fileType === "audio") {
                deckA.muted = false;
                console.log("Audio playing – deckA unmuted.");
            }
        });        
        
        // **Throttled Live Monitor Sync Using requestAnimationFrame**
        function syncLiveMonitor() {
            if (deckA.dataset.fileType === "video" && deckA.duration && !isScrubbing) {
                requestAnimationFrame(() => {
                    seekControl.value = (deckA.currentTime / deckA.duration) * 100;
                    if (Math.abs(liveMonitor.currentTime - deckA.currentTime) > 0.2) {
                        liveMonitor.currentTime = deckA.currentTime;
                    }
                });
            }
        }

        // **Throttle updates to prevent stuttering**
        deckA.addEventListener("timeupdate", syncLiveMonitor);

        // **Scrubbing: Seek Deck A & Live Monitor Smoothly**
        seekControl.addEventListener("input", (event) => {
            if (deckA.dataset.fileType === "video" && deckA.duration) {
                isScrubbing = true;
                let seekTime = (event.target.value / 100) * deckA.duration;
                liveMonitor.pause();
                deckA.currentTime = seekTime;
                liveMonitor.currentTime = seekTime;
            }
        });

        // **Resume video after user finishes scrubbing**
        seekControl.addEventListener("change", () => {
            if (deckA.dataset.fileType === "video") {
                isScrubbing = false;
                liveMonitor.play();
            }
        });

        // **Prevent seeking in Live Monitor if playing a camera stream**
        liveMonitor.addEventListener("seeking", (event) => {
            if (!deckA.src || deckA.dataset.fileType !== "video") {
                event.preventDefault();
            }
        });

        // **Pause Live Monitor when Deck A is paused**
        deckA.addEventListener("pause", () => {
            liveMonitor.pause();
        });

        // **Auto-Shift Tracks When Deck A Ends**
        deckA.addEventListener("ended", () => {
            console.log("Deck A video ended, shifting to next track");
            shiftTracks();
        });

        function shiftTracks() {
            if (deckB.src && deckB.src !== "") {
                console.log("Shifting track from Deck B to Deck A...");
                deckA.src = deckB.src;
                deckA.dataset.fileType = deckB.dataset.fileType;
                deckA.dataset.fileName = deckB.dataset.fileName;
                
                // If the new track is an audio file (mp3), ensure deck A is unmuted
                if (deckA.dataset.fileType === "audio") {
                    deckA.muted = false;
                    console.log("Audio track detected – deckA unmuted.");
                }
                
                // For video files, sync with liveMonitor as before
                if (deckA.dataset.fileType === "video") {
                    liveMonitor.src = deckA.src;
                    liveMonitor.play();
                }
                
                deckA.play();
                
                // Clear Deck B
                deckB.src = "";
                deckB.removeAttribute("data-file-type");
                deckB.removeAttribute("data-file-name");
            }
            
            // Load next track from the playlist if available.
            processPlaylist();
        }        

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
            let fadeTime = 5000; // 5 seconds fade duration
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

        function processPlaylist() {
            const playlistTable = document.getElementById("playlist-items");
        
            // If Deck A is empty, prioritize loading a track to Deck A
            if ((!deckA.src || deckA.src === "") && playlistTable.firstElementChild) {
                const firstRow = playlistTable.firstElementChild;
                const fileData = {
                    fileName: firstRow.dataset.fileName,
                    fileType: firstRow.dataset.fileType,
                    fileUrl: firstRow.dataset.fileUrl,
                    fileDuration: firstRow.dataset.fileDuration
                };
        
                deckA.src = fileData.fileUrl;
                deckA.dataset.fileType = fileData.fileType;
                deckA.dataset.fileName = fileData.fileName;
                
                console.log("Playing on Deck A:", fileData.fileName);
        
                if (fileData.fileType === "video") {
                    liveMonitor.src = fileData.fileUrl;
                }
                
                deckA.play();
                firstRow.remove();
            }
        
            // If Deck B is empty and there are playlist items, load a track to Deck B
            if ((!deckB.getAttribute("src") || deckB.getAttribute("src") === "") && playlistTable.firstElementChild) {
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
        
        function shiftTracks() {
            if (deckB.src && deckB.src !== "") {
                deckA.src = deckB.src;
                deckA.dataset.fileType = deckB.dataset.fileType;
                deckA.dataset.fileName = deckB.dataset.fileName;
                
                // If the new file is a video, sync with live monitor
                if (deckA.dataset.fileType === "video") {
                    liveMonitor.src = deckA.src;
                    liveMonitor.play();
                }
                
                deckA.play();
        
                // Clear Deck B
                deckB.src = "";
                deckB.removeAttribute("data-file-type");
                deckB.removeAttribute("data-file-name");
            }
        
            // Process next song from the playlist
            processPlaylist();
        }
        
        
        // Ensure this event listener is correctly set up
        document.addEventListener("DOMContentLoaded", () => {
            const deckA = document.getElementById("deckA");
            
            deckA.addEventListener("ended", () => {
                console.log("Deck A track ended, shifting tracks");
                
                // Clear Deck A before shifting
                deckA.src = "";
                deckA.removeAttribute("data-file-type");
                deckA.removeAttribute("data-file-name");
                
                shiftTracks();
            });
        });

        // loadToDeck always adds the file to the playlist.
        // For audio files, trigger processPlaylist() so that auto-play happens if appropriate.
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

        // Attach additional dragenter and dragleave events:
        playlistDropZone.addEventListener("dragenter", (event) => {
            event.preventDefault();
            event.stopPropagation();
            playlistDropZone.style.border = "2px dashed #ffaa00";
            playlistDropZone.style.background = "#333333";
        });

        playlistDropZone.addEventListener("dragleave", (event) => {
            event.preventDefault();
            event.stopPropagation();
            playlistDropZone.style.border = "";
            playlistDropZone.style.background = "";
        });

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
        
            const removeCell = document.createElement("td");
            const removeButton = document.createElement("button");
            removeButton.textContent = "Remove";
            removeButton.addEventListener("click", () => {
                row.remove();
                console.log("Removed from playlist:", fileData.fileName);
            });
            removeCell.appendChild(removeButton);
            row.appendChild(removeCell);
        
            const placeholderRow = document.querySelector(".drop-placeholder");
            if (placeholderRow) placeholderRow.remove();
        
            document.getElementById("playlist-items").appendChild(row);
            console.log("File successfully added to playlist:", fileData.fileName);
        }

        // Attach click event for manually playing video files from the playlist.
        document.getElementById("playlist-items").addEventListener("click", function(event) {
            const row = event.target.closest("tr");
            if (row && row.dataset.fileType === "video") {
                deckA.src = row.dataset.fileUrl;
                deckA.dataset.fileType = row.dataset.fileType;
                deckA.dataset.fileName = row.dataset.fileName;
                
                liveMonitor.src = deckA.src;
                liveMonitor.play();
                
                deckA.play();
                row.remove();
            }
        });    
    });
