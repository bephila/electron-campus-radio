// src/viewer-preload.js
const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld(
    'electronAPI', {
        // Add any viewer-specific IPC methods here
        onStreamStatus: (callback) => {
            ipcRenderer.on('stream-status', (_, data) => callback(data));
        },
        onStreamError: (callback) => {
            ipcRenderer.on('stream-error', (_, data) => callback(data));
        }
    }
); 