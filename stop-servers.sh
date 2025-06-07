# stop-servers.sh  
#!/bin/bash
echo "🛑 Stopping Campus Radio servers..."
pm2 stop all
echo "✅ Servers stopped!"