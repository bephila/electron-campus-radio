# Campus Radio - Complete Setup Guide

A professional campus radio streaming application built with Electron, WAMP server, WebSocket→FFmpeg bridge, and HLS viewer. Stream live content (camera feeds, videos, and audio) to viewers through any web browser, both locally and over the network.

## 📋 Prerequisites Installation

### 1. Download and Install Required Software

**FFmpeg Setup:**
1. Download FFmpeg from: https://ffmpeg.org/download.html#build-windows
2. Extract to: `C:\ffmpeg\`
3. Your folder structure should be: `C:\ffmpeg\bin\ffmpeg.exe`

**Caddy Setup:**
1. Download Caddy from: https://caddyserver.com/download
2. Extract to: `C:\caddy\`
3. Your folder structure should be: `C:\caddy\caddy.exe`

**WAMP Server:**
1. Download WAMP64 from: https://www.wampserver.com/
2. Install with default settings
3. Ensure it installs to: `C:\wamp64\`

### 2. Add to Windows PATH Environment

1. **Open System Properties:**
   - Press `Win + R` → type `sysdm.cpl` → Enter
   - Click "Environment Variables"

2. **Edit PATH Variable:**
   - Under "System variables", find and select "Path"
   - Click "Edit" → "New"
   - Add these paths:
     ```
     C:\ffmpeg\bin
     C:\caddy
     ```
   - Click "OK" to save

3. **Verify Installation:**
   - Open Command Prompt
   - Test commands:
     ```bash
     ffmpeg -version
     caddy version
     ```

## 🔧 WAMP Server Configuration

### 1. Basic WAMP Setup

1. **Start WAMP Server**
2. **Check Apache Configuration:**
   - Click WAMP icon → Apache → httpd.conf
   - Find line `Listen 80`
   - Change to: `Listen 0.0.0.0:80`

3. **Enable Network Access:**
   - Find this section:
     ```apache
     <Directory "C:/wamp64/www">
         Options +Indexes +Includes +FollowSymLinks +MultiViews
         AllowOverride All
         Require local
     </Directory>
     ```
   - Change `Require local` to: `Require all granted`

### 2. Virtual Host Configuration

1. **Click WAMP icon → Apache → httpd-vhosts.conf**
2. **Add this configuration:**
   ```apache
   <VirtualHost *:80>
       DocumentRoot "C:/wamp64/www/campus-radio/public"
       ServerName campus-radio.local
       ServerAlias *
       DirectoryIndex viewer.html
       <Directory "C:/wamp64/www/campus-radio/public">
           Options Indexes FollowSymLinks
           AllowOverride All
           Require all granted
       </Directory>
   </VirtualHost>
   ```

3. **Restart WAMP Services**

## 🔥 Windows Firewall Configuration

### Method 1: Windows Firewall GUI

1. **Press Win + R → type `firewall.cpl` → Enter**
2. **Click "Allow an app or feature through Windows Defender Firewall"**
3. **Click "Change Settings" → "Allow another app..."**
4. **Add these applications:**
   - `C:\wamp64\bin\apache\apache2.4.x\bin\httpd.exe`
   - Check both "Private" and "Public"

### Method 2: Advanced Firewall Rules

1. **Press Win + R → type `wf.msc` → Enter**
2. **Create Inbound Rules for these ports:**

**HTTP Traffic (Port 80):**
- Rule Type: Port
- Protocol: TCP
- Port: 80
- Action: Allow
- Profile: All
- Name: "Campus Radio HTTP"

**Stream Server (Port 9999):**
- Rule Type: Port
- Protocol: TCP
- Port: 9999
- Action: Allow
- Profile: All
- Name: "Campus Radio Stream"

**Health API (Port 9998):**
- Rule Type: Port
- Protocol: TCP
- Port: 9998
- Action: Allow
- Profile: All
- Name: "Campus Radio API"

### Method 3: Command Line (Run as Administrator)
```bash
netsh advfirewall firewall add rule name="Campus Radio HTTP" dir=in action=allow protocol=TCP localport=80
netsh advfirewall firewall add rule name="Campus Radio Stream" dir=in action=allow protocol=TCP localport=9999
netsh advfirewall firewall add rule name="Campus Radio API" dir=in action=allow protocol=TCP localport=9998
```

## 📁 Project Installation

### 1. Clone/Download Project
```bash
# Place your campus-radio project in:
C:\wamp64\www\campus-radio\
```

### 2. Install Dependencies
```bash
cd C:\wamp64\www\campus-radio
npm install
```

### 3. Verify File Structure
```
C:\wamp64\www\campus-radio\
├── public\
│   ├── viewer.html
│   ├── index.html
│   ├── rendered.js
│   └── hls\
├── src\
│   ├── stream-server.js
│   ├── main.js
│   └── config.js
├── assets\
│   └── brb.jpg
└── package.json
```

## 🚀 Running the Application

### 1. Start Services (Correct Order)

1. **Start WAMP Server:**
   - Ensure green light (all services running)

2. **Start Stream Server:**
   ```bash
   cd C:\wamp64\www\campus-radio
   node src/stream-server.js
   ```
   - Wait for: "✅ Server ready for connections!"

3. **Start Electron App:**
   ```bash
   npm start
   # OR run the built .exe file
   ```

### 2. Access Points

**Local Access:**
- Admin Panel: http://localhost/campus-radio/public/index.html
- Live Viewer: http://localhost/campus-radio/public/viewer.html

**Network Access:** (Replace with your IP)
- Admin Panel: http://YOUR-IP/public/index.html
- Live Viewer: http://YOUR-IP/public/viewer.html
- Example: http://192.168.1.100/public/viewer.html

**Health Check:**
- http://YOUR-IP:9998/health

## 🎯 How to Use

### For Broadcasters (Cheers App):

1. **Open the Cheers application**
2. **Set up cameras:**
   - Click settings button on camera preview
   - Select camera and microphone
   - Click "Go Live" to add to live monitor

3. **Add media files:**
   - Upload MP3/MP4 files
   - Drag to playlist
   - Click playlist items to play

4. **Start streaming:**
   - Click "Start Live Stream"
   - Live indicator turns red
   - Stream is now broadcasting

### For Viewers (Web Browser):

1. **Open viewer URL in any browser**
2. **The page will automatically:**
   - Show "Be Right Back" when no stream
   - Play live stream when active
   - Work on mobile devices

## 🔍 Network Access Testing

### Find Your IP Address:
```bash
ipconfig
# Look for "IPv4 Address"
```

### Test Network Connectivity:
```bash
# From broadcaster PC:
ping YOUR-IP

