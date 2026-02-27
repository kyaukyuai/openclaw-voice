import assert from 'node:assert/strict';
import test from 'node:test';

import __srcModule0 from '../src/ios-runtime/home-ui-session-selectors.ts';
const {
  resolveSessionPanelSelectors,
  resolveSettingsStatusSelectors,
  resolveSectionIconColors,
} = __srcModule0;
import __srcModule1 from '../src/ios-runtime/home-ui-history-selectors.ts';
const {
  resolveHistoryRefreshErrorMessage,
  resolveHistoryUpdatedLabel,
  resolveHistoryUiSelectors,
} = __srcModule1;
import __srcModule2 from '../src/ios-runtime/home-ui-banner-selectors.ts';
const {
  resolveActiveMissingResponseNotice,
  resolveTopBannerSelectors,
} = __srcModule2;
import __srcModule3 from '../src/ios-runtime/home-ui-bottom-status-selectors.ts';
const {
  resolveBottomStatusSelectors,
} = __srcModule3;
import __srcModule4 from '../src/ios-runtime/home-ui-composer-selectors.ts';
const {
  resolveComposerDisplaySelectors,
} = __srcModule4;
import __srcModule5 from '../src/ios-runtime/home-ui-onboarding-selectors.ts';
const {
  resolveGatewayDiagnosticIconName,
  resolveOnboardingDiagnosticSelectors,
} = __srcModule5;

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

test('composer selectors compute keyboard and quick text ui flags', () => {
  const result = resolveComposerDisplaySelectors({
    transcript: ' draft ',
    interimTranscript: '',
    isRecognizing: false,
    quickTextLeft: 'left',
    quickTextRight: '',
    focusedField: 'transcript',
    shouldShowSettingsScreen: false,
    isKeyboardVisible: true,
    isSending: false,
    settingsReady: true,
    quickTextTooltipSide: 'left',
    speechRecognitionSupported: true,
  });

  assert.equal(result.canSendDraft, true);
  assert.equal(result.showKeyboardActionBar, true);
  assert.equal(result.showHistoryCard, false);
  assert.equal(result.canUseQuickTextLeft, true);
  assert.equal(result.canUseQuickTextRight, false);
  assert.equal(result.transcriptPlaceholder, 'Type your message.');
});

test('onboarding selectors compute readiness and diagnostic icon', () => {
  assert.equal(
    resolveGatewayDiagnosticIconName({ kind: 'auth' }),
    'key-outline',
  );

  const result = resolveOnboardingDiagnosticSelectors({
    settingsReady: true,
    isOnboardingCompleted: false,
    gatewayUrl: 'wss://example.com',
    isGatewayConnected: false,
    chatTurns: [
      {
        id: 't1',
        createdAt: 1,
        state: 'complete',
        userText: 'hi',
        assistantText: 'done',
      },
    ],
    isGatewayConnecting: false,
    isSending: false,
    isOnboardingWaitingForResponse: false,
    gatewayConnectDiagnostic: { kind: 'network' },
  });

  assert.equal(result.showOnboardingGuide, true);
  assert.equal(result.isOnboardingGatewayConfigured, true);
  assert.equal(result.canRunOnboardingConnectTest, true);
  assert.equal(result.canRunOnboardingSampleSend, false);
  assert.equal(result.showGatewayDiagnostic, true);
  assert.equal(result.gatewayDiagnosticIconName, 'cloud-offline-outline');
});
