#!/bin/bash
# Pre-push build validation script
# Run before pushing to detect TypeScript/build errors early

set -e  # Exit on error

echo "🔧 Validating build before push..."

# Install dependencies (if needed)
echo "📦 Installing dependencies..."
npm ci

# Build frontend
echo "🏗️ Building frontend..."
npm run build

# Build server (TypeScript compilation)
echo "🏗️ Building server..."
npx tsc -p tsconfig.server.json || npx tsc --noEmit server/*.ts server/**/*.ts

echo "✅ Build validation passed!"
echo ""
echo "You can now push: git push origin master"
