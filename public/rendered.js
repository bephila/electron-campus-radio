NEW

// Global Variables
let playlistFiles = [];
let currentIndex = -1;
let audioVisualizerCanvas = null;
let audioContext = null;
let audioAnalyser = null;
let audioSource = null;
let isFading = false;
let isScrubbing = false;

// Enhanced streaming state with better isolation
let isCurrentlyStreaming = false;
let currentMediaRecorder = null;
let currentWebSocket = null;
let currentStream = null;
let streamingContentType = null;
let streamOperationId = 0;
let activeOperationId = null;

// Audio management tracking
let connectedAudioElements = new Set();
let currentAudioDestination = null;

// FIXED: Stream restart capability
let canRestartStream = true;
let lastStreamContent = null;
let isStreamRestarting = false;

// MISSING: Add isolated stream pool
let isolatedStreamPool = new Map();

// Initialize completed operations tracking
let completedOperations = new Set();

// FIXED: Simplified operation management
function startOperation(operationType = 'unknown') {
  streamOperationId++;
  
  // Cancel previous operation if not completed
  if (activeOperationId !== null && !completedOperations.has(activeOperationId)) {
    console.log(`Cancelling operation #${activeOperationId} for new ${operationType} operation #${streamOperationId}`);
  }
  
  activeOperationId = streamOperationId;
  console.log(`Starting operation #${activeOperationId} (${operationType})`);
  return activeOperationId;
}

function isValidOperation(operationId) {
  if (completedOperations.has(operationId)) {
    return true;
  }
  
  const valid = activeOperationId === operationId;
  if (!valid && Math.abs(activeOperationId - operationId) > 1) {
    console.log(`Operation #${operationId} cancelled (current: #${activeOperationId})`);
  }
  
  return valid;
}

function endOperation(operationId) {
  if (activeOperationId === operationId) {
    completedOperations.add(operationId);
    if (!isCurrentlyStreaming) {
      activeOperationId = null;
    }
    console.log(`Completed operation #${operationId}`);
    
    // Clean up old completed operations
    if (completedOperations.size > 5) {
      const oldestOperations = Array.from(completedOperations).slice(0, completedOperations.size - 5);
      oldestOperations.forEach(op => completedOperations.delete(op));
    }
  }
}

// Helper Functions
function updateLiveStatus(status) {
  const liveStatus = document.getElementById("live-status");
  if (liveStatus) {
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
}

// MISSING: Add WAMP status check function
async function checkWAMPStatus() {
  try {
    const response = await fetch('http://localhost/', { 
      method: 'HEAD',
      cache: 'no-cache'
    });
    
    if (!response.ok) {
      throw new Error('WAMP server not responding');
    }
    
    console.log('WAMP server status: OK');
    return true;
  } catch (error) {
    console.error('WAMP server check failed:', error);
    return false;
  }
}

// MISSING: Add fallback stream creation function
function createFallbackStream() {
  console.log("Creating fallback stream for empty monitor");
  
  const canvas = document.createElement('canvas');
  canvas.width = 1280;
  canvas.height = 720;
  const ctx = canvas.getContext('2d');
  
  // Create animated fallback content
  let animationFrame = 0;
  
  function drawFallback() {
    // Gradient background
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, '#1a1a2e');
    gradient.addColorStop(0.5, '#16213e');
    gradient.addColorStop(1, '#0f3460');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Animated title
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 64px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('🎵 Cheers Campus Radio', canvas.width/2, canvas.height/2 - 50);
    
    // Animated subtitle
    const alpha = (Math.sin(animationFrame * 0.1) + 1) / 2;
    ctx.fillStyle = `rgba(255, 183, 36, ${alpha})`;
    ctx.font = '32px Arial';
    ctx.fillText('Live Stream Ready', canvas.width/2, canvas.height/2 + 20);
    
    // Status indicator
    ctx.fillStyle = '#4CAF50';
    ctx.font = '24px Arial';
    ctx.fillText('• ONLINE', canvas.width/2, canvas.height/2 + 80);
    
    animationFrame++;
    
    if (animationFrame < 1000) { // Limit animation frames
      requestAnimationFrame(drawFallback);
    }
  }
  
  drawFallback();
  
  const stream = canvas.captureStream(30);
  stream.streamId = `fallback-${Date.now()}`;
  
  return stream;
}

// FIXED: Smoother content replacement without stream disruption
function confirmAndReplaceLiveMonitor(action, contentType = 'unknown') {
  const lm = document.getElementById("liveMonitor");
  const deckA = document.getElementById("deckA");
  
  // FIXED: If streaming, switch content smoothly without user prompts
  if (isCurrentlyStreaming) {
    console.log(`Currently streaming - switching to ${contentType} content smoothly`);
    action();
    return;
  }
  
  // Video always takes priority for new streams
  if (contentType === 'video') {
    console.log("Video content - taking priority");
    
    // Clear audio from deck A if not streaming
    if (deckA && deckA.dataset.fileType === 'audio') {
      deckA.pause();
      deckA.src = '';
      deckA.dataset.fileType = '';
      deckA.dataset.fileName = '';
      cleanupAudioConnections();
    }
    
    action();
    return;
  }
  
  const hasSomethingPlaying = (lm.srcObject && lm.srcObject.getTracks().length > 0) || !!lm.currentSrc;
  
  if (hasSomethingPlaying && !confirm("There is currently media playing, would you like to continue?")) {
    return;
  }
  action();    
}

// FIXED: Complete cleanup function
function cleanupAudioConnections() {
  console.log("Cleaning up all audio connections...");
  
  connectedAudioElements.forEach(element => {
    if (element.audioSourceNode) {
      try {
        element.audioSourceNode.disconnect();
        delete element.audioSourceNode;
        delete element.audioSourceConnected;
      } catch (error) {
        console.warn("Error disconnecting audio source:", error);
      }
    }
  });
  
  connectedAudioElements.clear();
  
  if (currentAudioDestination) {
    try {
      currentAudioDestination.disconnect();
      currentAudioDestination = null;
    } catch (error) {
      console.warn("Error disconnecting audio destination:", error);
    }
  }
  
  if (audioSource) {
    try {
      audioSource.disconnect();
      audioSource = null;
    } catch (error) {
      console.warn("Error disconnecting main audio source:", error);
    }
  }
}

function stopAudioVisualization() {
  cleanupAudioConnections();
  
  if (audioAnalyser) {
    try {
      audioAnalyser.disconnect();
      audioAnalyser = null;
    } catch (error) {
      console.warn("Error disconnecting analyser:", error);
    }
  }
}

