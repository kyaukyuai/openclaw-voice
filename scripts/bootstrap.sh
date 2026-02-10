#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "[bootstrap] Running setup..."
npm run setup

cat <<'EOF'

[bootstrap] Setup completed.
Use one of the following run paths:

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
