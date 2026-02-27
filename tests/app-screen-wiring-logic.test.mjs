import assert from 'node:assert/strict';
import test from 'node:test';

import __srcModule0 from '../src/ios-runtime/app-screen-wiring-logic.ts';
const {
  resolveGatewayUiFlags,
  resolveSettingsRuntimeMeta,
  resolveGatewayRuntimeMeta,
} = __srcModule0;

test('resolveGatewayUiFlags handles disconnected iOS path', () => {
  const flags = resolveGatewayUiFlags({
    connectionState: 'disconnected',
    isSettingsPanelOpen: false,
    isMacRuntime: false,
  });

  assert.deepEqual(flags, {
    isGatewayConnected: false,
    isGatewayConnecting: false,
    shouldForceSettingsScreen: true,
    shouldShowSettingsScreen: true,
    canToggleSettingsPanel: false,
    canDismissSettingsScreen: false,
  });
});

test('resolveGatewayUiFlags handles connected macOS path', () => {
  const flags = resolveGatewayUiFlags({
    connectionState: 'connected',
    isSettingsPanelOpen: false,
    isMacRuntime: true,
  });

  assert.deepEqual(flags, {
    isGatewayConnected: true,
    isGatewayConnecting: false,
    shouldForceSettingsScreen: false,
    shouldShowSettingsScreen: false,
    canToggleSettingsPanel: true,
    canDismissSettingsScreen: true,
  });
});

test('resolveGatewayUiFlags keeps settings panel visible on macOS while reconnecting', () => {
  const flags = resolveGatewayUiFlags({
    connectionState: 'reconnecting',
    isSettingsPanelOpen: true,
    isMacRuntime: true,
  });

  assert.equal(flags.isGatewayConnecting, true);
  assert.equal(flags.shouldShowSettingsScreen, true);
  assert.equal(flags.canToggleSettingsPanel, true);
});

test('resolveSettingsRuntimeMeta maps settings persistence state', () => {
  const meta = resolveSettingsRuntimeMeta({
    isReady: true,
    isSaving: false,
    pendingSaveCount: 2,
    lastSavedAt: 123,
    saveError: 'oops',
  });

  assert.deepEqual(meta, {
    settingsReady: true,
    isSettingsSaving: false,
    settingsPendingSaveCount: 2,
    settingsLastSavedAt: 123,
    settingsSaveError: 'oops',
  });
});

test('resolveGatewayRuntimeMeta maps gateway runtime state', () => {
  const sessions = [{ key: 'main' }];
  const diagnostic = { category: 'network' };

  const meta = resolveGatewayRuntimeMeta({
    isSessionsLoading: true,
    connectDiagnostic: diagnostic,
    sessions,
    sessionsError: 'busy',
  });

  assert.equal(meta.isSessionsLoading, true);
  assert.equal(meta.gatewayConnectDiagnostic, diagnostic);
  assert.equal(meta.gatewaySessions, sessions);
  assert.equal(meta.gatewaySessionsError, 'busy');
});
