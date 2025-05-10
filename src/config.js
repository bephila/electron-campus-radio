const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

// Default paths to check for FFmpeg
const DEFAULT_PATHS = [
    path.join(__dirname, '..', 'ffmpeg-7.1.1', 'bin', 'ffmpeg.exe'), // Local project FFmpeg
    'ffmpeg', // Check if ffmpeg is in PATH
    path.join(process.env.USERPROFILE, 'Documents', 'ffmpeg-7.1.1', 'bin', 'ffmpeg.exe'),
    path.join(process.env.ProgramFiles, 'ffmpeg', 'bin', 'ffmpeg.exe'),
    path.join(process.env.ProgramFiles, 'ffmpeg-7.1.1', 'bin', 'ffmpeg.exe'),
];

// Try to find FFmpeg in the system
function findFFmpeg() {
    // First check local project FFmpeg
    const localFFmpeg = path.join(__dirname, '..', 'ffmpeg-7.1.1', 'bin', 'ffmpeg.exe');
    if (fs.existsSync(localFFmpeg)) {
        return localFFmpeg;
    }

    // Then check if ffmpeg is in PATH
    try {
        execSync('ffmpeg -version', { stdio: 'ignore' });
        return 'ffmpeg'; // If found in PATH, return just the command name
    } catch (e) {
        // Not in PATH, continue checking other locations
    }

    // Check other default locations
    for (const ffmpegPath of DEFAULT_PATHS) {
        if (fs.existsSync(ffmpegPath)) {
            return ffmpegPath;
        }
    }

    return null;
}

// Get FFmpeg path from config or find it
function getFFmpegPath() {
    // Try to load custom config if it exists
    const configPath = path.join(process.env.APPDATA, 'electron-campus-radio', 'config.json');
    try {
        if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            if (config.ffmpegPath && fs.existsSync(config.ffmpegPath)) {
                return config.ffmpegPath;
            }
        }
    } catch (e) {
        console.warn('Error reading config file:', e);
    }

    // If no config or invalid config, try to find FFmpeg
    const foundPath = findFFmpeg();
    if (!foundPath) {
        throw new Error('FFmpeg not found. Please ensure ffmpeg-7.1.1 is present in the project directory.');
    }

    return foundPath;
}

module.exports = {
    getFFmpegPath,
    // Function to save custom FFmpeg path
    saveFFmpegPath: (customPath) => {
        const configDir = path.join(process.env.APPDATA, 'electron-campus-radio');
        const configPath = path.join(configDir, 'config.json');
        
        try {
            if (!fs.existsSync(configDir)) {
                fs.mkdirSync(configDir, { recursive: true });
            }
            
            const config = {
                ffmpegPath: customPath
            };
            
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
            return true;
        } catch (e) {
            console.error('Error saving FFmpeg path:', e);
            return false;
        }
    }
}; 