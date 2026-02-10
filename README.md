# OpenClaw Voice

![OpenClawVoice logo](https://raw.githubusercontent.com/kyaukyuai/openclaw-voice/main/assets/logo-badge.png)

[![Expo SDK 54](https://img.shields.io/badge/Expo-SDK%2054-000020?logo=expo&logoColor=white)](https://expo.dev/)
[![React Native 0.81](https://img.shields.io/badge/React%20Native-0.81-61DAFB?logo=react&logoColor=1f2937)](https://reactnative.dev/)
[![TypeScript 5.x](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

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
- A running OpenClaw Gateway endpoint (`wss://...`)

Quick setup:

```bash
npm run setup
```

Optional environment check:

```bash
npm run doctor:ios
```

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

### What Is Metro?

`Metro` is the JavaScript bundler/dev server used by React Native/Expo in development.
In Debug builds, the app loads JS from Metro (usually `:8081`) with fast refresh.

- Debug build (`npm run ios`, `npm run ios:dev`) -> Metro required
- Release build (`--configuration Release`) -> Metro not required (bundle is embedded)

If Debug app does not attach to Metro, pass URL explicitly:

```bash
EXPO_DEV_SERVER_URL=http://192.168.0.10:8081 npm run ios:dev:device:open
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
- `npm run dev:metro` - Start Metro for dev-client (tunnel mode)
- `npm run start` - Start Expo dev server
- `npm run ios` - Alias for `npm run ios:dev`
- `npm run ios:dev` - Build and run iOS Debug app (Metro required)
- `npm run ios:dev:device` - Build and run iOS Debug app on device (Metro required)
- `npm run ios:dev:device:install` - Install iOS Debug app on device (no bundler startup)
- `npm run ios:dev:device:open` - Launch installed iOS app on connected device (uses `EXPO_DEV_SERVER_URL` when set)
- `npm run ios:release` - Build and run iOS Release app (Metro not required)
- `npm run ios:release:device` - Build and run iOS Release app on device (Metro not required)
- `npm run android` - Build and run Android app
- `npm run web` - Run web target
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

See [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) for more.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## CI

GitHub Actions runs on push/PR:

- Type check (`npm run typecheck`)
- Package dry-run (`npm pack --dry-run`)
- Manifest restore check after pack (`package.json.main` stays `index.ts`)
- Lint (`npm run lint`)
- Tests (`npm test`)
- Tarball install smoke test (`npm run smoke:pack-install`)

Issue/PR templates are in `.github/`.

## Publish to npm

This repo uses two entry contexts:

- App runtime: `package.json.main = index.ts`
- npm package tarball: `main = ./dist/package.js` (switched automatically during pack/publish)

Release steps:

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
