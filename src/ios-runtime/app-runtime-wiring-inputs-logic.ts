import {
  OPENCLAW_IDENTITY_STORAGE_KEY,
  STORAGE_KEYS,
} from '../types';
import {
  DEFAULT_SESSION_KEY,
  getKvStore,
} from '../utils';
import type { GatewayContextValue, SettingsContextValue } from '../contexts';
import { isTurnWaitingState, parseOutboxQueue, parseSessionPreferences } from './app-runtime-pure';
import type { GatewayUiFlags } from './app-screen-wiring-logic';
import type { useAppRuntimeOrchestrator } from './useAppRuntimeOrchestrator';
import type { useAppRuntimeSideEffects } from './useAppRuntimeSideEffects';
import type { useAppRuntimeState } from './useAppRuntimeState';
import type { useGatewayRuntime } from './useGatewayRuntime';
import type { useHistoryRuntime } from './useHistoryRuntime';
import type { useRuntimeUiHelpers } from './useRuntimeUiHelpers';
import type { useSettingsUiRuntime } from './useSettingsUiRuntime';

type AppRuntimeState = ReturnType<typeof useAppRuntimeState>;
type GatewayRuntimeController = ReturnType<typeof useGatewayRuntime>;
type HistoryRuntimeState = ReturnType<typeof useHistoryRuntime>;
type RuntimeUiHelpers = ReturnType<typeof useRuntimeUiHelpers>;
type SettingsUiRuntimeState = ReturnType<typeof useSettingsUiRuntime>;
type RuntimeActions = ReturnType<typeof useAppRuntimeOrchestrator>;
type RuntimeOrchestratorInput = Parameters<typeof useAppRuntimeOrchestrator>[0];
type RuntimeSideEffectsInput = Parameters<typeof useAppRuntimeSideEffects>[0];

type BuildRuntimeOrchestratorInput = {
  settings: SettingsContextValue;
  gateway: GatewayContextValue;
  appState: AppRuntimeState;
  gatewayRuntimeController: GatewayRuntimeController;
  historyRuntime: HistoryRuntimeState;
  runtimeUiHelpers: RuntimeUiHelpers;
  uiFlags: GatewayUiFlags;
};

type BuildRuntimeSideEffectsInput = {
  settings: SettingsContextValue;
  gateway: GatewayContextValue;
  appState: AppRuntimeState;
  gatewayRuntimeController: GatewayRuntimeController;
  historyRuntime: HistoryRuntimeState;
  settingsUiRuntime: SettingsUiRuntimeState;
  runtimeUiHelpers: RuntimeUiHelpers;
  runtimeActions: RuntimeActions;
  uiFlags: GatewayUiFlags;
  kvStore: ReturnType<typeof getKvStore>;
  openClawIdentityMemory: Map<string, string>;
};

