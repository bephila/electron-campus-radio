// public/rendered.js
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

// Audio Visualizer for Live Monitor
let audioVisualizerCanvas = null;
let audioContext = null;
let audioAnalyser = null;
let audioSource = null;

function stopAudioVisualization() {
  if (audioSource) {
    audioSource.disconnect();
    audioSource = null;
  }
  
  if (audioAnalyser) {
    audioAnalyser.disconnect();
    audioAnalyser = null;
  }
}

function setupAudioStreamCapture(audioElement) {
  const liveMonitor = document.getElementById("liveMonitor");
  
  // Clean up any existing content
  cleanupAudioVisualization();
  
  // Set the soundwave video as source
  liveMonitor.src = "icons/soundwave.mp4";
  liveMonitor.loop = true;
  liveMonitor.muted = true; // Video is muted, audio comes from deckA
  liveMonitor.play();
  
  // Create audio context for streaming
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  
  try {
    // Create audio source from deckA
    const source = audioContext.createMediaElementSource(audioElement);
    const destination = audioContext.createMediaStreamDestination();
    
    // Connect audio to both speakers and destination
    source.connect(audioContext.destination);
    source.connect(destination);
    
    // Wait for video to load, then get its stream
    liveMonitor.addEventListener('loadeddata', () => {
      try {
        // Get video stream from live monitor
        const videoStream = liveMonitor.captureStream(30);
        
        // Combine video and audio streams
        const combinedStream = new MediaStream([
          ...videoStream.getVideoTracks(),
          ...destination.stream.getAudioTracks()
        ]);
        
        // Store reference to the combined stream for capture
        liveMonitor.combinedStream = combinedStream;
        
        console.log("Soundwave video with audio stream ready");
      } catch (error) {
        console.error("Error creating combined stream:", error);
      }
    }, { once: true });
    
    return destination.stream; // Return just audio for now
  } catch (error) {
    console.error("Error setting up audio stream capture:", error);
    return null;
  }
}

