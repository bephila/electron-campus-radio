// stream-server.js
const WebSocket = require('ws');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { getFFmpegPath } = require('./config');

// Configure paths
const publicDir = path.join(__dirname, '..', 'public');
const hlsDir = path.join(publicDir, 'hls');

// Create initial empty playlist
function createEmptyPlaylist() {
  const initialContent = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:2
#EXT-X-MEDIA-SEQUENCE:0
`;
  const outputPath = path.join(hlsDir, 'stream.m3u8');
  fs.writeFileSync(outputPath, initialContent);
  console.log('Created initial playlist file');
}

// Ensure directories exist
try {
  if (!fs.existsSync(hlsDir)) {
    fs.mkdirSync(hlsDir, { recursive: true });
  }
  // Create initial playlist
  createEmptyPlaylist();
  console.log('HLS directory ready:', hlsDir);
} catch (err) {
  console.error('Failed to prepare HLS directory:', err);
  process.exit(1);
}

const wss = new WebSocket.Server({ port: 9999 });
let ffmpeg;

wss.on('connection', ws => {
  console.log('New WebSocket connection received');
  
  // Clean up existing files but keep the playlist
  try {
    const files = fs.readdirSync(hlsDir);
    for (const file of files) {
      if (file !== 'stream.m3u8') {
        fs.unlinkSync(path.join(hlsDir, file));
      }
    }
    // Reset playlist
    createEmptyPlaylist();
    console.log('Cleaned up existing HLS files');
  } catch (err) {
    console.error('Error cleaning HLS directory:', err);
  }

  // Configure FFmpeg for WebM input
  const outputPath = path.join(hlsDir, 'stream.m3u8');
  const segmentPath = path.join(hlsDir, 'segment%d.ts');
  
  console.log('Starting FFmpeg with output:', outputPath);
  
  try {
    const ffmpegPath = getFFmpegPath();
    ffmpeg = spawn(ffmpegPath, [
      '-f', 'webm',           // Force WebM input format
      '-i', 'pipe:0',         // Input from WebSocket
      '-c:v', 'libx264',      // Output video codec
      '-c:a', 'aac',          // Output audio codec
      '-b:a', '192k',         // Audio bitrate
      '-ar', '44100',         // Audio sample rate
      '-ac', '2',             // Audio channels (stereo)
      '-preset', 'ultrafast',  // Fast encoding
      '-tune', 'zerolatency', // Reduce latency
      '-f', 'hls',            // HLS output
      '-hls_time', '2',       // Segment duration
      '-hls_list_size', '3',  // Keep 3 segments
      '-hls_flags', 'delete_segments+append_list',
      '-hls_segment_filename', segmentPath,
      outputPath
    ]);

    ffmpeg.stderr.on('data', (data) => {
      console.log(`FFmpeg: ${data.toString()}`);
    });

    ffmpeg.on('error', (err) => {
      console.error('FFmpeg error:', err);
      ws.close();
    });

    ws.on('message', chunk => {
      if (ffmpeg && ffmpeg.stdin.writable) {
        try {
          ffmpeg.stdin.write(chunk);
        } catch (err) {
          console.error('Error writing to FFmpeg:', err);
        }
      }
    });

    ws.on('close', () => {
      console.log('Client disconnected');
      if (ffmpeg) {
        ffmpeg.stdin.end();
        ffmpeg = null;
      }
    });
  } catch (error) {
    console.error('Failed to start FFmpeg:', error);
    ws.close();
  }
});

// Monitor HLS directory for debugging
fs.watch(hlsDir, (eventType, filename) => {
  console.log(`File ${eventType}: ${filename}`);
});

console.log('WebSocket server running on ws://localhost:9999');
console.log('HLS output directory:', hlsDir);
