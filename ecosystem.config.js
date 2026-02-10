/**
 * PM2 Ecosystem Configuration for Shalom Realm
 * Alternative to systemd service management
 * 
 * Start with: pm2 start ecosystem.config.js
 * Monitor: pm2 monit
 * Logs: pm2 logs realm-server
 * Restart: pm2 reload realm-server
 * Stop: pm2 stop realm-server
 */

module.exports = {
  apps: [
    {
      name: 'realm-server',
      script: 'dist-server/index.js',
      cwd: '/root/dev/projects/realm.shalohm.co',
      interpreter: '/usr/bin/node',
      instances: 1,
      exec_mode: 'fork',
      
      // Auto-start on system boot
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      
      // Environment variables
      env: {
        NODE_ENV: 'production',
        ROOM_NAME: 'Shalom Realm',
        ROOM_DESCRIPTION: 'Dragon & Kobold Ecosystem',
        WORLD_PORT: '18800',
        WORLD_HOST: '0.0.0.0',
        MAX_AGENTS: '50',
      },
      
      // Logging
      error_file: '/var/log/pm2/realm-server-error.log',
      out_file: '/var/log/pm2/realm-server-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      
      // Process management
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 4000,
      
      // Advanced options
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000,
      
      // Timezone
      time: true,
      
      // Instance variables (if using multiple instances)
      instance_var: 'INSTANCE_ID',
    },
    
    // Optional: Worker process for background tasks
    {
      name: 'realm-worker',
      script: 'dist-server/worker.js',
      cwd: '/root/dev/projects/realm.shalohm.co',
      instances: 1,
      autorestart: true,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};