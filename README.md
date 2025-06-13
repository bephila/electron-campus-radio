# Cheers Campus Radio - WAMP Server Deployment Guide

A professional campus radio streaming application for WAMP server deployment with network access support.

## 📋 Prerequisites

- **Windows 10/11**
- **WAMP Server 3.0+** (Apache, PHP, MySQL)
- **Node.js 14+** 
- **Modern web browser** (Chrome/Firefox recommended)

## 🚀 Quick Setup Guide

### Step 1: Download Required Software

1. **Download FFmpeg:**
   - Go to: https://ffmpeg.org/download.html
   - Download Windows build (static)
   - Extract to: `C:\ffmpeg\`
   - Final structure: `C:\ffmpeg\bin\ffmpeg.exe`

2. **Download Caddy:**
   - Go to: https://caddyserver.com/download
   - Download Windows x64
   - Extract to: `C:\caddy\`
   - Final structure: `C:\caddy\caddy.exe`

### Step 2: Add to Windows PATH

1. **Open System Environment Variables:**
   - Press `Win + R` → type `sysdm.cpl` → Enter
   - Click "Environment Variables"
   - Under "System Variables", select "Path" → "Edit"

2. **Add these paths:**
   ```
   C:\ffmpeg\bin
   C:\caddy
   ```

3. **Verify installation:**
   - Open Command Prompt
   - Test: `ffmpeg -version`
   - Test: `caddy version`

### Step 3: Configure Windows Firewall

**Option A: Quick Method**
1. Press `Win + R` → type `firewall.cpl` → Enter
2. Click "Allow an app through firewall"
3. Click "Allow another app" → Browse to: `C:\wamp64\bin\apache\apache2.4.x\bin\httpd.exe`
4. Check both **Private** and **Public** → OK

**Option B: Advanced Method (Recommended)**
1. Press `Win + R` → type `wf.msc` → Enter
2. Click "Inbound Rules" → "New Rule..."
3. **Rule Type:** Port → Next
4. **Protocol:** TCP → Specific Local Ports: `80,9999,9998` → Next
5. **Action:** Allow the connection → Next
6. **Profile:** Check all three boxes (Domain, Private, Public) → Next
7. **Name:** Campus Radio Server → Finish

### Step 4: Configure WAMP for Network Access

**4.1 Update Apache Configuration:**
1. Click WAMP icon → Apache → httpd.conf
2. Find line (~60): `Listen 80`
3. Add below it: `Listen 0.0.0.0:80`
4. Find line (~200): `Require local`
5. Change to: `Require all granted`
6. Save file

**4.2 Configure Virtual Host:**
1. Click 
      A.WAMP icon → Apache → httpd.conf
      B.WAMP icon → Apache → httpd-vhosts.conf
2. Add this configuration:

A.
```apache
<Directory "C:/wamp64/www">
    Options +Indexes +Includes +FollowSymLinks +MultiViews
    AllowOverride All
    Require all granted
</Directory>
```
B.
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

3. Save and restart WAMP services

### Step 5: Deploy Campus Radio Files

1. **Extract project files to:**
   ```
   C:\wamp64\www\campus-radio\
   ```

2. **Install Node.js dependencies:**
   ```bash
   cd C:\wamp64\www\campus-radio
   npm install
   ```

3. **Build the application:**
   ```bash
   npm run build:win
   ```

### Step 6: Start Services

**6.1 Start WAMP Server:**
- Ensure WAMP icon is green (all services running)

**6.2 Start Stream Server:**
```bash
cd C:\wamp64\www\campus-radio
node src/stream-server.js
```

**6.3 Launch Application:**
- Run: `dist\win-unpacked\Cheers.exe`

## 🌐 Network Access URLs

Once configured, access from any device on your network:

- **Live Viewer:** `http://YOUR-SERVER-IP/`
- **Admin Panel:** `http://YOUR-SERVER-IP/public/index.html`
- **Health Check:** `http://YOUR-SERVER-IP:9998/health`

**Find your server IP:**
```bash
ipconfig
```
Look for "IPv4 Address" under your active network adapter.

## 🔧 Development & Updates

### When Code Changes:
1. **Rebuild application:**
   ```bash
   cd C:\wamp64\www\campus-radio
   npm run build:win
   ```

2. **The `dist` folder will be recreated** with updated application files

3. **Restart services:**
   - Stop stream server (Ctrl+C)
   - Close Cheers application
   - Start stream server: `node src/stream-server.js`
   - Launch new build: `dist\win-unpacked\Cheers.exe`

### File Structure:
```
C:\wamp64\www\campus-radio\
├── dist\                    # Built application (recreated on build)
│   └── win-unpacked\
│       └── Cheers.exe       # Main application
├── public\                  # Web interface
│   ├── index.html          # Admin panel
│   ├── viewer.html         # Live viewer
│   ├── rendered.js         # Application logic
│   └── hls\               # HLS streaming files
├── src\                    # Source code
│   ├── main.js            # Electron main process
│   ├── stream-server.js   # WebSocket stream server
│   └── preload.js         # Electron preload
├── package.json           # Dependencies
└── README.md             # This file
```

## 🎯 Usage Instructions

### For Broadcasters:
1. Launch `Cheers.exe`
2. Upload audio/video files
3. Create playlists
4. Configure cameras (Settings buttons)
5. Click "Start Live Stream"

### For Viewers:
1. Open web browser
2. Navigate to: `http://SERVER-IP/`
3. Enjoy the live stream!

## 🛠️ Troubleshooting

### Stream Won't Start:
- ✅ Check stream server is running: `node src/stream-server.js`
- ✅ Verify firewall allows ports 80, 9999, 9998
- ✅ Ensure WAMP Apache is running (green icon)

### Network Access Issues:
- ✅ Check `httpd-vhosts.conf` configuration
- ✅ Verify `Require all granted` in Apache config
- ✅ Test locally first: `http://localhost/`
- ✅ Confirm devices are on same network

### Build Issues:
- ✅ Close all Cheers applications before building
- ✅ Run Command Prompt as Administrator
- ✅ Clear dist folder: `rmdir /s dist`
- ✅ Rebuild: `npm run build:win`

### Performance Issues:
- ✅ Use Chrome/Firefox for best compatibility
- ✅ Check network bandwidth (3+ Mbps recommended)
- ✅ Reduce video bitrate in settings if needed

## 📞 Support

For technical issues:
1. Check Windows Event Viewer for errors
2. Review Apache error logs: `C:\wamp64\logs\apache_error.log`
3. Check browser console for JavaScript errors
4. Verify all prerequisites are installed correctly

## 🔒 Security Notes

**⚠️ Important:** This configuration allows network access to your streaming server. For production use:

- Configure proper firewall rules
- Use HTTPS with SSL certificates
- Implement user authentication
- Regularly update WAMP and dependencies

## 📝 Version Information

- **Campus Radio:** 2.0.0
- **Minimum WAMP:** 3.0+
- **Node.js:** 14.0+
- **Electron:** 35.0+


## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guidelines](CONTRIBUTING.md) for details.

### Quick Start for Contributors
1. Fork the repository
2. Clone your fork: `git clone https://github.com/bephila/electron-campus-radio.git`
3. Create a branch: `git checkout -b feature-name`
4. Make your changes and test
5. Submit a pull request

Found a bug? Please [open an issue](../../issues).

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

🎵 **Happy Broadcasting with Cheers Campus Radio!** 🎵
