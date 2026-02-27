import assert from 'node:assert/strict';
import test from 'node:test';

import __srcModule0 from '../src/ios-runtime/app-presentation-wiring-inputs-logic.ts';
const {
  buildAppContentWiringInput,
  buildKeyboardUiRuntimeInput,
  buildAppViewModelWiringInput,
} = __srcModule0;

function createPresentationDeps(overrides = {}) {
  const noop = () => {};
  const createStateProxy = (seed = {}) =>
    new Proxy({ ...seed }, {
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
        if (typeof prop === 'string' && (prop.startsWith('is') || prop.startsWith('should'))) {
          target[prop] = false;
          return false;
        }
        target[prop] = `${String(prop)}-value`;
        return target[prop];
      },
    });

  const settings = createStateProxy({
    quickTextLeft: 'left',
    quickTextRight: 'right',
    isReady: true,
    isSaving: false,
    pendingSaveCount: 0,
    saveError: null,
    lastSavedAt: 1234,
    isOnboardingCompleted: false,
    gatewayUrl: 'wss://gateway.example',
    speechLang: 'ja-JP',
    authToken: 'token',
    quickTextLeftIcon: 'chatbubble-ellipses-outline',
    quickTextRightIcon: 'chatbubble-ellipses-outline',
    setOnboardingCompleted: noop,
  });

  const gateway = createStateProxy({
    isSessionsLoading: false,
    connectDiagnostic: { category: 'network' },
    connectionState: 'connected',
  });

  const theme = createStateProxy({
    isDark: false,
    theme: 'light',
  });

  const appState = createStateProxy({
    transcript: 'hello',
    interimTranscript: '',
    isRecognizing: false,
    focusedField: null,
    isSessionOperationPending: false,
    sessions: [{ key: 'main' }],
    sessionPreferences: {},
    sessionsError: null,
    chatTurns: [],
    outboxQueue: [{ id: 'q1' }],
    missingResponseNotice: null,
    activeSessionKey: 'main',
    historyRefreshNotice: null,
    historyLastSyncedAt: 555,
    showScrollToBottomButton: false,
    gatewayError: null,
    speechError: null,
    isOnboardingWaitingForResponse: false,
    isStartupAutoConnecting: false,
    isBottomCompletePulse: false,
    isKeyboardBarMounted: false,
    quickTextTooltipSide: null,
    isSessionPanelOpen: false,
    isSettingsPanelOpen: false,
    activeRunId: null,
    sessionRenameTargetKey: 'main',
    isSessionRenameOpen: false,
    sessionRenameDraft: '',
  });

  const gatewayRuntimeController = {
    state: {
      isSending: true,
      isSessionHistoryLoading: false,
      isMissingResponseRecoveryInFlight: false,
      gatewayEventState: 'streaming',
    },
  };

  const composerRuntime = {
    isKeyboardVisible: false,
    historyBottomInset: 120,
    composerHeight: 90,
    setComposerHeight: noop,
    setKeyboardState: noop,
  };

  const settingsUiRuntime = {
    clearQuickTextLongPressResetTimer: noop,
    scheduleQuickTextTooltipHide: noop,
    hideQuickTextTooltip: noop,
    quickTextLongPressSideRef: { current: null },
    quickTextLongPressResetTimerRef: { current: null },
    settingsScrollRef: { current: null },
    quickTextInputRefs: { current: [] },
    ensureSettingsFieldVisible: noop,
  };

  const uiFlags = {
    shouldShowSettingsScreen: true,
    isGatewayConnected: true,
    isGatewayConnecting: false,
    canToggleSettingsPanel: true,
    canDismissSettingsScreen: true,
  };

  const runtimeWiring = {
    runtimeForContent: {
      connectGateway: noop,
      sendToGateway: noop,
      refreshSessions: noop,
      scheduleMissingResponseRecovery: noop,
      startRecognition: noop,
      stopRecognition: noop,
      loadSessionHistory: noop,
    },
    runtimeForViewModel: {
      connectGateway: noop,
      refreshSessions: noop,
      createAndSwitchSession: noop,
      switchSession: noop,
      isSessionPinned: noop,
      getSessionTitle: noop,
      startSessionRename: noop,
      toggleSessionPinned: noop,
      submitSessionRename: noop,
    },
    runtimeUiHelpers: {
      forceMaskAuthToken: noop,
      clearHistoryNoticeTimer: noop,
      showHistoryRefreshNotice: noop,
      scrollHistoryToBottom: noop,
      toggleAuthTokenVisibility: noop,
    },
  };

  const appContent = {
    showKeyboardActionBar: true,
    gatewayDiagnosticIconName: 'wifi',
  };

  const keyboardBarAnim = { __type: 'anim' };

  const base = {
    settings,
    gateway,
    theme,
    appState,
    gatewayRuntimeController,
    composerRuntime,
    settingsUiRuntime,
    uiFlags,
    runtimeWiring,
    appContent,
    keyboardBarAnim,
  };

  return { ...base, ...overrides };
}

