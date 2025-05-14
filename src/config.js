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
    // First check for FFmpeg in the project directory
    const localFFmpegPath = path.join(__dirname, '..', 'ffmpeg-7.1.1', 'bin', 'ffmpeg.exe');
    if (fs.existsSync(localFFmpegPath)) {
        console.log('Using local FFmpeg installation:', localFFmpegPath);
        return localFFmpegPath;
    }

    // Then check for custom path in config
    const configDir = path.join(process.env.APPDATA, 'electron-campus-radio');
    const configPath = path.join(configDir, 'config.json');
    
    if (fs.existsSync(configPath)) {
        try {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            if (config.ffmpegPath && fs.existsSync(config.ffmpegPath)) {
                console.log('Using custom FFmpeg path from config:', config.ffmpegPath);
                return config.ffmpegPath;
            }
        } catch (e) {
            console.error('Error reading FFmpeg config:', e);
        }
    }

    // Finally check system PATH
    const systemFFmpeg = 'ffmpeg';
    try {
        require('child_process').execSync(`${systemFFmpeg} -version`, { stdio: 'ignore' });
        console.log('Using system FFmpeg installation');
        return systemFFmpeg;
    } catch (e) {
        console.error('FFmpeg not found in system PATH');
    }

    console.error('No FFmpeg installation found');
    return null;
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
            console.log('Saved FFmpeg path to config:', customPath);
            return true;
        } catch (e) {
            console.error('Error saving FFmpeg path:', e);
            return false;
        }
    }
}; 