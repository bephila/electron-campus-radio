// src/main.js - Complete main.js with WORKING HLS cleanup + FIXED Window Management
const { app, BrowserWindow, ipcMain, dialog, powerMonitor } = require('electron');
const path = require('path');
const { spawn, exec } = require('child_process');
const fs = require('fs');
const { getFFmpegPath, saveFFmpegPath } = require('./config');

// Inline HLS Cleanup Manager Class - WORKING VERSION
const fsPromises = require('fs').promises;
const fsSync = require('fs');

class RobustHLSCleanupManager {
  constructor(hlsDirectory = null) {
    // FIX: Use absolute path
    this.hlsDirectory = hlsDirectory || path.join(__dirname, '..', 'public', 'hls');
    this.isStreaming = false;
    this.cleanupInterval = null;
    this.retentionPeriod = 30000; // 30 seconds for old segments
    this.forceCleanupDelay = 2000; // 2 seconds after stream stops
    this.maxRetries = 5; // Increased retries
    this.isInitialized = false;
    
    console.log(`HLS Cleanup Manager initialized with directory: ${this.hlsDirectory}`);
  }

  async initialize() {
    if (this.isInitialized) return;
    
    console.log('Initializing HLS Cleanup Manager...');
    
    // Ensure directory exists
    try {
      await this.ensureDirectoryExists();
      console.log(`HLS directory confirmed: ${this.hlsDirectory}`);
    } catch (error) {
      console.error('Failed to initialize HLS directory:', error);
    }
    
    // Clean up any leftover files from previous session
    await this.startupCleanup();
    
    this.isInitialized = true;
    console.log('HLS Cleanup Manager initialized successfully');
  }

  async ensureDirectoryExists() {
    try {
      await fsPromises.access(this.hlsDirectory);
    } catch {
      // Directory doesn't exist, create it
      await fsPromises.mkdir(this.hlsDirectory, { recursive: true });
      console.log(`Created HLS directory: ${this.hlsDirectory}`);
    }
  }

  async startupCleanup() {
    console.log('Performing startup cleanup of HLS files...');
    try {
      const files = await this.getHLSFiles();
      let cleanedCount = 0;
      
      for (const file of files) {
        if (file.name.endsWith('.ts') || file.name.endsWith('.m3u8')) {
          try {
            await this.deleteFileWithRetry(file.path);
            cleanedCount++;
          } catch (error) {
            console.warn(`Could not clean startup file ${file.name}:`, error.message);
          }
        }
      }
      
      console.log(`Startup cleanup completed: ${cleanedCount} files removed`);
    } catch (error) {
      console.error('Startup cleanup failed:', error);
    }
  }

  async startCleanup() {
    await this.initialize();
    console.log('Starting HLS cleanup monitoring...');
    this.isStreaming = true;
    
    // Start periodic cleanup while streaming (removes old segments)
    this.startPeriodicCleanup();
    
    return { success: true, message: 'HLS cleanup monitoring started' };
  }

  async stopCleanup() {
    console.log('Stopping HLS cleanup monitoring...');
    this.isStreaming = false;
    
    // Stop periodic cleanup
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      console.log('Periodic cleanup stopped');
    }

    // IMPORTANT: Don't auto-cleanup here, let caller decide when to force cleanup
    console.log('HLS cleanup monitoring stopped (files preserved for now)');
    
