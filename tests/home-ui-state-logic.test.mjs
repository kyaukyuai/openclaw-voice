import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  buildVisibleSessions,
  buildHistoryItems,
  resolveLatestRetryText,
  resolveGatewayDiagnosticIconName,
  buildHomeUiStateSnapshot,
} = require('../src/ios-runtime/home-ui-state-logic.js');

function now(offset = 0) {
  return 1_700_000_000_000 + offset;
}

test('buildVisibleSessions keeps active first then pinned then updated order', () => {
  const sessions = [
    { key: 'b', updatedAt: now(20) },
    { key: 'a', updatedAt: now(30) },
    { key: 'c', updatedAt: now(10) },
  ];
  const prefs = {
    c: { pinned: true },
  };

  const result = buildVisibleSessions(sessions, 'main', prefs);
  assert.equal(result[0].key, 'main');
  assert.equal(result[1].key, 'c');
  assert.equal(result[2].key, 'a');
  assert.equal(result[3].key, 'b');
});

test('buildHistoryItems inserts date divider before first turn per day', () => {
  const dayKey = (ts) => `d${Math.floor(ts / 10)}`;
  const dayLabel = (ts) => `Day ${Math.floor(ts / 10)}`;

  const turns = [
    { id: 't1', createdAt: 10, state: 'complete', userText: 'u', assistantText: 'a' },
    { id: 't2', createdAt: 12, state: 'complete', userText: 'u', assistantText: 'a' },
    { id: 't3', createdAt: 25, state: 'complete', userText: 'u', assistantText: 'a' },
  ];

  const items = buildHistoryItems(turns, dayKey, dayLabel);
  assert.equal(items[0].kind, 'date');
  assert.equal(items[1].kind, 'turn');
  assert.equal(items[2].kind, 'turn');
  assert.equal(items[3].kind, 'date');
  assert.equal(items[4].kind, 'turn');
  assert.equal(items[4].isLast, true);
});

test('resolveLatestRetryText prefers current draft then latest failed turn', () => {
  const turns = [
    { id: 't1', createdAt: 1, state: 'complete', userText: 'ok', assistantText: 'ok' },
    { id: 't2', createdAt: 2, state: 'error', userText: 'retry me', assistantText: '' },
  ];

  assert.equal(resolveLatestRetryText(turns, '  draft  ', ''), 'draft');
  assert.equal(resolveLatestRetryText(turns, '', ''), 'retry me');
});

test('resolveGatewayDiagnosticIconName maps known kinds and fallback', () => {
  assert.equal(resolveGatewayDiagnosticIconName({ kind: 'tls' }), 'shield-checkmark-outline');
  assert.equal(resolveGatewayDiagnosticIconName({ kind: 'network' }), 'cloud-offline-outline');
  assert.equal(resolveGatewayDiagnosticIconName({ kind: 'unknown' }), 'alert-circle-outline');
});

test('buildHomeUiStateSnapshot resolves top banner and bottom states', () => {
  const input = {
    transcript: '',
    interimTranscript: '',
    isRecognizing: false,
    quickTextLeft: ' left ',
    quickTextRight: ' right ',
    focusedField: null,
    shouldShowSettingsScreen: false,
    isKeyboardVisible: false,
    isSending: false,
    settingsReady: true,
    isSessionOperationPending: false,
    isGatewayConnected: false,
    isSessionsLoading: false,
    sessions: [{ key: 'main', updatedAt: now(1) }],
    sessionPreferences: {},
    sessionsError: null,
    isSettingsSaving: false,
    settingsPendingSaveCount: 0,
    settingsSaveError: null,
    settingsLastSavedAt: now(5),
    isDarkTheme: false,
    isOnboardingCompleted: true,
    gatewayUrl: 'wss://example.com',
    chatTurns: [],
    isGatewayConnecting: false,
    isOnboardingWaitingForResponse: false,
    gatewayConnectDiagnostic: { kind: 'auth' },
    outboxQueueLength: 0,
    missingResponseNotice: null,
    activeSessionKey: 'main',
    isMissingResponseRecoveryInFlight: false,
    historyRefreshNotice: { kind: 'error', message: 'refresh failed' },
    historyLastSyncedAt: now(20),
    historyBottomInset: 64,
    showScrollToBottomButton: true,
    gatewayError: null,
    speechError: null,
    gatewayEventState: 'idle',
    connectionState: 'disconnected',
    isStartupAutoConnecting: false,
    isBottomCompletePulse: false,
    isKeyboardBarMounted: false,
    formatClockLabel: () => '12:00',
    getHistoryDayKey: () => 'today',
    getHistoryDayLabel: () => 'Today',
    quickTextTooltipSide: null,
  };

  const computed = {
    visibleSessions: [{ key: 'main', updatedAt: now(1) }],
    historyItems: [],
    latestRetryText: '',
  };

  const result = buildHomeUiStateSnapshot(input, computed);
  assert.equal(result.quickTextLeftLabel, 'left');
  assert.equal(result.quickTextRightLabel, 'right');
  assert.equal(result.topBannerKind, 'history');
  assert.equal(result.topBannerMessage, 'refresh failed');
  assert.equal(result.showHistoryUpdatedMeta, true);
  assert.equal(result.historyListBottomPadding, 92);
  assert.equal(result.bottomActionStatus, 'error');
});
