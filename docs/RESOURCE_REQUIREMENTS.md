# ============================================
# Shalom Realm v2 - VPS Resource Requirements
# ============================================

## System Metrics & Expected Load

### Minimum Requirements
| Resource | Minimum | Recommended | Notes |
|----------|---------|-------------|-------|
| **CPU**  | 1 core  | 2 cores     | Single-threaded Node.js, benefits from >1 core for background tasks |
| **RAM**  | 512 MB  | 1 GB        | Base memory ~200-400 MB, scales with active agents |
| **Disk** | 5 GB    | 10 GB       | Static assets + logs + node_modules |
| **Network** | 10 Mbps | 100 Mbps   | WebSocket traffic grows with active users |

### Memory Usage Breakdown
```
Base Node.js Runtime:     ~80-120 MB
Application Code:         ~20-40 MB
WebSocket Connections:    ~2-5 MB per active connection
Agent State (per agent):  ~5-10 MB
Overhead:                 ~50 MB

Estimated with 20 agents: ~300-500 MB
Estimated with 50 agents: ~600-900 MB
```

### CPU Load Profile
| Activity | CPU Impact | Frequency |
|----------|------------|-----------|
| **Idle** | 1-5%       | Continuous |
| **Single User** | 5-15% | When active |
| **10 Users** | 15-30% | Normal load |
| **50 Users** | 40-70% | Peak load |
| **World Updates** | Spike +20% | Every ~100ms |
| **Agent Think** | Burst +5-10% | Per agent, ~1s intervals |
| **Nostr Sync** | Burst +10% | Every 5-10s |

### Network Bandwidth
| Scenario | Upload | Download | Notes |
|----------|--------|----------|-------|
| **Idle** | < 0.1 KB/s | < 0.1 KB/s | Keep-alive messages |
| **Per User** | 0.5-2 KB/s | 1-5 KB/s | Avg. WebSocket traffic |
| **10 Users** | 10-20 KB/s | 50-100 KB/s | Normal usage |
| **50 Users** | 50-100 KB/s | 250-500 KB/s | Peak usage |
| **Static Assets** | Burst | Burst | On page load only |

### Storage
| Component | Size | Rotation |
|-----------|------|----------|
| **Application** | ~50 MB | Static |
| **node_modules** | ~200-400 MB | On updates |
| **Logs** | ~10 MB/day | 14 day retention |
| **Backups** | ~50 MB each | Keep 10 (500 MB) |
| **Certs** | ~5 KB | Static |

---

## Performance Tuning Recommendations

### Node.js
```bash
# Increase v8 heap size if needed (in systemd env)
NODE_OPTIONS=--max-old-space-size=768

# For larger deployments (>50 agents):
NODE_OPTIONS=--max-old-space-size=1536
```

### Nginx
```nginx
# Worker processes (typically = CPU cores)
worker_processes auto;

# Worker connections
events {
    worker_connections 2048;
}

# Buffers for WebSocket long-lived connections
client_body_buffer_size 128k;
client_max_body_size 10m;
```

### System Kernel (sysctl.conf)
```
# Increase file descriptor limits
fs.file-max = 65536
net.core.somaxconn = 4096
net.ipv4.tcp_max_syn_backlog = 4096

# WebSocket optimization
net.ipv4.tcp_tw_reuse = 1
net.core.netdev_max_backlog = 5000
```

### Ulimits (/etc/security/limits.conf)
```
root soft nofile 65536
root hard nofile 65536
```

---

## Monitoring Key Metrics

### Critical Metrics to Monitor
1. **Memory Usage** - Alert at 85% of allocated limit
2. **CPU Usage** - Alert if sustained > 80% for 5 min
3. **Active Connections** - Alert if > WORLD_MAX_AGENTS * 1.5
4. **Response Time** - WebSocket latency < 100ms
5. **Error Rate** - < 1% of total messages
6. **Disk Space** - Alert at 80% full

### Health Check Endpoint
```
GET /health
Response: { 
  status: "ok", 
  uptime: 123456, 
  agents: { active: 15, total: 50 }, 
  connections: 15,
  memory: { used: "350MB", heap: "250MB" }
}
```

### Log Patterns to Watch
```
# Error patterns to alert on
ECONNREFUSED
ECONNRESET
ETIMEDOUT
EMFILE (too many open files)
out of memory
heap out of memory

# Warning patterns
connection timeout
buffer overflow
agent respawn
relay connection failed
```

---

## Scaling Strategy

### Vertical Scaling (Single VPS)
| Agents | CPU | RAM | Disk |
|--------|-----|-----|------|
| 0-10   | 1 core | 512 MB | 5 GB |
| 11-30  | 2 cores | 1 GB | 10 GB |
| 31-50  | 2-4 cores | 2 GB | 15 GB |
| 50+    | 4+ cores | 4 GB | 20 GB |