    return { success: true, message: 'HLS cleanup stopped' };
  }

  startPeriodicCleanup() {
    // Clean up old segments every 10 seconds while streaming
    this.cleanupInterval = setInterval(async () => {
      if (this.isStreaming) {
        try {
          await this.cleanupOldSegments();
        } catch (error) {
          console.error('Error during periodic cleanup:', error);
        }
      }
    }, 10000);
    
    console.log('Periodic cleanup started (every 10 seconds)');
  }

  async cleanupOldSegments() {
    try {
      const files = await this.getHLSFiles();
      const now = Date.now();
      let cleanedCount = 0;
      
      for (const file of files) {
        // Only clean .ts files, keep .m3u8 playlist files while streaming
        if (file.name.endsWith('.ts')) {
          const age = now - file.stats.mtime.getTime();
          if (age > this.retentionPeriod) {
            try {
              await this.deleteFileWithRetry(file.path);
              cleanedCount++;
              console.log(`Cleaned up old segment: ${file.name} (${Math.round(age/1000)}s old)`);
            } catch (error) {
              console.warn(`Could not clean old segment ${file.name}:`, error.message);
            }
          }
        }
      }
      
      if (cleanedCount > 0) {
        console.log(`Periodic cleanup: ${cleanedCount} old segments removed`);
      }
    } catch (error) {
      console.error('Error during periodic cleanup:', error);
    }
  }

  // FIXED: More aggressive force cleanup with multiple methods
  async forceCleanupAllSegments() {
    console.log('Starting ULTRA-AGGRESSIVE force cleanup of ALL HLS segments...');
    
    try {
      // First, make sure we have the right directory
      console.log(`Target directory: ${this.hlsDirectory}`);
      
      // Check if directory exists
      if (!fsSync.existsSync(this.hlsDirectory)) {
        console.log('HLS directory does not exist, nothing to clean');
        return { success: true, filesRemoved: 0 };
      }

      const files = await this.getHLSFiles();
      let cleanedCount = 0;
      let failedCount = 0;
      const failedFiles = [];
      
      console.log(`Found ${files.length} files to process`);
      
      // Log all files found
      files.forEach(file => {
        console.log(`Found file: ${file.name} (${file.stats.size} bytes, modified: ${file.stats.mtime.toISOString()})`);
      });

      // Method 1: Try normal async deletion
      for (const file of files) {
        if (file.name.endsWith('.ts') || file.name.endsWith('.m3u8')) {
          try {
            await this.deleteFileWithRetry(file.path);
            cleanedCount++;
            console.log(`Method 1 - Force cleaned: ${file.name}`);
          } catch (error) {
            failedCount++;
            failedFiles.push({name: file.name, path: file.path});
            console.error(`Method 1 failed for ${file.name}:`, error.message);
          }
        }
      }
      
      console.log(`Method 1 results: ${cleanedCount} files cleaned, ${failedCount} failed`);
      
      // Method 2: Try synchronous deletion for failed files
      if (failedFiles.length > 0) {
        console.log('Method 2: Attempting synchronous cleanup for failed files...');
        
        for (const file of failedFiles) {
          try {
            if (fsSync.existsSync(file.path)) {
              fsSync.unlinkSync(file.path);
              cleanedCount++;
              console.log(`Method 2 - Sync cleanup succeeded: ${file.name}`);
              // Remove from failed list
              const index = failedFiles.findIndex(f => f.name === file.name);
              if (index > -1) failedFiles.splice(index, 1);
            } else {
              console.log(`File already gone: ${file.name}`);
              // Remove from failed list since it's gone
              const index = failedFiles.findIndex(f => f.name === file.name);
              if (index > -1) failedFiles.splice(index, 1);
            }
          } catch (error) {
            console.error(`Method 2 failed for ${file.name}:`, error.message);
          }
        }
      }
      
      // Method 3: Nuclear option - try to clear the entire directory
      if (failedFiles.length > 0) {
        console.log('Method 3: NUCLEAR OPTION - Attempting to clear entire HLS directory...');
        
        try {
          const allFiles = fsSync.readdirSync(this.hlsDirectory);
          for (const fileName of allFiles) {
            const filePath = path.join(this.hlsDirectory, fileName);
            try {
              if (fileName.endsWith('.ts') || fileName.endsWith('.m3u8')) {
                fsSync.unlinkSync(filePath);
                console.log(`Nuclear cleanup: ${fileName}`);
                cleanedCount++;
              }
            } catch (error) {
              console.error(`Nuclear method failed for ${fileName}:`, error.message);
            }
          }
        } catch (error) {
          console.error('Nuclear method directory read failed:', error);
        }
      }
      
      // Final verification
      try {
        const remainingFiles = await this.getHLSFiles();
        const remainingSegments = remainingFiles.filter(f => f.name.endsWith('.ts') || f.name.endsWith('.m3u8'));
        
        if (remainingSegments.length > 0) {
          console.warn(`${remainingSegments.length} HLS files STILL REMAIN after all cleanup methods:`);
          remainingSegments.forEach(f => console.warn(`   STUBBORN FILE: ${f.name} (${f.stats.size} bytes)`));
        } else {
          console.log('SUCCESS! All HLS files successfully cleaned!');
        }
      } catch (error) {
        console.error('Error during final verification:', error);
      }
      
      console.log(`FINAL RESULT: ${cleanedCount} files removed total`);
      return { success: true, filesRemoved: cleanedCount };
      
    } catch (error) {
      console.error('COMPLETE FORCE CLEANUP FAILURE:', error);
      return { success: false, error: error.message, filesRemoved: 0 };
    }
  }

  // ENHANCED: Better retry mechanism with more attempts
  async deleteFileWithRetry(filePath) {
    let lastError;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        // Check if file still exists first
        if (!fsSync.existsSync(filePath)) {
          // File doesn't exist, that's success
          return;
        }
        
        // Try to delete
        await fsPromises.unlink(filePath);
        
        // Verify deletion worked
        if (fsSync.existsSync(filePath)) {
          throw new Error('File still exists after deletion attempt');
        }
        
        // Success!
        return;
        
      } catch (error) {
        lastError = error;
        
        if (error.code === 'ENOENT') {
          // File doesn't exist, that's success
          return;
        }
        
        if (attempt < this.maxRetries) {
          console.warn(`Delete attempt ${attempt}/${this.maxRetries} failed for ${path.basename(filePath)}: ${error.message}, retrying...`);
          // Progressive delay: 300ms, 600ms, 900ms, 1200ms, 1500ms
          await new Promise(resolve => setTimeout(resolve, 300 * attempt));
        }
      }
    }
    
    // All retries failed, try synchronous delete as last resort
    try {
      if (fsSync.existsSync(filePath)) {
        fsSync.unlinkSync(filePath);
        console.log(`Final sync delete succeeded for ${path.basename(filePath)}`);
        return;
      }
    } catch (syncError) {
      console.error(`Final sync delete also failed for ${path.basename(filePath)}:`, syncError.message);
    }
    
    throw new Error(`FAILED TO DELETE ${path.basename(filePath)} after ${this.maxRetries} attempts and sync fallback: ${lastError.message}`);
  }

  async getHLSFiles() {
    try {
      // Check if directory exists
      if (!fsSync.existsSync(this.hlsDirectory)) {
        console.log(`Directory does not exist: ${this.hlsDirectory}`);
        return [];
      }

      const files = await fsPromises.readdir(this.hlsDirectory);
      const fileDetails = [];

      for (const file of files) {
        const filePath = path.join(this.hlsDirectory, file);
        try {
          const stats = await fsPromises.stat(filePath);
          if (stats.isFile()) {
            fileDetails.push({
              name: file,
              path: filePath,
              stats: stats
            });
          }
        } catch (error) {
          console.warn(`Could not stat file ${filePath}:`, error.message);
        }
      }

      return fileDetails;
    } catch (error) {
      console.error('Error reading HLS directory:', error);
      return [];
    }
  }

  // Manual cleanup method for emergency use
  async emergencyCleanup() {
    console.log('EMERGENCY CLEANUP TRIGGERED');
    
    try {
      // Force stop any ongoing cleanup
      if (this.cleanupInterval) {
        clearInterval(this.cleanupInterval);
        this.cleanupInterval = null;
      }
      
      this.isStreaming = false;
      
      // Immediately force cleanup
      const result = await this.forceCleanupAllSegments();
      
      return { success: true, message: 'Emergency cleanup completed', filesRemoved: result.filesRemoved };
    } catch (error) {
      console.error('Emergency cleanup failed:', error);
      return { success: false, error: error.message };
    }
  }

  // Get detailed status for debugging
  async getDetailedStatus() {
    try {
      const files = await this.getHLSFiles();
      const now = Date.now();
      
      const segmentFiles = files.filter(f => f.name.endsWith('.ts'));
      const playlistFiles = files.filter(f => f.name.endsWith('.m3u8'));
      const otherFiles = files.filter(f => !f.name.endsWith('.ts') && !f.name.endsWith('.m3u8'));
      
      const oldestFile = files.length > 0 ? 
        Math.min(...files.map(f => f.stats.mtime.getTime())) : null;
      
      const newestFile = files.length > 0 ? 
        Math.max(...files.map(f => f.stats.mtime.getTime())) : null;
      
      return {
        isStreaming: this.isStreaming,
        isInitialized: this.isInitialized,
        directory: this.hlsDirectory,
        directoryExists: fsSync.existsSync(this.hlsDirectory),
        totalFiles: files.length,
        segmentCount: segmentFiles.length,
        playlistCount: playlistFiles.length,
        otherFiles: otherFiles.length,
        oldestFile: oldestFile ? new Date(oldestFile).toISOString() : null,
        newestFile: newestFile ? new Date(newestFile).toISOString() : null,
        ageOfOldestFile: oldestFile ? Math.round((now - oldestFile) / 1000) : null,
        files: files.map(f => ({
          name: f.name,
          size: f.stats.size,
          modified: f.stats.mtime.toISOString(),
          ageSeconds: Math.round((now - f.stats.mtime.getTime()) / 1000)
        }))
      };
    } catch (error) {
      return {
        isStreaming: this.isStreaming,
        isInitialized: this.isInitialized,
        error: error.message,
        directory: this.hlsDirectory,
        directoryExists: fsSync.existsSync(this.hlsDirectory)
      };
    }
  }

  // Synchronous emergency cleanup for process exit
  emergencyCleanupSync() {
    console.log('SYNCHRONOUS EMERGENCY CLEANUP');
    
    try {
      if (!fsSync.existsSync(this.hlsDirectory)) {
        console.log('No HLS directory to clean');
        return;
      }
      
      const files = fsSync.readdirSync(this.hlsDirectory);
      let cleanedCount = 0;
      
      console.log(`Found ${files.length} files for sync cleanup`);
      
      for (const file of files) {
        if (file.endsWith('.ts') || file.endsWith('.m3u8')) {
          const filePath = path.join(this.hlsDirectory, file);
          try {
            fsSync.unlinkSync(filePath);
            cleanedCount++;
            console.log(`Sync cleaned: ${file}`);
          } catch (error) {
            console.warn(`Could not sync clean ${file}:`, error.message);
          }
        }
      }
      
      console.log(`Synchronous cleanup completed: ${cleanedCount} files removed`);
    } catch (error) {
      console.error('Synchronous cleanup failed:', error);
    }
  }
}

