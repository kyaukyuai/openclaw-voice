#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required. Install Node.js 18+ first." >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required but was not found." >&2
  exit 1
fi

NODE_MAJOR="$(node -p 'Number(process.versions.node.split(".")[0])')"
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "Node.js 18+ is required. Current: $(node -v)" >&2
  exit 1
fi

if ! command -v xcodebuild >/dev/null 2>&1; then
  echo "xcodebuild was not found. Install Xcode command line tools." >&2
  exit 1
fi

if [ ! -f ".env" ] && [ -f ".env.example" ]; then
  cp .env.example .env
  echo "[setup] Created .env from .env.example"
fi

echo "[setup] Installing dependencies..."
npm install

if [ ! -d "ios" ]; then
  echo "[setup] iOS native project not found. Running Expo prebuild..."
  npx expo prebuild --platform ios --non-interactive
fi

echo "[setup] Installing CocoaPods dependencies..."
npx pod-install ios

cat <<'EOF'

[setup] Done.
Next steps:
  macOS app (Apple Silicon, iOS app on Mac):
    1) npm run doctor:macos
    2) npm run ios:mac

  Debug (Metro required):
    1) npm run dev:metro
    2) npm run ios:dev:device:install
    3) EXPO_DEV_SERVER_URL=<metro-url> npm run ios:dev:device:open

  Release (Metro not required):
    npm run ios:release:device
EOF
