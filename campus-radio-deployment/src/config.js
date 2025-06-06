const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const { app } = require('electron');

// Get FFmpeg path from config or find it
function getFFmpegPath() {
    // First check for FFmpeg in the packaged app resources
    if (app && app.isPackaged) {
        const resourcesPath = process.resourcesPath;
        const packagedFFmpegPath = path.join(resourcesPath, 'ffmpeg-7.1.1', 'bin', 'ffmpeg.exe');
        if (fs.existsSync(packagedFFmpegPath)) {
            console.log('Using packaged FFmpeg:', packagedFFmpegPath);
            return packagedFFmpegPath;
        }
    }
    
    // Development mode - check local project directory
    const localFFmpegPath = path.join(__dirname, '..', 'ffmpeg-7.1.1', 'bin', 'ffmpeg.exe');
    if (fs.existsSync(localFFmpegPath)) {
        console.log('Using local FFmpeg installation:', localFFmpegPath);
        return localFFmpegPath;
    }

    // Check for custom path in config
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
    try {
        execSync('ffmpeg -version', { stdio: 'ignore' });
        console.log('Using system FFmpeg installation');
        return 'ffmpeg';
    } catch (e) {
        console.error('FFmpeg not found in system PATH');
    }

    console.error('No FFmpeg installation found');
    return null;
}

module.exports = {
    getFFmpegPath,
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