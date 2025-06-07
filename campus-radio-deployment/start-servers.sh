# start-servers.sh
#!/bin/bash
echo "🎵 Starting Campus Radio servers..."
cd /opt/campus-radio
pm2 start ecosystem.config.js
echo "✅ Servers started!"
echo "📺 Viewer: http://$(hostname -I | awk '{print $1}'):8080/viewer.html"

# stop-servers.sh  
#!/bin/bash
echo "🛑 Stopping Campus Radio servers..."
pm2 stop all
echo "✅ Servers stopped!"

# restart-servers.sh
#!/bin/bash
echo "🔄 Restarting Campus Radio servers..."
cd /opt/campus-radio
pm2 restart all
echo "✅ Servers restarted!"
echo "📺 Viewer: http://$(hostname -I | awk '{print $1}'):8080/viewer.html"

# status.sh
#!/bin/bash
echo "=== 🎵 Campus Radio Status ==="
pm2 status
echo ""
echo "=== 💾 Disk Usage ==="
df -h /opt/campus-radio
echo ""
echo "=== 🧠 Memory Usage ==="
free -h
echo ""
echo "=== 🌐 Network Info ==="
echo "📺 Viewer URL: http://$(hostname -I | awk '{print $1}'):8080/viewer.html"
echo "🎛️ Streamer Target: $(hostname -I | awk '{print $1}')"

# logs.sh
#!/bin/bash
echo "=== 📋 Campus Radio Logs ==="
echo "Stream Server Logs:"
pm2 logs campus-radio-stream --lines 20
echo ""
echo "Caddy Server Logs:"  
pm2 logs campus-radio-caddy --lines 20