import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  resolveSessionPanelSelectors,
  resolveSettingsStatusSelectors,
  resolveSectionIconColors,
} = require('../src/ios-runtime/home-ui-session-selectors.js');
const {
  resolveHistoryRefreshErrorMessage,
  resolveHistoryUpdatedLabel,
  resolveHistoryUiSelectors,
} = require('../src/ios-runtime/home-ui-history-selectors.js');
const {
  resolveActiveMissingResponseNotice,
  resolveTopBannerSelectors,
} = require('../src/ios-runtime/home-ui-banner-selectors.js');
const {
  resolveBottomStatusSelectors,
} = require('../src/ios-runtime/home-ui-bottom-status-selectors.js');

test('session selectors map action availability and status text', () => {
  const result = resolveSessionPanelSelectors({
    isSending: false,
    isSessionOperationPending: false,
    isGatewayConnected: true,
    isSessionsLoading: false,
    sessionsError: null,
    sessionsCount: 2,
    visibleSessionsCount: 2,
  });

  assert.equal(result.canSwitchSession, true);
  assert.equal(result.canRefreshSessions, true);
  assert.equal(result.sessionPanelStatusText, '2 sessions');
  assert.equal(result.sessionListHintText, null);
});

test('settings selectors expose pending and saved states', () => {
  const result = resolveSettingsStatusSelectors({
    settingsReady: true,
    isSettingsSaving: false,
    settingsPendingSaveCount: 0,
    settingsSaveError: null,
    settingsLastSavedAt: 10,
    formatClockLabel: () => '12:34',
  });

  assert.equal(result.settingsStatusText, 'Saved 12:34');
  assert.equal(result.isSettingsStatusError, false);
  assert.equal(result.isSettingsStatusPending, false);
  assert.equal(resolveSectionIconColors(true).sectionIconColor, '#9eb1d2');
});

test('history selectors compute labels and bottom padding', () => {
  assert.equal(
    resolveHistoryRefreshErrorMessage({ kind: 'error', message: 'sync failed' }),
    'sync failed',
  );
  assert.equal(resolveHistoryUpdatedLabel(100, () => '10:00'), 'Updated 10:00');

  const ui = resolveHistoryUiSelectors({
    showHistoryCard: true,
    showHistorySecondaryUi: true,
    historyUpdatedLabel: 'Updated 10:00',
    historyBottomInset: 40,
    showScrollToBottomButton: true,
    isHomeComposingMode: false,
  });

  assert.equal(ui.showHistoryUpdatedMeta, true);
  assert.equal(ui.historyListBottomPadding, 68);
  assert.equal(ui.showHistoryDateDivider, true);
  assert.equal(ui.showHistoryScrollButton, true);
});

test('banner selectors prioritize gateway error and match session notices', () => {
  const notice = { sessionKey: 'main', message: 'retry', turnId: 't1', attempt: 1 };
  assert.equal(resolveActiveMissingResponseNotice(notice, 'main')?.message, 'retry');
  assert.equal(resolveActiveMissingResponseNotice(notice, 'other'), null);

  const banner = resolveTopBannerSelectors({
    gatewayError: 'network error',
    activeMissingResponseNotice: notice,
    historyRefreshErrorMessage: 'sync failed',
    speechError: 'speech failed',
  });

  assert.equal(banner.topBannerKind, 'gateway');
  assert.equal(banner.topBannerMessage, 'network error');
  assert.equal(banner.topBannerIconName, 'cloud-offline-outline');
});

test('bottom status selectors derive disconnected and sending details', () => {
  const baseInput = {
    isRecognizing: false,
    isSending: false,
    activeMissingResponseNotice: null,
    outboxQueueLength: 0,
    connectionState: 'disconnected',
    gatewayError: null,
    speechError: null,
    historyRefreshErrorMessage: null,
    isGatewayConnected: false,
    isGatewayConnecting: false,
    isStartupAutoConnecting: false,
    isBottomCompletePulse: false,
    isStreamingGatewayEvent: false,
    isMissingResponseRecoveryInFlight: false,
    canSendDraft: false,
    speechRecognitionSupported: true,
    speechUnsupportedMessage: 'unsupported',
    isKeyboardBarMounted: false,
    isHomeComposingMode: false,
    bottomActionStatusLabels: {
      disconnected: 'Disconnected',
      connecting: 'Connecting',
      ready: 'Ready',
      recording: 'Recording',
      sending: 'Sending',
      retrying: 'Retrying',
      complete: 'Complete',
      error: 'Error',
    },
    connectionLabels: {
      disconnected: 'Disconnected',
      connecting: 'Connecting',
      connected: 'Connected',
      reconnecting: 'Connecting',
    },
  };

  const disconnected = resolveBottomStatusSelectors(baseInput);

  assert.equal(disconnected.bottomActionStatus, 'disconnected');
  assert.equal(disconnected.bottomActionDetailText, 'Connect Gateway');

  const sending = resolveBottomStatusSelectors({
    ...baseInput,
    isSending: true,
    isGatewayConnected: true,
    connectionState: 'connected',
    isStreamingGatewayEvent: true,
  });
  assert.equal(sending.bottomActionStatus, 'sending');
  assert.equal(sending.bottomActionDetailText, 'Streaming response');
});