### Horizontal Scaling (Multi-server)
- **Load Balancer**: Nginx upstream with sticky sessions for WebSocket
- **Session Storage**: Redis for distributing room state
- **Database**: PostgreSQL for persistent data
- **Message Queue**: Redis/NATS for inter-server communication

Example upstream config:
```nginx
upstream realm_servers {
    ip_hash;  # Sticky sessions for WebSocket
    server 10.0.1.10:18800 max_fails=3 fail_timeout=30s;
    server 10.0.1.11:18800 max_fails=3 fail_timeout=30s;
    server 10.0.1.12:18800 max_fails=3 fail_timeout=30s;
}
```

---

## Backup Strategy

### What to Backup
1. **Environment Configuration** - `.env`
2. **Custom Agent Data** - If stored locally
3. **SSL Certificates** - `/etc/ssl/...`
4. **Nginx Configuration** - `/etc/nginx/...`
5. **Database Dumps** - If using external DB

### Backup Schedule
| Type | Frequency | Retention |
|------|-----------|-----------|
| **Full App Backup** | Daily | 30 days |
| **Config Only** | On change | Forever (Git) |
| **Database** | Hourly | 7 days |
| **Logs** | N/A | 14 days (rotate) |

### Backup Script Template
```bash
#!/bin/bash
DATE=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR="/var/backups/realm-shalohm"

# Create backup
tar -czf "$BACKUP_DIR/realm-$DATE.tar.gz" \
    /root/dev/projects/realm.shalohm.co/.env \
    /etc/ssl/certs/realm.shalohm.co.* \
    /etc/nginx/sites-available/realm.shalohm.co

# Upload to remote storage
rclone copy "$BACKUP_DIR/realm-$DATE.tar.gz" remote:realm-backups/

# Cleanup old backups (>30 days)
find "$BACKUP_DIR" -name "realm-*.tar.gz" -mtime +30 -delete
```

---

## Disaster Recovery

### Service Recovery
```bash
# If service crashes:
systemctl restart realm-server

# If node process hangs:
pkill -9 -f "node.*dist-server"
systemctl start realm-server

# If out of memory:
# (handled by MemoryMax limit in systemd)
```

### Emergency Rollback
```bash
# Using deployment script backup:
cd /root/dev/projects/realm.shalohm.co
BACKUP=$(ls -t /var/backups/realm-shalohm/*.tar.gz | head -1)
tar -xzf "$BACKUP"
systemctl restart realm-server
```

### Data Recovery
- Git rollback for code/config
- Restore from backup tarball
- Replay Nostr events for world state (if available)

---

## Security Considerations

### Firewall Rules (UFW)
```bash
# Allow SSH (from trusted IPs only recommended)
ufw allow from YOUR_IP to any port 22

# Allow HTTP/HTTPS
ufw allow 80/tcp
ufw allow 443/tcp

# Allow no other ports (close WORLD_PORT 18800 from external)
# It should only be accessible via localhost (Nginx proxy)
ufw deny 18800/tcp
```

### Fail2ban (for SSH protection)
```ini
[ssh]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 3
bantime = 3600
```

### SSL Certificate Management
```bash
# For Let's Encrypt (certbot):
certbot certonly --webroot -w /var/www/html -d realm.shalohm.co
# Auto-renewal is handled by certbot timer
```

---

## Cost Estimation (VPS)

### Low Traffic (10 users)
| Provider | Plan | Monthly |
|----------|------|---------|
| DigitalOcean | 1GB/1CPU | $6 |
| Linode | 1GB/1CPU | $5 |
| Vultr | 1GB/1CPU | $6 |
| AWS t3.micro | 1GB/2CPU | ~$8 |

### Medium Traffic (30 users)
| Provider | Plan | Monthly |
|----------|------|---------|
| DigitalOcean | 2GB/1CPU | $12 |
| Linode | 2GB/1CPU | $10 |
| Vultr | 2GB/1CPU | $12 |
| AWS t3.small | 2GB/2CPU | ~$20 |

### High Traffic (50+ users)
| Provider | Plan | Monthly |
|----------|------|---------|
| DigitalOcean | 4GB/2CPU | $24 |
| Linode | 4GB/2CPU | $20 |
| Vultr | 4GB/2CPU | $24 |
| AWS t3.medium | 4GB/2CPU | ~$40 |

---

## Monitoring Tools推荐

### Built-in (included with systemd)
- `journalctl -u realm-server -f` - Live logs
- `systemctl status realm-server` - Service status
- `systemctl show realm-server` - Resource usage

### Recommended Add-ons
| Tool | Purpose | Cost |
|------|---------|------|
| **htop** | Real-time CPU/MEM | Free |
| **iotop** | Disk I/O monitoring | Free |
| **netstat/ss** | Connection tracking | Free |
| **Uptime Kuma** | Status page | Self-hosted |
| **Grafana+Prometheus** | Full monitoring stack | Self-hosted |
| **Sentry** | Error tracking | Free tier |
| **BetterUptime** | External monitoring | Free tier |

---

Last updated: 2026-02-10
Version: v2.0.0