// FIXED: Robust audio stream setup with reuse protection
function setupAudioStreamCapture(audioElement) {
  const liveMonitor = document.getElementById("liveMonitor");
  
  // FIXED: Check if this audio element is already connected
  if (audioElement.audioSourceNode && audioElement.audioSourceConnected) {
    console.log("Audio element already connected, reusing existing setup");
    
    // Ensure live monitor is set up correctly with existing connection
    liveMonitor.src = "icons/soundwave.mp4";
    liveMonitor.loop = true;
    liveMonitor.muted = true;
    liveMonitor.play();
    
    // Return existing stream if available
    if (currentAudioDestination && currentAudioDestination.stream) {
      return currentAudioDestination.stream;
    }
  }
  
  // Only clean up if we're setting up a new connection
  if (!audioElement.audioSourceNode) {
    cleanupAudioConnections();
  }
  
  liveMonitor.src = "icons/soundwave.mp4";
  liveMonitor.loop = true;
  liveMonitor.muted = true;
  liveMonitor.play();
  
  if (!audioContext || audioContext.state === 'closed') {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  
  try {
    const timestamp = Date.now();
    
    // FIXED: Only create new MediaElementSource if not already connected
    let source = audioElement.audioSourceNode;
    if (!source) {
      source = audioContext.createMediaElementSource(audioElement);
      audioElement.audioSourceNode = source;
      audioElement.audioSourceConnected = timestamp;
      connectedAudioElements.add(audioElement);
      audioSource = source;
    }
    
    // FIXED: Only create new destination if needed
    let destination = currentAudioDestination;
    if (!destination) {
      destination = audioContext.createMediaStreamDestination();
      destination.stream.streamId = `audio-${timestamp}`;
      currentAudioDestination = destination;
      
      // Connect the audio path
      source.connect(audioContext.destination);
      source.connect(destination);
    }
    
    liveMonitor.addEventListener('loadeddata', () => {
      try {
        const videoStream = liveMonitor.captureStream(30);
        videoStream.streamId = `video-${timestamp}`;
        
        const combinedStream = new MediaStream();
        combinedStream.streamId = `combined-${timestamp}`;
        
        videoStream.getVideoTracks().forEach(track => {
          track.id = `video-track-${timestamp}-${Math.random()}`;
          combinedStream.addTrack(track);
        });
        
        destination.stream.getAudioTracks().forEach(track => {
          track.id = `audio-track-${timestamp}-${Math.random()}`;
          combinedStream.addTrack(track);
        });
        
        liveMonitor.combinedStream = combinedStream;
        console.log(`Audio+video stream ready: ${combinedStream.streamId}`);
      } catch (error) {
        console.error("Error creating combined stream:", error);
      }
    }, { once: true });
    
    return destination.stream;
  } catch (error) {
    console.error("Error setting up audio stream capture:", error);
    return null;
  }
}

// FIXED: Better stream cleanup
function cleanupAudioVisualization() {
  stopAudioVisualization();
  
  const liveMonitor = document.getElementById("liveMonitor");
  
  if (liveMonitor.srcObject) {
    liveMonitor.srcObject.getTracks().forEach(track => track.stop());
    liveMonitor.srcObject = null;
  }
  
  liveMonitor.removeAttribute('src');
  liveMonitor.loop = false;
  liveMonitor.pause();
  
  if (audioVisualizerCanvas && audioVisualizerCanvas.parentElement) {
    audioVisualizerCanvas.parentElement.removeChild(audioVisualizerCanvas);
    audioVisualizerCanvas = null;
  }
  
  if (liveMonitor.combinedStream) {
    liveMonitor.combinedStream.getTracks().forEach(track => track.stop());
    delete liveMonitor.combinedStream;
  }
}

// FIXED: Simple, reliable stream creation
function createStableStream(baseStream, contentType) {
  const timestamp = Date.now();
  const streamId = `stable-${contentType}-${timestamp}`;
  
  console.log(`Creating stable stream: ${streamId}`);
  
  if (!baseStream || !baseStream.getTracks) {
    console.error("Invalid base stream provided");
    return null;
  }
  
  try {
    // Clone all tracks from base stream
    const clonedTracks = baseStream.getTracks().map((track, index) => {
      const clonedTrack = track.clone();
      clonedTrack.id = `${streamId}-${index}`;
      return clonedTrack;
    });
    
    // Create new MediaStream with cloned tracks
    const stableStream = new MediaStream(clonedTracks);
    stableStream.streamId = streamId;
    
    console.log(`Created stable stream ${streamId} with ${clonedTracks.length} tracks`);
    return stableStream;
  } catch (error) {
    console.error("Error creating stable stream:", error);
    return null;
  }
}

// Device Management Functions
async function getBrowserDeviceIdForFFmpegName(ffmpegDeviceName) {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoInputs = devices.filter(device => device.kind === 'videoinput');
    
    const exactMatch = videoInputs.find(device => 
      device.label === ffmpegDeviceName || 
      device.label.includes(ffmpegDeviceName)
    );
    
    if (exactMatch) {
      return exactMatch.deviceId;
    }
    
    const partialMatch = videoInputs.find(device => 
      ffmpegDeviceName.includes(device.label) ||
      device.label.toLowerCase().includes(ffmpegDeviceName.toLowerCase())
    );
    
    if (partialMatch) {
      return partialMatch.deviceId;
    }
    
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

// FIXED: Robust streaming functions
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

// FIXED: Complete audio system reset for recovery
function resetAudioSystem() {
  console.log("Performing complete audio system reset...");
  
  // Stop all audio tracks first
  connectedAudioElements.forEach(element => {
    if (element.audioSourceNode) {
      try {
        element.audioSourceNode.disconnect();
      } catch (error) {
        console.warn("Error disconnecting during reset:", error);
      }
      delete element.audioSourceNode;
      delete element.audioSourceConnected;
    }
  });
  
  connectedAudioElements.clear();
  
  // Disconnect all audio nodes
  if (currentAudioDestination) {
    try {
      currentAudioDestination.disconnect();
    } catch (error) {
      console.warn("Error disconnecting destination during reset:", error);
    }
    currentAudioDestination = null;
  }
  
  if (audioSource) {
    try {
      audioSource.disconnect();
    } catch (error) {
      console.warn("Error disconnecting source during reset:", error);
    }
    audioSource = null;
  }
  
  // Close and recreate audio context
  if (audioContext && audioContext.state !== 'closed') {
    try {
      audioContext.close();
    } catch (error) {
      console.warn("Error closing audio context during reset:", error);
    }
  }
  
  audioContext = null;
  
  console.log("Audio system reset complete");
}

// FIXED: Enhanced error handling with audio system reset
async function handleStreamError(errorMessage, operationId = null) {
  console.error('Stream error:', errorMessage);
  
  if (operationId && !isValidOperation(operationId)) {
    console.log(`Ignoring error cleanup for cancelled operation #${operationId}`);
    return;
  }
  
  const cleanupOperationId = startOperation('error-cleanup');
  
  try {
    // Set restart capability
    canRestartStream = true;
    
    // Complete MediaRecorder cleanup
    if (currentMediaRecorder) {
      try {
        if (currentMediaRecorder.state === "recording") {
          currentMediaRecorder.stop();
        }
      } catch (e) {
        console.error('Error stopping MediaRecorder during error handling:', e);
      }
      currentMediaRecorder = null;
    }
    
    // Complete WebSocket cleanup
    if (currentWebSocket) {
      try {
        if (currentWebSocket.readyState === WebSocket.OPEN) {
          currentWebSocket.close();
        }
      } catch (e) {
        console.error('Error closing WebSocket during error handling:', e);
      }
      currentWebSocket = null;
    }
    
    // Complete stream cleanup
    if (currentStream) {
      try {
        currentStream.getTracks().forEach(track => track.stop());
      } catch (e) {
        console.error('Error stopping stream tracks:', e);
      }
      currentStream = null;
    }
    
    // Clean isolated stream pool
    isolatedStreamPool.forEach((stream, id) => {
      try {
        stream.getTracks().forEach(track => track.stop());
      } catch (e) {
        console.warn(`Error cleaning isolated stream ${id}:`, e);
      }
    });
    isolatedStreamPool.clear();
    
    // FIXED: Reset audio system if error involves audio
    if (errorMessage.includes('audio') || errorMessage.includes('MediaElementSource')) {
      resetAudioSystem();
    }
    
    isCurrentlyStreaming = false;
    isStreamRestarting = false;
    streamingContentType = null;
    updateLiveStatus(false);
    
    // HLS cleanup
    if (window.electronAPI && window.electronAPI.stopHLSCleanup) {
      try {
        console.log("Stopping HLS cleanup due to error...");
        await window.electronAPI.stopHLSCleanup();
      } catch (error) {
        console.warn("Could not stop HLS cleanup during error handling:", error);
      }
    }
    
  } finally {
    endOperation(cleanupOperationId);
  }
}

async function switchStreamContent(newBaseStream, contentType) {
  if (!isCurrentlyStreaming || !currentMediaRecorder || !currentWebSocket) {
    console.log("Not streaming or missing components, ignoring content switch");
    return;
  }
  
  console.log(`Switching to ${contentType} content while maintaining stream...`);
  
  try {
    // Don't stop MediaRecorder - just change the stream
    const mimeType = getSupportedMimeType();
    if (!mimeType) return;
    
    // Stop old MediaRecorder
    if (currentMediaRecorder.state === "recording") {
      currentMediaRecorder.stop();
    }
    
    // Wait briefly for stop
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Create new MediaRecorder with new content
    currentMediaRecorder = new MediaRecorder(newBaseStream, { 
      mimeType: mimeType,
      videoBitsPerSecond: 500000,
      audioBitsPerSecond: 64000
    });
    
    currentMediaRecorder.ondataavailable = e => {
      if (e.data.size > 0 && currentWebSocket && currentWebSocket.readyState === WebSocket.OPEN) {
        currentWebSocket.send(e.data);
      }
    };
    
    currentMediaRecorder.onerror = async (event) => {
      console.error("MediaRecorder error during switch:", event);
    };
    
    // Start new recording
    currentMediaRecorder.start(500);
    console.log(`✅ Stream content switched to ${contentType}`);
    
  } catch (error) {
    console.error("Error switching content:", error);
  }
}

// FIXED: Enhanced new stream initialization
async function startNewStream(baseStream, contentType, operationId = null) {
  if (!operationId) {
    operationId = startOperation(`start-${contentType}`);
  }
  
  if (isStreamRestarting) {
    console.log("Stream restart already in progress");
    return;
  }
  
  try {
    console.log(`[#${operationId}] Starting new ${contentType} stream...`);
    isStreamRestarting = true;
    
    // Store content for restart capability
    lastStreamContent = { stream: baseStream, type: contentType };
    
    // Create stable stream
    currentStream = createStableStream(baseStream, contentType);
    if (!currentStream) {
      throw new Error("Failed to create stable stream");
    }
    
    streamingContentType = contentType;
    
    // Create WebSocket connection
    currentWebSocket = new WebSocket("ws://localhost:9999");
    
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("WebSocket connection timeout"));
      }, 5000);

      currentWebSocket.addEventListener("open", () => {
        clearTimeout(timeout);
        console.log(`[#${operationId}] WebSocket connected`);
        resolve();
      });

      currentWebSocket.addEventListener("error", (error) => {
        clearTimeout(timeout);
        reject(new Error("WebSocket connection failed"));
      });
    });

    if (!isValidOperation(operationId)) return;

    // Create MediaRecorder
    const mimeType = getSupportedMimeType();
    if (!mimeType) {
      throw new Error("No supported MIME types found");
    }

    currentMediaRecorder = new MediaRecorder(currentStream, { 
      mimeType: mimeType,
      videoBitsPerSecond: 500000,
      audioBitsPerSecond: 64000
    });
    
    currentMediaRecorder.ondataavailable = e => {
      if (e.data.size > 0 && currentWebSocket && currentWebSocket.readyState === WebSocket.OPEN && isValidOperation(operationId)) {
        try {
          currentWebSocket.send(e.data);
        } catch (error) {
          console.error(`[#${operationId}] Error sending data:`, error);
        }
      }
    };

    currentMediaRecorder.onerror = async (event) => {
      console.error(`[#${operationId}] MediaRecorder error:`, event);
      await handleStreamError('MediaRecorder error: ' + (event.error || 'Unknown error'), operationId);
    };
    
    currentMediaRecorder.onstart = () => {
      if (isValidOperation(operationId)) {
        console.log(`[#${operationId}] New ${contentType} stream started successfully`);
        isCurrentlyStreaming = true;
        isStreamRestarting = false;
        updateLiveStatus(true);
      }
    };

    currentMediaRecorder.onstop = () => {
      console.log(`[#${operationId}] MediaRecorder stopped`);
      if (isCurrentlyStreaming && isValidOperation(operationId)) {
        isCurrentlyStreaming = false;
        updateLiveStatus(false);
      }
    };

    // Set up WebSocket error handlers
    currentWebSocket.onerror = async (error) => {
      console.error(`[#${operationId}] WebSocket error:`, error);
      await handleStreamError('WebSocket error occurred', operationId);
    };

    currentWebSocket.onclose = async (event) => {
      if (isCurrentlyStreaming && isValidOperation(operationId)) {
        console.warn(`[#${operationId}] WebSocket closed unexpectedly:`, event);
        await handleStreamError('WebSocket connection lost', operationId);
      }
    };
    
    if (isValidOperation(operationId)) {
      currentMediaRecorder.start(500);
      console.log(`[#${operationId}] New stream started successfully!`);
    }

  } catch (error) {
    console.error(`[#${operationId}] Error starting new stream:`, error);
    isStreamRestarting = false;
    await handleStreamError("Failed to start stream: " + error.message, operationId);
  } finally {
    endOperation(operationId);
    isStreamRestarting = false;
  }
}

