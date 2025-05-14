// Helper functions
function updateLiveStatus(status) {
  const liveStatus = document.getElementById("live-status");
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

function confirmAndReplaceLiveMonitor(action) {
  const lm = document.getElementById("liveMonitor");
  const hasSomethingPlaying =
    (lm.srcObject && lm.srcObject.getTracks().length > 0) ||
    !!lm.currentSrc;
  
  // If there's a live stream, don't show confirmation
  if (hasSomethingPlaying && lm.srcObject && lm.srcObject.getTracks().length > 0) {
    // If it's a live camera stream, just execute the action
    action();
    return;
  }
  
  // For other media (videos, audio), show confirmation
  if (hasSomethingPlaying && !confirm("There is currently a media playing, would you like to continue?")) {
    return;
  }
  action();    
}

// When the user clicks "Go Live" on a camera, show its stream in the live monitor.
window.goLive = async function(cameraId) {
  if (!confirm(`Do you want to add camera ${cameraId} to the live monitor feed?`)) {
    return;
  }

  confirmAndReplaceLiveMonitor(async () => {
    const camEl = document.getElementById(cameraId);
    const liveMonitor = document.getElementById("liveMonitor");
    
    try {
      // 1) Get the camera stream
      const deviceId = camEl.dataset.deviceId
        || (await navigator.mediaDevices
             .enumerateDevices()
             .then(list => list.find(d => d.kind==="videoinput").deviceId));
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: deviceId }}, 
        audio: false
      });

      // 2) Show the stream in the camera preview
      camEl.srcObject = stream;
      camEl.dataset.deviceId = deviceId;
      camEl.play();

      // 3) Show the same stream in the Live Monitor
      liveMonitor.srcObject = stream;
      liveMonitor.play();
      
      console.log(`Camera ${cameraId} is now live in monitor.`);
      // Don't update live status here - only when actually streaming
    } catch (error) {
      console.error('Error starting camera stream:', error);
      alert('Failed to start camera stream: ' + error.message);
    }
  });
};

// Stop a camera stream.
window.stopLive = function(cameraId) {
  const videoElement = document.getElementById(cameraId);
  const liveMonitor = document.getElementById("liveMonitor");
  
  if (videoElement.srcObject) {
    videoElement.srcObject.getTracks().forEach(track => track.stop());
    videoElement.srcObject = null;
    videoElement.dataset.ready = "false";
  }
  
  if (liveMonitor.srcObject) {
    liveMonitor.srcObject.getTracks().forEach(track => track.stop());
    liveMonitor.srcObject = null;
    liveMonitor.pause();
  }
  
  window.electronAPI.stopFFmpeg();
  updateLiveStatus(false);
  console.log(`Camera ${cameraId} stopped.`);
};

// Add this function before the DOMContentLoaded event listener
async function getBrowserDeviceIdForFFmpegName(ffmpegDeviceName) {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoInputs = devices.filter(device => device.kind === 'videoinput');
    
    // Try to find an exact match first
    const exactMatch = videoInputs.find(device => 
      device.label === ffmpegDeviceName || 
      device.label.includes(ffmpegDeviceName)
    );
    
    if (exactMatch) {
      return exactMatch.deviceId;
    }
    
    // If no exact match, try to find a partial match
    const partialMatch = videoInputs.find(device => 
      ffmpegDeviceName.includes(device.label) ||
      device.label.toLowerCase().includes(ffmpegDeviceName.toLowerCase())
    );
    
    if (partialMatch) {
      return partialMatch.deviceId;
    }
    
    // If still no match, return the first available video input
    if (videoInputs.length > 0) {
      console.warn(`No exact match found for ${ffmpegDeviceName}, using first available camera`);
      return videoInputs[0].deviceId;
    }
    
    throw new Error('No video input devices found');
  } catch (error) {
    console.error('Error getting browser device ID:', error);
    throw error;
  }
}

