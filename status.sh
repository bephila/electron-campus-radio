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