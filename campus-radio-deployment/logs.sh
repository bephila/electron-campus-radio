# logs.sh
#!/bin/bash
echo "=== 📋 Campus Radio Logs ==="
echo "Stream Server Logs:"
pm2 logs campus-radio-stream --lines 20
echo ""
echo "Caddy Server Logs:"  
pm2 logs campus-radio-caddy --lines 20