import { useTheme, useSettings, useGateway } from '../contexts';
import {
  getKvStore,
  DEFAULT_SESSION_KEY,
  isMacDesktopRuntime,
} from '../utils';
import { useGatewayRuntime } from './useGatewayRuntime';
import { useHistoryRuntime } from './useHistoryRuntime';
import { useComposerRuntime } from './useComposerRuntime';
import { useAppRuntimeState } from './useAppRuntimeState';
import { useSettingsUiRuntime } from './useSettingsUiRuntime';
import { useAppRuntimeWiring } from './useAppRuntimeWiring';
import { useAppPresentationWiring } from './useAppPresentationWiring';
import {
  resolveGatewayUiFlags,
} from './app-screen-wiring-logic';

type UseAppScreenWiringInput = {
  kvStore: ReturnType<typeof getKvStore>;
  openClawIdentityMemory: Map<string, string>;
};

export function useAppScreenWiring(input: UseAppScreenWiringInput) {
  const settings = useSettings();
  const gateway = useGateway();
  const theme = useTheme();

  const gatewayRuntimeController = useGatewayRuntime();
  const gatewayRuntime = gatewayRuntimeController.state;

  const composerRuntime = useComposerRuntime();
  const historyRuntime = useHistoryRuntime();

  const appState = useAppRuntimeState({
    defaultSessionKey: DEFAULT_SESSION_KEY,
    initialGatewayEventState: gatewayRuntime.gatewayEventState,
    initialGatewayUrl: settings.gatewayUrl,
    initialConnectionState: gateway.connectionState,
  });

  const settingsUiRuntime = useSettingsUiRuntime({
    setQuickTextTooltipSide: appState.setQuickTextTooltipSide,
  });

  const isMacRuntime = isMacDesktopRuntime();
  const uiFlags = resolveGatewayUiFlags({
    connectionState: gateway.connectionState,
    isSettingsPanelOpen: appState.isSettingsPanelOpen,
    isMacRuntime,
  });

  const runtimeWiring = useAppRuntimeWiring({
    settings,
    gateway,
    appState,
    gatewayRuntimeController,
    historyRuntime,
    settingsUiRuntime,
    uiFlags,
    kvStore: input.kvStore,
    openClawIdentityMemory: input.openClawIdentityMemory,
  });

  const viewModel = useAppPresentationWiring({
    settings,
    gateway,
    theme,
    appState,
    gatewayRuntimeController,
    composerRuntime,
    settingsUiRuntime,
    uiFlags,
    runtimeWiring,
  });

  return {
    isDarkTheme: theme.isDark,
    ...viewModel,
  };
}