document.addEventListener("DOMContentLoaded", async () => {
let playlistFiles = [];
let currentIndex  = -1; 
function updateMediaLibrary(inputElement, targetTableId, mediaType) {
  console.log(`updateMediaLibrary called for ${mediaType}`, inputElement.files);
  const targetTable = document.getElementById(targetTableId);
  Array.from(inputElement.files).forEach(file => {
    if (!file) return;

    let row = document.createElement("tr");
    row.setAttribute("draggable", true);
    row.dataset.fileName   = file.name;
    row.dataset.fileType   = mediaType;
    row.dataset.fileUrl    = URL.createObjectURL(file);
    row.dataset.fileDuration = "--:--";

    // optional: if you need the real path in Electron
    row.dataset.filePath   = file.path || "";

    row.addEventListener("dragstart", dragItem);

    let titleCell  = document.createElement("td");
    titleCell.textContent = file.name;
    let lengthCell = document.createElement("td");
    lengthCell.textContent = "Loading…";

    row.appendChild(titleCell);
    row.appendChild(lengthCell);
    targetTable.appendChild(row);

    // load metadata
    if (mediaType === "audio") {
      getAudioDuration(file, lengthCell, row);
    } else {
      getVideoDuration(file, lengthCell, row);
    }
  });
}

const audioInput = document.getElementById('audioUpload');
if (audioInput) {
  audioInput.addEventListener('change', e => {
    console.log('Audio selected:', e.target.files);
    updateMediaLibrary(e.target, 'audio-library-items', 'audio');
  });
}

const videoInput = document.getElementById('videoUpload');
if (videoInput) {
  videoInput.addEventListener('change', e => {
    console.log('Video selected:', e.target.files);
    updateMediaLibrary(e.target, 'video-library-items', 'video');
  });
}

async function populateCameraDevices() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoInputs = devices.filter(device => device.kind === 'videoinput');
    const videoDevices = videoInputs.map(device => ({
      label: device.label || `Camera ${videoInputs.indexOf(device) + 1}`,
      deviceId: device.deviceId
    }));
    ['cam1', 'cam2', 'cam3', 'cam4'].forEach(camId => {
      const videoEl = document.getElementById(camId);
      if (videoEl) {
        videoEl.dataset.availableDevices = JSON.stringify(videoDevices);
      }
    });
    console.log("Populated camera devices for previews.");
  } catch (error) {
    console.error("Error populating camera devices:", error);
  }
}

function showCameraStream(stream) {
  const lm = document.getElementById("liveMonitor");
  lm.pause(); lm.removeAttribute("src"); lm.removeAttribute("srcObject");
  lm.srcObject = stream;
  lm.play();
}

function showFile(url) {
  const lm = document.getElementById("liveMonitor");
  if (lm.srcObject) lm.srcObject.getTracks().forEach(t=>t.stop());
  lm.pause(); lm.removeAttribute("srcObject");
  lm.src = url;
  lm.play();
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function getAudioDuration(file, lengthCell, row) {
  const audio = new Audio();
  audio.src = URL.createObjectURL(file);
  audio.addEventListener("loadedmetadata", function () {
      let duration = formatTime(audio.duration);
      lengthCell.textContent = duration;
      row.dataset.fileDuration = duration;
      URL.revokeObjectURL(audio.src);
  });
}

function getVideoDuration(file, lengthCell, row) {
  const video = document.createElement("video");
  video.preload = "metadata";
  video.src = URL.createObjectURL(file);
  video.addEventListener("loadedmetadata", function () {
      let duration = formatTime(video.duration);
      lengthCell.textContent = duration;
      row.dataset.fileDuration = duration;
      URL.revokeObjectURL(video.src);
  });
}

// Update the preview for a given camera element with a new stream.
async function updateCameraPreview(camId, deviceId) {
  try {
    const videoElement = document.getElementById(camId);
    if (videoElement.srcObject) {
      videoElement.srcObject.getTracks().forEach(track => track.stop());
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: { exact: deviceId } },
      audio: false
    });
    videoElement.srcObject = stream;
    videoElement.play();
    console.log(`Updated preview for ${camId} with device ${deviceId}`);
  } catch (error) {
    console.error(`Error updating preview for ${camId}:`, error);
  }
}

