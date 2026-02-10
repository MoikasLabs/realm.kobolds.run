#!/bin/bash
# ============================================
# Shalom Realm Deployment Script
# ============================================
# Automates: pull -> install -> build -> restart
# Usage: ./scripts/deploy.sh [branch]

set -e  # Exit on error
set -u  # Exit on undefined variable

# Configuration
PROJECT_DIR="/root/dev/projects/realm.shalohm.co"
SERVICE_NAME="realm-server"
LOG_FILE="/var/log/realm-shalohm/deploy.log"
BACKUP_DIR="/var/backups/realm-shalohm"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_FILE"
    exit 1
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1" | tee -a "$LOG_FILE"
}

info() {
    echo -e "${BLUE}[INFO]${NC} $1" | tee -a "$LOG_FILE"
}

# Create directories if they don't exist
mkdir -p "$(dirname "$LOG_FILE")"
mkdir -p "$BACKUP_DIR"

# Get branch (default: main)
BRANCH="${1:-main}"

log "======================================"
log "Starting Shalom Realm deployment"
log "======================================"
log "Branch: $BRANCH"
log "Project: $PROJECT_DIR"

# Change to project directory
cd "$PROJECT_DIR" || error "Failed to change to project directory"

# Step 1: Backup current build
info "Step 1: Backing up current build..."
if [ -d "dist" ]; then
    BACKUP_FILE="$BACKUP_DIR/realm-shalohm-backup-$(date +%Y%m%d-%H%M%S).tar.gz"
    tar -czf "$BACKUP_FILE" dist/ dist-server/ 2>/dev/null || warn "No existing build to backup"
    log "Backed up to: $BACKUP_FILE"
fi

# Step 2: Pull latest changes
info "Step 2: Pulling latest changes..."
git fetch origin "$BRANCH" || error "Failed to fetch from origin"
git checkout "$BRANCH" || error "Failed to checkout branch"
git pull origin "$BRANCH" || warn "No new changes to pull (already up to date)"

# Step 3: Install dependencies
info "Step 3: Installing dependencies..."
npm ci --production=false || error "npm ci failed"

# Step 4: Build project
info "Step 4: Building project..."
npm run build || error "Build failed"

# Verify build output
if [ ! -d "dist" ] || [ ! -d "dist-server" ]; then
    error "Build output missing (dist or dist-server not found)"
fi
log "Build completed successfully"

# Step 5: Check environment file
info "Step 5: Checking environment configuration..."
if [ ! -f ".env" ]; then
    warn ".env file not found, copying from production template..."
    cp .env.production .env
    warn "Please update .env with your production values!"
fi

# Step 6: Restart service
info "Step 6: Restarting realm-server service..."
if systemctl is-active --quiet "$SERVICE_NAME"; then
    systemctl restart "$SERVICE_NAME" || error "Failed to restart $SERVICE_NAME"
    log "Service restarted successfully"
else
    systemctl start "$SERVICE_NAME" || error "Failed to start $SERVICE_NAME"
    log "Service started successfully"
fi

# Step 7: Verify service status
info "Step 7: Verifying service status..."
sleep 2
if systemctl is-active --quiet "$SERVICE_NAME"; then
    log "🎉 Deployment successful! Service is running."
else
    error "Service failed to start after deployment"
fi

# Step 8: Health check (optional)
info "Step 8: Performing health check..."
HEALTH_CHECK=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:18800/health 2>/dev/null || echo "000")
if [ "$HEALTH_CHECK" = "200" ]; then
    log "Health check passed (200 OK)"
else
    warn "Health check returned status: $HEALTH_CHECK"
fi

# Step 9: Reload nginx (if needed)
info "Step 9: Checking nginx configuration..."
if nginx -t 2>/dev/null; then
    systemctl reload nginx || warn "Failed to reload nginx"
    log "Nginx reloaded successfully"
else
    warn "Nginx configuration test failed, skipping reload"
fi

log "======================================"
log "Deployment completed successfully!"
log "======================================"
log ""
log "Service status: $(systemctl is-active $SERVICE_NAME)"
log "Memory usage:"
systemctl show "$SERVICE_NAME" --property=MemoryCurrent || true
log ""
log "Recent logs:"
journalctl -u "$SERVICE_NAME" --since "1 minute ago" -n 5 --no-pager || true

exit 0