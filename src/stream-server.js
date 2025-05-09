// stream-server.js
const WebSocket = require('ws');
const { spawn } = require('child_process');

const wss = new WebSocket.Server({ port: 9999 });
let ffmpeg;

wss.on('connection', ws => {
  // start ffmpeg on first connection
  ffmpeg = spawn('ffmpeg', [
    '-i', 'pipe:0',              // input from stdin
    '-c:v', 'libx264', '-preset', 'veryfast',
    '-g', '30', '-sc_threshold', '0',
    '-f', 'hls',
    '-hls_time', '2',
    '-hls_list_size', '3',
    '-hls_flags', 'delete_segments',
    'hls/stream.m3u8'
  ]);

  ws.on('message', chunk => ffmpeg.stdin.write(chunk));
  ws.on('close', () => { ffmpeg.stdin.end(); });
});

console.log('WebSocket→FFmpeg bridge listening on ws://localhost:9999');