// CRITICAL: FFmpeg process management function
function killFFmpegProcess() {
  return new Promise((resolve) => {
    if (!ffmpegProcess) {
      resolve();
      return;
    }

    console.log('Killing FFmpeg process...');
    
    const timeout = setTimeout(() => {
      console.log('Force killing FFmpeg process...');
      try {
        ffmpegProcess.kill('SIGKILL');
      } catch (error) {
        console.error('Error force killing FFmpeg:', error);
      }
      ffmpegProcess = null;
      resolve();
    }, 3000); // 3 second timeout

    ffmpegProcess.on('close', () => {
      clearTimeout(timeout);
      console.log('FFmpeg process terminated gracefully');
      ffmpegProcess = null;
      resolve();
    });

    try {
      ffmpegProcess.kill('SIGTERM');
    } catch (error) {
      console.error('Error terminating FFmpeg:', error);
      clearTimeout(timeout);
      ffmpegProcess = null;
      resolve();
    }
  });
}

// NUCLEAR OPTION: Force delete with multiple methods
async function nuclearHLSCleanup(hlsDirectory) {
  console.log('NUCLEAR HLS CLEANUP STARTING...');
  
  const targetDir = hlsDirectory || path.join(__dirname, '..', 'public', 'hls');
  let totalDeleted = 0;
  
  // Method 1: Try to delete each file individually with retries
  try {
    if (fsSync.existsSync(targetDir)) {
      const files = fsSync.readdirSync(targetDir);
      console.log(`Found ${files.length} files in HLS directory`);
      
      for (const file of files) {
        if (file.endsWith('.ts') || file.endsWith('.m3u8')) {
          const filePath = path.join(targetDir, file);
          
          // Try multiple deletion methods
          for (let method = 1; method <= 3; method++) {
            try {
              if (!fsSync.existsSync(filePath)) {
                console.log(`File already gone: ${file}`);
                totalDeleted++;
                break;
              }
              
              if (method === 1) {
                // Method 1: Normal deletion
                fsSync.unlinkSync(filePath);
              } else if (method === 2) {
                // Method 2: Force with different permissions
                fsSync.chmodSync(filePath, 0o666);
                fsSync.unlinkSync(filePath);
              } else if (method === 3) {
                // Method 3: Try to overwrite then delete
                fsSync.writeFileSync(filePath, '');
                fsSync.unlinkSync(filePath);
              }
              
              if (!fsSync.existsSync(filePath)) {
                console.log(`Method ${method} SUCCESS: Deleted ${file}`);
                totalDeleted++;
                break;
              }
            } catch (error) {
              console.log(`Method ${method} failed for ${file}: ${error.message}`);
              if (method === 3) {
                console.error(`ALL METHODS FAILED for ${file}`);
              }
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('Nuclear cleanup error:', error);
  }
  
  console.log(`NUCLEAR CLEANUP COMPLETE: ${totalDeleted} files removed`);
  return totalDeleted;
}

// Global variables
let ffmpegProcess;
let mainWindow;

// Create HLS cleanup instance with absolute path
const hlsCleanup = new RobustHLSCleanupManager();
hlsCleanup.initialize().catch(console.error);

// FIXED: Function to create the main window with proper minimizing support
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    // FIXED: Enable all window controls including minimize
    frame: true,
    titleBarStyle: 'default', // Use default title bar
    minimizable: true,        // CRITICAL: Allow minimizing
    maximizable: true,        // Allow maximizing
    resizable: true,          // Allow resizing
    closable: true,           // Allow closing
    fullscreenable: true,     // Allow fullscreen
    // FIXED: Proper window icon
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    // FIXED: Enhanced window appearance
    backgroundColor: '#1c1c1e', // Dark background
    show: false, // Don't show until ready
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      sandbox: true,
      worldSafeExecuteJavaScript: true,
      // FIXED: Enhanced security and compatibility
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      webSecurity: true
    }
  });

  // Load the index.html file
  mainWindow.loadFile(path.join(__dirname, '..', 'public', 'index.html'));

  // FIXED: Show window when ready to prevent flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    
    // FIXED: Focus the window properly
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
  });

  // FIXED: Enhanced window state management
  mainWindow.on('minimize', () => {
    console.log('Window minimized');
    // You can add tray functionality here if needed
  });

  mainWindow.on('restore', () => {
    console.log('Window restored');
  });

  mainWindow.on('maximize', () => {
    console.log('Window maximized');
  });

  mainWindow.on('unmaximize', () => {
    console.log('Window unmaximized');
  });

  // FIXED: Proper window close handling
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      
      // Ask user if they want to minimize to tray or actually quit
      const choice = dialog.showMessageBoxSync(mainWindow, {
        type: 'question',
        buttons: ['Minimize to Tray', 'Quit Application'],
        defaultId: 0,
        cancelId: 0,
        title: 'Cheers Campus Radio',
        message: 'What would you like to do?',
        detail: 'You can minimize to keep the app running in the background, or quit completely.'
      });

      if (choice === 1) {
        // User chose to quit
        app.isQuitting = true;
        app.quit();
      } else {
        // User chose to minimize
        mainWindow.hide();
        // You can implement system tray here if needed
      }
    }
  });

  // Open DevTools only in development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  // Log when the window is ready
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('Main window loaded');
    // Verify that electronAPI is available
    mainWindow.webContents.executeJavaScript(`
      console.log('Checking electronAPI availability:', window.electronAPI ? 'Available' : 'Not available');
      if (window.electronAPI) {
        console.log('Available methods:', Object.keys(window.electronAPI));
      }
    `);
  });

  // Log any console messages from the renderer
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`Renderer Console [${level}]: ${message}`);
  });

  // FIXED: Handle window focus/blur for better alt-tab behavior
  mainWindow.on('focus', () => {
    console.log('Window focused');
  });

  mainWindow.on('blur', () => {
    console.log('Window blurred');
  });

  // FIXED: Handle window state changes
  mainWindow.on('show', () => {
    console.log('Window shown');
  });

  mainWindow.on('hide', () => {
    console.log('Window hidden');
  });
}