// FIXED: Restart stream capability
async function restartStream() {
  if (!canRestartStream || !lastStreamContent) {
    console.log("Cannot restart stream - no previous content available");
    return false;
  }
  
  if (isCurrentlyStreaming || isStreamRestarting) {
    console.log("Cannot restart - stream is already active or restarting");
    return false;
  }
  
  console.log("Restarting stream with last content...");
  
  try {
    await startNewStream(lastStreamContent.stream, lastStreamContent.type);
    return true;
  } catch (error) {
    console.error("Failed to restart stream:", error);
    return false;
  }
}

// Camera Functions
window.goLive = async function(cameraId) {
  const camEl = document.getElementById(cameraId);
  console.log("Audio ID on cam:", camEl.dataset.audioDeviceId);

  if (isCurrentlyStreaming) {
    console.log("Already streaming, switching to camera feed...");
  } else if (!confirm(`Do you want to add camera ${cameraId} to the live monitor feed?`)) {
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
      
      // Enhanced content switching if already streaming
      if (isCurrentlyStreaming) {
        console.log("Switching to camera content...");
        setTimeout(() => {
          try {
            const captureStream = liveMonitor.captureStream(30);
            switchStreamContent(captureStream, 'camera');
          } catch (error) {
            console.error("Error switching to camera:", error);
          }
        }, 500);
      }
      
      console.log(`Camera ${cameraId} is now live in monitor with audio:`, !!constraints.audio);
    } catch (error) {
      console.error('Error starting camera stream:', error);
      alert('Failed to start camera stream: ' + error.message);
    }
  }, 'camera');
};

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

  if (isCurrentlyStreaming) {
    console.log("Stopping streaming due to camera stop...");
    await stopCurrentStream();
  }
  
  if (window.electronAPI && window.electronAPI.stopFFmpeg) {
    window.electronAPI.stopFFmpeg();
  }
  
  console.log(`Camera ${cameraId} stopped.`);
};

