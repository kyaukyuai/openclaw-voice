# Release Readiness Checklist

This checklist is the release gate for OpenClaw Voice.
Run it in order from top to bottom.

## 0. Preflight (must pass first)

- [ ] Working tree is clean (`git status --short` is empty).
- [ ] `main` is up to date with remote (`git pull --ff-only`).
- [ ] Release scope is explicit (iOS / macOS native / npm package).

## 1. Stability Gate

### 1.1 Automated checks

- [ ] `npm run typecheck`
- [ ] `npm run lint --if-present`
- [ ] `npm test -- --watch=false`
- [ ] `npm --prefix apps/macos-native run lint`
- [ ] `npm --prefix apps/macos-native run lint:baseline`
- [ ] `npm --prefix apps/macos-native run test -- --watch=false`
- [ ] `npm --prefix apps/macos-native run test:e2e`
- [ ] `npm run web:check`
- [ ] `npm run smoke:pack-install`

### 1.2 iOS runtime manual checks

- [ ] Connect -> send -> complete (no `Sending...` stuck).
- [ ] Manual refresh returns to terminal state (no `Refreshing...` stuck).
- [ ] Reconnecting state still allows manual reconnect/disconnect.
- [ ] Keyboard open/close does not clip latest history line.
- [ ] Session switch keeps draft/quick text behavior.

### 1.3 macOS native manual checks

- [ ] Connect / reconnect / disconnect all work.
- [ ] Session selection and unread state are correct.
- [ ] Composer shortcuts work (`Enter`, `Cmd+Enter`, `Cmd+R`, `Esc`).
- [ ] Quick Text insert works and focus returns to composer.
- [ ] Attachment picker/import/send path works.
- [ ] Notification path does not block normal send/sync operations.

### 1.4 Stability acceptance

- [ ] P0/P1 known bugs: zero.
- [ ] No residual terminal-state regressions (`Sending...` / `Refreshing...`).

## 2. Security Gate

### 2.1 Secrets and transport

- [ ] No real gateway token in repository or screenshots.
- [ ] Default connection path uses `wss://` only.
- [ ] Token display stays masked by default in settings UI.

### 2.2 Dependency and leak checks

- [ ] `npm audit --omit=dev --audit-level=high` reviewed (no unresolved high/critical for release target).
- [ ] Secret scanning enabled in CI (or run equivalent scanner pre-release).
- [ ] Release logs/artifacts do not expose credentials.

### 2.3 Operational hardening

- [ ] Credential rotation plan is documented for production gateways.
- [ ] Public exposure path follows: private network -> authenticated tunnel -> hardened proxy.

## 3. Operations Gate

### 3.1 Release process validation

- [ ] `npm run doctor:release`
- [ ] `npm run check:release-docs`
- [ ] `.github/workflows/release.yml` trigger/permissions are valid.
- [ ] Branch protection for `main` requires status check `Release / verify`.

### 3.2 Documentation readiness

- [ ] `README.md` commands and package version are aligned.
- [ ] `CHANGELOG.md` has the target version section.
- [ ] `docs/TROUBLESHOOTING.md` includes latest known failure modes.

### 3.3 Reproducibility

- [ ] A second operator can run build + checks from clean clone.
- [ ] Rollback plan is defined (tag rollback + npm version policy).

## 4. Go / No-Go Decision

Release only when all items in sections 1-3 are checked.

- [ ] GO: all gates passed.
- [ ] NO-GO: at least one gate failed (record blocker and owner).

## 5. Recommended release command sequence

```bash
git pull --ff-only
npm ci
npm run doctor:release
npm run typecheck
npm run lint --if-present
npm test -- --watch=false
npm --prefix apps/macos-native run lint
npm --prefix apps/macos-native run test -- --watch=false
npm --prefix apps/macos-native run test:e2e
npm run web:check
npm run smoke:pack-install
npm version patch -m "chore(release): %s"
git push
git push --tags
```
