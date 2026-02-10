# Changelog

All notable changes to this project are documented in this file.

## [1.0.6] - 2026-02-10

### Added
- Android support baseline:
  - Android package id (`com.kyaukyuai.openclawpocket`)
  - Android environment doctor (`npm run doctor:android`)
  - Emulator setup/start scripts (`npm run android:emulator:setup`, `npm run android:emulator:start`)
- iOS developer workflow scripts and checks:
  - `npm run setup`
  - `npm run doctor:ios`
  - unified debug/release run flow in docs

### Changed
- Gateway client platform is now selected by runtime OS (`ios` / `android` / `web`) instead of fixed `ios`.
- App display and metadata updates for OpenClaw Pocket branding.

### Fixed
- Improved session history sync stability.
- Added gateway connection diagnostics.
- Auto-recover missing final assistant responses.
- Complete onboarding state after first successful response.

## [1.0.5] - 2026-02-09

### Added
- Quick Text icon selection.
- Gateway health checks and outbox auto-retry.
- Outbox queue persistence across app restarts.
- Transcript keyboard toolbar clear action.
- Scroll-to-bottom button in history.

### Changed
- Quick Text editing focus behavior improvements.

## [1.0.4] - 2026-02-09

### Added
- Session management capabilities:
  - create
  - switch
  - rename
  - pin/unpin
  - delete
- Full-screen settings screen with sectionized layout and save status.
- Bubble-style history layout and compact error banner.
- URL auto-link support in markdown responses.
- Runtime logic tests and debug info panel.
- Haptic feedback for bottom action buttons.

### Changed
- Header controls moved to settings to reduce clutter.
- Home/session layout simplified and spacing tuned for larger history viewport.
- README and screenshots refreshed.

### Fixed
- Quick Text fields stay visible with keyboard.
- Final assistant output is preserved.
- Markdown heading rendering inside chat bubbles.

## [1.0.3] - 2026-02-08

### Added
- CI/testing hardening:
  - lint + tests in CI
  - package smoke install validation
  - npm pack dry-run and manifest restore checks

### Changed
- Documentation updates for release flow and local quality workflow.

## [1.0.2] - 2026-02-08

### Added
- Packaging split between app entry and npm publish manifest.

### Fixed
- Restored Expo app entry (`index.ts`) to resolve startup crash (`RCTDeviceEventEmitter`).

## [1.0.1] - 2026-02-08

### Added
- `EXPO_PUBLIC_DEBUG_MODE` environment toggle for debug warnings/panel visibility.

### Changed
- Project slug/entry configuration and media cleanup.

[1.0.6]: https://github.com/kyaukyuai/openclaw-voice/compare/v1.0.5...v1.0.6
[1.0.5]: https://github.com/kyaukyuai/openclaw-voice/compare/v1.0.4...v1.0.5
[1.0.4]: https://github.com/kyaukyuai/openclaw-voice/compare/v1.0.3...v1.0.4
[1.0.3]: https://github.com/kyaukyuai/openclaw-voice/compare/v1.0.2...v1.0.3
[1.0.2]: https://github.com/kyaukyuai/openclaw-voice/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/kyaukyuai/openclaw-voice/compare/55122d93669e032a10822e3c6d7eef04fb86d899...v1.0.1
