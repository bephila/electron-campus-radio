// src/preload.js
const { contextBridge, ipcRenderer } = require("electron");

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld(
  'electronAPI',
  {
    // Existing FFmpeg methods
    getFFmpegDevices: () => ipcRenderer.invoke("get-ffmpeg-devices"),
    getFFmpegPath: () => ipcRenderer.invoke("get-ffmpeg-path"),
    setFFmpegPath: () => ipcRenderer.invoke("set-ffmpeg-path"),
    startFFmpeg: (rtmpUrl, cameraName) => ipcRenderer.send("start-ffmpeg", rtmpUrl, cameraName),
    stopFFmpeg: () => ipcRenderer.send("stop-ffmpeg"),
    
    // Enhanced HLS cleanup methods
    invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
    startHLSCleanup: () => ipcRenderer.invoke('start-hls-cleanup'),
    stopHLSCleanup: () => ipcRenderer.invoke('stop-hls-cleanup'),
    
    // Keep your existing method for compatibility
    manualHLSCleanup: () => ipcRenderer.invoke('manual-hls-cleanup'),
    
    // New enhanced cleanup methods
    forceHLSCleanup: () => ipcRenderer.invoke('force-hls-cleanup'),
    emergencyHLSCleanup: () => ipcRenderer.invoke('emergency-hls-cleanup'),
    
    // Status and monitoring
    getHLSStatus: () => ipcRenderer.invoke('get-hls-status'),
    getHLSDirectoryInfo: () => ipcRenderer.invoke('get-hls-directory-info'),
    
    // HLS streaming support
    startHLSStream: (cameraName, micName) => ipcRenderer.send('start-hls-stream', cameraName, micName)
  }
);

// Add event listeners for status updates
ipcRenderer.on("stream-status", (event, data) => {
  if (window.onStreamStatus) {
    window.onStreamStatus(data);
  }
});

ipcRenderer.on("stream-error", (event, data) => {
  if (window.onStreamError) {
    window.onStreamError(data);
  }
});

// Enhanced HLS cleanup event listeners
ipcRenderer.on("hls-cleanup-completed", (event, data) => {
  if (window.onHLSCleanupCompleted) {
    window.onHLSCleanupCompleted(data);
  }
  
  // Handle both old format (just number) and new format (object with details)
  if (typeof data === 'number') {
    console.log(`HLS cleanup completed: ${data} files deleted`);
  } else if (data && typeof data === 'object') {
    console.log(`HLS cleanup completed:`, {
      filesDeleted: data.deletedCount || data.filesDeleted || 0,
      failed: data.failedCount || 0,
      type: data.type || 'manual',
      message: data.message
    });
  } else {
    console.log('HLS cleanup completed');
  }
});

// New event listeners for enhanced cleanup monitoring
ipcRenderer.on("hls-cleanup-started", (event, data) => {
  if (window.onHLSCleanupStarted) {
    window.onHLSCleanupStarted(data);
  }
  console.log('HLS cleanup monitoring started:', data);
});

ipcRenderer.on("hls-cleanup-stopped", (event, data) => {
  if (window.onHLSCleanupStopped) {
    window.onHLSCleanupStopped(data);
  }
  console.log('HLS cleanup monitoring stopped:', data);
});

ipcRenderer.on("hls-cleanup-error", (event, error) => {
  if (window.onHLSCleanupError) {
    window.onHLSCleanupError(error);
  }
  console.error('HLS cleanup error:', error);
});

// Emergency cleanup event listener
ipcRenderer.on("hls-emergency-cleanup", (event, data) => {
  if (window.onHLSEmergencyCleanup) {
    window.onHLSEmergencyCleanup(data);
  }
  console.warn('HLS emergency cleanup triggered:', data);
});

// Periodic status update listener
ipcRenderer.on("hls-status-update", (event, status) => {
  if (window.onHLSStatusUpdate) {
    window.onHLSStatusUpdate(status);
  }
  
  // Only log if there are segments and we're not streaming (potential issue)
  if (status.segmentCount > 0 && !status.isStreaming && Math.random() < 0.1) {
    console.warn(`HLS Status: ${status.segmentCount} orphaned segments detected`);
  }
});

// Add cleanup monitoring helper functions that can be called from renderer
window.hlsDebugHelpers = {
  // Quick status check
  checkStatus: async () => {
    try {
      const status = await window.electronAPI.getHLSStatus();
      console.log('HLS Status:', {
        streaming: status.isStreaming,
        segments: status.segmentCount,
        playlists: status.playlistCount,
        total: status.totalFiles,
        directory: status.directory
      });
      
      if (status.files && status.files.length > 0) {
        console.log('Files:', status.files.map(f => `${f.name} (${f.ageSeconds}s old)`));
      }
      
      return status;
    } catch (error) {
      console.error('Failed to check HLS status:', error);
      return null;
    }
  },

  // Quick cleanup
  cleanup: async () => {
    try {
      console.log('Starting manual cleanup...');
      const result = await window.electronAPI.forceHLSCleanup();
      console.log('Cleanup result:', result);
      return result;
    } catch (error) {
      console.error('Cleanup failed:', error);
      return null;
    }
  },

  // Emergency cleanup
  emergency: async () => {
    try {
      console.log('Starting emergency cleanup...');
      const result = await window.electronAPI.emergencyHLSCleanup();
      console.log('Emergency cleanup result:', result);
      return result;
    } catch (error) {
      console.error('Emergency cleanup failed:', error);
      return null;
    }
  },

  // Monitor for a few seconds
  monitor: async (seconds = 30) => {
    console.log(`Monitoring HLS status for ${seconds} seconds...`);
    const interval = setInterval(async () => {
      const status = await window.hlsDebugHelpers.checkStatus();
    }, 5000);
    
    setTimeout(() => {
      clearInterval(interval);
      console.log('Monitoring complete');
    }, seconds * 1000);
  }
};

// Auto-initialize debug helpers
console.log('HLS Debug helpers available:');
console.log('  - window.hlsDebugHelpers.checkStatus() - Check current status');
console.log('  - window.hlsDebugHelpers.cleanup() - Force cleanup');
console.log('  - window.hlsDebugHelpers.emergency() - Emergency cleanup');
console.log('  - window.hlsDebugHelpers.monitor(30) - Monitor for 30 seconds');