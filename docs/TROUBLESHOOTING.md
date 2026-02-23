# Troubleshooting

## First checks

```bash
npm run doctor:ios
npm run setup
```

## iOS regression quick checks (before merge/release)

```bash
npm run typecheck
npm run lint --if-present
npm test -- --watch=false
```

Manual checks:

- Connect -> send -> complete does not leave `Sending...` stuck.
- Refresh history returns from `Refreshing...` to terminal state (updated/failed).
- Keyboard open/close still keeps the latest history message visible.
- Session switch/rename/pin and quick-text insert still work.

## `Cannot find native module 'ExpoSecureStore'`

```bash
npm install expo-secure-store
npx pod-install ios
npm run ios:dev:device:install
```

If it still fails:

```bash
rm -rf ios/build
npm run setup
```

## `xcodebuild exited with code 70` / destination not found

- Install the required iOS runtime in `Xcode > Settings > Components`.
- Reconnect your simulator/device.
- Retry with explicit device mode:

```bash
npm run ios:dev:device:install
```

## macOS native PoC: first run checks

```bash
npm run macos:native:doctor
npm run macos:native:bootstrap
```

Then run:

```bash
# Terminal A
npm run macos:native:start

# Terminal B
npm run macos:native:run
```

These scripts use Metro port `8082` by default.

## macOS native PoC: provisioning/signing failure

If build fails with signing/provisioning errors:

- Open `apps/macos-native/macos/OpenClawPocketMac.xcodeproj` in Xcode
- Select target `OpenClawPocketMac-macOS`
- Enable `Automatically manage signing`
- Select your Team
- Build once in Xcode, then retry `npm run macos:native:run`

## macOS native PoC: `unable to initiate PIF transfer session`

This is usually a stale Xcode build service state.

Run:

```bash
pkill -x xcodebuild || true
pkill -f XCBBuildService || true
```

Then reopen Xcode once and retry:

```bash
npm run macos:native:run
```

## macOS native PoC: Metro connection issue

If the app launches but JS does not attach:

```bash
npm run macos:native:start
```

Keep Metro running while using Debug configuration.

## macOS native PoC: cannot find Gateway/Quick Text settings

The macOS mock-parity UI moved settings out of the main chat pane.

Where to find:

- Open left sidebar -> `Settings`
- `Gateway URL`, `Token`, `Session Key` are in `Gateway Settings`
- `Quick Text` left/right values are in `Quick Text`

You can still use keyboard shortcuts globally:

- `Cmd+Enter`: send
- `Cmd+R`: refresh history
- `Esc`: close banner or clear composer text

## macOS native PoC: `Connect` button is disabled

`Connect` is disabled only when:

- Identity bootstrap is not ready yet, or
- The target gateway is currently in `connecting`

`reconnecting` does **not** disable manual controls.
In `reconnecting`, both `Reconnect` and `Disconnect` remain available by design.

## macOS native PoC: auto-connect does not run after manual disconnect

When you click `Disconnect`, that gateway is marked as manually disconnected.
Startup auto-connect is suppressed for that gateway until you reconnect manually.

How to resume auto behavior:

- Click `Reconnect`/`Connect` once for the same gateway
- Keep `Gateway URL` + `Token` configured

## macOS native PoC: cursor / placeholder visibility is low

If cursor or placeholder text is hard to see in light/dark themes:

- Ensure you are on the latest `main` with the visibility patch in `apps/macos-native/App.js`
- Verify the app is restarted after `npm run macos:native:start` (clear cache once if needed)
- In `Settings`, focus each input once and confirm focus border changes
- In composer, confirm cursor and text-selection accent are visible in both themes

If stale bundle is suspected:

```bash
# Terminal A
npm run macos:native:start -- --reset-cache

# Terminal B
npm run macos:native:run
```

## macOS native PoC: `Secure RNG unavailable: crypto.getRandomValues is missing`

This means native random module linkage is incomplete.

Run:

```bash
npm run macos:native:bootstrap
```

Then restart:

```bash
# Terminal A
npm run macos:native:start

# Terminal B
npm run macos:native:run
```

## macOS native PoC: `RNCWebView` / `react-native-webview` module not found

If the app crashes with a missing `RNCWebView` native module error, the macOS pods are out of sync.

Run:

```bash
npm run macos:native:bootstrap
```

Then restart Metro + app:

```bash
# Terminal A
npm run macos:native:start

# Terminal B
npm run macos:native:run
```

## macOS native PoC: `EADDRINUSE` on Metro start

If you see `listen EADDRINUSE` while starting Metro, another process is already using that port.

Check current listeners:

```bash
lsof -nP -iTCP:8082 -sTCP:LISTEN
```

If needed, stop stale Metro:

```bash
pkill -f "react-native start" || true
pkill -f "expo start" || true
```

## `Connecting to: iPhone` never finishes

If Expo CLI keeps showing `Connecting to: iPhone` forever, installation may already be complete and only the CLI attach step is stuck.

```bash
# Stop the stuck command, then launch installed app directly:
npm run ios:dev:device:open
```

If Debug build still cannot attach to Metro:

```bash
EXPO_DEV_SERVER_URL=http://192.168.0.10:8081 npm run ios:dev:device:open
```

If you get `The requested application ... is not installed`:

```bash
# 1) Install debug build to the physical device
npm run ios:dev:device:install

# 2) Launch and attach to Metro URL
EXPO_DEV_SERVER_URL=http://192.168.0.10:8081 npm run ios:dev:device:open
```

## Repeated pairing requests

Likely causes:

- App reinstall
- Secure storage reset/unavailable
- Device identity changed

Actions:

- Confirm `expo-secure-store` is working.
- Avoid clearing app data between runs.
- Keep the same signing/profile during development.

## Gateway connection errors (`INVALID_REQUEST`, schema errors)

Check:

- URL starts with `wss://`
- Token/password matches server config
- Gateway supports operator client params used by this app
- Gateway and app protocol versions are compatible

## No response from assistant

Check:

- Gateway is connected (`Connected` in header)
- Transcript has content before sending
- Gateway logs for upstream provider/model errors
- History card status (`WAIT`, `ERR`, `OK`) for the failing turn

## `Refreshing...` does not finish

History refresh has a hard timeout of 20 seconds.
If the refresh path hangs, it now fails closed and shows a retryable banner.

What to do:

1. Click `Refresh` again after the banner appears.
2. If it repeats, reconnect Gateway once and retry.
3. Check gateway logs and network reachability for `chat.history`.

## Android: `Failed to resolve the Android SDK path` / `spawn adb ENOENT`

Run:

```bash
npm run doctor:android
```

Then configure SDK path:

```bash
export ANDROID_HOME="$HOME/Library/Android/sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$ANDROID_HOME/platform-tools:$PATH"
```

Retry:

```bash
npm run android
```

## Android: `Package path is not valid. Valid system image paths are: null`

This means `avdmanager` cannot read SDK metadata, typically because `cmdline-tools;latest` is missing in your SDK root.

Run:

```bash
npm run android:emulator:setup
```

Then launch emulator:

```bash
npm run android:emulator:start
```
