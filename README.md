# OpenClaw Voice

![OpenClawVoice logo](https://raw.githubusercontent.com/kyaukyuai/openclaw-voice/main/assets/logo-badge.png)

[![Expo SDK 54](https://img.shields.io/badge/Expo-SDK%2054-000020?logo=expo&logoColor=white)](https://expo.dev/)
[![React Native 0.81](https://img.shields.io/badge/React%20Native-0.81-61DAFB?logo=react&logoColor=1f2937)](https://reactnative.dev/)
[![TypeScript 5.x](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![npm version](https://img.shields.io/npm/v/openclaw-voice)](https://www.npmjs.com/package/openclaw-voice)

Voice-first OpenClaw experience for mobile and code.

Speak -> edit -> send -> stream response.

<p align="center">
  <video
    src="https://github.com/user-attachments/assets/17678911-a359-490c-a529-67e9b38ff4bb"
    poster="https://raw.githubusercontent.com/kyaukyuai/openclaw-voice/main/docs/screenshots/response-light.png"
    controls
    playsinline
    preload="none"
    width="360"
  >
    Your browser cannot play inline video.
  </video>
</p>

<p align="center">
  <a href="https://github.com/user-attachments/assets/17678911-a359-490c-a529-67e9b38ff4bb"><strong>Watch demo video (MP4)</strong></a>
</p>

## Why OpenClaw Voice

- Fast voice-to-chat workflow optimized for iOS
- Reusable `GatewayClient` SDK on npm (`openclaw-voice`)
- Streaming + recovery handling for unstable mobile networks
- Secure device identity signing via Ed25519

## Run The App (5 Minutes)

Prerequisites:

- Node.js 18+
- Xcode + iOS runtime
- CocoaPods
- Android Studio + Android SDK (for Android runs)
- A running OpenClaw Gateway endpoint (`wss://...`)

Quick setup:

```bash
npm run setup
```

Optional environment check:

```bash
npm run doctor:ios
npm run doctor:macos
```

macOS app run path (Apple Silicon, Metro not required):

```bash
npm run ios:mac
```

macOS native PoC path (`react-native-macos`, Apple Silicon only):

```bash
npm run macos:native:doctor
npm run macos:native:bootstrap

# Terminal A
npm run macos:native:start

# Terminal B
npm run macos:native:run
```

`macos:native:start`/`macos:native:run` use Metro port `8082` by default to avoid conflicts with Expo/iOS Debug (`8081`).

Debug run path (development, Metro required):

```bash
# Terminal A
npm run dev:metro

# Terminal B
npm run ios:dev:device:install
```

If `Connecting to: iPhone` keeps spinning forever, stop that terminal (`Ctrl+C`) and launch directly:

```bash
EXPO_DEV_SERVER_URL=<metro-url> npm run ios:dev:device:open
```

Release run path (device testing, Metro not required):

```bash
npm run ios:release:device
```

`scripts/bootstrap.sh` runs `npm run setup` and prints these run paths.

Android run path:

```bash
npm run doctor:android
npm run android:emulator:setup   # one-time
npm run android:emulator:start   # start emulator
npm run android
```

If `doctor:android` reports SDK errors, set `ANDROID_HOME` (or `ANDROID_SDK_ROOT`) and ensure `adb` is available.
If AVD creation fails with `Valid system image paths are: null`, install `cmdline-tools;latest` inside your SDK and rerun `npm run android:emulator:setup`.

### Android: Verified Device/Emulator Steps

Verified on macOS with Expo SDK 54 and Android API 35.

1. Set SDK environment variables:

```bash
export ANDROID_HOME="$HOME/Library/Android/sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
```

2. Validate toolchain:

```bash
npm run doctor:android
```

3. Emulator path:

```bash
npm run android:emulator:setup
npm run android:emulator:start
npm run android
```

4. Physical device path (USB debugging enabled):

```bash
adb devices
npm run android
```

Expected result:
- `adb devices` shows at least one `device`
- Expo installs and launches the app without SDK-path errors

### What Is Metro?

`Metro` is the JavaScript bundler/dev server used by React Native/Expo in development.
In Debug builds, the app loads JS from Metro (usually `:8081`) with fast refresh.

- Debug build (`npm run ios`, `npm run ios:dev`) -> Metro required
- Release build (`--configuration Release`) -> Metro not required (bundle is embedded)

If Debug app does not attach to Metro, pass URL explicitly:

```bash
EXPO_DEV_SERVER_URL=http://192.168.0.10:8081 npm run ios:dev:device:open
```

### macOS App Support

This project supports macOS app usage on Apple Silicon as:

- iOS app running on Mac (`Designed for iPad/iPhone`)
- Dedicated native PoC target via `react-native-macos` (`apps/macos-native`)
- Core flow: Gateway connection, text input/send, history display, quick text actions
- Current limitation: voice input is disabled on macOS (`macOSでは音声入力未対応です。`)

Validate macOS runtime:

```bash
npm run doctor:macos
```

Build and launch macOS app:

```bash
npm run ios:mac
```

### macOS Native PoC (Phase1)

Scope:

- Apple Silicon macOS only
- Text-first workflow (Gateway connect, send, stream, history)
- Multi-gateway concurrent connection support (connect A/B gateways in parallel)
- Focused gateway session view with large history + composer
- Assistant markdown is rendered in WKWebView for stable heading/list/code formatting
- Partial copy is supported directly in assistant bubbles (drag to select, then `Cmd+C`)
- Keyboard shortcuts: `Enter` send, `Shift+Enter` newline, `Cmd+Enter` send (compat), `Cmd+R` refresh focused card, `Esc` close banner or clear
- Voice input intentionally disabled (mic icon is visual-only)

UI (mock parity):

- Left sidebar (`~220px`) with gateway list, nested session list, and `Settings`
- Main pane shows the selected gateway/session history and focused composer
- `Settings`: active gateway profile editing (`Gateway Name/URL/Token/Session Key`)
- `Quick Text` remains global and can be inserted into the focused gateway composer
- Theme toggle (`Light` / `Dark`) in sidebar footer

Commands:

```bash
npm run macos:native:doctor
npm run macos:native:bootstrap
npm run macos:native:start
npm run macos:native:run
```

Note: native macOS Metro runs on port `8082` by default.

Optional desktop web path (secondary):

```bash
npm run web
npm run web:check
```

## Use It As npm Package

Install:

```bash
npm install openclaw-voice
```

Example:

```ts
import { GatewayClient, setStorage } from 'openclaw-voice';

// Optional: set persistent storage for device identity.
setStorage({
  getString: (key) => localStorage.getItem(key) ?? undefined,
  set: (key, value) => localStorage.setItem(key, value),
});

const client = new GatewayClient('wss://your-openclaw-gateway.example.com', {
  token: 'your-token',
  clientId: 'openclaw-ios',
  displayName: 'OpenClaw Pocket',
  role: 'operator',
  scopes: ['operator.read', 'operator.write'],
  caps: ['talk'],
});

client.onConnectionStateChange((state) => console.log('connection:', state));
client.onChatEvent((event) => console.log('chat event:', event.state, event.message));

await client.connect();
const result = await client.chatSend('demo-session-1', 'Hello from openclaw-voice');
console.log('runId:', result.runId);
```

Notes:

- Without `setStorage`, identity is in-memory and may require re-pairing after restart.
- In React Native/Expo, load crypto/base64 polyfills before using the client when needed.

## Screenshots

<table>
  <tr>
    <td align="center" width="25%">
      <strong>Idle</strong><br>
      <sub>Connected, waiting for input</sub><br><br>
      <img src="https://raw.githubusercontent.com/kyaukyuai/openclaw-voice/main/docs/screenshots/idle.png" width="230" alt="Idle state" />
    </td>
    <td align="center" width="25%">
      <strong>Ready to Send</strong><br>
      <sub>Transcript ready, tap to send</sub><br><br>
      <img src="https://raw.githubusercontent.com/kyaukyuai/openclaw-voice/main/docs/screenshots/ready-to-send.png" width="230" alt="Ready to send state" />
    </td>
    <td align="center" width="25%">
      <strong>Sending</strong><br>
      <sub>Waiting for Gateway response</sub><br><br>
      <img src="https://raw.githubusercontent.com/kyaukyuai/openclaw-voice/main/docs/screenshots/sending.png" width="230" alt="Sending state" />
    </td>
    <td align="center" width="25%">
      <strong>Response</strong><br>
      <sub>Streamed response displayed</sub><br><br>
      <img src="https://raw.githubusercontent.com/kyaukyuai/openclaw-voice/main/docs/screenshots/response-light.png" width="230" alt="Response in light theme" />
    </td>
  </tr>
</table>

## Features

- Voice input with hold-to-record (`expo-speech-recognition`)
- macOS app mode uses text-first operation (voice input disabled)
- Editable transcript and quick text insert buttons
- Speech language switch (`ja-JP` / `en-US`)
- Dedicated **Settings** screen and **Sessions** screen
- Session management: list, switch, rename, pin/unpin, create
- Gateway connect/reconnect flow with startup auto-connect retry
- History sync and manual refresh with status notice
- Streaming response rendering with per-turn states (`WAIT`, `OK`, `ERR`)
- Markdown response rendering with URL linkification
- Persistent local settings and secure local device identity reuse

## Environment Variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

- `EXPO_PUBLIC_DEFAULT_GATEWAY_URL`
- `EXPO_PUBLIC_DEFAULT_THEME` (`light` or `dark`)
- `EXPO_PUBLIC_DEFAULT_SESSION_KEY` (default: `main`)
- `EXPO_PUBLIC_GATEWAY_CLIENT_ID` (default: `openclaw-ios`)
- `EXPO_PUBLIC_GATEWAY_DISPLAY_NAME` (default: `OpenClaw Pocket`)
- `EXPO_PUBLIC_DEBUG_MODE` (`true` to show dev warnings and runtime debug panel, default: `false`)

## iOS Stability Runtime

Recent iOS stability work introduces:

- `GatewayContext` as the primary connect/disconnect/health/sessions runtime path on iOS
- Reducer-based runtime state transitions for `connection/sending/sync/recovery`
- Unified settings persistence in `SettingsContext` (single source of truth)
- History refresh in-flight guard + 20s timeout fail-close behavior
- Shared history bottom-scroll scheduler (`requestAnimationFrame` x2) for safer tail visibility
- `App.tsx` wiring split: `useAppScreenWiring` -> `useAppRuntimeWiring` + `useAppPresentationWiring`
- Pure runtime input builders in `src/ios-runtime/app-runtime-wiring-inputs-logic.ts` (orchestrator/side-effects assembly)
- iOS runtime is now a single path (legacy fallback path removed)

Primary files:

- `/Users/kyaukyuai/src/github.com/kyaukyuai/openclaw-voice/src/ios-runtime/runtime-state.ts`
- `/Users/kyaukyuai/src/github.com/kyaukyuai/openclaw-voice/src/ios-runtime/useAppScreenWiring.ts`
- `/Users/kyaukyuai/src/github.com/kyaukyuai/openclaw-voice/src/ios-runtime/useAppRuntimeWiring.ts`
- `/Users/kyaukyuai/src/github.com/kyaukyuai/openclaw-voice/src/ios-runtime/useAppPresentationWiring.ts`
- `/Users/kyaukyuai/src/github.com/kyaukyuai/openclaw-voice/src/ios-runtime/app-runtime-wiring-inputs-logic.ts`
- `/Users/kyaukyuai/src/github.com/kyaukyuai/openclaw-voice/src/ios-runtime/useGatewayRuntime.ts`
- `/Users/kyaukyuai/src/github.com/kyaukyuai/openclaw-voice/src/ios-runtime/useHistoryRuntime.ts`
- `/Users/kyaukyuai/src/github.com/kyaukyuai/openclaw-voice/src/ui/history-layout.ts`
- `/Users/kyaukyuai/src/github.com/kyaukyuai/openclaw-voice/tests/ios-runtime-integration.test.mjs`

Integration scenarios covered by tests:

- Send lifecycle reaches terminal state from both streaming-complete and failure branches
- History refresh timeout fail-closes and clears in-flight tracking
- Reconnecting -> disconnect reset clears runtime and allows reconnect

### iOS Regression Checklist

Run these checks before commit/PR:

```bash
npm run typecheck
npm run lint --if-present
npm test -- --watch=false
```

Manual iOS device checks:

1. Launch debug app (`npm run ios:dev:device:install`) with Metro running.
2. Verify connect -> send -> complete does not leave `Sending...` stuck.
3. Verify refresh returns from `Refreshing...` to terminal state.
4. Verify reconnecting state still allows manual disconnect/reconnect.
5. Open keyboard and ensure latest history line is fully visible (no bottom clipping).
6. Switch sessions and ensure draft/quick text behavior still works.

### iOS Debug Decision Matrix

When a regression appears, use this quick mapping before digging into code:

1. `Sending...` does not end:
- Check `src/ios-runtime/runtime-state.ts` terminal transitions.
- Then check `src/ios-runtime/useAppRuntimeEffects.ts` send/recovery side effects.

2. `Refreshing...` does not end:
- Check history timeout and in-flight reset in `src/ios-runtime/useHistoryRuntime.ts`.
- Then confirm refresh notice flow in `src/ios-runtime/useHomeUiHandlers.ts`.

3. Latest history line is clipped:
- Check bottom inset math in `src/ui/history-layout.ts`.
- Then check auto-scroll triggers in `src/ios-runtime/useAppRuntimeEffects.ts` and `src/ios-runtime/useHomeUiHandlers.ts`.

4. Session/quick-text UI state mismatch:
- Check computed selectors in `src/ios-runtime/home-ui-state-logic.ts`.
- Then check action handlers in `src/ios-runtime/home-ui-handlers-logic.ts`.

## Connection Defaults

- `clientId: openclaw-ios`
- `displayName: OpenClaw Pocket`
- `role: operator`
- `scopes: operator.read, operator.write`
- `caps: talk`

Device identity is generated locally and reused when persistent storage is available.

## Scripts

- `npm run setup` - Install deps, prepare native iOS project, install Pods
- `npm run doctor:ios` - Validate iOS development environment and connectivity
- `npm run doctor:macos` - Validate macOS app runtime availability (`Designed for iPad/iPhone`)
- `npm run macos:native:doctor` - Validate `react-native-macos` local environment
- `npm run doctor:android` - Validate Android SDK/adb/device environment
- `npm run doctor:release` - Check release prerequisites (release workflow, docs gate, GitHub secret/permissions when available)
- `npm run check:release-docs` - Ensure `CHANGELOG.md` and `README.md` stay aligned with package metadata
- `npm run android:emulator:setup` - Install Android SDK pieces and create default emulator (`Pixel_8_API_35`)
- `npm run android:emulator:start` - Start default Android emulator
- `npm run dev:metro` - Start Metro for dev-client (tunnel mode)
- `npm run start` - Start Expo dev server
- `npm run ios` - Alias for `npm run ios:dev`
- `npm run ios:dev` - Build and run iOS Debug app (Metro required)
- `npm run ios:dev:device` - Build and run iOS Debug app on device (Metro required)
- `npm run ios:dev:device:install` - Install iOS Debug app on device (no bundler startup)
- `npm run ios:dev:device:open` - Launch installed iOS app on connected device (uses `EXPO_DEV_SERVER_URL` when set)
- `npm run ios:release` - Build and run iOS Release app (Metro not required)
- `npm run ios:release:device` - Build and run iOS Release app on device (Metro not required)
- `npm run ios:mac` - Build and launch macOS app (Apple Silicon, Release)
- `npm run ios:mac:debug` - Build and launch macOS app in Debug (Metro required)
- `npm run macos:native:bootstrap` - Install deps and Pods for `apps/macos-native`
- `npm run macos:native:start` - Start Metro for native macOS PoC target on port `8082`
- `npm run macos:native:run` - Build and run native macOS PoC target (connects to port `8082`)
- `npm run android` - Build and run Android app
- `npm run web` - Run web target
- `npm run web:check` - Export web bundle to validate desktop/web compatibility
- `npm run typecheck` - Run TypeScript checks
- `npm run lint` - Run repository lint checks
- `npm test` - Run regression tests (runtime logic + manifest switch)
- `npm run smoke:pack-install` - Pack tarball and verify install/import from a clean temp app
- `npm run build:package` - Build npm package files to `dist/`

## Local Quality Checks

Run before opening a PR:

```bash
npm run typecheck
npm run lint
npm test
npm run smoke:pack-install
```

If your environment cannot access npm network during smoke test:

```bash
OPENCLAW_SMOKE_SKIP_INSTALL=1 npm run smoke:pack-install
```

Before release/public rollout, run:

- [Release Readiness Checklist](docs/RELEASE_READINESS_CHECKLIST.md)

## Security Notes

- Do not commit private gateway tokens.
- Use secure `wss://` endpoints.
- Preferred exposure path order: Tailscale/WireGuard -> Cloudflare Tunnel + access control -> Hardened VPS reverse proxy.
- Do not expose raw Gateway ports publicly.
- Rotate credentials and keep TLS/server packages up to date.

## Funding

If this project helps your workflow, you can support maintenance on GitHub Sponsors:

- [@kyaukyuai](https://github.com/sponsors/kyaukyuai)

## Troubleshooting

For `No script URL provided` / `Could not connect to development server`:

- Start Metro explicitly (`npx expo start --dev-client --host tunnel --clear`)
- Reinstall Debug app with `--no-bundler` from another terminal
- Or use Release build (`npx expo run:ios --device --configuration Release`)

For macOS app build error `Provisioning profile ... doesn't include the currently selected device ... Mac`:

- Open Xcode and ensure your Apple ID/team is configured for automatic signing
- Re-run with provisioning updates enabled (default):
  - `npm run ios:mac`
- If needed, set explicitly:
  - `IOS_ALLOW_PROVISIONING_UPDATES=1 npm run ios:mac`

For `expo export --platform web` dependency errors (`react-dom` / `react-native-web` missing):

- Install required web dependencies: `npx expo install react-dom react-native-web`
- Re-run: `npm run web:check`

See [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) for more.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## CI

GitHub Actions runs on push/PR:

- Type check (`npm run typecheck`)
- TS/JS mirror guard (`npm run check:no-ts-js-mirror`)
- Web export check (`npm run web:check`)
- Package dry-run (`npm pack --dry-run`)
- Manifest restore check after pack (`package.json.main` stays `index.ts`)
- Lint (`npm run lint`)
- Tests (`npm test`)
- Tarball install smoke test (`npm run smoke:pack-install`)

`macos-native-checks` (macOS runner) also validates:

- `npm --prefix apps/macos-native run lint`
- `npm --prefix apps/macos-native run lint:baseline` (`no-shadow` / `no-unused-vars` enforced)
- `npm --prefix apps/macos-native run test -- --watch=false`
- `npm --prefix apps/macos-native exec react-native start --help` (startup smoke)

Issue/PR templates are in `.github/`.

## Publish to npm

This repo uses two entry contexts:

- App runtime: `package.json.main = index.ts`
- npm package tarball: `main = ./dist/package.js` (switched automatically during pack/publish)

Release gate:

- [Release Readiness Checklist](docs/RELEASE_READINESS_CHECKLIST.md)

Recommended release flow (automated):

1. Configure repository secret:
- `NPM_TOKEN` (npm automation/granular token that can publish this package)

2. Bump version and create tag:

```bash
npm version patch -m "chore(release): %s"
```

3. Push commit + tag:

```bash
git push
git push --tags
```

4. GitHub Actions `Release` workflow runs on `v*` tag:
- Version/tag consistency check
- `typecheck`, `lint`, `test`, `smoke:pack-install`
- `npm publish --access public --provenance` (skips if version is already published)
- GitHub Release auto-created with generated notes

Optional preflight checks:

```bash
npm run doctor:release
gh workflow run release.yml
```

Manual release path:

```bash
npm version patch --no-git-tag-version
git add package.json package-lock.json
git commit -m "chore(release): bump version to x.y.z"

# Runs prepack/postpack hooks automatically:
# - prepack: build + switch manifest for package publish
# - postpack: restore app manifest
npm publish --access public

git tag vX.Y.Z
git push -u origin main
git push origin vX.Y.Z
```

## Acknowledgements

- [`expo-openclaw-chat`](https://github.com/brunobar79/expo-openclaw-chat)

## License

MIT. See [LICENSE](LICENSE).
