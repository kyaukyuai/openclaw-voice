# Contributing

Thanks for contributing to OpenClawVoice.

## Development Setup

```bash
bash scripts/bootstrap.sh
```

If you do not use a physical device, run:

```bash
npm run ios
```

## Branch and PR Flow

1. Create a feature branch from `main`.
2. Keep each PR focused on one topic.
3. Run checks locally before opening a PR.
4. Open a PR with clear test notes and screenshots for UI changes.

## Local Checks

```bash
npm run typecheck
npm run lint --if-present
npm test --if-present
```

## Coding Guidelines

- Prefer small, reviewable commits.
- Keep user-facing strings in clear English.
- Avoid unrelated refactors in feature PRs.
- Keep UI changes accessible (`accessibilityLabel` for icon-only buttons).

## Reporting Bugs

Please use the bug issue template and include:

- Device model and iOS version
- Xcode version
- Reproduction steps
- Logs or screenshots

## Security

Do not commit secrets such as gateway tokens or private keys.
Use `.env` locally and keep `.env.example` up to date.
For remote access, prefer Tailscale/WireGuard over direct internet exposure.
If you must use Cloudflare Tunnel or a VPS, enforce `wss://`, edge access control, and gateway auth together.
Never publish a raw gateway port without access restrictions.
