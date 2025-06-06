# start-servers.sh
#!/bin/bash
echo "🎵 Starting Campus Radio servers..."
cd /opt/campus-radio
pm2 start ecosystem.config.js
echo "✅ Servers started!"
echo "📺 Viewer: http://$(hostname -I | awk '{print $1}'):8080/viewer.html"