function cleanupAudioVisualization() {
  stopAudioVisualization();
  
  const liveMonitor = document.getElementById("liveMonitor");
  
  // Remove any video source and stop streams
  if (liveMonitor.srcObject) {
    liveMonitor.srcObject.getTracks().forEach(track => track.stop());
    liveMonitor.srcObject = null;
  }
  
  liveMonitor.removeAttribute('src');
  liveMonitor.loop = false;
  liveMonitor.pause();
  
  // Remove canvas if it exists
  if (audioVisualizerCanvas && audioVisualizerCanvas.parentElement) {
    audioVisualizerCanvas.parentElement.removeChild(audioVisualizerCanvas);
    audioVisualizerCanvas = null;
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

// Add this function near the top of rendered.js (around line 50-100)
function restartStreamWithNewMedia() {
  // Only restart if currently streaming
  if (!mediaRecorder || mediaRecorder.state === "inactive") {
    return;
  }
  
  console.log("Restarting stream with new media...");
  
  // Stop current recording
  if (mediaRecorder && mediaRecorder.state === "recording") {
    try {
      mediaRecorder.stop();
    } catch (e) {
      console.log("MediaRecorder already stopped");
    }
  }
  
  // Close WebSocket
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.close();
  }
  
  // Wait a moment, then restart
  setTimeout(() => {
    // Trigger the start stream logic again
    const startBtn = document.getElementById("start-stream");
    if (startBtn) {
      // Simulate click to restart streaming
      startBtn.click();
    }
  }, 1000);
}

// When the user clicks "Go Live" on a camera, show its stream in the live monitor.
window.goLive = async function(cameraId) {
  const camEl = document.getElementById(cameraId);
  console.log("Audio ID on cam:", camEl.dataset.audioDeviceId);

  if (!confirm(`Do you want to add camera ${cameraId} to the live monitor feed?`)) {
    return;
  }

  confirmAndReplaceLiveMonitor(async () => {
    const liveMonitor = document.getElementById("liveMonitor");
    
    try {
      const constraints = {
        video: camEl.dataset.deviceId ? { deviceId: { exact: camEl.dataset.deviceId } } : true,
        audio: camEl.dataset.audioDeviceId ? { deviceId: { exact: camEl.dataset.audioDeviceId } } : false
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      camEl.srcObject = stream;
      camEl.play();

      liveMonitor.srcObject = stream;
      liveMonitor.play();
      
      console.log(`Camera ${cameraId} is now live in monitor with audio:`, !!constraints.audio);
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
function ensureAudioInStream(originalStream) {
  const deckA = document.getElementById("deckA");
  
  // Fix: Clear existing audio context connections
  if (audioSource) {
    try {
      audioSource.disconnect();
      audioSource = null;
    } catch (e) {
      console.log("Audio source already disconnected");
    }
  }
  
  // If deckA is playing audio and we have an audio context
  if (deckA && !deckA.paused && deckA.dataset.fileType === "audio" && audioContext) {
    try {
      // Create a new destination for the combined stream
      const destination = audioContext.createMediaStreamDestination();
      
      // Add video tracks from original stream if any
      originalStream.getVideoTracks().forEach(track => {
        destination.stream.addTrack(track);
      });
      
      // Connect deckA audio to the destination
      const source = audioContext.createMediaElementSource(deckA);
      source.connect(destination);
      source.connect(audioContext.destination); // Also play to speakers
      
      // Store the new source reference
      audioSource = source;
      
      return destination.stream;
    } catch (error) {
      console.error("Error ensuring audio in stream:", error);
      return originalStream;
    }
  }
  
  return originalStream;
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

function showFile(url) {
  const lm = document.getElementById("liveMonitor");
  
  // Clean up existing streams
  if (lm.srcObject) {
    lm.srcObject.getTracks().forEach(t => t.stop());
    lm.srcObject = null;
  }
  
  lm.pause();
  lm.removeAttribute("srcObject");
  lm.src = url;
  lm.play();
  
  // Wait for video to load, then create a capturable stream
  lm.addEventListener('loadeddata', () => {
    try {
      // Create a stream from the video for capture
      const videoStream = lm.captureStream(30);
      lm.combinedStream = videoStream; // Store for streaming
      console.log("Video stream ready for capture");
    } catch (error) {
      console.error("Error creating video stream:", error);
    }
  }, { once: true });
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
      updateTotalTime(); // Update total when duration is loaded
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
      updateTotalTime(); // Update total when duration is loaded
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
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoInputs = devices.filter(device => device.kind === 'videoinput');
    const audioInputs = devices.filter(device => device.kind === 'audioinput');
    
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

    // Create camera select with proper ID
    const cameraLabel = document.createElement("label");
    cameraLabel.textContent = "Camera: ";
    cameraLabel.htmlFor = "streamSelect";
    
    const cameraSelect = document.createElement("select");
    cameraSelect.id = "streamSelect";
    cameraSelect.innerHTML = '<option value="">Select Camera</option>';
    
    videoInputs.forEach((device, idx) => {
      const label = device.label || `Camera ${idx+1}`;
      const opt = new Option(label, device.deviceId);
      cameraSelect.appendChild(opt);
    });

    // Create mic select with proper ID
    const micLabel = document.createElement("label");
    micLabel.textContent = "Microphone: ";
    micLabel.htmlFor = "micSelect";
    
    const micSelect = document.createElement("select");
    micSelect.id = "micSelect";
    micSelect.innerHTML = '<option value="">Select Microphone</option>';
    
    audioInputs.forEach((device, i) => {
      const label = device.label || `Mic ${i+1}`;
      micSelect.appendChild(new Option(label, device.deviceId));
    });

    // Set current selections if any
    if (videoElement.dataset.deviceId) {
      cameraSelect.value = videoElement.dataset.deviceId;
    }
    if (videoElement.dataset.audioDeviceId) {
      micSelect.value = videoElement.dataset.audioDeviceId;
    }

    // Combined change handler for both camera and mic
    async function updateStream() {
      const selectedCameraId = cameraSelect.value;
      const selectedMicId = micSelect.value;

      try {
        if (videoElement.srcObject) {
          videoElement.srcObject.getTracks().forEach(track => track.stop());
        }

        if (!selectedCameraId && !selectedMicId) {
          videoElement.srcObject = null;
          return;
        }

        // Store the audio device ID on the video element
        videoElement.dataset.audioDeviceId = selectedMicId;
        
        const constraints = {
          video: selectedCameraId ? { deviceId: { exact: selectedCameraId } } : false,
          audio: selectedMicId ? { deviceId: { exact: selectedMicId } } : false
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        videoElement.srcObject = stream;
        videoElement.dataset.deviceId = selectedCameraId;
        videoElement.play();

        console.log(`Updated ${camId} with camera: ${selectedCameraId}, mic: ${selectedMicId}`);
      } catch (error) {
        console.error(`Error setting up devices for ${camId}:`, error);
        alert(`Failed to set up devices: ${error.message}`);
      }
    }

    cameraSelect.addEventListener("change", updateStream);
    micSelect.addEventListener("change", updateStream);

    // Add elements to settings div
    settingsDiv.appendChild(cameraLabel);
    settingsDiv.appendChild(cameraSelect);
    settingsDiv.appendChild(document.createElement("br"));
    settingsDiv.appendChild(micLabel);
    settingsDiv.appendChild(micSelect);

    document.body.appendChild(settingsDiv);

    // Position the settings menu
    const buttonRect = button.getBoundingClientRect();
    settingsDiv.style.position = "absolute";
    settingsDiv.style.left = `${buttonRect.left}px`;
    settingsDiv.style.top = `${buttonRect.bottom}px`;
    settingsDiv.style.zIndex = 9999;

    // Add styling
    settingsDiv.style.backgroundColor = "#333";
    settingsDiv.style.padding = "15px";
    settingsDiv.style.borderRadius = "5px";
    settingsDiv.style.boxShadow = "0 2px 10px rgba(0,0,0,0.2)";
    
    const selects = settingsDiv.querySelectorAll('select');
    selects.forEach(select => {
      select.style.width = "200px";
      select.style.padding = "5px";
      select.style.marginBottom = "10px";
      select.style.backgroundColor = "#444";
      select.style.color = "white";
      select.style.border = "1px solid #555";
      select.style.borderRadius = "3px";
    });

    const labels = settingsDiv.querySelectorAll('label');
    labels.forEach(label => {
      label.style.color = "white";
      label.style.display = "block";
      label.style.marginBottom = "5px";
    });

    // Close menu when clicking outside
    document.addEventListener('click', function handleOutsideClick(e) {
      if (!settingsDiv.contains(e.target) && e.target !== button) {
        settingsDiv.remove();
        document.removeEventListener('click', handleOutsideClick);
      }
    });
  } catch (error) {
    console.error("Error in showSettings:", error);
    alert("Error loading device settings: " + error.message);
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
      const micSelect = document.getElementById("micSelect");
      if (micSelect) {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter(d => d.kind === 'audioinput');
        audioInputs.forEach((device, i) => {
          const opt = document.createElement("option");
          opt.value = device.label || `Mic ${i+1}`;
          opt.textContent = device.label || `Mic ${i+1}`;
          micSelect.appendChild(opt);
        });
      }

      document.getElementById("start-stream").addEventListener("click", async () => {
        const streamSelect = document.getElementById("streamSelect");
        const micSelect = document.getElementById("micSelect");

        const cameraName = streamSelect.value;
        const micName = micSelect.value;

        const videoDeviceId = await getBrowserDeviceIdForFFmpegName(cameraName);
        const audioDeviceId = await getBrowserDeviceIdForFFmpegName(micName);

        if (!videoDeviceId) return alert("No matching camera found.");
        if (!audioDeviceId) return alert("No matching microphone found.");

        await updateCameraPreview("liveMonitor", videoDeviceId);

        window.electronAPI.startFFmpeg(
          "rtmp://localhost/live/stream",
          cameraName,
          micName
        );
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
  setupPlaylistRowDragDrop();

  const liveMonitor = document.getElementById("liveMonitor");
  const liveStatus = document.getElementById("live-status");
  const playlistDropZone = document.getElementById("playlist");
  const deckA = document.getElementById("deckA");
  const deckB = document.getElementById("deckB");
  const seekControl = document.getElementById("seekA"); 
  let isScrubbing = false; 

deckA.addEventListener("play", () => {
  const liveMonitor = document.getElementById("liveMonitor");
  
  if (deckA.dataset.fileType === "video") {
      cleanupAudioVisualization();
      showFile(deckA.src);
      deckA.muted = true;
      console.log("Video playing – deckA muted.");
      
      // Add this line to restart stream when switching to video
      restartStreamWithNewMedia();
      
  } else if (deckA.dataset.fileType === "audio") {
      deckA.muted = false;
      console.log("Audio playing – deckA unmuted.");
      
      // Create audio context if not exists
      if (!audioContext) {
          audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }
      
      try {
          // Clean up any existing content
          cleanupAudioVisualization();
          
          // Set up audio stream capture with soundwave video
          const combinedStream = setupAudioStreamCapture(deckA);
          
          console.log("Audio with soundwave video setup complete");
          
          // Add this line to restart stream when switching to audio
          restartStreamWithNewMedia();
          
      } catch (error) {
          console.error("Error setting up audio with soundwave:", error);
          // Fallback: just play the soundwave video without audio streaming
          liveMonitor.src = "icons/soundwave.mp4";
          liveMonitor.loop = true;
          liveMonitor.muted = true;
          liveMonitor.play();
      }
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
    let streamToCapture;

    // Always create a stream, even if live monitor is empty
// In the startBtn event listener, update this section:
  if (liveMonitor.combinedStream) {
    streamToCapture = liveMonitor.combinedStream;
  } else if (liveMonitor.srcObject && liveMonitor.srcObject.getTracks().length > 0) {
    streamToCapture = liveMonitor.srcObject;
  } else if (liveMonitor.src) {
    // For videos, try to capture the stream
    try {
      streamToCapture = liveMonitor.captureStream(30);
    } catch (error) {
      console.error("Could not capture video stream:", error);
      // Fallback to black screen
      const canvas = document.createElement('canvas');
      canvas.width = 1280;
      canvas.height = 720;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = 'black';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = 'white';
      ctx.font = '48px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('Cheers Campus Radio', canvas.width/2, canvas.height/2);
      streamToCapture = canvas.captureStream(30);
    }
  } else {
    // Create fallback black screen with text
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'white';
    ctx.font = '48px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Cheers Campus Radio', canvas.width/2, canvas.height/2);
    streamToCapture = canvas.captureStream(30);
  }

    streamToCapture = ensureAudioInStream(streamToCapture);

    // Start WebSocket streaming
    try {
      const mimeType = getSupportedMimeType();
      
      if (!mimeType) {
        console.warn("No supported MIME types found for MediaRecorder");
        return;
      }

      ws = new WebSocket("ws://localhost:9999");
      
      ws.addEventListener("open", () => {
        try {
          mediaRecorder = new MediaRecorder(streamToCapture, { 
            mimeType: mimeType,
            videoBitsPerSecond: 500000,  // Reduced from 1M to 500k
            audioBitsPerSecond: 64000    // Reduced from 96k to 64k
          });

          mediaRecorder.ondataavailable = e => {
            if (e.data.size > 0 && ws.readyState === WebSocket.OPEN) {
              try {
              // Send immediately for better responsiveness
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(e.data);
              }
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
          
          mediaRecorder.start(1000);
          console.log("MediaRecorder started successfully with mimeType:", mimeType);
          updateLiveStatus(true);
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
let isFading = false;

document.getElementById("fadeButton").addEventListener("click", function () {
    if (isFading) return; // Prevent multiple fades
    
    // Check if deck B has content to fade to
    if (!deckB.src || deckB.src === "" || currentIndex + 1 >= playlistFiles.length) {
        alert("No next track available to fade to!");
        return;
    }
    
    isFading = true;
    const fadeButton = document.getElementById("fadeButton");
    
    // Update button state
    fadeButton.style.background = "#6e6e73";
    fadeButton.style.cursor = "not-allowed";
    fadeButton.textContent = "Fading...";
    fadeButton.disabled = true;
    
    // Crossfade parameters
    const fadeTime = 3000; // 3 seconds
    const steps = 60; // 60 steps for smooth fade
    const interval = fadeTime / steps;
    let step = 0;
    
    // Ensure both decks are ready
    deckA.volume = 1.0;
    deckB.volume = 0.0;
    
    // Start deck B if not playing
    if (deckB.paused) {
        deckB.play();
    }
    
    // Crossfade animation
    const fadeInterval = setInterval(() => {
        step++;
        const progress = step / steps;
        
        // Smooth crossfade curve
        deckA.volume = Math.max(0, 1 - progress);
        deckB.volume = Math.min(1, progress);
        
        // Fade complete
// Fade complete
        if (step >= steps) {
            clearInterval(fadeInterval);
            
            // Let deck A continue playing but muted
            deckA.volume = 0.0;
            
            // Swap content: deck B becomes new deck A
            const tempSrc = deckB.src;
            const tempType = deckB.dataset.fileType;
            const tempName = deckB.dataset.fileName;
            
            deckA.src = tempSrc;
            deckA.dataset.fileType = tempType;
            deckA.dataset.fileName = tempName;
            deckA.volume = 1.0;
            deckA.currentTime = deckB.currentTime; // Sync to deck B's position
            deckA.play();
            
            // Update live monitor if it's audio
            if (tempType === "audio") {
                setupAudioStreamCapture(deckA);
            } else if (tempType === "video") {
                showFile(tempSrc);
            }
            
            // Advance to next track
            currentIndex++;
            highlightRow(currentIndex);
            
            // Load next track to deck B
            loadDeckB(currentIndex + 1);
            if (currentIndex + 1 >= playlistFiles.length) {
                console.log("Reached end of playlist");
                // Optionally show a message or disable crossfade button
                fadeButton.style.opacity = "0.5";
                fadeButton.title = "No more tracks in queue";
            }
            
            // Reset deck B
            deckB.volume = 0.0;
            deckB.pause();
            deckB.currentTime = 0;
            
            // Reset button
            isFading = false;
            fadeButton.style.background = "linear-gradient(135deg, #FF9500, #FF6D00)";
            fadeButton.style.cursor = "pointer";
            fadeButton.textContent = "Crossfade";
            fadeButton.disabled = false;
            
            console.log(`Crossfade complete. Now playing: ${tempName}`);
        }
    }, interval);
});
  
  const playlist = document.getElementById('playlist');

  playlist.addEventListener('dragover', e => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    playlist.classList.add('drag-over');
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
    
    // Check if this is a reorder operation (dragging within playlist)
    const draggedFromPlaylist = e.dataTransfer.getData('text/plain') === 'playlist-reorder';
    
    if (draggedFromPlaylist) {
      // This is handled by the row-level drop event, do nothing here
      return;
    }

    // This is a new item being added from media library
    addToPlaylist(fileData);
    playlistFiles.push(fileData);

    if (currentIndex === -1) {
      currentIndex = 0;
      loadDeckA(currentIndex);
    }

    loadDeckB(currentIndex + 1);
  });
  
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
    // Properly clear Deck B when no more tracks
    deckB.pause();
    deckB.currentTime = 0;
    deckB.removeAttribute('src');
    deckB.removeAttribute('data-file-type');
    deckB.removeAttribute('data-file-name');
    deckB.load(); // Force the audio element to reset
    console.log("Deck B cleared - no more tracks in queue");
    return;
  }
  const fd = playlistFiles[idx];
  deckB.src               = fd.fileUrl;
  deckB.dataset.fileType  = fd.fileType;
  deckB.dataset.fileName  = fd.fileName;
  console.log(`Deck B loaded: ${fd.fileName}`);
}

function dragItem(event) {
  const row = event.currentTarget;
  event.dataTransfer.effectAllowed = 'move';
  
  const payload = {
    fileName:     row.dataset.fileName,
    fileType:     row.dataset.fileType,
    fileUrl:      row.dataset.fileUrl,
    filePath:     row.dataset.filePath,
    fileDuration: row.dataset.fileDuration
  };
  
  event.dataTransfer.setData('application/json', JSON.stringify(payload));
  
  // Check if dragging from playlist
  const playlistTable = document.getElementById('playlist-items');
  if (playlistTable.contains(row)) {
    event.dataTransfer.setData('text/plain', 'playlist-reorder');
    row.classList.add('dragging');
  }
  
  console.log('dragging:', payload);
}

function parseTimeToSeconds(timeString) {
  if (!timeString || timeString === "--:--") return 0;
  const parts = timeString.split(':');
  const minutes = parseInt(parts[0]) || 0;
  const seconds = parseInt(parts[1]) || 0;
  return (minutes * 60) + seconds;
}

function formatTotalTime(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  } else {
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }
}

function updateTotalTime() {
  const rows = Array.from(document.querySelectorAll('#playlist-items tr:not(.drop-placeholder)'));
  let totalSeconds = 0;
  
  rows.forEach(row => {
    const duration = row.dataset.fileDuration;
    totalSeconds += parseTimeToSeconds(duration);
  });
  
  const totalTimeElement = document.getElementById('total-time');
  if (totalTimeElement) {
    totalTimeElement.textContent = formatTotalTime(totalSeconds);
  }
  
  console.log(`Total playlist time: ${formatTotalTime(totalSeconds)}`);
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

  // Remove button cell
  const removeCell   = document.createElement("td");
  const removeButton = document.createElement("button");
  removeButton.textContent = "Remove";
  removeButton.addEventListener("click", () => {
    row.remove();
    updatePlaylistArray();
    updateTotalTime();
  });
  removeCell.appendChild(removeButton);
  row.appendChild(removeCell);

  // Clean up placeholder - ADD SAFETY CHECK
  const placeholder = document.querySelector(".drop-placeholder");
  if (placeholder && placeholder.parentNode) {
    placeholder.remove();
  }

  // ADD SAFETY CHECK before appendChild
  const playlistItems = document.getElementById("playlist-items");
  if (playlistItems && row instanceof Node) {
    playlistItems.appendChild(row);
    updateTotalTime();
    console.log("Added to playlist:", fileData.fileName);
  } else {
    console.error("Could not add to playlist: invalid elements");
  }
}

  // Add drag and drop reordering to playlist rows
function setupPlaylistRowDragDrop() {
  const playlistTable = document.getElementById('playlist-items');
  
  playlistTable.addEventListener('dragover', e => {
    e.preventDefault();
    const dragging = document.querySelector('.dragging');
    const afterElement = getDragAfterElement(playlistTable, e.clientY);
    
    if (afterElement == null) {
      playlistTable.appendChild(dragging);
    } else {
      playlistTable.insertBefore(dragging, afterElement);
    }
  });

  document.addEventListener('dragover', e => {
    if (e.target.closest('#playlist-items tr')) {
      e.preventDefault();
    }
  });
  
  playlistTable.addEventListener('dragend', e => {
    const dragging = document.querySelector('.dragging');
    if (dragging) {
      dragging.classList.remove('dragging');
      updatePlaylistArray(); // Update the playlistFiles array to match new order
    }
  });
}

function getDragAfterElement(container, y) {
  const draggableElements = [...container.querySelectorAll('tr:not(.dragging):not(.drop-placeholder)')];
  
  return draggableElements.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    
    if (offset < 0 && offset > closest.offset) {
      return { offset: offset, element: child };
    } else {
      return closest;
    }
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

function updatePlaylistArray() {
  const rows = Array.from(document.querySelectorAll('#playlist-items tr:not(.drop-placeholder)'));
  playlistFiles = rows.map(row => ({
    fileName: row.dataset.fileName,
    fileType: row.dataset.fileType,
    fileUrl: row.dataset.fileUrl,
    fileDuration: row.dataset.fileDuration
  }));
  
  // Update deck B to load the correct next track
  loadDeckB(currentIndex + 1);
  updateTotalTime(); // Update total time when playlist is reordered
  console.log('Playlist reordered:', playlistFiles);
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