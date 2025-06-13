// Improved WAMP Stream Server - Fixed Reconnection Issues
const WebSocket = require('ws');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');

// WAMP-specific paths
const publicDir = path.join(__dirname, '..', 'public');
const hlsDir = path.join(publicDir, 'hls');

// Simple FFmpeg path detection
function getFFmpegPath() {
    const possiblePaths = [
        'ffmpeg',
        'C:\\ffmpeg\\bin\\ffmpeg.exe',
        'C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe',
        'C:\\Program Files (x86)\\ffmpeg\\bin\\ffmpeg.exe'
    ];
    
    for (const ffmpegPath of possiblePaths) {
        try {
            const { execSync } = require('child_process');
            execSync(`"${ffmpegPath}" -version`, { stdio: 'ignore' });
            console.log(`✓ Found FFmpeg at: ${ffmpegPath}`);
            return ffmpegPath;
        } catch (error) {
            continue;
        }
    }
    
    console.error('✗ FFmpeg not found. Please install FFmpeg');
    return 'ffmpeg';
}

// Create initial playlist
function createEmptyPlaylist() {
    const initialContent = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:4
#EXT-X-MEDIA-SEQUENCE:0
`;
    const outputPath = path.join(hlsDir, 'stream.m3u8');
    try {
        fs.writeFileSync(outputPath, initialContent);
        console.log('✓ Created initial playlist');
    } catch (error) {
        console.error('✗ Failed to create playlist:', error.message);
    }
}

// Enhanced HLS Cleanup
class HLSCleanup {
    constructor() {
        this.hlsDirectory = hlsDir;
        this.maxSegments = 6;  // Reduced for better performance
        this.cleanupInterval = null;
    }
    
    start() {
        console.log('🧹 Starting HLS cleanup...');
        this.cleanupInterval = setInterval(() => {
            this.cleanupOldSegments();
        }, 3000); // More frequent cleanup
    }
    
    stop() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
        console.log('🛑 Stopped HLS cleanup');
        
        setTimeout(() => {
            this.forceCleanup();
        }, 1000);
    }
    
    cleanupOldSegments() {
        try {
            if (!fs.existsSync(this.hlsDirectory)) return;
            
            const files = fs.readdirSync(this.hlsDirectory);
            const segmentFiles = files
                .filter(f => f.endsWith('.ts'))
                .map(f => ({
                    name: f,
                    path: path.join(this.hlsDirectory, f),
                    stats: fs.statSync(path.join(this.hlsDirectory, f))
                }))
                .sort((a, b) => a.stats.mtime - b.stats.mtime);
            
            const toRemove = segmentFiles.length - this.maxSegments;
            if (toRemove > 0) {
                for (let i = 0; i < toRemove; i++) {
                    try {
                        fs.unlinkSync(segmentFiles[i].path);
                        console.log(`🗑️ Cleaned: ${segmentFiles[i].name}`);
                    } catch (error) {
                        // Ignore cleanup errors
                    }
                }
            }
        } catch (error) {
            // Ignore cleanup errors
        }
    }
    
    forceCleanup() {
        console.log('🧹 Force cleaning all segments...');
        try {
            if (!fs.existsSync(this.hlsDirectory)) return;
            
            const files = fs.readdirSync(this.hlsDirectory);
            let cleaned = 0;
            
            for (const file of files) {
                if (file.endsWith('.ts') || file.endsWith('.m3u8')) {
                    try {
                        fs.unlinkSync(path.join(this.hlsDirectory, file));
                        cleaned++;
                    } catch (error) {
                        // Ignore cleanup errors
                    }
                }
            }
            
            console.log(`✓ Force cleanup: ${cleaned} files removed`);
            createEmptyPlaylist();
        } catch (error) {
            console.error('Force cleanup failed:', error.message);
        }
    }
}

// Initialize directories
function initializeDirectories() {
    try {
        if (!fs.existsSync(hlsDir)) {
            fs.mkdirSync(hlsDir, { recursive: true });
            console.log(`✓ Created HLS directory`);
        }
        createEmptyPlaylist();
        return true;
    } catch (err) {
        console.error('✗ Failed to initialize directories:', err.message);
        return false;
    }
}

// Connection manager to handle reconnections better
class ConnectionManager {
    constructor() {
        this.activeConnection = null;
        this.activeFFmpeg = null;
        this.isProcessing = false;
    }
    
    async handleNewConnection(ws, req) {
        const clientIP = req.socket.remoteAddress;
        console.log(`🔗 New connection from ${clientIP}`);
        
        // If there's an existing connection, clean it up first
        if (this.activeConnection) {
            console.log('🔄 Cleaning up previous connection...');
            await this.cleanup();
            
            // Wait a moment for cleanup to complete
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        this.activeConnection = ws;
        this.isProcessing = false;
        
        // Set up the new connection
        this.setupConnection(ws, clientIP);
    }
    
    setupConnection(ws, clientIP) {
        // Clean existing files
        try {
            const files = fs.readdirSync(hlsDir);
            for (const file of files) {
                if (file !== 'stream.m3u8' && (file.endsWith('.ts') || file.endsWith('.m3u8'))) {
                    fs.unlinkSync(path.join(hlsDir, file));
                }
            }
            createEmptyPlaylist();
            console.log('🧹 Cleaned existing files');
        } catch (err) {
            console.warn('⚠️ Cleanup warning:', err.message);
        }
        
        const ffmpegPath = getFFmpegPath();
        const outputPath = path.join(hlsDir, 'stream.m3u8');
        const segmentPath = path.join(hlsDir, 'segment%d.ts');
        
        console.log(`🎬 Starting FFmpeg for ${clientIP}`);
        
        try {
            this.activeFFmpeg = spawn(ffmpegPath, [
                '-f', 'webm',
                '-i', 'pipe:0',
                '-c:v', 'libx264',
                '-c:a', 'aac',
                '-b:v', '1000k',  // Reduced bitrate for stability
                '-b:a', '96k',    // Reduced audio bitrate
                '-ar', '44100',
                '-ac', '2',
                '-preset', 'faster',  // Faster preset for better performance
                '-tune', 'zerolatency',
                '-g', '25',       // Smaller GOP for better seeking
                '-keyint_min', '25',
                '-sc_threshold', '0',
                '-f', 'hls',
                '-hls_time', '2',      // Shorter segments
                '-hls_list_size', '4', // Keep fewer segments
                '-hls_flags', 'delete_segments+append_list+independent_segments',
                '-hls_segment_filename', segmentPath,
                '-hls_allow_cache', '0',
                '-avoid_negative_ts', 'make_zero',
                outputPath
            ], {
                stdio: ['pipe', 'pipe', 'pipe']
            });
            
            // Enhanced error handling
            this.activeFFmpeg.stderr.on('data', (data) => {
                const output = data.toString();
                if (output.includes('Error') || output.includes('error')) {
                    console.error(`❌ FFmpeg Error: ${output.trim()}`);
                } else if (Math.random() < 0.05) { // Log 5% of messages
                    console.log(`📽️ FFmpeg: ${output.trim()}`);
                }
            });
            
            this.activeFFmpeg.on('error', (err) => {
                console.error('❌ FFmpeg error:', err.message);
                this.cleanup();
            });
            
            this.activeFFmpeg.on('close', (code) => {
                console.log(`🛑 FFmpeg ended (code: ${code})`);
                if (code !== 0 && code !== null) {
                    console.warn('FFmpeg exited with error code:', code);
                }
            });
            
        } catch (error) {
            console.error('❌ Failed to start FFmpeg:', error.message);
            ws.close();
            return;
        }
        
        // Handle WebSocket messages
        ws.on('message', (chunk) => {
            if (this.activeFFmpeg && this.activeFFmpeg.stdin && this.activeFFmpeg.stdin.writable && !this.isProcessing) {
                try {
                    this.activeFFmpeg.stdin.write(chunk);
                    
                    // Log data transfer occasionally
                    if (Math.random() < 0.001) { // 0.1% of messages
                        console.log(`📡 Data: ${chunk.length} bytes`);
                    }
                } catch (err) {
                    console.error('❌ Error writing to FFmpeg:', err.message);
                }
            }
        });
        
        // Handle WebSocket close
        ws.on('close', () => {
            console.log(`🔌 Client ${clientIP} disconnected`);
            this.cleanup();
        });
        
        // Handle WebSocket errors
        ws.on('error', (error) => {
            console.error(`❌ WebSocket error from ${clientIP}:`, error.message);
            this.cleanup();
        });
    }
    
    async cleanup() {
        this.isProcessing = true;
        
        if (this.activeFFmpeg) {
            try {
                if (this.activeFFmpeg.stdin && !this.activeFFmpeg.stdin.destroyed) {
                    this.activeFFmpeg.stdin.end();
                }
                this.activeFFmpeg.kill('SIGTERM');
                
                // Wait for FFmpeg to close gracefully
                await new Promise((resolve) => {
                    const timeout = setTimeout(() => {
                        if (this.activeFFmpeg) {
                            this.activeFFmpeg.kill('SIGKILL');
                        }
                        resolve();
                    }, 2000);
                    
                    if (this.activeFFmpeg) {
                        this.activeFFmpeg.on('close', () => {
                            clearTimeout(timeout);
                            resolve();
                        });
                    } else {
                        clearTimeout(timeout);
                        resolve();
                    }
                });
                
                this.activeFFmpeg = null;
                console.log('✓ FFmpeg cleaned up');
            } catch (err) {
                console.warn('⚠️ FFmpeg cleanup warning:', err.message);
            }
        }
        
        this.activeConnection = null;
        this.isProcessing = false;
    }
}

// Main server function
function startServer() {
    console.log('🎵 Campus Radio Stream Server - Enhanced Edition');
    console.log('===============================================');
    
    const ffmpegPath = getFFmpegPath();
    
    if (!initializeDirectories()) {
        console.error('Cannot start without proper directories');
        process.exit(1);
    }
    
    const hlsCleanup = new HLSCleanup();
    const connectionManager = new ConnectionManager();
    
    // Create HTTP server
    const app = express();
    app.use(cors());
    app.use(express.json());
    
    app.get('/health', (req, res) => {
        res.json({
            status: 'ok',
            server: 'Campus Radio Stream Server',
            timestamp: new Date().toISOString(),
            activeConnection: !!connectionManager.activeConnection
        });
    });
    
    app.get('/stream/status', (req, res) => {
        try {
            const files = fs.existsSync(hlsDir) ? fs.readdirSync(hlsDir) : [];
            const segments = files.filter(f => f.endsWith('.ts'));
            const playlists = files.filter(f => f.endsWith('.m3u8'));
            
            res.json({
                active: segments.length > 0,
                segments: segments.length,
                playlists: playlists.length,
                connected: !!connectionManager.activeConnection
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });
    
    const HTTP_PORT = 9998;
    app.listen(HTTP_PORT, () => {
        console.log(`✓ HTTP API: http://localhost:${HTTP_PORT}`);
    });
    
    // Create WebSocket server with enhanced configuration
    const wss = new WebSocket.Server({ 
        port: 9999,
        host: '0.0.0.0', //allows connections from any IP
        perMessageDeflate: false,
        maxPayload: 50 * 1024 * 1024,
        backlog: 1,
        clientTracking: true
    });
    
    console.log('✓ WebSocket: ws://localhost:9999');
    console.log(`✓ HLS directory: ${hlsDir}`);
    console.log('');
    console.log('📺 Viewer: http://localhost/campus-radio/public/viewer.html');
    console.log('🎛️ Admin: http://localhost/campus-radio/public/index.html');
    console.log('');
    console.log('✅ Server ready for connections!');
    
    wss.on('connection', async (ws, req) => {
        hlsCleanup.start();
        await connectionManager.handleNewConnection(ws, req);
    });
    
    // Enhanced graceful shutdown
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    
    async function cleanup() {
        console.log('\n🛑 Shutting down gracefully...');
        
        hlsCleanup.stop();
        await connectionManager.cleanup();
        
        wss.close(() => {
            console.log('✓ WebSocket server closed');
        });
        
        console.log('✅ Cleanup completed');
        process.exit(0);
    }
}

// Start the server
if (require.main === module) {
    startServer();
}

module.exports = { startServer };