// FIXED: Enhanced app ready handler
app.whenReady().then(() => {
  createWindow();
  
  // FIXED: System sleep/wake handling (helps with minimizing issues)
  powerMonitor.on('suspend', () => {
    console.log('System is going to sleep');
  });

  powerMonitor.on('resume', () => {
    console.log('System resumed from sleep');
    
    // Restore window if it was minimized
    if (mainWindow && mainWindow.isMinimized()) {
      setTimeout(() => {
        mainWindow.restore();
      }, 1000);
    }
  });
  
  // FIXED: macOS specific behavior
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.show();
      mainWindow.focus();
    }
  });
});

// FIXED: Enhanced quit behavior
app.on('window-all-closed', () => {
  // On macOS, keep app running even when all windows are closed
  if (process.platform !== 'darwin') {
    app.isQuitting = true;
    app.quit();
  }
});

// FIXED: Enhanced before-quit handler
app.on('before-quit', (event) => {
  console.log('App is quitting, performing cleanup...');
  app.isQuitting = true;
  
  // Kill FFmpeg processes
  if (ffmpegProcess) {
    try {
      ffmpegProcess.kill('SIGKILL');
    } catch (error) {
      console.error('Error killing FFmpeg on quit:', error);
    }
  }
  
  // Force cleanup HLS files on app quit
  hlsCleanup.emergencyCleanupSync();
});

