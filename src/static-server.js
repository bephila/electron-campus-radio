// src/static-server.js
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const publicDir = path.join(__dirname, '..', 'public');
const hlsDir = path.join(publicDir, 'hls');

// Create HLS directory if it doesn't exist
if (!fs.existsSync(hlsDir)) {
  fs.mkdirSync(hlsDir, { recursive: true });
}

// Enable CORS for all routes
app.use(cors({
  origin: '*',
  methods: ['GET', 'HEAD'],
  allowedHeaders: ['Content-Type', 'Range']
}));

// Debug logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

// HLS specific routes
app.get('/hls/stream.m3u8', (req, res) => {
  const m3u8Path = path.join(hlsDir, 'stream.m3u8');
  
  // Create empty playlist if it doesn't exist
  if (!fs.existsSync(m3u8Path)) {
    const initialContent = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:2
#EXT-X-MEDIA-SEQUENCE:0
`;
    try {
      fs.writeFileSync(m3u8Path, initialContent);
      console.log('Created new playlist file');
    } catch (err) {
      console.error('Error creating playlist:', err);
      return res.status(500).send('Error creating playlist');
    }
  }

  res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(m3u8Path);
});

app.get('/hls/*.ts', (req, res) => {
  const tsPath = path.join(hlsDir, path.basename(req.path));
  if (!fs.existsSync(tsPath)) {
    console.log('TS segment not found:', tsPath);
    return res.status(404).send('Segment not found');
  }
  res.setHeader('Content-Type', 'video/MP2T');
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(tsPath);
});

// Serve static files
app.use(express.static(publicDir));

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).send('Internal Server Error');
});

const PORT = 8080;
const server = app.listen(PORT, () => {
  console.log(`HLS server running on http://localhost:${PORT}`);
  console.log(`Static files served from: ${publicDir}`);
  console.log(`HLS files served from: ${hlsDir}`);
});

// Handle server errors
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Please choose a different port or close the application using this port.`);
  } else {
    console.error('Server error:', error);
  }
  process.exit(1);
});

// Watch HLS directory for changes
fs.watch(hlsDir, (eventType, filename) => {
  console.log(`HLS file ${eventType}: ${filename}`);
});

// Keep the process alive
process.on('SIGINT', () => {
  console.log('Shutting down server...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  server.close(() => {
    process.exit(1);
  });
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  server.close(() => {
    process.exit(1);
  });
});
