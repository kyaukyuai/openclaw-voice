#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "[1/4] Installing dependencies with npm install..."
npm install

if [ ! -d "ios" ]; then
  echo "[2/4] iOS native project not found. Running Expo prebuild..."
  npx expo prebuild --platform ios --non-interactive
else
  echo "[2/4] iOS native project already exists."
fi

echo "[3/4] Installing CocoaPods dependencies..."
npx pod-install ios

echo "[4/4] Launching app on iOS device..."
npm run ios -- --device
