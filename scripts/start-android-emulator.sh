#!/usr/bin/env bash
set -euo pipefail

ANDROID_HOME="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
export ANDROID_HOME
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"

AVD_NAME="${1:-${AVD_NAME:-Pixel_8_API_35}}"
EMULATOR="$ANDROID_HOME/emulator/emulator"

if [ ! -x "$EMULATOR" ]; then
  echo "Error: emulator binary not found at $EMULATOR"
  echo "Run: npm run android:emulator:setup"
  exit 1
fi

if ! "$EMULATOR" -list-avds | grep -Fxq "$AVD_NAME"; then
  echo "Error: AVD '$AVD_NAME' not found."
  echo "Run: npm run android:emulator:setup"
  exit 1
fi

echo "Starting Android emulator: $AVD_NAME"
exec "$EMULATOR" -avd "$AVD_NAME" -netdelay none -netspeed full
