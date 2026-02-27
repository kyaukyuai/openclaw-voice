import assert from 'node:assert/strict';
import test from 'node:test';

import __srcModule0 from '../src/ios-runtime/app-view-model-wiring-inputs-logic.ts';
const {
  buildUseAppViewModelInput,
} = __srcModule0;

function createStateProxy(seed = {}) {
  const noop = () => {};
  return new Proxy({ ...seed }, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (typeof prop === 'string' && prop.endsWith('Ref')) {
        const value = { current: `${prop}-current` };
        target[prop] = value;
        return value;
      }
      if (typeof prop === 'string' && prop.startsWith('set')) {
        target[prop] = noop;
        return target[prop];
      }
      if (typeof prop === 'string' && prop.startsWith('handle')) {
        target[prop] = noop;
        return target[prop];
      }
      if (typeof prop === 'string' && (prop.startsWith('is') || prop.startsWith('can') || prop.startsWith('should') || prop.startsWith('show'))) {
        target[prop] = false;
        return false;
      }
      target[prop] = `${String(prop)}-value`;
      return target[prop];
    },
  });
}

function createInput(overrides = {}) {
  const connectGateway = () => Promise.resolve();
  const refreshSessions = () => Promise.resolve();

  const wiringInput = {
    appContent: createStateProxy({
      connectionStatusLabel: 'Connected',
      topBannerMessage: undefined,
      historyItems: [{ key: 'turn-1' }],
      historyListBottomPadding: 132,
      transcriptPlaceholder: 'Type here',
      quickTextLeftLabel: 'Left',
      quickTextRightLabel: 'Right',
      bottomActionStatus: 'ready',
      bottomActionStatusLabel: 'Ready',
      bottomActionDetailText: 'Hold to record',
    }),
    runtimeActions: createStateProxy({
      connectGateway,
      refreshSessions,
      createAndSwitchSession: () => Promise.resolve(),
      switchSession: () => Promise.resolve(),
      isSessionPinned: () => false,
      getSessionTitle: () => 'Main',
      startSessionRename: () => {},
      toggleSessionPinned: () => {},
      submitSessionRename: () => Promise.resolve(),
    }),
    keyboardBarAnim: { __type: 'keyboard-anim' },
    ui: createStateProxy({
      isDarkTheme: true,
      isGatewayConnected: true,
      isGatewayConnecting: false,
      isSessionPanelOpen: true,
      isSettingsPanelOpen: false,
      canToggleSettingsPanel: true,
      shouldShowSettingsScreen: true,
      canDismissSettingsScreen: true,
      isKeyboardVisible: false,
      isRecognizing: false,
      isSending: true,
      isSessionHistoryLoading: true,
      isMissingResponseRecoveryInFlight: false,
      isKeyboardBarMounted: false,
      showScrollToBottomButton: true,
      isOnboardingWaitingForResponse: false,
      transcript: 'hello',
      interimTranscript: 'wor',
      historyScrollRef: { current: null },
      isSessionsLoading: false,
      settingsScrollRef: { current: null },
      focusedField: null,
      gatewayUrl: 'wss://gateway.example.com',
      authToken: 'token',
      isAuthTokenMasked: true,
      settingsReady: true,
      isStartupAutoConnecting: false,
      gatewayDiagnosticIconName: 'wifi',
      gatewayConnectDiagnostic: { category: 'network' },
      theme: 'dark',
      speechLang: 'ja-JP',
      quickTextInputRefs: { current: [] },
      quickTextLeft: 'L',
      quickTextRight: 'R',
      quickTextLeftIcon: 'chatbubble-ellipses-outline',
      quickTextRightIcon: 'chatbubble-ellipses-outline',
      connectionState: 'connected',
      gatewayEventState: 'streaming',
      activeSessionKey: 'main',
      activeRunId: 'run-1',
      historyLastSyncedAt: 123,
      startupAutoConnectAttempt: 0,
      sessionRenameTargetKey: 'main',
      isSessionRenameOpen: false,
      sessionRenameDraft: 'draft',
      isSessionOperationPending: false,
      sessionsError: 'network-error',
      formatSessionUpdatedAt: () => '12:34',
    }),
  };

  return {
    wiringInput: {
      ...wiringInput,
      ...overrides.wiringInput,
      appContent: overrides.wiringInput?.appContent ?? wiringInput.appContent,
      runtimeActions:
        overrides.wiringInput?.runtimeActions ?? wiringInput.runtimeActions,
      ui: overrides.wiringInput?.ui ?? wiringInput.ui,
    },
    styles: overrides.styles ?? { root: true },
    placeholderColor: overrides.placeholderColor ?? '#95a8ca',
    maxTextScale: overrides.maxTextScale ?? 1.2,
    maxTextScaleTight: overrides.maxTextScaleTight ?? 1.1,
    enableDebugWarnings: overrides.enableDebugWarnings ?? false,
  };
}

test('buildUseAppViewModelInput maps core connection/settings/session wiring', () => {
  const input = createInput();
  const result = buildUseAppViewModelInput(input);

  assert.equal(result.styles, input.styles);
  assert.equal(result.isDarkTheme, input.wiringInput.ui.isDarkTheme);
  assert.equal(result.placeholderColor, input.placeholderColor);
  assert.equal(result.maxTextScale, input.maxTextScale);
  assert.equal(result.maxTextScaleTight, input.maxTextScaleTight);

  assert.equal(
    result.connectionHeader.connectionLabel,
    input.wiringInput.appContent.connectionStatusLabel,
  );
  assert.equal(
    result.settingsPanelContent.connectGateway,
    input.wiringInput.runtimeActions.connectGateway,
  );
  assert.equal(
    result.settingsPanelContent.enableDebugWarnings,
    input.enableDebugWarnings,
  );
  assert.equal(
    result.sessionsScreenModal.visible,
    input.wiringInput.ui.isGatewayConnected &&
      input.wiringInput.ui.isSessionPanelOpen,
  );
  assert.equal(result.sessionsScreenModal.hasSessionsError, true);

  assert.equal(result.homeMainLayout.keyboardBarAnim, input.wiringInput.keyboardBarAnim);
  assert.equal(result.homeMainLayout.transcript, input.wiringInput.ui.transcript);
  assert.equal(
    result.homeMainLayout.historyListBottomPadding,
    input.wiringInput.appContent.historyListBottomPadding,
  );
  assert.equal(result.homeMainLayout.topBannerMessage, null);
});

test('buildUseAppViewModelInput coerces session error to false and preserves refs/actions', () => {
  const ui = createStateProxy({
    isGatewayConnected: false,
    isSessionPanelOpen: true,
    sessionsError: null,
    historyScrollRef: { current: 'history-ref' },
    settingsScrollRef: { current: 'settings-ref' },
  });
  const appContent = createStateProxy({
    topBannerMessage: 'warning',
    handleRefreshHistory: () => 'refresh',
  });

  const input = createInput({
    wiringInput: {
      ui,
      appContent,
    },
  });

  const result = buildUseAppViewModelInput(input);

  assert.equal(result.sessionsScreenModal.hasSessionsError, false);
  assert.equal(result.sessionsScreenModal.visible, false);
  assert.equal(result.settingsScreenModal.settingsScrollRef, ui.settingsScrollRef);
  assert.equal(result.homeMainLayout.historyScrollRef, ui.historyScrollRef);
  assert.equal(result.homeMainLayout.onRefreshHistory, appContent.handleRefreshHistory);
  assert.equal(result.homeMainLayout.topBannerMessage, 'warning');
});
