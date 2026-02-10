#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IOS_DIR="$ROOT_DIR/ios"
WORKSPACE="${IOS_WORKSPACE:-OpenClawVoice.xcworkspace}"
SCHEME="${IOS_SCHEME:-OpenClawVoice}"
CONFIGURATION="${IOS_CONFIGURATION:-Release}"
ALLOW_PROVISIONING_UPDATES="${IOS_ALLOW_PROVISIONING_UPDATES:-1}"
ALLOW_PROVISIONING_DEVICE_REGISTRATION="${IOS_ALLOW_PROVISIONING_DEVICE_REGISTRATION:-1}"

if ! command -v xcodebuild >/dev/null 2>&1; then
  echo "xcodebuild is required. Install Xcode command line tools first." >&2
  exit 1
fi

if [ ! -d "$IOS_DIR" ]; then
  echo "ios/ project was not found. Run npm run setup first." >&2
  exit 1
fi

DESTINATIONS="$(
  cd "$IOS_DIR"
  xcodebuild -workspace "$WORKSPACE" -scheme "$SCHEME" -showdestinations 2>/dev/null || true
)"

DEST_ID="$(
  printf '%s\n' "$DESTINATIONS" \
    | sed -nE 's/.*variant:Designed for \[iPad,iPhone\], id:([^,}]+),.*/\1/p' \
    | head -n 1
)"

if [ -z "$DEST_ID" ]; then
  echo "No macOS destination found for 'Designed for iPad/iPhone'." >&2
  echo "Open Xcode once and ensure your Apple Silicon Mac is available." >&2
  exit 1
fi

echo "Using macOS destination id: $DEST_ID"
echo "Building $SCHEME ($CONFIGURATION) for macOS..."

cd "$IOS_DIR"
XCODE_ARGS=(
  -workspace "$WORKSPACE"
  -scheme "$SCHEME"
  -configuration "$CONFIGURATION"
  -destination "id=$DEST_ID"
)
if [ "$ALLOW_PROVISIONING_UPDATES" = "1" ]; then
  XCODE_ARGS+=(-allowProvisioningUpdates)
fi
if [ "$ALLOW_PROVISIONING_DEVICE_REGISTRATION" = "1" ]; then
  XCODE_ARGS+=(-allowProvisioningDeviceRegistration)
fi

BUILD_LOG_FILE="$(mktemp "${TMPDIR:-/tmp}/openclaw-ios-mac-build.XXXXXX")"
run_build() {
  local log_file="$1"
  set +e
  xcodebuild "${XCODE_ARGS[@]}" build | tee "$log_file"
  local exit_code="${PIPESTATUS[0]}"
  set -e
  return "$exit_code"
}

reset_xcode_build_services() {
  echo "Resetting Xcode build services..." >&2
  pkill -x xcodebuild || true
  pkill -f XCBBuildService || true
  for cache_dir in "$HOME"/Library/Developer/Xcode/DerivedData/OpenClawVoice-*/Build/Intermediates.noindex/XCBuildData; do
    if [ -d "$cache_dir" ]; then
      rm -rf "$cache_dir"
    fi
  done
}

if run_build "$BUILD_LOG_FILE"; then
  BUILD_EXIT_CODE=0
else
  BUILD_EXIT_CODE=$?
fi

if [ "$BUILD_EXIT_CODE" -ne 0 ]; then
  if grep -q "unable to initiate PIF transfer session" "$BUILD_LOG_FILE"; then
    echo "" >&2
    echo "Detected stale Xcode build session (PIF transfer error)." >&2
    reset_xcode_build_services
    echo "Retrying build once..." >&2
    RETRY_LOG_FILE="$(mktemp "${TMPDIR:-/tmp}/openclaw-ios-mac-build-retry.XXXXXX")"
    if run_build "$RETRY_LOG_FILE"; then
      BUILD_LOG_FILE="$RETRY_LOG_FILE"
      BUILD_EXIT_CODE=0
    else
      BUILD_LOG_FILE="$RETRY_LOG_FILE"
      BUILD_EXIT_CODE=$?
    fi
  fi
fi

if [ "$BUILD_EXIT_CODE" -ne 0 ]; then
  echo "" >&2
  echo "Build failed. See full log: $BUILD_LOG_FILE" >&2
  if grep -q "isn't registered in your developer account" "$BUILD_LOG_FILE"; then
    cat <<'EOF' >&2

Detected provisioning issue:
  Your Mac is not registered in your Apple Developer account, so Xcode cannot
  create a provisioning profile for "Designed for iPad/iPhone" app on Mac.

How to fix:
  1) Open Xcode > Settings > Accounts and confirm your team is signed in.
  2) Open ios/OpenClawVoice.xcworkspace in Xcode.
  3) Select target OpenClawVoice > Signing & Capabilities.
  4) Keep "Automatically manage signing" enabled and choose your team.
  5) Build once from Xcode (Product > Build), then retry:
     npm run ios:mac
EOF
  fi
  exit "$BUILD_EXIT_CODE"
fi

BUILD_SETTINGS="$(xcodebuild "${XCODE_ARGS[@]}" -showBuildSettings 2>/dev/null || true)"
TARGET_BUILD_DIR="$(printf '%s\n' "$BUILD_SETTINGS" | sed -n 's/^[[:space:]]*TARGET_BUILD_DIR = //p' | head -n 1)"
FULL_PRODUCT_NAME="$(printf '%s\n' "$BUILD_SETTINGS" | sed -n 's/^[[:space:]]*FULL_PRODUCT_NAME = //p' | head -n 1)"

APP_PATH=""
if [ -n "$TARGET_BUILD_DIR" ] && [ -n "$FULL_PRODUCT_NAME" ]; then
  APP_PATH="$TARGET_BUILD_DIR/$FULL_PRODUCT_NAME"
fi

if [ -n "$APP_PATH" ] && [ -d "$APP_PATH" ]; then
  if [[ "$TARGET_BUILD_DIR" == *"-iphoneos" ]]; then
    cat <<EOF
Build succeeded.
The produced bundle is an iOS app artifact:
  $APP_PATH

To run on "My Mac (Designed for iPad/iPhone)":
  1) Open ios/OpenClawVoice.xcworkspace in Xcode
  2) Select destination: My Mac (Designed for iPad/iPhone)
  3) Press Run (Product > Run)
EOF
  else
    echo "Launching app: $APP_PATH"
    set +e
    open "$APP_PATH"
    OPEN_EXIT_CODE=$?
    set -e
    if [ "$OPEN_EXIT_CODE" -ne 0 ]; then
      cat <<EOF >&2
Could not auto-launch app bundle.
If this is a Designed for iPad/iPhone destination, launch from Xcode:
  - Open ios/OpenClawVoice.xcworkspace
  - Destination: My Mac (Designed for iPad/iPhone)
  - Product > Run
EOF
    fi
  fi
else
  echo "Build succeeded, but app bundle path could not be resolved automatically." >&2
  echo "Open Xcode > Product > Run for scheme '$SCHEME' if needed." >&2
fi

if [ "$CONFIGURATION" = "Debug" ]; then
  cat <<'EOF'

Debug build note:
  Start Metro separately if JS is not embedded:
    npm run dev:metro
EOF
fi
