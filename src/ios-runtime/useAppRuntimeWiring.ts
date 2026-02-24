import {
  getKvStore,
} from '../utils';
import type { GatewayContextValue, SettingsContextValue } from '../contexts';
import {
  buildRuntimeUiHelpersInput,
  buildRuntimeOrchestratorInput,
  buildRuntimeSideEffectsInput,
} from './app-runtime-wiring-inputs-logic';
import { useAppRuntimeOrchestrator } from './useAppRuntimeOrchestrator';
import { useAppRuntimeSideEffects } from './useAppRuntimeSideEffects';
import { useRuntimeUiHelpers } from './useRuntimeUiHelpers';
import type { GatewayUiFlags } from './app-screen-wiring-logic';
import type { useAppRuntimeState } from './useAppRuntimeState';
import type { useGatewayRuntime } from './useGatewayRuntime';
import type { useHistoryRuntime } from './useHistoryRuntime';
import type { useSettingsUiRuntime } from './useSettingsUiRuntime';

type AppRuntimeState = ReturnType<typeof useAppRuntimeState>;
type GatewayRuntimeController = ReturnType<typeof useGatewayRuntime>;
type HistoryRuntimeState = ReturnType<typeof useHistoryRuntime>;
type SettingsUiRuntimeState = ReturnType<typeof useSettingsUiRuntime>;

type UseAppRuntimeWiringInput = {
  settings: SettingsContextValue;
  gateway: GatewayContextValue;
  appState: AppRuntimeState;
  gatewayRuntimeController: GatewayRuntimeController;
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
    historyRuntime,
    settingsUiRuntime,
    uiFlags,
    kvStore,
    openClawIdentityMemory,
  } = input;

  const runtimeUiHelpers = useRuntimeUiHelpers(
    buildRuntimeUiHelpersInput({
      gateway,
      appState,
      gatewayRuntimeController,
    }),
  );

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
