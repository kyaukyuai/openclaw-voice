import {
  getKvStore,
} from '../utils';
import type { GatewayContextValue, SettingsContextValue } from '../contexts';
import {
  buildRuntimeOrchestratorInput,
  buildRuntimeSideEffectsInput,
} from './app-runtime-wiring-inputs-logic';
import { useAppRuntimeOrchestrator } from './useAppRuntimeOrchestrator';
import { useAppRuntimeSideEffects } from './useAppRuntimeSideEffects';
import { useRuntimeUiHelpers } from './useRuntimeUiHelpers';
import type { GatewayUiFlags } from './app-screen-wiring-logic';
import type { useAppRuntimeState } from './useAppRuntimeState';
import type { useGatewayRuntime } from './useGatewayRuntime';
import type { useComposerRuntime } from './useComposerRuntime';
import type { useHistoryRuntime } from './useHistoryRuntime';
import type { useSettingsUiRuntime } from './useSettingsUiRuntime';

type AppRuntimeState = ReturnType<typeof useAppRuntimeState>;
type GatewayRuntimeController = ReturnType<typeof useGatewayRuntime>;
type ComposerRuntimeState = ReturnType<typeof useComposerRuntime>;
type HistoryRuntimeState = ReturnType<typeof useHistoryRuntime>;
type SettingsUiRuntimeState = ReturnType<typeof useSettingsUiRuntime>;

type UseAppRuntimeWiringInput = {
  settings: SettingsContextValue;
  gateway: GatewayContextValue;
  appState: AppRuntimeState;
  gatewayRuntimeController: GatewayRuntimeController;
  composerRuntime: ComposerRuntimeState;
  historyRuntime: HistoryRuntimeState;
  settingsUiRuntime: SettingsUiRuntimeState;
  uiFlags: GatewayUiFlags;
  kvStore: ReturnType<typeof getKvStore>;
  openClawIdentityMemory: Map<string, string>;
};

export function useAppRuntimeWiring(input: UseAppRuntimeWiringInput) {
  const {
    settings,
    gateway,
    appState,
    gatewayRuntimeController,
    composerRuntime,
    historyRuntime,
    settingsUiRuntime,
    uiFlags,
    kvStore,
    openClawIdentityMemory,
  } = input;

  const runtimeUiHelpers = useRuntimeUiHelpers({
    historyNoticeTimerRef: appState.historyNoticeTimerRef,
    bottomCompletePulseTimerRef: appState.bottomCompletePulseTimerRef,
    authTokenMaskTimerRef: appState.authTokenMaskTimerRef,
    outboxRetryTimerRef: appState.outboxRetryTimerRef,
    startupAutoConnectRetryTimerRef: appState.startupAutoConnectRetryTimerRef,
    finalResponseRecoveryTimerRef: appState.finalResponseRecoveryTimerRef,
    missingResponseRecoveryTimerRef: appState.missingResponseRecoveryTimerRef,
    missingResponseRecoveryRequestRef: appState.missingResponseRecoveryRequestRef,
    connectionStateRef: appState.connectionStateRef,
    historyScrollRef: appState.historyScrollRef,
    historyAutoScrollRef: appState.historyAutoScrollRef,
    gatewayCheckHealth: gateway.checkHealth,
    setIsAuthTokenMasked: appState.setIsAuthTokenMasked,
    setHistoryRefreshNotice: appState.setHistoryRefreshNotice,
    setShowScrollToBottomButton: appState.setShowScrollToBottomButton,
    setIsMissingResponseRecoveryInFlight:
      gatewayRuntimeController.setIsMissingResponseRecoveryInFlight,
    setMissingResponseNotice: appState.setMissingResponseNotice,
  });

  const runtimeActions = useAppRuntimeOrchestrator(
    buildRuntimeOrchestratorInput({
      settings,
      gateway,
      appState,
      gatewayRuntimeController,
      historyRuntime,
      runtimeUiHelpers,
      uiFlags,
    }),
  );

  useAppRuntimeSideEffects(
    buildRuntimeSideEffectsInput({
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
    }),
  );

  const runtimeForContent = {
    connectGateway: runtimeActions.connectGateway,
    sendToGateway: runtimeActions.sendToGateway,
    refreshSessions: runtimeActions.refreshSessions,
    scheduleMissingResponseRecovery: runtimeActions.scheduleMissingResponseRecovery,
    startRecognition: runtimeActions.startRecognition,
    stopRecognition: runtimeActions.stopRecognition,
    loadSessionHistory: runtimeActions.loadSessionHistory,
  };

  const runtimeForViewModel = {
    connectGateway: runtimeActions.connectGateway,
    refreshSessions: runtimeActions.refreshSessions,
    createAndSwitchSession: runtimeActions.createAndSwitchSession,
    switchSession: runtimeActions.switchSession,
    isSessionPinned: runtimeActions.isSessionPinned,
    getSessionTitle: runtimeActions.getSessionTitle,
    startSessionRename: runtimeActions.startSessionRename,
    toggleSessionPinned: runtimeActions.toggleSessionPinned,
    submitSessionRename: runtimeActions.submitSessionRename,
  };

  return {
    runtimeUiHelpers,
    runtimeForContent,
    runtimeForViewModel,
  };
}
