#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

DEVICE_UDID="${1:-}"
METRO_URL="${2:-${EXPO_DEV_SERVER_URL:-}}"

if [ -z "$DEVICE_UDID" ]; then
  DEVICE_UDID="$(
    xcrun xctrace list devices 2>/dev/null \
      | sed -n 's/^iPhone ([^)]*) (\([A-F0-9-]*\))$/\1/p' \
      | head -n 1
  )"
fi

if [ -z "$DEVICE_UDID" ]; then
  echo "No iPhone device UDID found. Connect a physical iPhone and trust this Mac first." >&2
  exit 1
fi

BUNDLE_ID="$(
  node -e "const app = require('./app.json'); console.log(app?.expo?.ios?.bundleIdentifier || 'com.kyaukyuai.openclaw-pocket');"
)"

if [ -z "$METRO_URL" ]; then
  LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || true)"
  if [ -z "$LAN_IP" ]; then
    LAN_IP="$(ipconfig getifaddr en1 2>/dev/null || true)"
  fi
  if [ -n "$LAN_IP" ]; then
    METRO_URL="http://${LAN_IP}:8081"
  fi
fi

PAYLOAD_URL=""
if [ -n "$METRO_URL" ]; then
  ENCODED_METRO_URL="$(
    node -e "console.log(encodeURIComponent(process.argv[1]))" "$METRO_URL"
  )"
  PAYLOAD_URL="${BUNDLE_ID}://expo-development-client/?url=${ENCODED_METRO_URL}"
fi

if [ -n "$PAYLOAD_URL" ]; then
  APP_INSTALLED="false"
  if xcrun devicectl device info apps --device "$DEVICE_UDID" | awk '{print $2}' | grep -x -q "$BUNDLE_ID"; then
    APP_INSTALLED="true"
  fi

  if [ "$APP_INSTALLED" != "true" ]; then
    APP_PATH=""
    while IFS= read -r CANDIDATE_PATH; do
      INFO_PLIST_PATH="${CANDIDATE_PATH}/Info.plist"
      if [ ! -f "$INFO_PLIST_PATH" ]; then
        continue
      fi
      CANDIDATE_BUNDLE_ID="$(
        /usr/libexec/PlistBuddy -c "Print :CFBundleIdentifier" "$INFO_PLIST_PATH" 2>/dev/null || true
      )"
      if [ "$CANDIDATE_BUNDLE_ID" = "$BUNDLE_ID" ]; then
        APP_PATH="$CANDIDATE_PATH"
        break
      fi
    done < <(ls -dt "$HOME"/Library/Developer/Xcode/DerivedData/*/Build/Products/*-iphoneos/OpenClawVoice.app 2>/dev/null || true)

    if [ -n "$APP_PATH" ]; then
      echo "App ${BUNDLE_ID} is not installed. Installing from ${APP_PATH}..."
      xcrun devicectl device install app --device "$DEVICE_UDID" "$APP_PATH" >/dev/null
    else
      echo "App ${BUNDLE_ID} is not installed and no valid device .app binary was found." >&2
      echo "Run: npm run ios:dev -- --device ${DEVICE_UDID} --no-bundler" >&2
      exit 1
    fi
  fi

  echo "Launching ${BUNDLE_ID} on ${DEVICE_UDID} with Metro URL ${METRO_URL}..."
  xcrun devicectl device process launch --device "$DEVICE_UDID" --terminate-existing --payload-url "$PAYLOAD_URL" "$BUNDLE_ID"
else
  echo "Launching ${BUNDLE_ID} on ${DEVICE_UDID} (no Metro payload URL)..."
  xcrun devicectl device process launch \
    --device "$DEVICE_UDID" \
    --terminate-existing \
    "$BUNDLE_ID"
  echo "Tip: pass Metro URL as 2nd arg or set EXPO_DEV_SERVER_URL for Debug auto-connect."
fi
