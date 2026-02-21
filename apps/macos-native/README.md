# OpenClawPocket macOS Native PoC

This app is an isolated `react-native-macos` target used to validate desktop UX.

## Bootstrap

```bash
npm run macos:native:bootstrap
```

## Run

```bash
# Terminal A
npm run macos:native:start   # Metro on port 8082

# Terminal B
npm run macos:native:run
```

## Scope

- Apple Silicon macOS only
- Text-first chat workflow
- Voice input intentionally disabled
- Secure random source is provided via `react-native-get-random-values`