export function buildRuntimeOrchestratorInput(
  input: BuildRuntimeOrchestratorInput,
): RuntimeOrchestratorInput {
  const {
    settings,
    gateway,
    appState,
    gatewayRuntimeController,
    historyRuntime,
    runtimeUiHelpers,
    uiFlags,
  } = input;

  return {
    setChatTurns: appState.setChatTurns,
    sessionHistoryInput: {
      connectionState: gateway.connectionState,
      connectionStateRef: appState.connectionStateRef,
      isSending: gatewayRuntimeController.state.isSending,
      isSessionOperationPending: appState.isSessionOperationPending,
      activeSessionKeyRef: appState.activeSessionKeyRef,
      activeRunIdRef: appState.activeRunIdRef,
      pendingTurnIdRef: appState.pendingTurnIdRef,
      runIdToTurnIdRef: appState.runIdToTurnIdRef,
      sessionTurnsRef: appState.sessionTurnsRef,
      outboxQueueRef: appState.outboxQueueRef,
      gatewayRefreshSessions: gateway.refreshSessions,
      gatewayChatHistory: gateway.chatHistory,
      runHistoryRefresh: historyRuntime.runHistoryRefresh,
      runGatewayRuntimeAction: gatewayRuntimeController.runAction,
      invalidateRefreshEpoch: historyRuntime.invalidateRefreshEpoch,
      setSessions: appState.setSessions,
      setSessionsError: appState.setSessionsError,
      setGatewayError: appState.setGatewayError,
      setChatTurns: appState.setChatTurns,
      setActiveSessionKey: appState.setActiveSessionKey,
      setFocusedField: appState.setFocusedField,
      setIsSessionRenameOpen: appState.setIsSessionRenameOpen,
      setSessionRenameTargetKey: appState.setSessionRenameTargetKey,
      setSessionRenameDraft: appState.setSessionRenameDraft,
      setIsSending: gatewayRuntimeController.setIsSending,
      setGatewayEventState: gatewayRuntimeController.setGatewayEventState,
      setHistoryLastSyncedAt: appState.setHistoryLastSyncedAt,
      setActiveRunId: appState.setActiveRunId,
    },
    sessionActionsInput: {
      connectionState: gateway.connectionState,
      isGatewayConnected: uiFlags.isGatewayConnected,
      isSessionOperationPending: appState.isSessionOperationPending,
      sessionRenameTargetKey: appState.sessionRenameTargetKey,
      sessionRenameDraft: appState.sessionRenameDraft,
      sessionPreferences: appState.sessionPreferences,
      sessions: appState.sessions,
      activeSessionKeyRef: appState.activeSessionKeyRef,
      gatewayPatchSession: gateway.patchSession,
      setSessionsError: appState.setSessionsError,
      setIsSessionOperationPending: appState.setIsSessionOperationPending,
      setSessionPreferences: appState.setSessionPreferences,
      setIsSessionRenameOpen: appState.setIsSessionRenameOpen,
      setSessionRenameTargetKey: appState.setSessionRenameTargetKey,
      setSessionRenameDraft: appState.setSessionRenameDraft,
    },
    sessionRuntimeInput: {
      historySyncTimerRef: appState.historySyncTimerRef,
      historySyncRequestRef: appState.historySyncRequestRef,
      missingResponseRecoveryTimerRef: appState.missingResponseRecoveryTimerRef,
      missingResponseRecoveryRequestRef: appState.missingResponseRecoveryRequestRef,
      finalResponseRecoveryTimerRef: appState.finalResponseRecoveryTimerRef,
      connectionStateRef: appState.connectionStateRef,
      sessionTurnsRef: appState.sessionTurnsRef,
      clearMissingResponseRecoveryTimer:
        runtimeUiHelpers.clearMissingResponseRecoveryTimer,
      clearFinalResponseRecoveryTimer:
        runtimeUiHelpers.clearFinalResponseRecoveryTimer,
      setIsMissingResponseRecoveryInFlight:
        gatewayRuntimeController.setIsMissingResponseRecoveryInFlight,
      setMissingResponseNotice: appState.setMissingResponseNotice,
      isTurnWaitingState,
    },
    gatewayEventBridgeInput: {
      activeSessionKeyRef: appState.activeSessionKeyRef,
      activeRunIdRef: appState.activeRunIdRef,
      pendingTurnIdRef: appState.pendingTurnIdRef,
      runIdToTurnIdRef: appState.runIdToTurnIdRef,
      sessionTurnsRef: appState.sessionTurnsRef,
      setGatewayEventState: gatewayRuntimeController.setGatewayEventState,
      setIsSending: gatewayRuntimeController.setIsSending,
      setActiveRunId: appState.setActiveRunId,
      isOnboardingWaitingForResponse: appState.isOnboardingWaitingForResponse,
      setIsOnboardingWaitingForResponse:
        appState.setIsOnboardingWaitingForResponse,
      setIsOnboardingCompleted: settings.setOnboardingCompleted,
      clearFinalResponseRecoveryTimer:
        runtimeUiHelpers.clearFinalResponseRecoveryTimer,
      clearMissingResponseRecoveryState:
        runtimeUiHelpers.clearMissingResponseRecoveryState,
      setGatewayError: appState.setGatewayError,
    },
    gatewayConnectionFlowInput: {
      gatewayUrl: settings.gatewayUrl,
      authToken: settings.authToken,
      settingsReady: settings.isReady,
      gatewayUrlRef: appState.gatewayUrlRef,
      connectionStateRef: appState.connectionStateRef,
      isUnmountingRef: appState.isUnmountingRef,
      subscriptionsRef: appState.subscriptionsRef,
      historySyncTimerRef: appState.historySyncTimerRef,
      historySyncRequestRef: appState.historySyncRequestRef,
      outboxProcessingRef: appState.outboxProcessingRef,
      startupAutoConnectAttemptRef: appState.startupAutoConnectAttemptRef,
      startupAutoConnectRetryTimerRef: appState.startupAutoConnectRetryTimerRef,
      activeRunIdRef: appState.activeRunIdRef,
      pendingTurnIdRef: appState.pendingTurnIdRef,
      runIdToTurnIdRef: appState.runIdToTurnIdRef,
      setActiveRunId: appState.setActiveRunId,
      setGatewayError: appState.setGatewayError,
      setSessionsError: appState.setSessionsError,
      setGatewayEventState: gatewayRuntimeController.setGatewayEventState,
      setIsSettingsPanelOpen: appState.setIsSettingsPanelOpen,
      setIsStartupAutoConnecting: appState.setIsStartupAutoConnecting,
      setIsSessionOperationPending: appState.setIsSessionOperationPending,
      setIsBottomCompletePulse: appState.setIsBottomCompletePulse,
      clearFinalResponseRecoveryTimer:
        runtimeUiHelpers.clearFinalResponseRecoveryTimer,
      clearMissingResponseRecoveryState:
        runtimeUiHelpers.clearMissingResponseRecoveryState,
      clearStartupAutoConnectRetryTimer:
        runtimeUiHelpers.clearStartupAutoConnectRetryTimer,
      clearBottomCompletePulseTimer: runtimeUiHelpers.clearBottomCompletePulseTimer,
      clearOutboxRetryTimer: runtimeUiHelpers.clearOutboxRetryTimer,
      invalidateRefreshEpoch: historyRuntime.invalidateRefreshEpoch,
      forceMaskAuthToken: runtimeUiHelpers.forceMaskAuthToken,
      runGatewayRuntimeAction: gatewayRuntimeController.runAction,
    },
    outboxRuntimeInput: {
      isSending: gatewayRuntimeController.state.isSending,
      connectionState: gateway.connectionState,
      outboxQueue: appState.outboxQueue,
      outboxQueueRef: appState.outboxQueueRef,
      outboxProcessingRef: appState.outboxProcessingRef,
      outboxRetryTimerRef: appState.outboxRetryTimerRef,
      connectionStateRef: appState.connectionStateRef,
      activeSessionKeyRef: appState.activeSessionKeyRef,
      transcriptRef: appState.transcriptRef,
      interimTranscriptRef: appState.interimTranscriptRef,
      sendFingerprintRef: appState.sendFingerprintRef,
      pendingTurnIdRef: appState.pendingTurnIdRef,
      activeRunIdRef: appState.activeRunIdRef,
      runIdToTurnIdRef: appState.runIdToTurnIdRef,
      gatewaySendChat: gateway.chatSend,
      runGatewayHealthCheck: runtimeUiHelpers.runGatewayHealthCheck,
      runGatewayRuntimeAction: gatewayRuntimeController.runAction,
      clearOutboxRetryTimer: runtimeUiHelpers.clearOutboxRetryTimer,
      clearMissingResponseRecoveryState:
        runtimeUiHelpers.clearMissingResponseRecoveryState,
      setGatewayError: appState.setGatewayError,
      setGatewayEventState: gatewayRuntimeController.setGatewayEventState,
      setOutboxQueue: appState.setOutboxQueue,
      setChatTurns: appState.setChatTurns,
      setTranscript: appState.setTranscript,
      setInterimTranscript: appState.setInterimTranscript,
      setActiveRunId: appState.setActiveRunId,
    },
    speechRuntimeInput: {
      speechLang: settings.speechLang,
      isRecognizing: appState.isRecognizing,
      expectedSpeechStopRef: appState.expectedSpeechStopRef,
      isUnmountingRef: appState.isUnmountingRef,
      setIsRecognizing: appState.setIsRecognizing,
      setSpeechError: appState.setSpeechError,
      setTranscript: appState.setTranscript,
      setInterimTranscript: appState.setInterimTranscript,
    },
  };
}

