#!/usr/bin/env bash
# Build and deploy Shalom Realm frontend to /www/realm
set -euo pipefail

PROJECT_ROOT="/root/dev/projects/realm.shalohm.co"
DEPLOY_DIR="/www/realm"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

echo "🐉 Shalom Realm Build & Deploy - $TIMESTAMP"

# 1. Checkout master and pull latest
cd "$PROJECT_ROOT"
echo "🔄 Checking out master and pulling latest..."
git checkout master
git pull origin master

# 2. Install dependencies
echo "📦 Installing dependencies..."
npm ci

# 3. Build frontend
echo "🔨 Building frontend..."
npm run build

# 4. Backup existing deployment (optional)
if [ -d "$DEPLOY_DIR" ] && [ "$(ls -A $DEPLOY_DIR)" ]; then
    BACKUP_DIR="${DEPLOY_DIR}.backup.$TIMESTAMP"
    echo "💾 Backing up existing deployment to $BACKUP_DIR..."
    sudo cp -r "$DEPLOY_DIR" "$BACKUP_DIR"
fi

# 5. Create deploy directory if it doesn't exist
if [ ! -d "$DEPLOY_DIR" ]; then
    echo "📁 Creating $DEPLOY_DIR..."
    sudo mkdir -p "$DEPLOY_DIR"
    sudo chown $USER:$USER "$DEPLOY_DIR"
fi

# 6. Deploy new build
echo "🚀 Deploying to $DEPLOY_DIR..."
# Clear old files (except we leave backups)
find "$DEPLOY_DIR" -mindepth 1 -maxdepth 1 ! -name '*.backup*' -exec rm -rf {} + 2>/dev/null || true
# Copy new build
cp -r "$PROJECT_ROOT/dist/"* "$DEPLOY_DIR/"

# 7. Set correct permissions
echo "🔒 Setting permissions..."
sudo chown -R www-data:www-data "$DEPLOY_DIR"
sudo chmod -R 755 "$DEPLOY_DIR"

# 8. Test nginx config and reload
echo "🔄 Reloading nginx..."
sudo nginx -t && sudo systemctl reload nginx

echo "✅ Deploy complete! Serving from: $DEPLOY_DIR"
echo "   URL: https://realm.shalohm.co"
echo "   Branch: master"
