// ecosystem.config.js - PM2 Configuration for Campus Radio
module.exports = {
  apps: [
    {
      name: 'campus-radio-stream',
      script: 'src/stream-server.js',
      cwd: '/opt/campus-radio',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 9999
      },
      error_file: 'logs/stream-error.log',
      out_file: 'logs/stream-out.log',
      log_file: 'logs/stream-combined.log'
    },
    {
      name: 'campus-radio-caddy',
      script: 'caddy',
      args: 'run',
      cwd: '/opt/campus-radio',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production'
      },
      error_file: 'logs/caddy-error.log',
      out_file: 'logs/caddy-out.log',
      log_file: 'logs/caddy-combined.log'
    }
  ]
};