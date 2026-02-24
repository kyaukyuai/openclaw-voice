import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  buildRuntimeUiHelpersInput,
  buildRuntimeOrchestratorInput,
  buildRuntimeSideEffectsInput,
} = require('../src/ios-runtime/app-runtime-wiring-inputs-logic.js');

function createRuntimeDeps(overrides = {}) {
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

  const gateway = createStateProxy({
    connectionState: 'connected',
    refreshSessions: () => Promise.resolve(),
    chatHistory: () => Promise.resolve([]),
    patchSession: () => Promise.resolve(),
    chatSend: () => Promise.resolve(),
    checkHealth: () => Promise.resolve(true),
    sessions: [{ key: 'main' }],
    sessionsError: null,
  });

  const settings = createStateProxy({
    gatewayUrl: 'wss://example.gateway',
    authToken: 'token',
    isReady: true,
    speechLang: 'ja-JP',
    isOnboardingCompleted: false,
    setOnboardingCompleted: noop,
  });

  const appState = createStateProxy({
    isSessionOperationPending: false,
    sessionRenameTargetKey: 'main',
    sessionRenameDraft: 'draft',
    sessionPreferences: {},
    sessions: [{ key: 'main' }],
    activeSessionKey: 'main',
    chatTurns: [],
    outboxQueue: [],
    transcript: '',
    interimTranscript: '',
    isOnboardingWaitingForResponse: false,
    missingResponseNotice: null,
    localStateReady: true,
    isRecognizing: false,
  });

  const gatewayRuntimeController = {
    state: {
      isSending: true,
      gatewayEventState: 'streaming',
    },
    runAction: noop,
    setIsSending: noop,
    setGatewayEventState: noop,
    setIsMissingResponseRecoveryInFlight: noop,
  };

  const historyRuntime = {
    runHistoryRefresh: () => Promise.resolve(),
    invalidateRefreshEpoch: noop,
  };

  const settingsUiRuntime = {
    settingsFocusScrollTimerRef: { current: null },
    quickTextTooltipTimerRef: { current: null },
    quickTextLongPressResetTimerRef: { current: null },
    quickTextLongPressSideRef: { current: null },
  };

  const runtimeUiHelpers = {
    clearMissingResponseRecoveryTimer: noop,
    clearFinalResponseRecoveryTimer: noop,
    clearMissingResponseRecoveryState: noop,
    clearStartupAutoConnectRetryTimer: noop,
    clearBottomCompletePulseTimer: noop,
    clearOutboxRetryTimer: noop,
    forceMaskAuthToken: noop,
    runGatewayHealthCheck: () => Promise.resolve(true),
    scrollHistoryToBottom: noop,
    persistRuntimeSetting: noop,
  };

  const runtimeActions = {
    connectGateway: noop,
    disconnectGateway: noop,
  };

  const uiFlags = {
    isGatewayConnected: true,
    shouldShowSettingsScreen: false,
  };

  const kvStore = {
    getItemAsync: async () => null,
    setItemAsync: async () => {},
    deleteItemAsync: async () => {},
  };

  const base = {
    settings,
    gateway,
    appState,
    gatewayRuntimeController,
    historyRuntime,
    settingsUiRuntime,
    runtimeUiHelpers,
    runtimeActions,
    uiFlags,
    kvStore,
    openClawIdentityMemory: new Map(),
  };

  return { ...base, ...overrides };
}

test('buildRuntimeOrchestratorInput maps runtime references and helpers', () => {
  const deps = createRuntimeDeps();
  const result = buildRuntimeOrchestratorInput(deps);

  assert.equal(result.setChatTurns, deps.appState.setChatTurns);
  assert.equal(
    result.sessionHistoryInput.connectionStateRef,
    deps.appState.connectionStateRef,
  );
  assert.equal(
    result.sessionHistoryInput.gatewayRefreshSessions,
    deps.gateway.refreshSessions,
  );
  assert.equal(
    result.gatewayConnectionFlowInput.forceMaskAuthToken,
    deps.runtimeUiHelpers.forceMaskAuthToken,
  );
  assert.equal(
    result.outboxRuntimeInput.gatewaySendChat,
    deps.gateway.chatSend,
  );
  assert.equal(
    result.outboxRuntimeInput.runGatewayHealthCheck,
    deps.runtimeUiHelpers.runGatewayHealthCheck,
  );
  assert.equal(result.sessionActionsInput.isGatewayConnected, true);
  assert.equal(result.speechRuntimeInput.speechLang, deps.settings.speechLang);
  assert.equal(result.sessionRuntimeInput.isTurnWaitingState('streaming'), true);
});

test('buildRuntimeUiHelpersInput maps health/timer refs and setter functions', () => {
  const deps = createRuntimeDeps();
  const result = buildRuntimeUiHelpersInput(deps);

  assert.equal(result.historyNoticeTimerRef, deps.appState.historyNoticeTimerRef);
  assert.equal(result.connectionStateRef, deps.appState.connectionStateRef);
  assert.equal(result.historyAutoScrollRef, deps.appState.historyAutoScrollRef);
  assert.equal(result.gatewayCheckHealth, deps.gateway.checkHealth);
  assert.equal(
    result.setIsMissingResponseRecoveryInFlight,
    deps.gatewayRuntimeController.setIsMissingResponseRecoveryInFlight,
  );
  assert.equal(result.setMissingResponseNotice, deps.appState.setMissingResponseNotice);
});

test('buildRuntimeSideEffectsInput wires persistence and lifecycle constants', () => {
  const deps = createRuntimeDeps({
    uiFlags: {
      isGatewayConnected: true,
      shouldShowSettingsScreen: true,
    },
  });
  const result = buildRuntimeSideEffectsInput(deps);

  assert.equal(result.uiEffectsInput.shouldShowSettingsScreen, true);
  assert.equal(
    result.uiEffectsInput.forceMaskAuthToken,
    deps.runtimeUiHelpers.forceMaskAuthToken,
  );
  assert.equal(
    result.persistenceEffectsInput.sessionKeyStorageKey,
    'mobile-openclaw.session-key',
  );
  assert.equal(
    result.persistenceEffectsInput.identityStorageKey,
    'openclaw_device_identity',
  );
  assert.equal(result.persistenceEffectsInput.defaultSessionKey, 'main');
  assert.deepEqual(
    result.persistenceEffectsInput.parseOutboxQueue('[]'),
    [],
  );
  assert.deepEqual(
    result.persistenceEffectsInput.parseSessionPreferences(
      '{"main":{"alias":"alpha","pinned":true}}',
    ),
    { main: { alias: 'alpha', pinned: true } },
  );
  assert.equal(result.lifecycleInput.connectGateway, deps.runtimeActions.connectGateway);
  assert.equal(
    result.lifecycleInput.settingsFocusScrollTimerRef,
    deps.settingsUiRuntime.settingsFocusScrollTimerRef,
  );
});