// Enhanced stream stopping
async function stopCurrentStream() {
  const operationId = startOperation('stop-stream');
  
  try {
    console.log(`[#${operationId}] Stopping current stream...`);
    
    // Reset restart capability
    canRestartStream = false;
    lastStreamContent = null;
    
    // Stop MediaRecorder
    if (currentMediaRecorder && currentMediaRecorder.state !== "inactive") {
      try {
        await new Promise((resolve) => {
          currentMediaRecorder.addEventListener('stop', resolve, { once: true });
          currentMediaRecorder.stop();
        });
      } catch (error) {
        console.error(`[#${operationId}] Error stopping MediaRecorder:`, error);
      }
      currentMediaRecorder = null;
    }
    
    // Close WebSocket
    if (currentWebSocket && currentWebSocket.readyState === WebSocket.OPEN) {
      try {
        currentWebSocket.close();
      } catch (error) {
        console.error(`[#${operationId}] Error closing WebSocket:`, error);
      }
      currentWebSocket = null;
    }
    
    // Stop stream tracks
    if (currentStream) {
      currentStream.getTracks().forEach(track => track.stop());
      currentStream = null;
    }
    
    // Clean isolated stream pool
    isolatedStreamPool.forEach((stream, id) => {
      try {
        stream.getTracks().forEach(track => track.stop());
      } catch (e) {
        console.warn(`Error cleaning isolated stream ${id}:`, e);
      }
    });
    isolatedStreamPool.clear();
    
    isCurrentlyStreaming = false;
    isStreamRestarting = false;
    streamingContentType = null;
    updateLiveStatus(false);
    
    // Clean up audio connections
    cleanupAudioConnections();
    
    // HLS cleanup
    if (window.electronAPI && window.electronAPI.stopHLSCleanup) {
      try {
        await window.electronAPI.stopHLSCleanup();
      } catch (error) {
        console.warn(`[#${operationId}] Could not stop HLS cleanup:`, error);
      }
    }

    setTimeout(async () => {
      if (window.electronAPI && window.electronAPI.forceHLSCleanup) {
        try {
          const result = await window.electronAPI.forceHLSCleanup();
          if (result.success) {
            console.log(`[#${operationId}] Cleaned ${result.filesRemoved} HLS files after stream stop`);
          }
        } catch (error) {
          console.warn(`[#${operationId}] Could not force cleanup HLS files:`, error);
        }
      }
    }, 2000);
    
  } finally {
    endOperation(operationId);
  }
}

// FIXED: Enhanced media display function with better live monitor sync
function showFile(url) {
  const lm = document.getElementById("liveMonitor");
  
  if (lm.srcObject) {
    lm.srcObject.getTracks().forEach(t => t.stop());
    lm.srcObject = null;
  }
  
  lm.pause();
  lm.removeAttribute("srcObject");
  lm.src = url;
  
  // FIXED: Enhanced load handling for better sync
  lm.addEventListener('loadeddata', () => {
    try {
      const videoStream = lm.captureStream(30);
      lm.videoStreamReady = videoStream;
      console.log("Video stream ready for capture");
      
      // FIXED: Sync with deck A immediately when video loads
      const deckA = document.getElementById("deckA");
      if (deckA && deckA.src === url && deckA.currentTime > 0) {
        lm.currentTime = deckA.currentTime;
        console.log(`Live monitor synced to deck A position: ${deckA.currentTime.toFixed(2)}s`);
      }
    } catch (error) {
      console.error("Error creating video stream:", error);
    }
  }, { once: true });
  
  // FIXED: Ensure live monitor starts playing
  lm.play().catch(error => {
    console.warn("Live monitor autoplay prevented:", error);
  });
}

