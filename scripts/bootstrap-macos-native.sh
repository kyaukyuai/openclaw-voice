#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="$ROOT_DIR/apps/macos-native"

if [ ! -d "$APP_DIR" ]; then
  echo "apps/macos-native not found." >&2
  exit 1
fi

echo "[1/3] Installing macOS native app dependencies..."
cd "$APP_DIR"
npm install

echo "[2/3] Installing macOS CocoaPods dependencies..."
if command -v bundle >/dev/null 2>&1 && [ -f Gemfile ]; then
  set +e
  bundle install
  BUNDLE_INSTALL_EXIT=$?
  set -e
  if [ "$BUNDLE_INSTALL_EXIT" -eq 0 ]; then
    bundle exec pod install --project-directory=macos
  else
    echo "bundle install failed; falling back to pod install directly..."
    pod install --project-directory=macos
  fi
else
  pod install --project-directory=macos
fi

echo "[3/3] Bootstrap complete."
echo "Run: npm run macos:native:start (Terminal A), npm run macos:native:run (Terminal B)"