test('buildAppContentWiringInput maps home/runtime/handler dependencies', () => {
  const deps = createPresentationDeps();
  const result = buildAppContentWiringInput(deps);

  assert.equal(
    result.runtimeActions.connectGateway,
    deps.runtimeWiring.runtimeForContent.connectGateway,
  );
  assert.equal(
    result.runtimeActions.sendToGateway,
    deps.runtimeWiring.runtimeForContent.sendToGateway,
  );
  assert.equal(result.homeUiStateInput.outboxQueueLength, deps.appState.outboxQueue.length);
  assert.equal(
    result.gatewayActionHandlersHomeUiBaseInput.forceMaskAuthToken,
    deps.runtimeWiring.runtimeUiHelpers.forceMaskAuthToken,
  );
  assert.equal(
    result.gatewayActionHandlersInput.quickTextInput.scheduleQuickTextTooltipHide,
    deps.settingsUiRuntime.scheduleQuickTextTooltipHide,
  );
  assert.equal(typeof result.homeUiStateInput.formatClockLabel, 'function');
  assert.equal(typeof result.homeUiStateInput.getHistoryDayLabel, 'function');
});

test('buildKeyboardUiRuntimeInput maps keyboard bridge dependencies', () => {
  const deps = createPresentationDeps();
  const result = buildKeyboardUiRuntimeInput({
    appContent: deps.appContent,
    composerRuntime: deps.composerRuntime,
    appState: deps.appState,
  });

  assert.equal(result.showKeyboardActionBar, true);
  assert.equal(result.setKeyboardState, deps.composerRuntime.setKeyboardState);
  assert.equal(
    result.setIsKeyboardBarMounted,
    deps.appState.setIsKeyboardBarMounted,
  );
});

test('buildAppViewModelWiringInput maps runtime view-model actions and UI fields', () => {
  const deps = createPresentationDeps();
  const result = buildAppViewModelWiringInput(deps);

  assert.equal(result.appContent, deps.appContent);
  assert.equal(result.keyboardBarAnim, deps.keyboardBarAnim);
  assert.equal(
    result.runtimeActions.connectGateway,
    deps.runtimeWiring.runtimeForViewModel.connectGateway,
  );
  assert.equal(
    result.runtimeActions.submitSessionRename,
    deps.runtimeWiring.runtimeForViewModel.submitSessionRename,
  );
  assert.equal(result.ui.gatewayDiagnosticIconName, deps.appContent.gatewayDiagnosticIconName);
  assert.equal(
    result.ui.toggleAuthTokenVisibility,
    deps.runtimeWiring.runtimeUiHelpers.toggleAuthTokenVisibility,
  );
  assert.equal(typeof result.ui.formatSessionUpdatedAt, 'function');
  assert.ok(result.ui.formatSessionUpdatedAt(Date.now()).length > 0);
  assert.equal(result.ui.isGatewayConnected, deps.uiFlags.isGatewayConnected);
  assert.equal(result.ui.connectionState, deps.gateway.connectionState);
});