// IPC Handlers for window management
ipcMain.handle('minimize-window', () => {
  if (mainWindow) {
    mainWindow.minimize();
    return true;
  }
  return false;
});

ipcMain.handle('maximize-window', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
    return mainWindow.isMaximized();
  }
  return false;
});

ipcMain.handle('close-window', () => {
  if (mainWindow) {
    mainWindow.close();
    return true;
  }
  return false;
});

ipcMain.handle('get-window-state', () => {
  if (mainWindow) {
    return {
      isMinimized: mainWindow.isMinimized(),
      isMaximized: mainWindow.isMaximized(),
      isFullScreen: mainWindow.isFullScreen(),
      isFocused: mainWindow.isFocused(),
      isVisible: mainWindow.isVisible()
    };
  }
  return null;
});

// Enhanced FFmpeg start with HLS support
ipcMain.on('start-ffmpeg', async (_, rtmpUrl, cameraName, outputType = 'rtmp') => {
  if (!cameraName) {
    mainWindow.webContents.send('stream-error', 'No camera selected');
    return;
  }

  try {
    // Kill any existing FFmpeg process first
    await killFFmpegProcess();

    const ffmpegPath = getFFmpegPath();
    const devices = await getFFmpegDevicesInternal();
    const selectedDevice = devices.find(d => d.name === cameraName);
    
    if (!selectedDevice) {
      mainWindow.webContents.send('stream-error', `Camera "${cameraName}" not found in FFmpeg devices`);
      return;
    }

    let ffmpegArgs;

    if (outputType === 'hls') {
      // HLS output with cleanup flags
      await hlsCleanup.startCleanup();
      
      ffmpegArgs = [
        '-f', 'dshow',
        '-i', `video="${selectedDevice.fullName}"`,
        '-vcodec', 'libx264',
        '-preset', 'ultrafast',
        '-tune', 'zerolatency',
        '-b:v', '2500k',
        '-maxrate', '2500k',
        '-bufsize', '1000k',
        '-pix_fmt', 'yuv420p',
        '-g', '15',
        '-sc_threshold', '0',
        '-f', 'hls',
        '-hls_time', '4',
        '-hls_list_size', '6',           // Keep only 6 segments in playlist
        '-hls_delete_threshold', '1',    // Delete segments when they're no longer needed
        '-hls_flags', 'delete_segments', // Auto-delete old segment files
        '-hls_segment_filename', path.join(hlsCleanup.hlsDirectory, 'segment%d.ts'),
        path.join(hlsCleanup.hlsDirectory, 'stream.m3u8')
      ];
    } else {
      // RTMP output (original)
      ffmpegArgs = [
        '-f', 'dshow',
        '-i', `video="${selectedDevice.fullName}"`,
        '-vcodec', 'libx264',
        '-preset', 'ultrafast',
        '-tune', 'zerolatency',
        '-b:v', '2500k',
        '-maxrate', '2500k',
        '-bufsize', '1000k',
        '-pix_fmt', 'yuv420p',
        '-g', '15',
        '-sc_threshold', '0',
        '-f', 'flv',
        rtmpUrl
      ];
    }

    console.log('Starting FFmpeg with args:', ffmpegArgs);

    ffmpegProcess = spawn(ffmpegPath, ffmpegArgs, { shell: true });

    ffmpegProcess.stderr.on('data', d => {
      const output = d.toString();
      console.log('FFmpeg stderr:', output);
      mainWindow.webContents.send('stream-error', output);
    });

    ffmpegProcess.stdout.on('data', d => {
      console.log('FFmpeg stdout:', d.toString());
    });

    ffmpegProcess.on('close', async (code) => {
      console.log(`FFmpeg process exited with code ${code}`);
      if (outputType === 'hls') {
        await hlsCleanup.stopCleanup();
      }
      mainWindow.webContents.send('stream-status', false);
    });

    ffmpegProcess.on('error', async (error) => {
      console.error('FFmpeg process error:', error);
      if (outputType === 'hls') {
        await hlsCleanup.stopCleanup();
      }
      mainWindow.webContents.send('stream-error', error.message);
    });

    mainWindow.webContents.send('stream-status', true);
  } catch (error) {
    console.error('Error starting FFmpeg:', error);
    mainWindow.webContents.send('stream-error', error.message);
  }
});

