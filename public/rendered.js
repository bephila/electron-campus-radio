// Complete rendered.js with Enhanced HLS Cleanup Integration - ALL SYNTAX ERRORS FIXED

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

// Global streaming state variables  
let isCurrentlyStreaming = false;
let currentMediaRecorder = null;
let currentWebSocket = null;

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

// Helper function for handling stream errors with HLS cleanup
async function handleStreamError(errorMessage) {
  console.error('Stream error:', errorMessage);
  
  // Clean up MediaRecorder
  if (currentMediaRecorder && currentMediaRecorder.state !== "inactive") {
    try {
      currentMediaRecorder.stop();
    } catch (e) {
      console.error('Error stopping MediaRecorder during error handling:', e);
    }
    currentMediaRecorder = null;
  }
  
  // Clean up WebSocket
  if (currentWebSocket && currentWebSocket.readyState === WebSocket.OPEN) {
    try {
      currentWebSocket.close();
    } catch (e) {
      console.error('Error closing WebSocket during error handling:', e);
    }
    currentWebSocket = null;
  }
  
  // Update status
  isCurrentlyStreaming = false;
  updateLiveStatus(false);
  
  // Stop HLS cleanup and clean remaining files
  if (window.electronAPI && window.electronAPI.stopHLSCleanup) {
    try {
      console.log("Stopping HLS cleanup due to error...");
      await window.electronAPI.stopHLSCleanup();
    } catch (error) {
      console.warn("Could not stop HLS cleanup during error handling:", error);
    }
  }
  
  alert(errorMessage);
}

// Function to restart streaming with new stream
function restartStreamingWithNewSource(newStream) {
  if (!isCurrentlyStreaming) return;
  
  console.log("Restarting streaming with new source...");
  
  // Stop current MediaRecorder if active with proper cleanup
  if (currentMediaRecorder) {
    return new Promise((resolve) => {
      if (currentMediaRecorder.state === "recording") {
        currentMediaRecorder.addEventListener('stop', () => {
          console.log("Old MediaRecorder stopped, starting new one...");
          startNewMediaRecorder(newStream);
          resolve();
        }, { once: true });
        
        try {
          currentMediaRecorder.stop();
        } catch (error) {
          console.error('Error stopping MediaRecorder:', error);
          startNewMediaRecorder(newStream);
          resolve();
        }
      } else {
        startNewMediaRecorder(newStream);
        resolve();
      }
    });
  } else {
    startNewMediaRecorder(newStream);
  }
}