# Test ports:
telnet YOUR-IP 80
telnet YOUR-IP 9999
```

### Browser Testing:
```javascript
// Test in browser console:
fetch('http://YOUR-IP:9998/health')
  .then(r => r.json())
  .then(data => console.log('✅ Server OK:', data))
  .catch(e => console.error('❌ Server fail:', e))
```

## 🛠️ Troubleshooting

### Common Issues:

**"Not Found" Error:**
- Check virtual host configuration
- Verify IP address in ServerAlias
- Restart WAMP services

**"Connection Refused":**
- Check Windows Firewall settings
- Verify stream server is running
- Test port accessibility

**"Stream Won't Start":**
- Ensure FFmpeg is in PATH
- Check camera/microphone permissions
- Verify WebSocket connection (port 9999)

**Poor Video Quality:**
- Increase bitrate in rendered.js
- Check network bandwidth
- Verify camera resolution settings

### Log Files:
- **WAMP Logs:** `C:\wamp64\logs\`
- **Stream Server:** Console output
- **Browser:** Developer Tools → Console

### Reset Everything:
```bash
# Stop all services
# Kill Node processes:
taskkill /f /im node.exe

# Restart WAMP
# Restart in correct order
```

## 📱 Mobile Access

**iOS/Safari:**
- Works automatically
- Tap to start video (autoplay restriction)

**Android/Chrome:**
- Works automatically
- Better autoplay support

**Network Requirements:**
- Same WiFi network
- Firewall ports open
- Router allows device communication

## 🔒 Security Notes

**For Production Use:**
- Change default ports
- Add authentication
- Use HTTPS/WSS
- Restrict network access
- Update firewall rules

**For Development:**
- Current setup allows network access
- Suitable for local network only
- Not internet-facing

## 📞 Support

**Check these first:**
1. All services running (WAMP green light)
2. Stream server shows "ready for connections"
3. Firewall allows required ports
4. Network devices on same subnet

**Debug Commands:**
```bash
# Test FFmpeg
ffmpeg -version

# Test Caddy  
caddy version

# Test ports
netstat -an | findstr :80
netstat -an | findstr :9999

# Test network
ping YOUR-IP
```

---

## Quick Start Checklist

- [ ] FFmpeg installed in `C:\ffmpeg\` and in PATH
- [ ] Caddy installed in `C:\caddy\` and in PATH
- [ ] WAMP64 installed and configured
- [ ] Windows Firewall ports opened (80, 9999, 9998)
- [ ] Virtual host configured
- [ ] Project files in `C:\wamp64\www\campus-radio\`
- [ ] Dependencies installed (`npm install`)
- [ ] WAMP server running (green light)
- [ ] Stream server started (`node src/stream-server.js`)
- [ ] Network access tested

**Happy Broadcasting! 🎵📻**