// ENHANCED: Better stop with proper FFmpeg termination
ipcMain.on('stop-ffmpeg', async () => {
  console.log('Stopping FFmpeg and HLS cleanup...');
  
  // First stop cleanup monitoring
  await hlsCleanup.stopCleanup();
  
  // Then kill FFmpeg process
  await killFFmpegProcess();
  
  mainWindow.webContents.send('stream-status', false);
  console.log('FFmpeg and HLS cleanup stopped');
});

// Helper function for getting devices (extracted for reuse)
async function getFFmpegDevicesInternal() {
  const ffmpegPath = getFFmpegPath();
  if (!ffmpegPath) {
    throw new Error('FFmpeg path not found');
  }

  return new Promise((resolve, reject) => {
    exec(`${ffmpegPath} -list_devices true -f dshow -i dummy`, (err, stdout, stderr) => {
      if (err) {
        console.error('Error getting FFmpeg devices:', err);
        reject(err);
        return;
      }

      const deviceLines = stderr
        .split('\n')
        .filter(l => l.toLowerCase().includes('dshow') && l.includes('"') && !l.toLowerCase().includes('audio'));

      const devices = deviceLines
        .map(l => {
          const match = l.match(/"([^"]+)"/);
          if (match) {
            const fullName = match[1];
            // Extract just the camera name without the @ symbol and any additional info
            const name = fullName.split('@')[0].trim();
            return {
              name: name,
              fullName: fullName
            };
          }
          return null;
        })
        .filter(Boolean);

      if (devices.length === 0) {
        console.warn('No FFmpeg devices found');
      }

      resolve(devices);
    });
  });
}

