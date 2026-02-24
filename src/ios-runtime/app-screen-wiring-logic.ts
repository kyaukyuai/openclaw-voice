import type { ConnectionState } from '../openclaw';

type ResolveGatewayUiFlagsInput = {
  connectionState: ConnectionState;
  isSettingsPanelOpen: boolean;
  isMacRuntime: boolean;
};

export function resolveGatewayUiFlags(input: ResolveGatewayUiFlagsInput) {
  const isGatewayConnected = input.connectionState === 'connected';
  const isGatewayConnecting =
    input.connectionState === 'connecting' ||
    input.connectionState === 'reconnecting';
  const shouldForceSettingsScreen = !isGatewayConnected && !input.isMacRuntime;
  const shouldShowSettingsScreen =
    shouldForceSettingsScreen || input.isSettingsPanelOpen;
  const canToggleSettingsPanel = isGatewayConnected || input.isMacRuntime;
  const canDismissSettingsScreen = isGatewayConnected || input.isMacRuntime;

  return {
    isGatewayConnected,
    isGatewayConnecting,
    shouldForceSettingsScreen,
    shouldShowSettingsScreen,
    canToggleSettingsPanel,
    canDismissSettingsScreen,
  };
}
export type GatewayUiFlags = ReturnType<typeof resolveGatewayUiFlags>;

type ResolveSettingsRuntimeMetaInput = {
  isReady: boolean;
  isSaving: boolean;
  pendingSaveCount: number;
  lastSavedAt: number | null;
  saveError: string | null;
};

export function resolveSettingsRuntimeMeta(input: ResolveSettingsRuntimeMetaInput) {
  return {
    settingsReady: input.isReady,
    isSettingsSaving: input.isSaving,
    settingsPendingSaveCount: input.pendingSaveCount,
    settingsLastSavedAt: input.lastSavedAt,
    settingsSaveError: input.saveError,
  };
}

type ResolveGatewayRuntimeMetaInput = {
  isSessionsLoading: boolean;
  connectDiagnostic: unknown;
  sessions: unknown[];
  sessionsError: string | null;
};

export function resolveGatewayRuntimeMeta(input: ResolveGatewayRuntimeMetaInput) {
  return {
    isSessionsLoading: input.isSessionsLoading,
    gatewayConnectDiagnostic: input.connectDiagnostic,
    gatewaySessions: input.sessions,
    gatewaySessionsError: input.sessionsError,
  };
}