// Utility Functions
function formatTime(seconds) {
  if (isNaN(seconds) || !isFinite(seconds)) {
    return "--:--";
  }
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function parseTimeToSeconds(timeString) {
  if (!timeString || timeString === "--:--") return 0;
  const parts = timeString.split(':');
  if (parts.length !== 2) return 0;
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

function getAudioDuration(file, lengthCell, row) {
  const audio = new Audio();
  audio.src = URL.createObjectURL(file);
  audio.addEventListener("loadedmetadata", function () {
      let duration = formatTime(audio.duration);
      lengthCell.textContent = duration;
      row.dataset.fileDuration = duration;
      updateTotalTime();
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
      updateTotalTime();
      URL.revokeObjectURL(video.src);
  });
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

function highlightRow(idx) {
  document.querySelectorAll('#playlist-items tr').forEach(r => 
    r.classList.remove('playing')
  );
  const rows = Array.from(document.querySelectorAll('#playlist-items tr:not(.drop-placeholder)'));
  if (rows[idx]) rows[idx].classList.add('playing');
}

// Enhanced deck management with perfect live monitor sync
function loadDeckA(idx) {
  const deckA = document.getElementById("deckA");
  const liveMonitor = document.getElementById("liveMonitor");
  if (!deckA) return;
  
  // Clear deck A if no valid index
  if (idx < 0 || idx >= playlistFiles.length) {
    deckA.pause();
    deckA.src = '';
    deckA.dataset.fileType = '';
    deckA.dataset.fileName = '';
    deckA.removeAttribute('src');
    deckA.removeAttribute('data-file-type');
    deckA.removeAttribute('data-file-name');
    deckA.load();
    cleanupAudioConnections();
    
    // FIXED: Also clear live monitor when deck A is cleared
    if (liveMonitor && !liveMonitor.srcObject) {
      liveMonitor.pause();
      liveMonitor.src = '';
    }
    
    console.log("Deck A cleared - no valid content");
    return;
  }
  
  const fd = playlistFiles[idx];
  deckA.src = fd.fileUrl;
  deckA.dataset.fileType = fd.fileType;
  deckA.dataset.fileName = fd.fileName;
  
  if (fd.fileType === "audio") {
    deckA.muted = false;
  } else if (fd.fileType === "video") {
    deckA.muted = true;
    
    // FIXED: Set up live monitor sync for video when deck A loads
    deckA.addEventListener('loadeddata', () => {
      if (liveMonitor && (!liveMonitor.srcObject || liveMonitor.srcObject.getTracks().length === 0)) {
        showFile(fd.fileUrl);
        console.log(`Live monitor set up for deck A video: ${fd.fileName}`);
      }
    }, { once: true });
  }
  
  deckA.play();
  highlightRow(idx);
  
  console.log(`Deck A loaded: ${fd.fileName} (${fd.fileType})`);
}

function loadDeckB(idx) {
  const deckB = document.getElementById("deckB");
  if (!deckB) return;
  
  if (idx < 0 || idx >= playlistFiles.length) {
    deckB.pause();
    deckB.currentTime = 0;
    deckB.removeAttribute('src');
    deckB.removeAttribute('data-file-type');
    deckB.removeAttribute('data-file-name');
    deckB.load();
    console.log("Deck B cleared - no more tracks in queue");
    return;
  }
  
  const fd = playlistFiles[idx];
  deckB.src = fd.fileUrl;
  deckB.dataset.fileType = fd.fileType;
  deckB.dataset.fileName = fd.fileName;
  console.log(`Deck B loaded: ${fd.fileName}`);
}

function dragItem(event) {
  const row = event.currentTarget;
  event.dataTransfer.effectAllowed = 'move';
  
  const payload = {
    fileName: row.dataset.fileName,
    fileType: row.dataset.fileType,
    fileUrl: row.dataset.fileUrl,
    filePath: row.dataset.filePath,
    fileDuration: row.dataset.fileDuration
  };
  
  event.dataTransfer.setData('application/json', JSON.stringify(payload));
  
  const playlistTable = document.getElementById('playlist-items');
  if (playlistTable.contains(row)) {
    event.dataTransfer.setData('text/plain', 'playlist-reorder');
    row.classList.add('dragging');
  }
  
  console.log('dragging:', payload);
}

function addToPlaylist(fileData) {
  const row = document.createElement("tr");
  row.dataset.fileName = fileData.fileName;
  row.dataset.fileType = fileData.fileType;
  row.dataset.fileUrl = fileData.fileUrl;
  row.dataset.fileDuration = fileData.fileDuration;
  row.setAttribute("draggable", true);
  row.addEventListener("dragstart", dragItem);

  const titleCell = document.createElement("td");
  titleCell.textContent = fileData.fileName;
  const typeCell = document.createElement("td");
  typeCell.textContent = fileData.fileType || "Audio";
  const lengthCell = document.createElement("td");
  lengthCell.textContent = fileData.fileDuration || "--:--";

  row.append(titleCell, typeCell, lengthCell);

  const removeCell = document.createElement("td");
  const removeButton = document.createElement("button");
  removeButton.textContent = "Remove";
  removeButton.addEventListener("click", () => {
    row.remove();
    updatePlaylistArray();
    updateTotalTime();
    
    // Update decks after playlist item removal
    updateDecksAfterPlaylistChange();
  });
  removeCell.appendChild(removeButton);
  row.appendChild(removeCell);

  const placeholder = document.querySelector(".drop-placeholder");
  if (placeholder && placeholder.parentNode) {
    try {
      placeholder.remove();
    } catch (error) {
      console.warn("Could not remove placeholder:", error);
    }
  }

  const playlistItems = document.getElementById("playlist-items");
  if (playlistItems && row instanceof Node) {
    try {
      playlistItems.appendChild(row);
      updateTotalTime();
      console.log("Added to playlist:", fileData.fileName);
    } catch (error) {
      console.error("Error adding to playlist:", error);
    }
  } else {
    console.error("Could not add to playlist: invalid elements");
  }
}

// New function to handle deck updates after playlist changes
function updateDecksAfterPlaylistChange() {
  // If current index is beyond playlist length, clear and reset
  if (currentIndex >= playlistFiles.length) {
    if (playlistFiles.length === 0) {
      currentIndex = -1;
      loadDeckA(-1); // This will clear deck A
      loadDeckB(-1); // This will clear deck B
    } else {
      currentIndex = playlistFiles.length - 1;
      loadDeckA(currentIndex);
      loadDeckB(currentIndex + 1);
    }
  } else {
    // Reload current and next tracks
    loadDeckA(currentIndex);
    loadDeckB(currentIndex + 1);
  }
}

function setupPlaylistRowDragDrop() {
  const playlistTable = document.getElementById('playlist-items');
  
  if (!playlistTable) {
    console.error("Playlist table not found");
    return;
  }
  
  playlistTable.addEventListener('dragover', e => {
    e.preventDefault();
    const dragging = document.querySelector('.dragging');
    
    if (!dragging) return;
    
    const afterElement = getDragAfterElement(playlistTable, e.clientY);
    
    try {
      if (afterElement == null) {
        playlistTable.appendChild(dragging);
      } else {
        playlistTable.insertBefore(dragging, afterElement);
      }
    } catch (error) {
      console.warn("Error in drag operation:", error);
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
      updatePlaylistArray();
    }
  });
}

function getDragAfterElement(container, y) {
  if (!container) return null;
  
  const draggableElements = [...container.querySelectorAll('tr:not(.dragging):not(.drop-placeholder)')];
  
  return draggableElements.reduce((closest, child) => {
    try {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      
      if (offset < 0 && offset > closest.offset) {
        return { offset: offset, element: child };
      } else {
        return closest;
      }
    } catch (error) {
      console.warn("Error in drag calculation:", error);
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
  
  // Update decks after reordering
  updateDecksAfterPlaylistChange();
  updateTotalTime();
  console.log('Playlist reordered:', playlistFiles);
}

// Browser compatibility check
function checkBrowserCompatibility() {
  const requiredFeatures = [
    'MediaRecorder',
    'WebSocket',
    'navigator.mediaDevices',
    'HTMLVideoElement.prototype.captureStream'
  ];
  
  const missing = requiredFeatures.filter(feature => {
    const parts = feature.split('.');
    let obj = window;
    for (const part of parts) {
      if (!obj || !obj[part]) return true;
      obj = obj[part];
    }
    return false;
  });
  
  if (missing.length > 0) {
    alert(`Browser compatibility issue for WAMP deployment.\nMissing features: ${missing.join(', ')}\n\nPlease use a modern browser like Chrome or Firefox.`);
    return false;
  }
  
  return true;
}

// Enhanced Settings Function
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

    if (videoElement.dataset.deviceId) {
      cameraSelect.value = videoElement.dataset.deviceId;
    }
    if (videoElement.dataset.audioDeviceId) {
      micSelect.value = videoElement.dataset.audioDeviceId;
    }

    async function updateStream() {
      const selectedCameraId = cameraSelect.value;
      const selectedMicId = micSelect.value;
      const liveMonitor = document.getElementById("liveMonitor");
      const isThisCameraLive = liveMonitor.srcObject && 
                               videoElement.srcObject && 
                               liveMonitor.srcObject === videoElement.srcObject;

      try {
        if (videoElement.srcObject) {
          videoElement.srcObject.getTracks().forEach(track => track.stop());
        }

        if (!selectedCameraId && !selectedMicId) {
          videoElement.srcObject = null;
          return;
        }

        videoElement.dataset.audioDeviceId = selectedMicId;
        
        const constraints = {
          video: selectedCameraId ? { deviceId: { exact: selectedCameraId } } : false,
          audio: selectedMicId ? { deviceId: { exact: selectedMicId } } : false
        };

        console.log("Getting new stream with constraints:", constraints);
        const stream = await navigator.mediaDevices.getUserMedia(constraints);

        videoElement.srcObject = stream;
        videoElement.dataset.deviceId = selectedCameraId;
        videoElement.play();

        if (isThisCameraLive) {
          console.log("Updating live monitor with new stream from camera settings change");
          
          if (liveMonitor.srcObject) {
            liveMonitor.srcObject.getTracks().forEach(track => track.stop());
          }
          
          liveMonitor.srcObject = stream;
          
          await new Promise((resolve) => {
            const checkReady = () => {
              if (liveMonitor.readyState >= 3) {
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
              resolve();
            });
          });
          
          // Enhanced content switching
          if (isCurrentlyStreaming) {
            console.log("Switching stream to new camera/mic settings");
            
            setTimeout(() => {
              if (liveMonitor.captureStream) {
                try {
                  const captureStream = liveMonitor.captureStream(30);
                  switchStreamContent(captureStream, 'camera');
                } catch (error) {
                  console.error("Error switching stream with new settings:", error);
                }
              }
            }, 500);
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

    settingsDiv.appendChild(cameraLabel);
    settingsDiv.appendChild(cameraSelect);
    settingsDiv.appendChild(document.createElement("br"));
    settingsDiv.appendChild(micLabel);
    settingsDiv.appendChild(micSelect);

    document.body.appendChild(settingsDiv);

    const buttonRect = button.getBoundingClientRect();
    settingsDiv.style.position = "absolute";
    settingsDiv.style.left = `${buttonRect.left}px`;
    settingsDiv.style.top = `${buttonRect.bottom}px`;
    settingsDiv.style.zIndex = 9999;

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

// Session management functions
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

// Main DOMContentLoaded Event
document.addEventListener("DOMContentLoaded", async () => {
  console.log("FIXED Campus Radio - Complete Version Initializing...");

  if (!checkBrowserCompatibility()) {
    console.error('Browser compatibility check failed');
    return;
  }

  // Media Library Functions
  function updateMediaLibrary(inputElement, targetTableId, mediaType) {
    console.log(`updateMediaLibrary called for ${mediaType}`, inputElement.files);
    const targetTable = document.getElementById(targetTableId);
    Array.from(inputElement.files).forEach(file => {
      if (!file) return;

      let row = document.createElement("tr");
      row.setAttribute("draggable", true);
      row.dataset.fileName = file.name;
      row.dataset.fileType = mediaType;
      row.dataset.fileUrl = URL.createObjectURL(file);
      row.dataset.fileDuration = "--:--";
      row.dataset.filePath = file.path || "";

      row.addEventListener("dragstart", dragItem);

      let titleCell = document.createElement("td");
      titleCell.textContent = file.name;
      let lengthCell = document.createElement("td");
      lengthCell.textContent = "Loading...";

      row.appendChild(titleCell);
      row.appendChild(lengthCell);
      targetTable.appendChild(row);

      if (mediaType === "audio") {
        getAudioDuration(file, lengthCell, row);
      } else {
        getVideoDuration(file, lengthCell, row);
      }
    });
  }

  // Setup Media Upload Handlers
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

  // Camera Device Population
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

  // FFmpeg Device Integration
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
      }
    }
  } catch (err) {
    console.error("Error fetching FFmpeg devices:", err);
  }

  await populateCameraDevices();
  setupPlaylistRowDragDrop();

  // Get DOM Elements
  const liveMonitor = document.getElementById("liveMonitor");
  const deckA = document.getElementById("deckA");
  const deckB = document.getElementById("deckB");
  const seekControl = document.getElementById("seekA");
  const startBtn = document.getElementById("start-stream");
  const stopBtn = document.getElementById("stop-stream");
  const fadeButton = document.getElementById("fadeButton");
  const playlist = document.getElementById('playlist');

  // Enhanced Deck A Event Handlers with fixed audio reuse
  if (deckA) {
    // FIXED: Track if audio setup is already done to prevent recreation
    let audioSetupComplete = false;
    
    deckA.addEventListener("play", () => {
      if (deckA.dataset.fileType === "video") {
        // Only cleanup audio visualization if not currently streaming
        if (!isCurrentlyStreaming) {
          cleanupAudioVisualization();
        }
        showFile(deckA.src);
        deckA.muted = true;
        console.log("Video playing – deckA muted.");
        
        // FIXED: Ensure live monitor is in sync when deck A starts playing
        setTimeout(() => {
          const liveMonitor = document.getElementById("liveMonitor");
          if (liveMonitor && liveMonitor.src === deckA.src) {
            // Force sync to current deck A position
            liveMonitor.currentTime = deckA.currentTime;
            if (liveMonitor.paused) {
              liveMonitor.play();
            }
            console.log(`Live monitor synced to deck A start position: ${deckA.currentTime.toFixed(2)}s`);
          }
        }, 200); // Small delay to ensure video is loaded
        
        // Enhanced content switch if streaming - NO RESTART, just switch content
        if (isCurrentlyStreaming && !window.skipNextStreamSwitch) {
          setTimeout(() => {
            if (liveMonitor.captureStream) {
              try {
                const videoStream = liveMonitor.captureStream(30);
                switchStreamContent(videoStream, 'video');
              } catch (error) {
                console.error("Error switching to video content:", error);
              }
            }
          }, 500);
        }
        
        // Clear the skip flag
        if (window.skipNextStreamSwitch) {
          window.skipNextStreamSwitch = false;
          console.log("Skipped stream switch to prevent double switching");
        }
      } else if (deckA.dataset.fileType === "audio") {
        deckA.muted = false;
        console.log("Audio playing – deckA unmuted.");
        
        // FIXED: Only set up audio capture once per track
        if (!audioSetupComplete || !deckA.audioSourceNode) {
          if (!audioContext || audioContext.state === 'closed') {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
          }
          
          try {
            const combinedStream = setupAudioStreamCapture(deckA);
            console.log("Audio with soundwave video setup complete");
            audioSetupComplete = true;
            
            // Enhanced content switch if streaming - NO RESTART, just switch content
            if (isCurrentlyStreaming) {
              setTimeout(() => {
                if (liveMonitor.combinedStream) {
                  switchStreamContent(liveMonitor.combinedStream, 'audio');
                }
              }, 500);
            }
          } catch (error) {
            console.error("Error setting up audio with soundwave:", error);
            audioSetupComplete = false;
            if (liveMonitor) {
              liveMonitor.src = "icons/soundwave.mp4";
              liveMonitor.loop = true;
              liveMonitor.muted = true;
              liveMonitor.play();
            }
          }
        } else {
          console.log("Audio setup already complete, reusing existing connection");
          
          // Still switch stream content if streaming
          if (isCurrentlyStreaming) {
            setTimeout(() => {
              if (liveMonitor.combinedStream) {
                switchStreamContent(liveMonitor.combinedStream, 'audio');
              }
            }, 500);
          }
        }
      }
    });
    
    // FIXED: Reset audio setup flag when source changes
    deckA.addEventListener("loadstart", () => {
      console.log("Deck A loading new source, resetting audio setup");
      audioSetupComplete = false;
    });

    // FIXED: Enhanced Live Monitor synchronization with Deck A
    function syncLiveMonitor() {
      if (deckA.dataset.fileType === "video" && deckA.duration) {
        requestAnimationFrame(() => {
          if (seekControl) {
            seekControl.value = (deckA.currentTime / deckA.duration) * 100;
          }
          
          // FIXED: Always sync live monitor with deck A, even during scrubbing
          if (liveMonitor && liveMonitor.src === deckA.src) {
            const timeDiff = Math.abs(liveMonitor.currentTime - deckA.currentTime);
            if (timeDiff > 0.1) { // More sensitive sync threshold
              liveMonitor.currentTime = deckA.currentTime;
              console.log(`Live monitor synced to deck A: ${deckA.currentTime.toFixed(2)}s`);
            }
          }
        });
      }
    }

    // FIXED: Continuous synchronization
    deckA.addEventListener("timeupdate", syncLiveMonitor);
    
    deckA.addEventListener("seeked", () => {
      console.log(`Deck A seeked to: ${deckA.currentTime.toFixed(2)}s`);
      
      if (deckA.dataset.fileType === "video") {
        syncLiveMonitor();
        
        // Only switch content for video, not audio
        if (isCurrentlyStreaming) {
          setTimeout(() => {
            try {
              const newVideoStream = liveMonitor.captureStream(30);
              switchStreamContent(newVideoStream, 'video');
            } catch (error) {
              console.error("Error updating video stream after seek:", error);
            }
          }, 100);
        }
      }
    });

    if (seekControl) {
      seekControl.addEventListener("input", (event) => {
        if (deckA.dataset.fileType === "video" && deckA.duration) {
          isScrubbing = true;
          let seekTime = (event.target.value / 100) * deckA.duration;
          
          // FIXED: Set both deck A and live monitor simultaneously
          if (liveMonitor && liveMonitor.src === deckA.src) {
            liveMonitor.currentTime = seekTime;
          }
          deckA.currentTime = seekTime;
          
          console.log(`Scrubbing to: ${seekTime.toFixed(2)}s`);
        }
      });

      seekControl.addEventListener("change", (event) => {
        if (deckA.dataset.fileType === "video") {
          isScrubbing = false;
          let seekTime = (event.target.value / 100) * deckA.duration;
          
          // FIXED: Ensure final sync when scrubbing ends
          if (liveMonitor && liveMonitor.src === deckA.src) {
            liveMonitor.currentTime = seekTime;
            if (liveMonitor.paused) {
              liveMonitor.play();
            }
          }
          
          // FIXED: Trigger seeked event for stream update
          console.log(`Scrubbing finished at: ${seekTime.toFixed(2)}s`);
          
          // Force sync one more time
          setTimeout(() => {
            syncLiveMonitor();
          }, 50);
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
      const liveMonitor = document.getElementById("liveMonitor");
      if (liveMonitor && liveMonitor.src === deckA.src) {
        liveMonitor.pause();
        console.log("Live monitor paused with deck A");
      }
    });

    // FIXED: Add resume synchronization
    deckA.addEventListener("play", () => {
      const liveMonitor = document.getElementById("liveMonitor");
      if (liveMonitor && liveMonitor.src === deckA.src && deckA.dataset.fileType === "video") {
        if (liveMonitor.paused && !deckA.paused) {
          liveMonitor.play();
          console.log("Live monitor resumed with deck A");
        }
      }
    });
  }
  
  deckA.addEventListener("ended", () => {
  console.log("Deck A track ended, loading next track");
  
  const wasStreaming = isCurrentlyStreaming;
  
  currentIndex++;
  loadDeckA(currentIndex);
  loadDeckB(currentIndex + 1);
  
  // Simple continuation for streaming
  if (wasStreaming && currentIndex < playlistFiles.length) {
    setTimeout(() => {
      const nextTrack = playlistFiles[currentIndex];
      const liveMonitor = document.getElementById("liveMonitor");
      
      if (nextTrack.fileType === "video") {
        const videoStream = liveMonitor.captureStream(30);
        switchStreamContent(videoStream, 'video');
      } else if (nextTrack.fileType === "audio" && liveMonitor.combinedStream) {
        switchStreamContent(liveMonitor.combinedStream, 'audio');
      }
    }, 1000);
  }
  
  // Update live monitor for non-streaming cases
  if (currentIndex < playlistFiles.length && !wasStreaming) {
    const liveMonitor = document.getElementById("liveMonitor");
    const nextTrack = playlistFiles[currentIndex];
    if (nextTrack && nextTrack.fileType === "video" && liveMonitor) {
      setTimeout(() => {
        if (liveMonitor.src !== nextTrack.fileUrl) {
          showFile(nextTrack.fileUrl);
          console.log(`Live monitor updated for next track: ${nextTrack.fileName}`);
        }
      }, 100);
    }
  }
});

  // Enhanced Start Stream Button with empty monitor support
  if (startBtn) {
    startBtn.addEventListener("click", async () => {
      if (!confirm("Are you sure you want to start live streaming? This will begin broadcasting the current live monitor feed.")) {
        return;
      }

      try {
        console.log("Initiating enhanced stream start sequence...");

        const wampOK = await checkWAMPStatus();
        if (!wampOK) {
          throw new Error("WAMP server not available");
        }

        // HLS cleanup
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

        if (window.electronAPI && window.electronAPI.startHLSCleanup) {
          try {
            const result = await window.electronAPI.startHLSCleanup();
            if (result.success) {
              console.log("HLS cleanup monitoring started successfully");
            }
          } catch (error) {
            console.warn("Could not start HLS cleanup monitoring:", error);
          }
        }

        console.log("Starting stream with content from Live Monitor");
        
        let streamToCapture;
        let contentType = 'unknown';

        // Support empty monitor with fallback content
        if (liveMonitor.combinedStream) {
          streamToCapture = liveMonitor.combinedStream;
          contentType = 'audio';
        } else if (liveMonitor.srcObject && liveMonitor.srcObject.getTracks().length > 0) {
          streamToCapture = liveMonitor.srcObject;
          contentType = 'camera';
        } else if (liveMonitor.src) {
          try {
            streamToCapture = liveMonitor.captureStream(30);
            contentType = 'video';
          } catch (error) {
            console.error("Could not capture video stream:", error);
            streamToCapture = createFallbackStream();
            contentType = 'fallback';
          }
        } else {
          // Empty monitor - create fallback content
          console.log("Empty live monitor - creating fallback stream");
          streamToCapture = createFallbackStream();
          contentType = 'fallback';
        }

        // Start enhanced stream
        await startNewStream(streamToCapture, contentType);
        
        // Wait for HLS segments to be generated
        console.log("Waiting for HLS segments to be generated...");
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        console.log("Enhanced stream started successfully!");

      } catch (error) {
        console.error("Error in enhanced stream start sequence:", error);
        await handleStreamError("Failed to start stream: " + error.message);
      }
    });
  }

  // Enhanced Stop Stream Button
  if (stopBtn) {
    stopBtn.addEventListener("click", async () => {
      if (!confirm("Are you sure you want to stop the live stream?")) {
        return;
      }

      console.log("Initiating enhanced stream stop sequence...");
      await stopCurrentStream();
      console.log("Enhanced stream stop sequence completed!");
    });
  }

  // Enhanced Crossfade Button
  if (fadeButton) {
    fadeButton.addEventListener("click", function () {
      if (isFading) return;
      
      if (!deckB || !deckB.src || deckB.src === "" || currentIndex + 1 >= playlistFiles.length) {
        alert("No next track available to fade to!");
        return;
      }
      
      isFading = true;
      
      fadeButton.style.background = "#6e6e73";
      fadeButton.style.cursor = "not-allowed";
      fadeButton.textContent = "Fading...";
      fadeButton.disabled = true;
      
      const fadeTime = 3000;
      const steps = 60;
      const interval = fadeTime / steps;
      let step = 0;
      
      deckA.volume = 1.0;
      deckB.volume = 0.0;
      
      if (deckB.paused) {
        deckB.play();
      }
      
      const fadeInterval = setInterval(() => {
        step++;
        const progress = step / steps;
        
        deckA.volume = Math.max(0, 1 - progress);
        deckB.volume = Math.min(1, progress);
        
        if (step >= steps) {
          clearInterval(fadeInterval);
          
          deckA.volume = 0.0;
          
          const tempSrc = deckB.src;
          const tempType = deckB.dataset.fileType;
          const tempName = deckB.dataset.fileName;
          
          deckA.src = tempSrc;
          deckA.dataset.fileType = tempType;
          deckA.dataset.fileName = tempName;
          deckA.volume = 1.0;
          deckA.currentTime = deckB.currentTime;
          deckA.play();
          
          currentIndex++;
          highlightRow(currentIndex);
          
          loadDeckB(currentIndex + 1);
          if (currentIndex + 1 >= playlistFiles.length) {
            console.log("Reached end of playlist");
            fadeButton.style.opacity = "0.5";
            fadeButton.title = "No more tracks in queue";
          }
          
          deckB.volume = 0.0;
          deckB.pause();
          deckB.currentTime = 0;
          
          isFading = false;
          fadeButton.style.background = "linear-gradient(135deg, #FF9500, #FF6D00)";
          fadeButton.style.cursor = "pointer";
          fadeButton.textContent = "Crossfade";
          fadeButton.disabled = false;
          
          console.log(`Crossfade complete. Now playing: ${tempName}`);
        }
      }, interval);
    });
  }

  // Playlist Drop Zone
  if (playlist) {
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
      
      const draggedFromPlaylist = e.dataTransfer.getData('text/plain') === 'playlist-reorder';
      
      if (draggedFromPlaylist) {
        return;
      }

      addToPlaylist(fileData);
      playlistFiles.push(fileData);

      if (currentIndex === -1) {
        currentIndex = 0;
        loadDeckA(currentIndex);
      }

      loadDeckB(currentIndex + 1);
    });
  }

  // Enhanced Playlist Click Handler with perfect sync
  // Enhanced Playlist Click Handler - SIMPLIFIED
const playlistItemsTable = document.getElementById("playlist-items");
if (playlistItemsTable) {
  playlistItemsTable.addEventListener("click", function(event) {
    const row = event.target.closest("tr");
    if (!row) return;

    const fileType = row.dataset.fileType;
    const fileUrl = row.dataset.fileUrl;
    const fileName = row.dataset.fileName;

    if (fileType === "video") {
      const liveMonitor = document.getElementById("liveMonitor");
      if (liveMonitor) {
        if (deckA) {
          deckA.src = fileUrl;
          deckA.dataset.fileType = fileType;
          deckA.dataset.fileName = fileName;
          deckA.play();
        }
        
        showFile(fileUrl);
        
        // Simple stream switch for video
        if (isCurrentlyStreaming) {
          setTimeout(() => {
            const videoStream = liveMonitor.captureStream(30);
            switchStreamContent(videoStream, 'video');
          }, 500);
        }
      }
    } else if (fileType === "audio") {
      if (deckA) {
        deckA.src = fileUrl;
        deckA.dataset.fileType = fileType;
        deckA.dataset.fileName = fileName;
        deckA.muted = false;
        deckA.play();
        
        // Simple stream switch for audio
        if (isCurrentlyStreaming) {
          setTimeout(() => {
            const audioStream = setupAudioStreamCapture(deckA);
            if (liveMonitor.combinedStream) {
              switchStreamContent(liveMonitor.combinedStream, 'audio');
            }
          }, 800);
        }
      }
    }
  }); 
}

  // Wire up session buttons
  const saveSessionBtn = document.getElementById('save-session');
  const loadSessionBtn = document.getElementById('load-session');
  
  if (saveSessionBtn) {
    saveSessionBtn.addEventListener('click', saveSession);
  }
  if (loadSessionBtn) {
    loadSessionBtn.addEventListener('click', loadSession);
  }

  // Status Handlers
  window.onStreamStatus = (status) => {
    updateLiveStatus(status);
  };

  window.onStreamError = async (error) => {
    console.error('Stream error:', error);
    await handleStreamError('Stream error: ' + error);
  };

  // Enhanced browser focus handling
  let wasStreamingBeforeHidden = false;
  
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      wasStreamingBeforeHidden = isCurrentlyStreaming;
      console.log(`Page hidden, was streaming: ${wasStreamingBeforeHidden}`);
    } else {
      console.log(`Page visible, was streaming before: ${wasStreamingBeforeHidden}`);
    }
  });

  // Fixed HLS Status Monitoring with reduced frequency and better error handling
  if (window.electronAPI && window.electronAPI.getHLSStatus) {
    let hlsMonitoringActive = true;
    let consecutiveErrors = 0;
    
    const monitorHLSStatus = async () => {
      if (!hlsMonitoringActive) return;
      
      try {
        const status = await window.electronAPI.getHLSStatus();
        consecutiveErrors = 0;
        
        if (status.error) {
          console.warn('HLS Status Error:', status.error);
          return;
        }
        
        // Only log status occasionally to reduce noise
        if (Math.random() < 0.05) {
          console.log('HLS Status:', {
            streaming: status.isStreaming,
            segments: status.segmentCount,
            playlists: status.playlistCount,
            total: status.totalFiles
          });
        }
        
        // More conservative cleanup thresholds
        if (status.segmentCount > 50) {
          console.warn(`High segment count detected: ${status.segmentCount} segments`);
        }
        
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
        consecutiveErrors++;
        if (consecutiveErrors <= 3) {
          console.error('Error getting HLS status:', error);
        }
        
        // Disable monitoring after too many consecutive errors
        if (consecutiveErrors > 10) {
          console.warn('Disabling HLS monitoring due to repeated errors');
          hlsMonitoringActive = false;
        }
      }
    };
    
    // Reduced monitoring frequency from 20s to 30s
    setInterval(monitorHLSStatus, 30000);
    setTimeout(monitorHLSStatus, 5000);
  }

  // Enhanced cleanup on page unload
  window.addEventListener('beforeunload', async (event) => {
    if (isCurrentlyStreaming) {
      console.log('Page unloading, stopping stream and cleaning HLS files...');
      await stopCurrentStream();
    }
  });

  console.log("FIXED Campus Radio - Complete Version with Perfect Sync + Audio Scrubbing Ready!");
  console.log("Features: Perfect Live Monitor ↔ Deck A sync, Fixed audio scrubbing, Stream switching, Stable restart");
  console.log("Live Monitor Sync: ✅ Scrubbing ✅ Play/Pause ✅ Track Changes ✅ Position Sync");
  console.log("Audio System: ✅ No more MediaElementSource errors ✅ Scrubbing works while streaming");

  // Debug helpers for troubleshooting
  window.hlsDebugHelpers = {
    checkStatus: () => {
      console.log('=== Campus Radio Debug Status ===');
      console.log('Currently Streaming:', isCurrentlyStreaming);
      console.log('Active Operation ID:', activeOperationId);
      console.log('Stream Content Type:', streamingContentType);
      console.log('MediaRecorder State:', currentMediaRecorder ? currentMediaRecorder.state : 'null');
      console.log('WebSocket State:', currentWebSocket ? currentWebSocket.readyState : 'null');
      console.log('Current Stream Tracks:', currentStream ? currentStream.getTracks().length : 0);
      console.log('Isolated Stream Pool Size:', isolatedStreamPool.size);
      console.log('Completed Operations:', Array.from(completedOperations));
      console.log('Connected Audio Elements:', connectedAudioElements.size);
      console.log('Audio Context State:', audioContext ? audioContext.state : 'null');
      console.log('================================');
    },
    
    cleanup: async () => {
      console.log('=== Force Cleanup ===');
      await stopCurrentStream();
      isolatedStreamPool.clear();
      completedOperations.clear();
      activeOperationId = null;
      console.log('Cleanup completed');
    },
    
    // FIXED: Add audio system reset helper
    resetAudio: () => {
      console.log('=== Audio System Reset ===');
      resetAudioSystem();
      console.log('Audio system reset completed - try starting stream again');
    },
    
    emergency: async () => {
      console.log('=== Emergency Reset ===');
      try {
        if (currentMediaRecorder) {
          currentMediaRecorder.stop();
          currentMediaRecorder = null;
        }
        if (currentWebSocket) {
          currentWebSocket.close();
          currentWebSocket = null;
        }
        if (currentStream) {
          currentStream.getTracks().forEach(track => track.stop());
          currentStream = null;
        }
        isolatedStreamPool.forEach(stream => {
          stream.getTracks().forEach(track => track.stop());
        });
        isolatedStreamPool.clear();
        resetAudioSystem(); // FIXED: Include audio reset in emergency
        isCurrentlyStreaming = false;
        updateLiveStatus(false);
        console.log('Emergency reset completed');
      } catch (error) {
        console.error('Error during emergency reset:', error);
      }
    },
    
    monitor: (seconds = 10) => {
      console.log(`=== Monitoring for ${seconds} seconds ===`);
      let count = 0;
      const interval = setInterval(() => {
        count++;
        console.log(`[${count}s] Streaming: ${isCurrentlyStreaming}, Op: #${activeOperationId}, Pool: ${isolatedStreamPool.size}, Audio: ${audioContext ? audioContext.state : 'null'}`);
        if (count >= seconds) {
          clearInterval(interval);
          console.log('=== Monitoring complete ===');
        }
      }, 1000);
    }
  };

  console.log('HLS Debug helpers available:');
  console.log('  - window.hlsDebugHelpers.checkStatus() - Check current status');
  console.log('  - window.hlsDebugHelpers.cleanup() - Force cleanup');
  console.log('  - window.hlsDebugHelpers.resetAudio() - Reset audio system (use if audio errors occur)');
  console.log('  - window.hlsDebugHelpers.emergency() - Emergency cleanup');
  console.log('  - window.hlsDebugHelpers.monitor(30) - Monitor for 30 seconds');
});