export function buildRuntimeSideEffectsInput(
  input: BuildRuntimeSideEffectsInput,
): RuntimeSideEffectsInput {
  const {
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
    openClawIdentityMemory,
  } = input;

  return {
    uiEffectsInput: {
      shouldShowSettingsScreen: uiFlags.shouldShowSettingsScreen,
      forceMaskAuthToken: runtimeUiHelpers.forceMaskAuthToken,
      missingResponseNotice: appState.missingResponseNotice,
      activeSessionKey: appState.activeSessionKey,
      chatTurns: appState.chatTurns,
      clearMissingResponseRecoveryState:
        runtimeUiHelpers.clearMissingResponseRecoveryState,
      isTurnWaitingState,
      transcript: appState.transcript,
      transcriptRef: appState.transcriptRef,
      interimTranscript: appState.interimTranscript,
      interimTranscriptRef: appState.interimTranscriptRef,
      activeSessionKeyRef: appState.activeSessionKeyRef,
      historyAutoScrollRef: appState.historyAutoScrollRef,
      setShowScrollToBottomButton: appState.setShowScrollToBottomButton,
      gatewayUrl: settings.gatewayUrl,
      gatewayUrlRef: appState.gatewayUrlRef,
      connectionState: gateway.connectionState,
      connectionStateRef: appState.connectionStateRef,
      outboxQueue: appState.outboxQueue,
      outboxQueueRef: appState.outboxQueueRef,
      gatewaySessions: gateway.sessions,
      setSessions: appState.setSessions,
      gatewaySessionsError: gateway.sessionsError,
      setSessionsError: appState.setSessionsError,
      gatewayEventState: gatewayRuntimeController.state.gatewayEventState,
      gatewayEventStateRef: appState.gatewayEventStateRef,
      isSending: gatewayRuntimeController.state.isSending,
      setIsBottomCompletePulse: appState.setIsBottomCompletePulse,
      clearBottomCompletePulseTimer: runtimeUiHelpers.clearBottomCompletePulseTimer,
      bottomCompletePulseTimerRef: appState.bottomCompletePulseTimerRef,
      setGatewayEventState: gatewayRuntimeController.setGatewayEventState,
      sessionTurnsRef: appState.sessionTurnsRef,
      scrollHistoryToBottom: runtimeUiHelpers.scrollHistoryToBottom,
      isOnboardingCompleted: settings.isOnboardingCompleted,
      isOnboardingWaitingForResponse: appState.isOnboardingWaitingForResponse,
      setIsOnboardingCompleted: settings.setOnboardingCompleted,
      setIsOnboardingWaitingForResponse:
        appState.setIsOnboardingWaitingForResponse,
      isGatewayConnected: uiFlags.isGatewayConnected,
      setIsSessionPanelOpen: appState.setIsSessionPanelOpen,
    },
    persistenceEffectsInput: {
      settingsReady: settings.isReady,
      persistRuntimeSetting: runtimeUiHelpers.persistRuntimeSetting,
      activeSessionKey: appState.activeSessionKey,
      sessionPreferences: appState.sessionPreferences,
      outboxQueue: appState.outboxQueue,
      kvStore,
      sessionKeyStorageKey: STORAGE_KEYS.sessionKey,
      sessionPrefsStorageKey: STORAGE_KEYS.sessionPrefs,
      outboxQueueStorageKey: STORAGE_KEYS.outboxQueue,
      identityStorageKey: OPENCLAW_IDENTITY_STORAGE_KEY,
      openClawIdentityMemory,
      parseSessionPreferences,
      parseOutboxQueue,
      defaultSessionKey: DEFAULT_SESSION_KEY,
      activeSessionKeyRef: appState.activeSessionKeyRef,
      sessionTurnsRef: appState.sessionTurnsRef,
      setActiveSessionKey: appState.setActiveSessionKey,
      setSessionPreferences: appState.setSessionPreferences,
      setOutboxQueue: appState.setOutboxQueue,
      setGatewayEventState: gatewayRuntimeController.setGatewayEventState,
      setChatTurns: appState.setChatTurns,
      setLocalStateReady: appState.setLocalStateReady,
    },
    lifecycleInput: {
      localStateReady: appState.localStateReady,
      settingsReady: settings.isReady,
      gatewayUrl: settings.gatewayUrl,
      connectionState: gateway.connectionState,
      startupAutoConnectAttemptedRef: appState.startupAutoConnectAttemptedRef,
      startupAutoConnectAttemptRef: appState.startupAutoConnectAttemptRef,
      connectGateway: runtimeActions.connectGateway,
      isUnmountingRef: appState.isUnmountingRef,
      invalidateRefreshEpoch: historyRuntime.invalidateRefreshEpoch,
      expectedSpeechStopRef: appState.expectedSpeechStopRef,
      holdStartTimerRef: appState.holdStartTimerRef,
      historySyncTimerRef: appState.historySyncTimerRef,
      historySyncRequestRef: appState.historySyncRequestRef,
      historyNoticeTimerRef: appState.historyNoticeTimerRef,
      bottomCompletePulseTimerRef: appState.bottomCompletePulseTimerRef,
      authTokenMaskTimerRef: appState.authTokenMaskTimerRef,
      outboxRetryTimerRef: appState.outboxRetryTimerRef,
      startupAutoConnectRetryTimerRef: appState.startupAutoConnectRetryTimerRef,
      finalResponseRecoveryTimerRef: appState.finalResponseRecoveryTimerRef,
      missingResponseRecoveryTimerRef: appState.missingResponseRecoveryTimerRef,
      missingResponseRecoveryRequestRef: appState.missingResponseRecoveryRequestRef,
      settingsFocusScrollTimerRef: settingsUiRuntime.settingsFocusScrollTimerRef,
      quickTextTooltipTimerRef: settingsUiRuntime.quickTextTooltipTimerRef,
      quickTextLongPressResetTimerRef:
        settingsUiRuntime.quickTextLongPressResetTimerRef,
      quickTextLongPressSideRef: settingsUiRuntime.quickTextLongPressSideRef,
      disconnectGateway: runtimeActions.disconnectGateway,
    },
  };
}
