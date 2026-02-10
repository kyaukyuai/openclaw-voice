#!/usr/bin/env bash
set -euo pipefail

ANDROID_HOME="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
export ANDROID_HOME
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"

AVD_NAME="${AVD_NAME:-Pixel_8_API_35}"
SYSTEM_IMAGE="${ANDROID_SYSTEM_IMAGE:-system-images;android-35;google_apis;arm64-v8a}"
DEVICE_PROFILE="${ANDROID_DEVICE_PROFILE:-pixel_8}"

echo "Using ANDROID_HOME: $ANDROID_HOME"
mkdir -p "$ANDROID_HOME"

if [ ! -x "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" ]; then
  if ! command -v sdkmanager >/dev/null 2>&1; then
    echo "Error: sdkmanager command not found."
    echo "Install Android command-line tools first, then rerun this script."
    exit 1
  fi
  echo "[1/4] Installing cmdline-tools;latest..."
  sdkmanager --sdk_root="$ANDROID_HOME" "cmdline-tools;latest"
else
  echo "[1/4] cmdline-tools;latest already installed."
fi

SDKMANAGER="$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager"
AVDMANAGER="$ANDROID_HOME/cmdline-tools/latest/bin/avdmanager"
EMULATOR="$ANDROID_HOME/emulator/emulator"

echo "[2/4] Installing SDK packages..."
"$SDKMANAGER" --sdk_root="$ANDROID_HOME" \
  "platform-tools" \
  "emulator" \
  "platforms;android-35" \
  "build-tools;35.0.0" \
  "$SYSTEM_IMAGE"

echo "[3/4] Accepting SDK licenses..."
yes | "$SDKMANAGER" --sdk_root="$ANDROID_HOME" --licenses >/dev/null || true

if "$EMULATOR" -list-avds | grep -Fxq "$AVD_NAME"; then
  echo "[4/4] AVD '$AVD_NAME' already exists."
else
  echo "[4/4] Creating AVD '$AVD_NAME'..."
  echo "no" | "$AVDMANAGER" create avd -n "$AVD_NAME" -k "$SYSTEM_IMAGE" --device "$DEVICE_PROFILE" --force
fi

echo ""
echo "Android emulator setup completed."
echo "Start emulator:"
echo "  npm run android:emulator:start"
echo "Then run app:"
echo "  npm run android"
