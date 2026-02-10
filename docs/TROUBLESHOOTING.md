# Troubleshooting

## First checks

```bash
npm run doctor:ios
npm run setup
```

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