// Show the settings dropdown for selecting a camera for a preview.
window.showSettings = async function(button, settingsId, camId) {
  const videoElement = document.getElementById(camId);
  if (!videoElement) {
    console.error(`Video element with id "${camId}" not found.`);
    return;
  }

  try {
    // Get physical cameras using MediaDevices API
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoInputs = devices.filter(device => device.kind === 'videoinput');
    
    if (videoInputs.length === 0) {
      alert("No camera devices found!");
      return;
    }

    let existingMenu = document.getElementById(settingsId);
    if (existingMenu) {
      existingMenu.remove();
      return;
    }

    let settingsDiv = document.createElement("div");
    settingsDiv.id = settingsId;
    settingsDiv.className = "settings-menu";
    const select = document.createElement("select");
    select.classList.add("camera-select");

    // Add a default "Select Camera" option
    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.textContent = "Select Camera";
    select.appendChild(defaultOption);

    // Add all available physical cameras
    videoInputs.forEach((device, index) => {
      const option = document.createElement("option");
      option.value = device.deviceId;
      // Use device label if available, otherwise use a generic name
      option.textContent = device.label || `Camera ${index + 1}`;
      select.appendChild(option);
    });

    // Set current selection if any
    if (videoElement.dataset.deviceId) {
      select.value = videoElement.dataset.deviceId;
    }

    select.addEventListener("change", async (event) => {
      const selectedDeviceId = event.target.value;
      if (!selectedDeviceId) {
        // If "Select Camera" is chosen, stop the current stream
        if (videoElement.srcObject) {
          videoElement.srcObject.getTracks().forEach(track => track.stop());
          videoElement.srcObject = null;
        }
        settingsDiv.remove();
        return;
      }

      try {
        // Stop any existing stream
        if (videoElement.srcObject) {
          videoElement.srcObject.getTracks().forEach(track => track.stop());
        }

        // Get stream from selected camera
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: selectedDeviceId } },
          audio: false
        });

        // Update video element
        videoElement.srcObject = stream;
        videoElement.dataset.deviceId = selectedDeviceId;
        videoElement.play();

        console.log(`Camera ${camId} updated with device: ${selectedDeviceId}`);
      } catch (error) {
        console.error(`Error setting up camera for ${camId}:`, error);
        alert(`Failed to set up camera: ${error.message}`);
      }

      settingsDiv.remove();
    });

    settingsDiv.appendChild(select);
    document.body.appendChild(settingsDiv);
    const buttonRect = button.getBoundingClientRect();
    settingsDiv.style.position = "absolute";
    settingsDiv.style.left = `${buttonRect.left}px`;
    settingsDiv.style.top = `${buttonRect.bottom}px`;
    settingsDiv.style.zIndex = 9999;

    // Add some basic styling to the settings menu
    settingsDiv.style.backgroundColor = "#333";
    settingsDiv.style.padding = "10px";
    settingsDiv.style.borderRadius = "5px";
    settingsDiv.style.boxShadow = "0 2px 10px rgba(0,0,0,0.2)";
    
    select.style.width = "200px";
    select.style.padding = "5px";
    select.style.backgroundColor = "#444";
    select.style.color = "white";
    select.style.border = "1px solid #555";
    select.style.borderRadius = "3px";

    document.addEventListener('click', function handleOutsideClick(e) {
      if (!settingsDiv.contains(e.target) && e.target !== button) {
        settingsDiv.remove();
        document.removeEventListener('click', handleOutsideClick);
      }
    });
  } catch (error) {
    console.error("Error in showSettings:", error);
    alert("Error loading camera settings: " + error.message);
  }
};

