# OpenClaw Voice

![OpenClawVoice logo](https://raw.githubusercontent.com/kyaukyuai/openclaw-voice/main/assets/logo-badge.png)

[![Expo SDK 54](https://img.shields.io/badge/Expo-SDK%2054-000020?logo=expo&logoColor=white)](https://expo.dev/)
[![React Native 0.81](https://img.shields.io/badge/React%20Native-0.81-61DAFB?logo=react&logoColor=1f2937)](https://reactnative.dev/)
[![TypeScript 5.x](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

Voice-first OpenClaw experience for mobile and code.

Speak -> edit -> send -> stream response.

<p align="center">
  <video
    src="https://github.com/user-attachments/assets/65f799f3-c87b-4c13-8b5f-23491efd5ec5"
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
  <a href="https://github.com/user-attachments/assets/65f799f3-c87b-4c13-8b5f-23491efd5ec5"><strong>Watch demo video (MP4)</strong></a>
</p>

## Why OpenClaw Voice

- Fast voice-to-chat workflow optimized for iOS
- Reusable `GatewayClient` SDK on npm (`openclaw-voice`)
- Streaming response handling with reconnect and pairing flow support
- Secure device identity signing via Ed25519

## Run The App (5 Minutes)

Prerequisites:

- Node.js 18+
- Xcode + iOS runtime
- CocoaPods
- A running OpenClaw Gateway endpoint (`wss://...`)

Quick setup:

```bash
bash scripts/bootstrap.sh
```

What it does:

- Installs dependencies with `npm install`
- Generates iOS native project (if missing)
- Installs CocoaPods
- Launches the app on a physical device (`npm run ios -- --device`)

Manual setup:

```bash
npm install
npm run ios
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
  displayName: 'OpenClawVoice',
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
      <img src="https://raw.githubusercontent.com/kyaukyuai/openclaw-voice/main/docs/screenshots/idle.png" width="200" alt="Idle state" />
    </td>
    <td align="center" width="25%">
      <strong>Ready to Send</strong><br>
      <sub>Transcript ready, tap to send</sub><br><br>
      <img src="https://raw.githubusercontent.com/kyaukyuai/openclaw-voice/main/docs/screenshots/ready-to-send.png" width="200" alt="Ready to send state" />
    </td>
    <td align="center" width="25%">
      <strong>Sending</strong><br>
      <sub>Waiting for Gateway response</sub><br><br>
      <img src="https://raw.githubusercontent.com/kyaukyuai/openclaw-voice/main/docs/screenshots/sending.png" width="200" alt="Sending state" />
    </td>
    <td align="center" width="25%">
      <strong>Response (Light)</strong><br>
      <sub>Streamed response displayed</sub><br><br>
      <img src="https://raw.githubusercontent.com/kyaukyuai/openclaw-voice/main/docs/screenshots/response-light.png" width="200" alt="Response in light theme" />
    </td>
  </tr>
</table>

## Features

- Speech-to-text input using `expo-speech-recognition`
- Editable transcript before sending
- OpenClaw Gateway connection with URL + token/password
- Streaming response rendering with per-turn states (`WAIT`, `OK`, `ERR`)
- Auto reconnect support
- Persistent settings for gateway URL, token/password, and theme
- Local device identity generation/signing for gateway auth

## Environment Variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

- `EXPO_PUBLIC_DEFAULT_GATEWAY_URL`
- `EXPO_PUBLIC_DEFAULT_THEME` (`light` or `dark`)
- `EXPO_PUBLIC_GATEWAY_CLIENT_ID` (default: `openclaw-ios`)
- `EXPO_PUBLIC_GATEWAY_DISPLAY_NAME` (default: `OpenClawVoice`)
- `EXPO_PUBLIC_DEBUG_MODE` (`true` to show warnings in dev, default: `false`)

## Connection Defaults

- `clientId: openclaw-ios`
- `displayName: OpenClawVoice`
- `role: operator`
- `scopes: operator.read, operator.write`
- `caps: talk`

Device identity is generated locally and reused when persistent storage is available.

## Scripts

- `npm run start` - Start Expo dev server
- `npm run ios` - Build and run iOS app
- `npm run android` - Build and run Android app
- `npm run web` - Run web target
- `npm run typecheck` - Run TypeScript checks
- `npm run build:package` - Build npm package files to `dist/`

## Security Notes

- Do not commit private gateway tokens.
- Use secure `wss://` endpoints.
- Preferred exposure path order: Tailscale/WireGuard -> Cloudflare Tunnel + access control -> Hardened VPS reverse proxy.
- Do not expose raw Gateway ports publicly.
- Rotate credentials and keep TLS/server packages up to date.

## Troubleshooting

See [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## CI

GitHub Actions runs on push/PR:

- Type check (`npm run typecheck`)
- Lint (`npm run lint --if-present`)
- Tests (`npm test --if-present`)

Issue/PR templates are in `.github/`.

## Publish to npm

```bash
npm run build:package
npm publish --access public
```

## Acknowledgements

- [`expo-openclaw-chat`](https://github.com/brunobar79/expo-openclaw-chat)

## License

MIT. See [LICENSE](LICENSE).
