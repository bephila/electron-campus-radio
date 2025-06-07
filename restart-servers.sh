# restart-servers.sh
#!/bin/bash
echo "🔄 Restarting Campus Radio servers..."
cd /opt/campus-radio
pm2 restart all
echo "✅ Servers restarted!"
echo "📺 Viewer: http://$(hostname -I | awk '{print $1}'):8080/viewer.html"