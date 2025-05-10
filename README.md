# Campus Radio

A campus radio streaming application built with Electron, WebSocket→FFmpeg bridge, and HLS viewer. This application allows you to stream live content (camera feeds, videos, and audio) to viewers through a web browser.

## Prerequisites

- Node.js (v14 or higher)
- A modern web browser (for viewers)

## Quick Start

1. Clone the repository:
```bash
git clone [repository-url]
cd electron-campus-radio
```

2. Install dependencies:
```bash
npm install
```

3. Start the application (in three separate terminals):
```bash
# Terminal 1 - Static Server
npm run serve

# Terminal 2 - Stream Server
npm run stream

# Terminal 3 - Main Application
npm start
```

## Usage

### For Broadcasters

1. Open the application using `npm start`
2. Use the interface to:
   - Select and preview cameras
   - Upload and play media files (MP3, MP4)
   - Create playlists
   - Start/stop streaming

### For Viewers

1. Open a web browser and navigate to:
   ```
   http://localhost:8080/viewer.html
   ```
2. The stream will automatically start playing when available
3. Use the player controls to:
   - Play/pause the stream
   - Adjust volume
   - Toggle fullscreen

## Troubleshooting

If you encounter issues:

1. **Stream not starting:**
   - Verify all three components are running
   - Check the console for error messages

2. **Viewer can't connect:**
   - Ensure the static server is running
   - Check if the HLS stream is being generated
   - Verify network connectivity

3. **Camera not working:**
   - Check camera permissions
   - Verify camera is not in use by another application
   - Try selecting a different camera in settings

## Development

- Main application: `src/main.js`
- Stream server: `src/stream-server.js`
- Static server: `src/static-server.js`
- Viewer page: `public/viewer.html`

## Contributors

- [Team Name]
- SLU Internship Project
