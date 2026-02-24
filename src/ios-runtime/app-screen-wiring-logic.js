function resolveGatewayUiFlags(input) {
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

function resolveSettingsRuntimeMeta(input) {
  return {
    settingsReady: input.isReady,
    isSettingsSaving: input.isSaving,
    settingsPendingSaveCount: input.pendingSaveCount,
    settingsLastSavedAt: input.lastSavedAt,
    settingsSaveError: input.saveError,
  };
}

function resolveGatewayRuntimeMeta(input) {
  return {
    isSessionsLoading: input.isSessionsLoading,
    gatewayConnectDiagnostic: input.connectDiagnostic,
    gatewaySessions: input.sessions,
    gatewaySessionsError: input.sessionsError,
  };
}

module.exports = {
  resolveGatewayUiFlags,
  resolveSettingsRuntimeMeta,
  resolveGatewayRuntimeMeta,
};