// Bruce 
  try {
    const ffmpegDevices = await window.electronAPI.getFFmpegDevices();
    console.log("DirectShow devices from FFmpeg:", ffmpegDevices);
    const streamSelect = document.getElementById("streamSelect");
    if (streamSelect) {
      ffmpegDevices.forEach(name => {
        const option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        streamSelect.appendChild(option);
      });
      document.getElementById("start-stream").addEventListener("click", async () => {
        console.log("Start Live Stream button clicked!");
        const ffmpegDeviceName = streamSelect.value;
        console.log("Selected FFmpeg device:", ffmpegDeviceName);
        const browserDeviceId = await getBrowserDeviceIdForFFmpegName(ffmpegDeviceName);
        if (!browserDeviceId) {
          alert("No matching browser device found for the selected camera.");
          return;
        }
        console.log("Mapped to browser device ID:", browserDeviceId);
        await updateCameraPreview("liveMonitor", browserDeviceId);
        const rtmpUrl = "rtmp://localhost/live/stream";
        console.log("Starting FFmpeg stream with:", rtmpUrl, ffmpegDeviceName);
        window.electronAPI.startFFmpeg(rtmpUrl, ffmpegDeviceName);
      });
    }
  } catch (err) {
    console.error("Error fetching FFmpeg devices:", err);
  }

    
  function highlightRow(idx) {
    document.querySelectorAll('#playlist-items tr').forEach(r => 
      r.classList.remove('playing')
    );
    const rows = Array.from(document.querySelectorAll('#playlist-items tr:not(.drop-placeholder)'));
    if (rows[idx]) rows[idx].classList.add('playing');
  }

  await populateCameraDevices();

  const liveMonitor = document.getElementById("liveMonitor");
  const liveStatus = document.getElementById("live-status");
  const playlistDropZone = document.getElementById("playlist");
  const deckA = document.getElementById("deckA");
  const deckB = document.getElementById("deckB");
  const seekControl = document.getElementById("seekA"); 
  let mediaStreams = {}; 
  let activeCameraId = null;
  let isStreaming = false;
  let rtmpUrl = "rtmp://localhost/live/stream";
  let draggedRow = null; 
  let lastSeekTimeUpdate = 0; 
  let isScrubbing = false; 

  deckA.addEventListener("play", () => {
      if (deckA.dataset.fileType === "video") {
          showFile(deckA.src);
          deckA.muted = true;
          console.log("Video playing – deckA muted.");
      } else if (deckA.dataset.fileType === "audio") {
          deckA.muted = false;
          console.log("Audio playing – deckA unmuted.");
      }
  });        
  
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

  deckA.addEventListener("timeupdate", syncLiveMonitor);

  seekControl.addEventListener("input", (event) => {
      if (deckA.dataset.fileType === "video" && deckA.duration) {
          isScrubbing = true;
          let seekTime = (event.target.value / 100) * deckA.duration;
          liveMonitor.pause();
          deckA.currentTime = seekTime;
          liveMonitor.currentTime = seekTime;
      }
  });

  seekControl.addEventListener("change", () => {
      if (deckA.dataset.fileType === "video") {
          isScrubbing = false;
          liveMonitor.play();
      }
  });

  liveMonitor.addEventListener("seeking", (event) => {
      if (!deckA.src || deckA.dataset.fileType !== "video") {
          event.preventDefault();
      }
  });

  deckA.addEventListener("pause", () => {
      liveMonitor.pause();
  });

  deckA.addEventListener("ended", () => {
    currentIndex++;
    loadDeckA(currentIndex);
    loadDeckB(currentIndex + 1);
  });
  

  function shiftTracks() {
      if (deckB.src && deckB.src !== "") {
          console.log("Shifting track from Deck B to Deck A...");
          deckA.src = deckB.src;
          deckA.dataset.fileType = deckB.dataset.fileType;
          deckA.dataset.fileName = deckB.dataset.fileName;
          
          if (deckA.dataset.fileType === "audio") {
              deckA.muted = false;
              console.log("Audio track detected – deckA unmuted.");
          }

          if (deckA.dataset.fileType === "video") {
            showFile(deckA.src);
          }
          
          deckA.play();
          
          deckB.src = "";
          deckB.removeAttribute("data-file-type");
          deckB.removeAttribute("data-file-name");
      }
      processPlaylist();
  }
  
  async function saveSession() {
    const { dialog } = require('electron').remote;
    const fs       = require('fs');
    // build session payload
    const rows = Array.from(document.querySelectorAll('#playlist-items tr:not(.drop-placeholder)'));
    const playlist = rows.map(r => ({
      fileName: r.dataset.fileName,
      fileUrl:  r.dataset.fileUrl,
      fileType: r.dataset.fileType,
      fileDuration: r.dataset.fileDuration
    }));
    const nowIdx = rows.findIndex(r => r.classList.contains('playing'));
    const deckA = document.getElementById('deckA');
    const name = await dialog.showInputBox({ prompt: 'Session name?' })
               || `session-${new Date().toISOString().slice(0,10)}`;
    const session = {
      created: new Date().toISOString(),
      name,
      playlist,
      nowPlayingIndex: nowIdx,
      deckA: { src: deckA.src, currentTime: deckA.currentTime }
    };
  
    const { filePath } = await dialog.showSaveDialog({
      title: 'Save session',
      defaultPath: `${name}.json`,
      filters: [{ name:'Session', extensions:['json'] }]
    });
    if (filePath) fs.writeFileSync(filePath, JSON.stringify(session,null,2), 'utf-8');
  }
  
  async function loadSession() {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Load session',
      properties: ['openFile'],
      filters: [{ name:'Session', extensions:['json'] }]
    });
    if (canceled) return;
    const session = JSON.parse(fs.readFileSync(filePaths[0], 'utf-8'));
  
    // re-populate playlist
    const tbody = document.getElementById('playlist-items');
    tbody.innerHTML = `<tr class="drop-placeholder">
        <td colspan="4" style="text-align:center;color:gray;">Drag & drop items here</td>
      </tr>`;
    session.playlist.forEach(item => addToPlaylist(item));
  
    // restore now playing
    if (session.nowPlayingIndex >= 0) {
      const deckA = document.getElementById('deckA');
      deckA.src = session.deckA.src;
      deckA.currentTime = session.deckA.currentTime;
      deckA.play();
      highlightRow(session.nowPlayingIndex);
    }
  }
  
  // wire up buttons
  document.getElementById('save-session').addEventListener('click', saveSession);
  document.getElementById('load-session').addEventListener('click', loadSession);
  

  function getActiveCamera() {
    const camIds = ['cam1','cam2','cam3','cam4'];
    for (let id of camIds) {
      const el = document.getElementById(id);
      if (el && el.srcObject && el.srcObject.getTracks().length > 0) {
        // we found a live camera stream
        return id;
      }
    }
    return null;
  }        

  const startBtn = document.getElementById("start-stream");
  const stopBtn = document.getElementById("stop-stream");
  let mediaRecorder;
  let ws;

  // Helper function to get supported MIME type
  function getSupportedMimeType() {
    const types = [
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=h264,opus',
      'video/webm',
      'video/mp4'
    ];
    
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        console.log('Using MIME type:', type);
        return type;
      }
    }
    return null;
  }

  startBtn.addEventListener("click", async () => {
    if (!confirm("Are you sure you want to start live streaming? This will begin broadcasting the current live monitor feed.")) {
      return;
    }

    try {
      const liveMonitor = document.getElementById("liveMonitor");
      if (!liveMonitor.srcObject && !liveMonitor.src) {
        alert("No content in Live Monitor! Please add some content first.");
        return;
      }

      // Start FFmpeg stream
      const rtmpUrl = "rtmp://localhost/live/stream";
      console.log("Starting stream with content from Live Monitor");
      
      // Start WebSocket streaming
      try {
        // Check if captureStream is supported
        if (!liveMonitor.captureStream) {
          console.warn("captureStream not supported in this browser");
          return;
        }

        const stream = liveMonitor.captureStream(30);
        const mimeType = getSupportedMimeType();
        
        if (!mimeType) {
          console.warn("No supported MIME types found for MediaRecorder");
          return;
        }

        ws = new WebSocket("ws://localhost:9999");
        
        ws.addEventListener("open", () => {
          try {
            mediaRecorder = new MediaRecorder(stream, { 
              mimeType: mimeType,
              videoBitsPerSecond: 2500000,
              audioBitsPerSecond: 192000
            });
            
            mediaRecorder.ondataavailable = e => {
              if (e.data.size > 0 && ws.readyState === WebSocket.OPEN) {
                try {
                  ws.send(e.data);
                } catch (error) {
                  console.error('Error sending data to WebSocket:', error);
                }
              }
            };

            mediaRecorder.onerror = (event) => {
              console.error('MediaRecorder error:', event);
              alert('MediaRecorder error: ' + event.error);
              updateLiveStatus(false);
            };
            
            mediaRecorder.start(500);
            console.log("MediaRecorder started successfully with mimeType:", mimeType);
            updateLiveStatus(true); // Only update live status when actually streaming
          } catch (error) {
            console.error('Error starting MediaRecorder:', error);
            alert('Failed to start MediaRecorder: ' + error.message);
            updateLiveStatus(false);
          }
        });

        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          alert('WebSocket error: ' + error.message);
          updateLiveStatus(false);
        };
      } catch (error) {
        console.warn("WebSocket streaming not available:", error);
        alert('WebSocket streaming not available: ' + error.message);
        updateLiveStatus(false);
      }

    } catch (error) {
      console.error("Error starting stream:", error);
      alert("Failed to start stream: " + error.message);
      updateLiveStatus(false);
    }
  });

  stopBtn.addEventListener("click", () => {
    if (!confirm("Are you sure you want to stop the live stream?")) {
      return;
    }

    try {
      // Stop MediaRecorder if active
      if (mediaRecorder && mediaRecorder.state !== "inactive") {
        try {
          mediaRecorder.stop();
        } catch (error) {
          console.error('Error stopping MediaRecorder:', error);
        }
        mediaRecorder = null;
      }

      // Close WebSocket if open
      if (ws && ws.readyState === WebSocket.OPEN) {
        try {
          ws.close();
        } catch (error) {
          console.error('Error closing WebSocket:', error);
        }
        ws = null;
      }

      updateLiveStatus(false);
    } catch (error) {
      console.error("Error stopping stream:", error);
    }
  });

  document.getElementById("fadeButton").addEventListener("click", function () {
      let fadeTime = 5000;
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
  
    const playlist = document.getElementById('playlist');

    playlist.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      playlist.classList.add('drag-over');  // optional visual feedback
    });
    
    playlist.addEventListener('dragleave', e => {
      e.preventDefault();
      playlist.classList.remove('drag-over');
    });
    
    playlist.addEventListener('drop', e => {
      e.preventDefault();
      playlist.classList.remove('drag-over');
    
      const raw = e.dataTransfer.getData('application/json');
      if (!raw) return;
      const fileData = JSON.parse(raw);
    
      // 1) Add a row to the UI
      addToPlaylist(fileData);
    
      // 2) Add to the array
      playlistFiles.push(fileData);
    
      // 3) If this is the very first track, start Deck A
      if (currentIndex === -1) {
        currentIndex = 0;
        loadDeckA(currentIndex);
      }
    
      // 4) Always (re)load Deck B with the *next* track
      loadDeckB(currentIndex + 1);
    });
    
    async function saveSession() {
      // build the session object
      const rows = Array.from(document.querySelectorAll('#playlist-items tr:not(.drop-placeholder)'));
      const playlist = rows.map(r => ({
        fileName:     r.dataset.fileName,
        fileUrl:      r.dataset.fileUrl,
        fileType:     r.dataset.fileType,
        fileDuration: r.dataset.fileDuration
      }));
      const nowIdx = rows.findIndex(r => r.classList.contains('playing'));
      const deckA = document.getElementById('deckA');
      const session = {
        created: new Date().toISOString(),
        name:    await dialog.showInputBox({ prompt: 'Session name?' }) || `session-${Date.now()}`,
        playlist,
        nowPlayingIndex: nowIdx,
        deckA: { src: deckA.src, currentTime: deckA.currentTime }
      };
    
      const { filePath } = await dialog.showSaveDialog({
        title: 'Save session file',
        defaultPath: `${session.name}.json`,
        filters: [{ name:'Session', extensions:['json'] }]
      });
      if (!filePath) return;
      fs.writeFileSync(filePath, JSON.stringify(session, null,2), 'utf-8');
    }
    
    async function loadSession() {
      const { canceled, filePaths } = await dialog.showOpenDialog({
        title: 'Open session file',
        properties: ['openFile'],
        filters: [{ name:'Session', extensions:['json'] }]
      });
      if (canceled || !filePaths.length) return;
      const session = JSON.parse(fs.readFileSync(filePaths[0], 'utf-8'));
    
      // clear existing
      document.getElementById('playlist-items').innerHTML = '';
      session.playlist.forEach(item => {
        addToPlaylist(item);          // your existing helper
      });
    
      // restore "now playing"
      if (session.nowPlayingIndex >= 0) {
        highlightRow(session.nowPlayingIndex);
        const deckA = document.getElementById('deckA');
        deckA.src = session.deckA.src;
        deckA.currentTime = session.deckA.currentTime;
        deckA.play();
      }
    }
    
    // wire up your buttons:
    document.getElementById('save-session').addEventListener('click', saveSession);
    document.getElementById('load-session').addEventListener('click', loadSession);
  
  function playMedia(url, type) {
      if (type === "audio") {
          let deckA = document.getElementById("deckA");
          deckA.src = url;
          deckA.play();
      } else if (type === "video") {
          let monitor = document.getElementById("liveMonitor");
          monitor.src = url;
          monitor.play();
      }
  }
  
  function processPlaylist() {
    const playlistTable = document.getElementById("playlist-items");
    const rows = Array.from(playlistTable.querySelectorAll('tr:not(.drop-placeholder)'));
    if (!deckA.src && rows.length) {
      const fileData = {
        fileName: rows[0].dataset.fileName,
        fileType: rows[0].dataset.fileType,
        fileUrl: rows[0].dataset.fileUrl,
        fileDuration: rows[0].dataset.fileDuration
      };
      deckA.src = fileData.fileUrl;
      deckA.dataset.fileType = fileData.fileType;
      
      // Set audio properties
      if (fileData.fileType === "audio") {
        deckA.muted = false;
      } else if (fileData.fileType === "video") {
        deckA.muted = true;
      }
      
      deckA.play();
      highlightRow(0);
    }
  }

  function loadToDeck(fileData) {
      addToPlaylist(fileData);
      if (fileData.fileType === "audio") processPlaylist();
  }
  
  function highlightRow(idx) {
    document.querySelectorAll('#playlist-items tr').forEach(r =>
      r.classList.remove('playing')
    );
    const rows = Array.from(
      document.querySelectorAll('#playlist-items tr:not(.drop-placeholder)')
    );
    if (rows[idx]) rows[idx].classList.add('playing');
  }
  
  function loadDeckA(idx) {
    if (idx < 0 || idx >= playlistFiles.length) return;
    const fd = playlistFiles[idx];
    deckA.src = fd.fileUrl;
    deckA.dataset.fileType = fd.fileType;
    deckA.dataset.fileName = fd.fileName;
    
    // Set audio properties
    if (fd.fileType === "audio") {
      deckA.muted = false;
    } else if (fd.fileType === "video") {
      deckA.muted = true;
    }
    
    deckA.play();
    highlightRow(idx);
  }
  
  function loadDeckB(idx) {
    if (idx < 0 || idx >= playlistFiles.length) {
      deckB.removeAttribute('src');
      return;
    }
    const fd = playlistFiles[idx];
    deckB.src               = fd.fileUrl;
    deckB.dataset.fileType  = fd.fileType;
    deckB.dataset.fileName  = fd.fileName;
  }  

  function dragItem(event) {
    const row = event.currentTarget;       // the <tr> itself
    event.dataTransfer.effectAllowed = 'copy';
    const payload = {
      fileName:     row.dataset.fileName,
      fileType:     row.dataset.fileType,
      fileUrl:      row.dataset.fileUrl,
      filePath:     row.dataset.filePath,      // real path if you need it
      fileDuration: row.dataset.fileDuration
    };
    event.dataTransfer.setData('application/json', JSON.stringify(payload));
    console.log('dragging:', payload);
  }
  
  function updatePlaylistOrder() {
      const playlistItems = document.getElementById("playlist-items").children;
      console.log("Playlist order updated:", playlistItems);
  }

  // ---- Helper: addToPlaylist (used when a file is dropped) ---- //
  function addToPlaylist(fileData) {
    const row = document.createElement("tr");
    row.dataset.fileName     = fileData.fileName;
    row.dataset.fileType     = fileData.fileType;
    row.dataset.fileUrl      = fileData.fileUrl;
    row.dataset.fileDuration = fileData.fileDuration;
    row.setAttribute("draggable", true);
    row.addEventListener("dragstart", dragItem);
  
    const titleCell  = document.createElement("td");
    titleCell.textContent = fileData.fileName;
    const typeCell   = document.createElement("td");
    typeCell.textContent = fileData.fileType || "Audio";
    const lengthCell = document.createElement("td");
    lengthCell.textContent = fileData.fileDuration || "--:--";
  
    row.append(titleCell, typeCell, lengthCell);
  
    // Remove‐button cell
    const removeCell   = document.createElement("td");
    const removeButton = document.createElement("button");
    removeButton.textContent = "Remove";
    removeButton.addEventListener("click", () => row.remove());
    removeCell.appendChild(removeButton);
    row.appendChild(removeCell);
  
    // Clean up placeholder
    const placeholder = document.querySelector(".drop-placeholder");
    if (placeholder) placeholder.remove();
  
    document.getElementById("playlist-items").appendChild(row);
    console.log("Added to playlist:", fileData.fileName);
  }  

  document
  .getElementById("playlist-items")
  .addEventListener("click", function(event) {
    const row = event.target.closest("tr");
    if (!row) return;

    const fileType = row.dataset.fileType;
    const fileUrl = row.dataset.fileUrl;

    if (fileType === "video") {
      confirmAndReplaceLiveMonitor(() => {
        const liveMonitor = document.getElementById("liveMonitor");
        liveMonitor.pause();
        if (liveMonitor.srcObject) {
          liveMonitor.srcObject.getTracks().forEach(t => t.stop());
          liveMonitor.srcObject = null;
        }

        showFile(fileUrl);

        const deckA = document.getElementById("deckA");
        deckA.src = fileUrl;
        deckA.dataset.fileType = fileType;
        deckA.dataset.fileName = row.dataset.fileName;
        deckA.play();
      });
    } else if (fileType === "audio") {
      // Handle audio files
      const deckA = document.getElementById("deckA");
      deckA.src = fileUrl;
      deckA.dataset.fileType = fileType;
      deckA.dataset.fileName = row.dataset.fileName;
      deckA.muted = false; // Ensure audio is not muted
      deckA.play();
      
      // Highlight the playing row
      document.querySelectorAll('#playlist-items tr').forEach(r => 
        r.classList.remove('playing')
      );
      row.classList.add('playing');
    }
  }); 

  // Add status handlers
  window.onStreamStatus = (status) => {
    updateLiveStatus(status);
  };

  window.onStreamError = (error) => {
    console.error('Stream error:', error);
    alert('Stream error: ' + error);
  };
});