function startNewMediaRecorder(stream) {
  // Wait a bit to ensure the old recorder is fully cleaned up
  setTimeout(() => {
    if (!currentWebSocket || currentWebSocket.readyState !== WebSocket.OPEN) {
      console.error("WebSocket not available for restart");
      return;
    }

    try {
      const mimeType = getSupportedMimeType();
      if (!mimeType) {
        console.error("No supported MIME types found");
        return;
      }

      // Verify the stream has active tracks
      const videoTracks = stream.getVideoTracks();
      const audioTracks = stream.getAudioTracks();
      
      if (videoTracks.length === 0 && audioTracks.length === 0) {
        console.error("No active tracks in stream");
        return;
      }

      // Check if tracks are actually active (not ended)
      const activeVideoTracks = videoTracks.filter(track => track.readyState === 'live');
      const activeAudioTracks = audioTracks.filter(track => track.readyState === 'live');
      
      console.log(`Starting new MediaRecorder with ${activeVideoTracks.length} active video tracks and ${activeAudioTracks.length} active audio tracks`);

      if (activeVideoTracks.length === 0 && activeAudioTracks.length === 0) {
        console.error("No active (live) tracks in stream");
        return;
      }

      currentMediaRecorder = new MediaRecorder(stream, { 
        mimeType: mimeType,
        videoBitsPerSecond: 2500000,
        audioBitsPerSecond: 192000
      });
      
      currentMediaRecorder.ondataavailable = e => {
        if (e.data.size > 0 && currentWebSocket && currentWebSocket.readyState === WebSocket.OPEN) {
          try {
            currentWebSocket.send(e.data);
            // Log successful data transmission occasionally
            if (Math.random() < 0.01) { // 1% of the time
              console.log(`Sent ${e.data.size} bytes to WebSocket`);
            }
          } catch (error) {
            console.error('Error sending data to WebSocket:', error);
          }
        } else if (e.data.size === 0) {
          console.warn('MediaRecorder produced empty data chunk');
        }
      };

      currentMediaRecorder.onerror = async (event) => {
        console.error('MediaRecorder error during restart:', event);
        await handleStreamError('MediaRecorder error: ' + (event.error || 'Unknown error'));
      };

      currentMediaRecorder.onstart = () => {
        console.log("New MediaRecorder started successfully");
        // Verify it's actually recording
        setTimeout(() => {
          if (currentMediaRecorder && currentMediaRecorder.state === 'recording') {
            console.log("MediaRecorder confirmed to be recording");
          } else {
            console.error("MediaRecorder failed to maintain recording state");
          }
        }, 1000);
      };

      currentMediaRecorder.onstop = () => {
        console.log("MediaRecorder stopped");
      };
      
      currentMediaRecorder.start(500);
      console.log("MediaRecorder restart initiated");
      
    } catch (error) {
      console.error('Error creating new MediaRecorder:', error);
      handleStreamError('Error creating new MediaRecorder: ' + error.message);
    }
  }, 200); // Increased delay to ensure proper cleanup
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

      // Stop previous streams
      if (camEl.srcObject) {
        camEl.srcObject.getTracks().forEach(track => track.stop());
      }
      if (liveMonitor.srcObject) {
        liveMonitor.srcObject.getTracks().forEach(track => track.stop());
      }

      camEl.srcObject = stream;
      camEl.play();

      liveMonitor.srcObject = stream;
      liveMonitor.play();
      
      // If streaming is active, restart with new stream
      if (isCurrentlyStreaming && liveMonitor.captureStream) {
        console.log("Restarting stream with new camera source");
        setTimeout(() => {
          try {
            const captureStream = liveMonitor.captureStream(30);
            restartStreamingWithNewSource(captureStream);
          } catch (error) {
            console.error("Error restarting stream:", error);
          }
        }, 200);
      }
      
      console.log(`Camera ${cameraId} is now live in monitor with audio:`, !!constraints.audio);
    } catch (error) {
      console.error('Error starting camera stream:', error);
      alert('Failed to start camera stream: ' + error.message);
    }
  });
};

