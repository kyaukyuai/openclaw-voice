# OpenClaw Voice

![OpenClawVoice logo](https://raw.githubusercontent.com/kyaukyuai/openclaw-voice/main/assets/logo-badge.png)

[![Expo SDK 54](https://img.shields.io/badge/Expo-SDK%2054-000020?logo=expo&logoColor=white)](https://expo.dev/)
[![React Native 0.81](https://img.shields.io/badge/React%20Native-0.81-61DAFB?logo=react&logoColor=1f2937)](https://reactnative.dev/)
[![TypeScript 5.x](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![npm version](https://img.shields.io/npm/v/openclaw-voice)](https://www.npmjs.com/package/openclaw-voice)

Voice-first OpenClaw experience for mobile and desktop.

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

- Fast voice-to-chat workflow optimized for iOS.
- Text-first macOS experience for desktop operations.
- Reusable `GatewayClient` SDK on npm (`openclaw-voice`).
- Streaming + recovery handling for unstable networks.
- Secure local device identity signing via Ed25519.

## Run The App (5 Minutes)

### Prerequisites

- Node.js 18+
- Xcode + iOS runtime + CocoaPods
- Android Studio + Android SDK (Android runs)
- A running OpenClaw Gateway endpoint (`wss://...`)

### Setup

```bash
npm run setup
```

Optional environment validation:

```bash
npm run doctor:ios
npm run doctor:macos
npm run doctor:android
```

### iOS Debug (Metro required)

```bash
# Terminal A
npm run dev:metro

# Terminal B
npm run ios:dev:device:install
```

If `Connecting to: iPhone` keeps spinning:

```bash
EXPO_DEV_SERVER_URL=<metro-url> npm run ios:dev:device:open
```

### iOS Release (Metro not required)

```bash
npm run ios:release:device
```

### macOS App (Designed for iPad/iPhone)

```bash
npm run ios:mac
```

### macOS Native (`react-native-macos`)

```bash
npm run macos:native:doctor
npm run macos:native:bootstrap

# Terminal A
npm run macos:native:start

# Terminal B
npm run macos:native:run
```

`macos:native:start` / `macos:native:run` use Metro port `8082` by default.

### Android

```bash
npm run doctor:android
npm run android:emulator:setup   # one-time
npm run android:emulator:start
npm run android
```

If SDK path errors appear, set:

```bash
export ANDROID_HOME="$HOME/Library/Android/sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
```

## Platform Support

| Platform | Path | Status | Notes |
| --- | --- | --- | --- |
| iOS | Expo + native run | Stable | Voice + text workflow |
| macOS (iOS app on Mac) | `npm run ios:mac` | Stable | Release run, Metro not required |
| macOS Native | `apps/macos-native` | Active | Text-first, multi-gateway |
| Android | Expo + native run | Verified | Emulator + physical device flow validated |
| Web | `npm run web` / `npm run web:check` | Secondary | Compatibility check target |

## macOS Native UX Summary

- Apple Silicon only.
- Text-first workflow: connect, send, stream, refresh history.
- Multi-gateway concurrent connection support.
- Sidebar with gateway + session navigation.
- Focused session history + large composer area.
- Assistant markdown rendered via WKWebView for stable layout.
- Partial copy from assistant bubbles (drag select + `Cmd+C`).
- Shortcuts: `Enter` send, `Shift+Enter` newline, `Cmd+Enter` send, `Cmd+R` refresh, `Esc` dismiss/clear.
- Voice input intentionally disabled on macOS native.

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
      <img src="https://raw.githubusercontent.com/kyaukyuai/openclaw-voice/main/docs/screenshots/response-light.png" width="230" alt="Response state" />
    </td>
  </tr>
</table>

## Features

- Voice input with hold-to-record (`expo-speech-recognition`).
- Speech language switch (`ja-JP` / `en-US`).
- Dedicated Settings + Sessions screens.
- Session management: list, switch, rename, pin/unpin, create.
- Gateway connect/reconnect with startup auto-connect retry.
- History sync + manual refresh + status notice.
- Streaming response rendering with per-turn states (`WAIT`, `OK`, `ERR`).
- Markdown response rendering + URL linkification.
- Persistent local settings + secure device identity reuse.

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

## Metro (Debug Only)

`Metro` is the JS bundler/dev server used by React Native/Expo in development.

- Debug (`npm run ios`, `npm run ios:dev`) -> Metro required.
- Release (`--configuration Release`) -> Metro not required (bundle embedded).

If Debug app cannot attach, pass URL explicitly:

```bash
EXPO_DEV_SERVER_URL=http://192.168.0.10:8081 npm run ios:dev:device:open
```

## iOS Runtime Stability

Recent iOS runtime changes:

- Reducer-based runtime transitions for connect/send/sync/recovery.
- Unified settings persistence in `SettingsContext` (single source of truth).
- History refresh in-flight guard + 20s timeout fail-close.
- Shared history bottom-scroll scheduler (`requestAnimationFrame` x2).
- Wiring split: `useAppRuntimeWiring` + `useAppPresentationWiring`.

Key files:

- `src/ios-runtime/runtime-state.ts`
- `src/ios-runtime/useGatewayRuntime.ts`
- `src/ios-runtime/useHistoryRuntime.ts`
- `src/ios-runtime/useAppRuntimeWiring.ts`
- `src/ios-runtime/useAppPresentationWiring.ts`
- `src/ui/history-layout.ts`
- `tests/ios-runtime-integration.test.mjs`

Regression checklist:

```bash
npm run typecheck
npm run lint --if-present
npm test -- --watch=false
```

Manual iOS checks:

1. `connect -> send -> complete` does not leave `Sending...` stuck.
2. Manual refresh returns from `Refreshing...`.
3. Reconnecting still allows manual reconnect/disconnect.
4. Keyboard open/close does not clip latest history line.
5. Session switching keeps draft/quick-text behavior.

## Connection Defaults

- `clientId: openclaw-ios`
- `displayName: OpenClaw Pocket`
- `role: operator`
- `scopes: operator.read, operator.write`
- `caps: talk`

Device identity is generated locally and reused when persistent storage is available.

## Scripts

### Setup / Doctor

- `npm run setup`
- `npm run doctor:ios`
- `npm run doctor:macos`
- `npm run doctor:android`
- `npm run doctor:release`
- `npm run check:release-docs`

### iOS / macOS / Android / Web

- `npm run ios:dev`
- `npm run ios:dev:device`
- `npm run ios:dev:device:install`
- `npm run ios:dev:device:open`
- `npm run ios:release`
- `npm run ios:release:device`
- `npm run ios:mac`
- `npm run ios:mac:debug`
- `npm run macos:native:bootstrap`
- `npm run macos:native:start`
- `npm run macos:native:run`
- `npm run android`
- `npm run web`
- `npm run web:check`

### Quality / Packaging

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run smoke:pack-install`
- `npm run build:package`
- `npm run check:no-ts-js-mirror`

## Local Quality Checks

Run before PR:

```bash
npm run typecheck
npm run lint
npm test
npm run smoke:pack-install
```

If npm network is unavailable during smoke test:

```bash
OPENCLAW_SMOKE_SKIP_INSTALL=1 npm run smoke:pack-install
```

## CI

GitHub Actions (`CI`) runs on push/PR:

- Type check (`npm run typecheck`)
- TS/JS mirror guard (`npm run check:no-ts-js-mirror`)
- Web export check (`npm run web:check`)
- Package dry-run (`npm pack --dry-run`)
- Manifest restore check after pack (`package.json.main` stays `index.ts`)
- Lint (`npm run lint`)
- Tests (`npm test`)
- Tarball install smoke (`npm run smoke:pack-install`)

`macos-native-checks` (macOS runner) also runs:

- `npm --prefix apps/macos-native run lint`
- `npm --prefix apps/macos-native run lint:baseline`
- `npm --prefix apps/macos-native run test -- --watch=false`
- `npm --prefix apps/macos-native run test:smoke`
- `npm --prefix apps/macos-native run test:e2e`
- `npm --prefix apps/macos-native exec react-native start --help`

## Release & Publish to npm

Release gate:

- [Release Readiness Checklist](docs/RELEASE_READINESS_CHECKLIST.md)

Automated path:

1. Ensure repository secret `NPM_TOKEN` exists.
2. Bump version:

```bash
npm version patch -m "chore(release): %s"
```

3. Push commit and tags:

```bash
git push
git push --tags
```

4. `Release` workflow behavior:
- PR to `main`: runs verify gate (`Release / verify`).
- Tag `v*`: runs verify + publish + GitHub release.

Verify gate includes:

- `gitleaks detect --source . --redact`
- `npm audit --omit=dev --audit-level=high`
- `typecheck`, `lint`, `test`, `smoke:pack-install`
- `npm --prefix apps/macos-native run test:e2e`

Optional preflight:

```bash
npm run doctor:release
gh workflow run release.yml
```

Manual publish path:

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

## Security Notes

- Do not commit private gateway tokens.
- Use secure `wss://` endpoints.
- `markdown-it` is pinned via npm `overrides` to avoid vulnerable legacy transitive versions.
- Extremely long assistant markdown is truncated during render for safe UI/resource usage.
- Preferred exposure path: Tailscale/WireGuard -> Cloudflare Tunnel + access control -> hardened VPS reverse proxy.
- Do not expose raw Gateway ports publicly.
- Rotate credentials and keep TLS/server packages up to date.

## Troubleshooting

For `No script URL provided` / `Could not connect to development server`:

- Start Metro explicitly: `npx expo start --dev-client --host tunnel --clear`
- Reinstall Debug app with `--no-bundler` from another terminal
- Or use Release build: `npx expo run:ios --device --configuration Release`

For macOS build error `Provisioning profile ... doesn't include ... Mac`:

- Open Xcode and confirm Apple ID/team automatic signing
- Re-run: `npm run ios:mac`
- If needed: `IOS_ALLOW_PROVISIONING_UPDATES=1 npm run ios:mac`

For web export dependency errors (`react-dom` / `react-native-web`):

- `npx expo install react-dom react-native-web`
- `npm run web:check`

More cases: [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

Issue/PR templates are in `.github/`.

## Funding

If this project helps your workflow, support maintenance:

- [@kyaukyuai](https://github.com/sponsors/kyaukyuai)

## Acknowledgements

- [`expo-openclaw-chat`](https://github.com/brunobar79/expo-openclaw-chat)

## License

MIT. See [LICENSE](LICENSE).
