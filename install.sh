#!/bin/bash
set -e

echo "🎵 Installing Campus Radio Server..."

# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js LTS
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install FFmpeg
sudo apt install -y ffmpeg

# Install PM2 globally
sudo npm install -g pm2

# Install Caddy
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/caddy-stable-archive-keyring.gpg] https://dl.cloudsmith.io/public/caddy/stable/deb/debian any-version main" | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install caddy

# Create application directory
sudo mkdir -p /opt/campus-radio
sudo chown -R $USER:$USER /opt/campus-radio

# Copy files to deployment directory
cp -r * /opt/campus-radio/
cd /opt/campus-radio

# Ensure assets directory exists with proper permissions
mkdir -p assets
chmod 755 assets

# Install dependencies
npm install --only=production

# Create directories
mkdir -p logs public/hls

# Set up PM2
pm2 start ecosystem.config.js
pm2 save
pm2 startup

# Configure firewall
sudo ufw allow 8080
sudo ufw allow 9999
sudo ufw --force enable

echo "✅ Installation complete!"
echo "📺 Viewer URL: http://$(hostname -I | awk '{print $1}'):8080/viewer.html"
echo "🎛️ Stream to: $(hostname -I | awk '{print $1}')"