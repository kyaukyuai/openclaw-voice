# Troubleshooting

## `Cannot find native module 'ExpoSecureStore'`

```bash
npm install expo-secure-store
npx pod-install ios
npm run ios -- --device
```

If it still fails:

```bash
rm -rf ios/build
npm run ios -- --device
```

## `xcodebuild exited with code 70` / destination not found

- Install the required iOS runtime in `Xcode > Settings > Components`.
- Reconnect your simulator/device.
- Retry with explicit device mode:

```bash
npm run ios -- --device
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