ipcMain.handle('get-ffmpeg-devices', async () => {
  try {
    return await getFFmpegDevicesInternal();
  } catch (error) {
    console.error('Error in get-ffmpeg-devices handler:', error);
    throw error;
  }
});

// Add new IPC handler for FFmpeg path configuration
ipcMain.handle('get-ffmpeg-path', async () => {
  try {
    return getFFmpegPath();
  } catch (error) {
    return null;
  }
});

ipcMain.handle('set-ffmpeg-path', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Select FFmpeg executable',
    properties: ['openFile'],
    filters: [
      { name: 'Executable', extensions: ['exe'] }
    ]
  });

  if (canceled || !filePaths.length) {
    return false;
  }

  const selectedPath = filePaths[0];
  if (saveFFmpegPath(selectedPath)) {
    return selectedPath;
  }
  return false;
});

// IPC handlers for HLS cleanup
ipcMain.handle('start-hls-cleanup', async () => {
  try {
    const result = await hlsCleanup.startCleanup();
    console.log('IPC: start-hls-cleanup succeeded');
    return result;
  } catch (error) {
    console.error('IPC: start-hls-cleanup failed:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('stop-hls-cleanup', async () => {
  try {
    const result = await hlsCleanup.stopCleanup();
    console.log('IPC: stop-hls-cleanup succeeded');
    return result;
  } catch (error) {
    console.error('IPC: stop-hls-cleanup failed:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('manual-hls-cleanup', async () => {
  try {
    console.log('IPC: manual-hls-cleanup called');
    const result = await hlsCleanup.forceCleanupAllSegments();
    
    if (mainWindow) {
      mainWindow.webContents.send('hls-cleanup-completed', {
        deletedCount: result.filesRemoved || 0,
        type: 'manual',
        message: 'Manual cleanup completed',
        success: result.success
      });
    }
    
    return { success: true, message: 'Manual cleanup completed', filesRemoved: result.filesRemoved };
  } catch (error) {
    console.error('IPC: manual-hls-cleanup failed:', error);
    if (mainWindow) {
      mainWindow.webContents.send('hls-cleanup-error', error.message);
    }
    return { success: false, error: error.message };
  }
});

// CRITICAL FIX: Force cleanup that actually works
ipcMain.handle('force-hls-cleanup', async () => {
  try {
    console.log('FORCE HLS CLEANUP - NUCLEAR MODE ACTIVATED');
    
    // Step 1: Kill FFmpeg with extreme prejudice
    if (ffmpegProcess) {
      try {
        ffmpegProcess.kill('SIGKILL');
        ffmpegProcess = null;
        console.log('FFmpeg process killed');
      } catch (error) {
        console.error('Error killing FFmpeg:', error);
      }
    }
    
    // Step 2: Wait longer for file handles to close
    console.log('Waiting 3 seconds for file handles to close...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Step 3: Nuclear cleanup - returns number of files removed
    const filesRemoved = await nuclearHLSCleanup(hlsCleanup.hlsDirectory);
    
    // Step 4: Double-check files are gone
    const targetDir = hlsCleanup.hlsDirectory;
    let remainingFiles = [];
    try {
      if (fsSync.existsSync(targetDir)) {
        const allFiles = fsSync.readdirSync(targetDir);
        remainingFiles = allFiles.filter(f => f.endsWith('.ts') || f.endsWith('.m3u8'));
      }
    } catch (error) {
      console.error('Error checking remaining files:', error);
    }
    
    if (remainingFiles.length > 0) {
      console.error(`CLEANUP FAILED: ${remainingFiles.length} files still remain:`, remainingFiles);
      return { 
        success: false, 
        message: `FAILED: ${remainingFiles.length} files still exist`, 
        filesRemoved: filesRemoved,
        remainingFiles: remainingFiles
      };
    } else {
      console.log('SUCCESS: All HLS files completely removed!');
      return { 
        success: true, 
        message: `SUCCESS: Removed ${filesRemoved} files`, 
        filesRemoved: filesRemoved
      };
    }
    
  } catch (error) {
    console.error('NUCLEAR CLEANUP FAILED:', error);
    return { success: false, error: error.message, filesRemoved: 0 };
  }
});

ipcMain.handle('emergency-hls-cleanup', async () => {
  try {
    const result = await hlsCleanup.emergencyCleanup();
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-hls-status', async () => {
  try {
    const status = await hlsCleanup.getDetailedStatus();
    return status;
  } catch (error) {
    return { error: error.message };
  }
});

// Enhanced cleanup event monitoring
const originalForceCleanup = hlsCleanup.forceCleanupAllSegments.bind(hlsCleanup);
hlsCleanup.forceCleanupAllSegments = async function(...args) {
  try {
    if (mainWindow) {
      mainWindow.webContents.send('hls-cleanup-started', { type: 'force' });
    }
    
    const result = await originalForceCleanup(...args);
    
    if (mainWindow) {
      const status = await this.getDetailedStatus();
      mainWindow.webContents.send('hls-cleanup-completed', {
        type: 'force',
        message: 'Force cleanup completed',
        remainingFiles: status.totalFiles,
        filesRemoved: result.filesRemoved || 0
      });
    }
    
    return result;
  } catch (error) {
    if (mainWindow) {
      mainWindow.webContents.send('hls-cleanup-error', error.message);
    }
    throw error;
  }
};

// Add periodic status updates
setInterval(async () => {
  try {
    if (mainWindow) {
      const status = await hlsCleanup.getDetailedStatus();
      mainWindow.webContents.send('hls-status-update', status);
    }
  } catch (error) {
    console.warn('Failed to send status update:', error);
  }
}, 30000);

// Simplified HLS streaming handler
ipcMain.on('start-hls-stream', async (event, cameraName, micName) => {
  ipcMain.emit('start-ffmpeg', event, 'unused-rtmp-url', cameraName, 'hls');
});