// Stop a camera stream with HLS cleanup
window.stopLive = async function(cameraId) {
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

  // Stop streaming if active
  if (isCurrentlyStreaming) {
    console.log("Stopping streaming due to camera stop...");
    
    if (currentMediaRecorder && currentMediaRecorder.state !== "inactive") {
      try {
        currentMediaRecorder.stop();
      } catch (error) {
        console.error('Error stopping MediaRecorder:', error);
      }
      currentMediaRecorder = null;
    }
    
    if (currentWebSocket && currentWebSocket.readyState === WebSocket.OPEN) {
      try {
        currentWebSocket.close();
      } catch (error) {
        console.error('Error closing WebSocket:', error);
      }
      currentWebSocket = null;
    }
    
    isCurrentlyStreaming = false;
    updateLiveStatus(false);
    
    // Stop HLS cleanup monitoring
    if (window.electronAPI && window.electronAPI.stopHLSCleanup) {
      try {
        console.log("Stopping HLS cleanup due to camera stop...");
        await window.electronAPI.stopHLSCleanup();
      } catch (error) {
        console.warn("Could not stop HLS cleanup:", error);
      }
    }

    // Force cleanup HLS files after a short delay
    setTimeout(async () => {
      if (window.electronAPI && window.electronAPI.forceHLSCleanup) {
        try {
          console.log("Force cleaning HLS files after camera stop...");
          const result = await window.electronAPI.forceHLSCleanup();
          if (result.success) {
            console.log(`Cleaned ${result.filesRemoved} HLS files after camera stop`);
          }
        } catch (error) {
          console.warn("Could not force cleanup HLS files:", error);
        }
      }
    }, 2000); // 2 second delay
  }
  
  if (window.electronAPI && window.electronAPI.stopFFmpeg) {
    window.electronAPI.stopFFmpeg();
  }
  
  console.log(`Camera ${cameraId} stopped.`);
};

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

    // ENHANCED change handler with proper timing
    async function updateStream() {
      const selectedCameraId = cameraSelect.value;
      const selectedMicId = micSelect.value;
      const liveMonitor = document.getElementById("liveMonitor");
      const isThisCameraLive = liveMonitor.srcObject && 
                               videoElement.srcObject && 
                               liveMonitor.srcObject === videoElement.srcObject;

      try {
        // Stop old stream tracks
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

        console.log("Getting new stream with constraints:", constraints);
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        
        // Verify stream has tracks
        const videoTracks = stream.getVideoTracks();
        const audioTracks = stream.getAudioTracks();
        console.log(`New stream has ${videoTracks.length} video tracks, ${audioTracks.length} audio tracks`);

        videoElement.srcObject = stream;
        videoElement.dataset.deviceId = selectedCameraId;
        videoElement.play();

        // CRITICAL FIX: If this camera was feeding the live monitor, update live monitor too
        if (isThisCameraLive) {
          console.log("Updating live monitor with new stream from camera settings change");
          
          // Stop old live monitor tracks first
          if (liveMonitor.srcObject) {
            liveMonitor.srcObject.getTracks().forEach(track => track.stop());
          }
          
          // Update live monitor with new stream
          liveMonitor.srcObject = stream;
          
          // Wait for the live monitor to be ready with the new stream
          await new Promise((resolve) => {
            const checkReady = () => {
              if (liveMonitor.readyState >= 3) { // HAVE_FUTURE_DATA or higher
                resolve();
              } else {
                setTimeout(checkReady, 50);
              }
            };
            
            liveMonitor.addEventListener('loadeddata', resolve, { once: true });
            liveMonitor.play().then(() => {
              checkReady();
            }).catch((error) => {
              console.error("Error playing live monitor:", error);
              resolve(); // Continue anyway
            });
          });
          
          // If streaming is active, restart with new stream
          if (isCurrentlyStreaming) {
            console.log("Restarting live stream with new camera/mic settings");
            
            // Wait a bit more for the video to be fully ready
            setTimeout(() => {
              if (liveMonitor.captureStream) {
                try {
                  // Make sure we're capturing from the updated live monitor
                  console.log("Creating capture stream from updated live monitor");
                  const captureStream = liveMonitor.captureStream(30);
                  
                  // Verify the capture stream has tracks
                  const capVideoTracks = captureStream.getVideoTracks();
                  const capAudioTracks = captureStream.getAudioTracks();
                  console.log(`Capture stream has ${capVideoTracks.length} video tracks, ${capAudioTracks.length} audio tracks`);
                  
                  if (capVideoTracks.length > 0 || capAudioTracks.length > 0) {
                    restartStreamingWithNewSource(captureStream);
                  } else {
                    console.error("Capture stream has no tracks, retrying...");
                    // Retry once more after a longer delay
                    setTimeout(() => {
                      const retryStream = liveMonitor.captureStream(30);
                      if (retryStream.getVideoTracks().length > 0 || retryStream.getAudioTracks().length > 0) {
                        restartStreamingWithNewSource(retryStream);
                      } else {
                        console.error("Failed to capture valid stream after retry");
                      }
                    }, 500);
                  }
                  
                } catch (error) {
                  console.error("Error capturing stream from live monitor:", error);
                }
              }
            }, 300); // Increased delay to ensure video is fully ready
          }
        }

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

document.addEventListener("DOMContentLoaded", async () => {
  let playlistFiles = [];
  let currentIndex = -1; 

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
    lm.pause(); 
    lm.removeAttribute("src"); 
    lm.removeAttribute("srcObject");
    lm.srcObject = stream;
    lm.play();
  }

  function showFile(url) {
    const lm = document.getElementById("liveMonitor");
    if (lm.srcObject) lm.srcObject.getTracks().forEach(t=>t.stop());
    lm.pause(); 
    lm.removeAttribute("srcObject");
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

  // Bruce - FFmpeg device enumeration
  try {
    if (window.electronAPI && window.electronAPI.getFFmpegDevices) {
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

        const startStreamBtn = document.getElementById("start-stream");
        if (startStreamBtn) {
          startStreamBtn.addEventListener("click", async () => {
            const streamSelect = document.getElementById("streamSelect");
            const micSelect = document.getElementById("micSelect");

            const cameraName = streamSelect.value;
            const micName = micSelect.value;

            const videoDeviceId = await getBrowserDeviceIdForFFmpegName(cameraName);
            const audioDeviceId = await getBrowserDeviceIdForFFmpegName(micName);

            if (!videoDeviceId) return alert("No matching camera found.");
            if (!audioDeviceId) return alert("No matching microphone found.");

            await updateCameraPreview("liveMonitor", videoDeviceId);

            if (window.electronAPI && window.electronAPI.startFFmpeg) {
              window.electronAPI.startFFmpeg(
                "rtmp://localhost/live/stream",
                cameraName,
                micName
              );
            }
          });
        }
      }
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

  const startBtn = document.getElementById("start-stream");
  const stopBtn = document.getElementById("stop-stream");

  // ENHANCED START BUTTON WITH HLS CLEANUP INTEGRATION
  if (startBtn) {
    startBtn.addEventListener("click", async () => {
      if (!confirm("Are you sure you want to start live streaming? This will begin broadcasting the current live monitor feed.")) {
        return;
      }

      try {
        console.log("Initiating stream start sequence...");

        // Step 1: Clean up any leftover HLS files from previous sessions
        if (window.electronAPI && window.electronAPI.forceHLSCleanup) {
          try {
            console.log("Cleaning up any leftover HLS files before starting new stream...");
            const preCleanup = await window.electronAPI.forceHLSCleanup();
            if (preCleanup.success && preCleanup.filesRemoved > 0) {
              console.log(`Pre-stream cleanup: Removed ${preCleanup.filesRemoved} leftover files`);
            }
          } catch (error) {
            console.warn("Could not perform pre-stream cleanup:", error);
          }
        }

        // Step 2: Start HLS cleanup monitoring
        if (window.electronAPI && window.electronAPI.startHLSCleanup) {
          try {
            const result = await window.electronAPI.startHLSCleanup();
            if (result.success) {
              console.log("HLS cleanup monitoring started successfully");
            } else {
              console.warn("HLS cleanup start failed:", result.error);
            }
          } catch (error) {
            console.warn("Could not start HLS cleanup monitoring:", error);
          }
        }

        // Step 3: Verify live monitor has content
        const liveMonitor = document.getElementById("liveMonitor");
        if (!liveMonitor.srcObject && !liveMonitor.src) {
          alert("No content in Live Monitor! Please add some content first.");
          
          // Stop cleanup since we're not actually streaming
          if (window.electronAPI && window.electronAPI.stopHLSCleanup) {
            await window.electronAPI.stopHLSCleanup();
          }
          return;
        }

        console.log("Starting stream with content from Live Monitor");
        
        // Step 4: Start WebSocket streaming
        try {
          if (!liveMonitor.captureStream) {
            throw new Error("captureStream not supported in this browser");
          }

          const stream = liveMonitor.captureStream(30);
          const mimeType = getSupportedMimeType();
          
          if (!mimeType) {
            throw new Error("No supported MIME types found for MediaRecorder");
          }

          // Create WebSocket connection with proper error handling
          currentWebSocket = new WebSocket("ws://localhost:9999");
          
          await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
              reject(new Error("WebSocket connection timeout"));
            }, 5000);

            currentWebSocket.addEventListener("open", () => {
              clearTimeout(timeout);
              console.log("WebSocket connected successfully");
              resolve();
            });

            currentWebSocket.addEventListener("error", (error) => {
              clearTimeout(timeout);
              console.error('WebSocket connection error:', error);
              reject(new Error("WebSocket connection failed"));
            });
          });

          // Create and start MediaRecorder
          currentMediaRecorder = new MediaRecorder(stream, { 
            mimeType: mimeType,
            videoBitsPerSecond: 2500000,
            audioBitsPerSecond: 192000
          });
          
          currentMediaRecorder.ondataavailable = e => {
            if (e.data.size > 0 && currentWebSocket && currentWebSocket.readyState === WebSocket.OPEN) {
              try {
                currentWebSocket.send(e.data);
                // Log successful data transmission occasionally
                if (Math.random() < 0.005) { // 0.5% of the time
                  console.log(`Sent ${e.data.size} bytes to WebSocket`);
                }
              } catch (error) {
                console.error('Error sending data to WebSocket:', error);
              }
            }
          };

          currentMediaRecorder.onerror = async (event) => {
            console.error('MediaRecorder error:', event);
            await handleStreamError('MediaRecorder error: ' + (event.error || 'Unknown error'));
          };
          
          currentMediaRecorder.onstart = () => {
            console.log("MediaRecorder started successfully with mimeType:", mimeType);
            isCurrentlyStreaming = true;
            updateLiveStatus(true);
          };

          currentMediaRecorder.onstop = () => {
            console.log("MediaRecorder stopped");
            isCurrentlyStreaming = false;
          };

          // Add WebSocket error and close handlers
          currentWebSocket.onerror = async (error) => {
            console.error('WebSocket error:', error);
            await handleStreamError('WebSocket error occurred');
          };

          currentWebSocket.onclose = async (event) => {
            if (isCurrentlyStreaming) {
              console.warn('WebSocket closed unexpectedly:', event);
              await handleStreamError('WebSocket connection lost');
            }
          };
          
          currentMediaRecorder.start(500); // 500ms chunks for better responsiveness
          console.log("🎉 Stream started successfully with fresh HLS cleanup!");

        } catch (error) {
          console.error("Error starting WebSocket streaming:", error);
          await handleStreamError("Failed to start stream: " + error.message);
        }

      } catch (error) {
        console.error("Error in stream start sequence:", error);
        await handleStreamError("Failed to start stream: " + error.message);
      }
    });
  }

  // ENHANCED STOP BUTTON WITH HLS CLEANUP INTEGRATION
  if (stopBtn) {
    stopBtn.addEventListener("click", async () => {
      if (!confirm("Are you sure you want to stop the live stream?")) {
        return;
      }

      console.log("Initiating stream stop sequence...");
      
      try {
        // Step 1: Stop MediaRecorder first
        if (currentMediaRecorder && currentMediaRecorder.state !== "inactive") {
          try {
            console.log("Stopping MediaRecorder...");
            currentMediaRecorder.stop();
            
            // Wait a bit for it to fully stop
            await new Promise((resolve) => {
              if (currentMediaRecorder.state === "inactive") {
                resolve();
              } else {
                currentMediaRecorder.addEventListener('stop', resolve, { once: true });
                setTimeout(resolve, 2000); // Timeout after 2 seconds
              }
            });
            
            currentMediaRecorder = null;
            console.log("MediaRecorder stopped successfully");
          } catch (error) {
            console.error('Error stopping MediaRecorder:', error);
          }
        }

        // Step 2: Close WebSocket
        if (currentWebSocket && currentWebSocket.readyState === WebSocket.OPEN) {
          try {
            console.log("Closing WebSocket...");
            currentWebSocket.close();
            
            // Wait for WebSocket to close
            await new Promise((resolve) => {
              if (currentWebSocket.readyState === WebSocket.CLOSED) {
                resolve();
              } else {
                currentWebSocket.addEventListener('close', resolve, { once: true });
                setTimeout(resolve, 2000); // Timeout after 2 seconds
              }
            });
            
            currentWebSocket = null;
            console.log("WebSocket closed successfully");
          } catch (error) {
            console.error('Error closing WebSocket:', error);
          }
        }

        // Step 3: Update status immediately
        isCurrentlyStreaming = false;
        updateLiveStatus(false);

        // Step 4: Stop HLS cleanup monitoring
        if (window.electronAPI && window.electronAPI.stopHLSCleanup) {
          try {
            console.log("Stopping HLS cleanup monitoring...");
            await window.electronAPI.stopHLSCleanup();
            console.log("HLS cleanup monitoring stopped");
          } catch (error) {
            console.warn("Could not stop HLS cleanup monitoring:", error);
          }
        }

        // Step 5: Wait for any current segments to finish playing (give viewers time)
        console.log("Waiting for current segments to finish playing...");
        await new Promise(resolve => setTimeout(resolve, 3000)); // 3 second delay

        // Step 6: FORCE CLEANUP all remaining HLS files
        if (window.electronAPI && window.electronAPI.forceHLSCleanup) {
          try {
            console.log("Force cleaning up all HLS segments and playlists...");
            const cleanupResult = await window.electronAPI.forceHLSCleanup();
            if (cleanupResult.success) {
              console.log(`✅ Force cleanup completed - Removed ${cleanupResult.filesRemoved} files`);
            } else {
              console.warn("Force cleanup failed:", cleanupResult.error);
            }
          } catch (error) {
            console.warn("Could not force cleanup HLS files:", error);
          }
        }

        // Step 7: Clear any cached HLS content in the player
        try {
          // Stop any HLS.js instances if they exist
          if (window.hls) {
            window.hls.destroy();
            window.hls = null;
          }
          
          // Clear the live monitor source to prevent cached content
          const liveMonitor = document.getElementById("liveMonitor");
          if (liveMonitor && liveMonitor.src && liveMonitor.src.includes('.m3u8')) {
            liveMonitor.pause();
            liveMonitor.removeAttribute('src');
            liveMonitor.load(); // This forces the browser to clear cached content
            console.log("Cleared HLS content from live monitor");
          }
        } catch (error) {
          console.warn("Could not clear HLS player cache:", error);
        }

        console.log("🎉 Stream stopped and all HLS content cleaned successfully!");

      } catch (error) {
        console.error("Error in stream stop sequence:", error);
        updateLiveStatus(false);
        isCurrentlyStreaming = false;
      }
    });
  }

  if (deckA) {
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
                if (seekControl) {
                  seekControl.value = (deckA.currentTime / deckA.duration) * 100;
                }
                if (liveMonitor && Math.abs(liveMonitor.currentTime - deckA.currentTime) > 0.2) {
                    liveMonitor.currentTime = deckA.currentTime;
                }
            });
        }
    }

    deckA.addEventListener("timeupdate", syncLiveMonitor);

    if (seekControl) {
      seekControl.addEventListener("input", (event) => {
          if (deckA.dataset.fileType === "video" && deckA.duration) {
              isScrubbing = true;
              let seekTime = (event.target.value / 100) * deckA.duration;
              if (liveMonitor) {
                liveMonitor.pause();
                liveMonitor.currentTime = seekTime;
              }
              deckA.currentTime = seekTime;
          }
      });

      seekControl.addEventListener("change", () => {
          if (deckA.dataset.fileType === "video") {
              isScrubbing = false;
              if (liveMonitor) {
                liveMonitor.play();
              }
          }
      });
    }

    if (liveMonitor) {
      liveMonitor.addEventListener("seeking", (event) => {
          if (!deckA.src || deckA.dataset.fileType !== "video") {
              event.preventDefault();
          }
      });
    }

    deckA.addEventListener("pause", () => {
        if (liveMonitor) {
          liveMonitor.pause();
        }
    });

    deckA.addEventListener("ended", () => {
      currentIndex++;
      loadDeckA(currentIndex);
      loadDeckB(currentIndex + 1);
    });
  }

  function shiftTracks() {
      if (deckB && deckB.src && deckB.src !== "") {
          console.log("Shifting track from Deck B to Deck A...");
          if (deckA) {
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
          }
          
          deckB.src = "";
          deckB.removeAttribute("data-file-type");
          deckB.removeAttribute("data-file-name");
      }
      processPlaylist();
  }
  
  async function saveSession() {
    try {
      if (typeof require !== 'undefined') {
        const { dialog } = require('electron').remote;
        const fs = require('fs');
        
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
          deckA: { src: deckA ? deckA.src : '', currentTime: deckA ? deckA.currentTime : 0 }
        };
      
        const { filePath } = await dialog.showSaveDialog({
          title: 'Save session',
          defaultPath: `${name}.json`,
          filters: [{ name:'Session', extensions:['json'] }]
        });
        if (filePath) fs.writeFileSync(filePath, JSON.stringify(session,null,2), 'utf-8');
      }
    } catch (error) {
      console.error('Error saving session:', error);
    }
  }
  
  async function loadSession() {
    try {
      if (typeof require !== 'undefined') {
        const { dialog } = require('electron').remote;
        const fs = require('fs');
        
        const { canceled, filePaths } = await dialog.showOpenDialog({
          title: 'Load session',
          properties: ['openFile'],
          filters: [{ name:'Session', extensions:['json'] }]
        });
        if (canceled) return;
        const session = JSON.parse(fs.readFileSync(filePaths[0], 'utf-8'));
      
        // re-populate playlist
        const tbody = document.getElementById('playlist-items');
        if (tbody) {
          tbody.innerHTML = `<tr class="drop-placeholder">
              <td colspan="4" style="text-align:center;color:gray;">Drag & drop items here</td>
            </tr>`;
          session.playlist.forEach(item => addToPlaylist(item));
        }
      
        // restore now playing
        if (session.nowPlayingIndex >= 0) {
          const deckA = document.getElementById('deckA');
          if (deckA) {
            deckA.src = session.deckA.src;
            deckA.currentTime = session.deckA.currentTime;
            deckA.play();
          }
          highlightRow(session.nowPlayingIndex);
        }
      }
    } catch (error) {
      console.error('Error loading session:', error);
    }
  }
  
  // wire up buttons
  const saveSessionBtn = document.getElementById('save-session');
  const loadSessionBtn = document.getElementById('load-session');
  
  if (saveSessionBtn) {
    saveSessionBtn.addEventListener('click', saveSession);
  }
  if (loadSessionBtn) {
    loadSessionBtn.addEventListener('click', loadSession);
  }

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

  const fadeButton = document.getElementById("fadeButton");
  if (fadeButton) {
    fadeButton.addEventListener("click", function () {
        let fadeTime = 5000;
        let startVolumeA = deckA ? deckA.volume : 0;
        let startVolumeB = deckB ? deckB.volume : 0;
        let fadeOut = setInterval(() => {
            if (deckA && deckA.volume > 0) {
                deckA.volume = Math.max(0, deckA.volume - 0.05);
            }
            if (deckB && deckB.volume < startVolumeB) {
                deckB.volume = Math.min(startVolumeB, deckB.volume + 0.05);
            }
            if (deckA && deckA.volume <= 0) {
                clearInterval(fadeOut);
                deckA.pause();
            }
        }, fadeTime / 20);
    });
  }
  
  const playlist = document.getElementById('playlist');

  if (playlist) {
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
    
      // 3) If this is the very first track, start Deck A - FIXED SYNTAX ERROR
      if (currentIndex === -1) {
        currentIndex = 0;
        loadDeckA(currentIndex);
      }
    
      // 4) Always (re)load Deck B with the *next* track
      loadDeckB(currentIndex + 1);
    });
  }
  
  function playMedia(url, type) {
      if (type === "audio") {
          if (deckA) {
            deckA.src = url;
            deckA.play();
          }
      } else if (type === "video") {
          if (liveMonitor) {
            liveMonitor.src = url;
            liveMonitor.play();
          }
      }
  }
  
  function processPlaylist() {
    const playlistTable = document.getElementById("playlist-items");
    if (playlistTable) {
      const rows = Array.from(playlistTable.querySelectorAll('tr:not(.drop-placeholder)'));
      if (deckA && !deckA.src && rows.length) {
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
  }

  function loadToDeck(fileData) {
      addToPlaylist(fileData);
      if (fileData.fileType === "audio") processPlaylist();
  }
  
  function loadDeckA(idx) {
    if (idx < 0 || idx >= playlistFiles.length || !deckA) return;
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
    if (idx < 0 || idx >= playlistFiles.length || !deckB) {
      if (deckB) {
        deckB.removeAttribute('src');
      }
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
      const playlistItems = document.getElementById("playlist-items");
      if (playlistItems) {
        console.log("Playlist order updated:", playlistItems.children);
      }
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
  
    const playlistItems = document.getElementById("playlist-items");
    if (playlistItems) {
      playlistItems.appendChild(row);
    }
    console.log("Added to playlist:", fileData.fileName);
  }  

  const playlistItemsTable = document.getElementById("playlist-items");
  if (playlistItemsTable) {
    playlistItemsTable.addEventListener("click", function(event) {
      const row = event.target.closest("tr");
      if (!row) return;

      const fileType = row.dataset.fileType;
      const fileUrl = row.dataset.fileUrl;

      if (fileType === "video") {
        confirmAndReplaceLiveMonitor(() => {
          if (liveMonitor) {
            liveMonitor.pause();
            if (liveMonitor.srcObject) {
              liveMonitor.srcObject.getTracks().forEach(t => t.stop());
              liveMonitor.srcObject = null;
            }

            showFile(fileUrl);

            if (deckA) {
              deckA.src = fileUrl;
              deckA.dataset.fileType = fileType;
              deckA.dataset.fileName = row.dataset.fileName;
              deckA.play();
            }
          }
        });
      } else if (fileType === "audio") {
        // Handle audio files
        if (deckA) {
          deckA.src = fileUrl;
          deckA.dataset.fileType = fileType;
          deckA.dataset.fileName = row.dataset.fileName;
          deckA.muted = false; // Ensure audio is not muted
          deckA.play();
        }
        
        // Highlight the playing row
        document.querySelectorAll('#playlist-items tr').forEach(r => 
          r.classList.remove('playing')
        );
        row.classList.add('playing');
      }
    }); 
  }

  // Add status handlers
  window.onStreamStatus = (status) => {
    updateLiveStatus(status);
  };

  window.onStreamError = async (error) => {
    console.error('Stream error:', error);
    await handleStreamError('Stream error: ' + error);
  };

  // ENHANCED HLS STATUS MONITORING WITH BETTER ERROR HANDLING
  if (window.electronAPI && window.electronAPI.getHLSStatus) {
    const monitorHLSStatus = async () => {
      try {
        const status = await window.electronAPI.getHLSStatus();
        
        if (status.error) {
          console.warn('HLS Status Error:', status.error);
          return;
        }
        
        // Log status occasionally (every 5th check = ~2.5 minutes)
        if (Math.random() < 0.2) {
          console.log('HLS Status:', {
            streaming: status.isStreaming,
            segments: status.segmentCount,
            playlists: status.playlistCount,
            total: status.totalFiles
          });
        }
        
        // Warn if too many segments are accumulating
        if (status.segmentCount > 50) {
          console.warn(`High segment count detected: ${status.segmentCount} segments`);
        }
        
        // Emergency cleanup if segments are really piling up
        if (status.segmentCount > 100 && !isCurrentlyStreaming) {
          console.warn('Emergency cleanup triggered due to excessive segments');
          try {
            if (window.electronAPI.forceHLSCleanup) {
              await window.electronAPI.forceHLSCleanup();
              console.log('Emergency cleanup completed');
            }
          } catch (error) {
            console.error('Emergency cleanup failed:', error);
          }
        }
        
      } catch (error) {
        console.error('Error getting HLS status:', error);
      }
    };
    
    // Check HLS status every 30 seconds
    setInterval(monitorHLSStatus, 30000);
    
    // Initial status check after a delay
    setTimeout(monitorHLSStatus, 5000);
  }

  // ADDITIONAL CLEANUP ON PAGE UNLOAD
  window.addEventListener('beforeunload', async (event) => {
    if (isCurrentlyStreaming) {
      console.log('Page unloading, stopping stream and cleaning HLS files...');
      
      // Stop MediaRecorder immediately
      if (currentMediaRecorder && currentMediaRecorder.state !== "inactive") {
        try {
          currentMediaRecorder.stop();
        } catch (error) {
          console.error('Error stopping MediaRecorder on page unload:', error);
        }
      }
      
      // Close WebSocket immediately
      if (currentWebSocket && currentWebSocket.readyState === WebSocket.OPEN) {
        try {
          currentWebSocket.close();
        } catch (error) {
          console.error('Error closing WebSocket on page unload:', error);
        }
      }
      
      // Stop HLS cleanup monitoring
      if (window.electronAPI && window.electronAPI.stopHLSCleanup) {
        try {
          window.electronAPI.stopHLSCleanup();
        } catch (error) {
          console.error('Error stopping HLS cleanup on page unload:', error);
        }
      }

      // Force cleanup HLS files on page unload
      if (window.electronAPI && window.electronAPI.forceHLSCleanup) {
        try {
          window.electronAPI.forceHLSCleanup();
          console.log('Forced HLS cleanup on page unload');
        } catch (error) {
          console.error('Error force cleaning HLS files on page unload:', error);
        }
      }
    }
  });

  console.log("Application initialized with HLS cleanup integration");
});