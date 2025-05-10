# Campus Radio

A campus radio streaming application built with Electron, WebSocket→FFmpeg bridge, and HLS viewer. This application allows you to stream live content (camera feeds, videos, and audio) to viewers through a web browser.

## Prerequisites

- Node.js (v14 or higher)
- FFmpeg (must be installed and available in PATH or in Documents folder)
- A modern web browser (for viewers)

## Installation

1. Clone the repository:
```bash
git clone [repository-url]
cd electron-campus-radio
```

2. Install dependencies:
```bash
npm install
```

## Running the Application

The application consists of three main components that need to be running:

1. **Static Server** (serves the viewer page and HLS segments):
```bash
npm run serve
```
This starts the static server on port 8080.

2. **Stream Server** (handles WebSocket streaming and FFmpeg conversion):
```bash
npm run stream
```
This starts the WebSocket server on port 9999.

3. **Main Application** (the broadcasting interface):
```bash
npm start
```
This launches the Electron application for broadcasting.

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

## FFmpeg Setup

The application requires FFmpeg to be installed. You can:

1. Install FFmpeg globally and add it to your PATH, or
2. Place FFmpeg in your Documents folder at:
   ```
   C:\Users\[YourUsername]\Documents\ffmpeg-7.1.1\bin\ffmpeg.exe
   ```

## Troubleshooting

If you encounter issues:

1. **Stream not starting:**
   - Check if FFmpeg is properly installed
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

## License

[Your License Here]

## Contributors

- [Your Name/Team]
- SLU Internship Project
