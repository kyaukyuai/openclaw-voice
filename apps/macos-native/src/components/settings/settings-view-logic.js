export function resolveSettingsSectionOrder() {
  return [
    'gatewayProfiles',
    'gatewaySettings',
    'notifications',
    'quickText',
    'telemetry',
  ];
}

export function buildGatewayProfilesSectionProps(input) {
  return {
    activeGatewayId: input.activeGatewayId,
    gatewayProfiles: input.gatewayProfiles,
    gatewayRuntimeById: input.gatewayRuntimeById,
    handleCreateGatewayProfile: input.handleCreateGatewayProfile,
    handleDeleteActiveGatewayProfile: input.handleDeleteActiveGatewayProfile,
    handleSelectGatewayProfile: input.handleSelectGatewayProfile,
    themeTokens: input.themeTokens,
  };
}

export function buildGatewaySettingsSectionProps(input) {
  return {
    activeGatewayId: input.activeGatewayId,
    authToken: input.authToken,
    authTokenInputRef: input.authTokenInputRef,
    connectGateway: input.connectGateway,
    disconnectGateway: input.disconnectGateway,
    focusedSettingsInput: input.focusedSettingsInput,
    gatewayName: input.gatewayName,
    gatewayRuntimeById: input.gatewayRuntimeById,
    gatewayUrl: input.gatewayUrl,
    identityReady: input.identityReady,
    isAuthTokenVisible: input.isAuthTokenVisible,
    sessionKey: input.sessionKey,
    setAuthToken: input.setAuthToken,
    setFocusedSettingsInput: input.setFocusedSettingsInput,
    setGatewayName: input.setGatewayName,
    setGatewayUrl: input.setGatewayUrl,
    setIsAuthTokenVisible: input.setIsAuthTokenVisible,
    setSessionKey: input.setSessionKey,
    themeTokens: input.themeTokens,
  };
}

export function buildNotificationsSectionProps(input) {
  return {
    gatewayProfiles: input.gatewayProfiles,
    isGatewayNotificationEnabled: input.isGatewayNotificationEnabled,
    notificationSettings: input.notificationSettings,
    themeTokens: input.themeTokens,
    toggleGatewayNotifications: input.toggleGatewayNotifications,
    toggleMuteForegroundNotifications: input.toggleMuteForegroundNotifications,
    toggleNotificationsEnabled: input.toggleNotificationsEnabled,
  };
}

export function buildQuickTextSectionProps(input) {
  return {
    focusedGatewayId: input.focusedGatewayId,
    focusedSettingsInput: input.focusedSettingsInput,
    gatewayRuntimeById: input.gatewayRuntimeById,
    insertQuickText: input.insertQuickText,
    quickTextLeft: input.quickTextLeft,
    quickTextRight: input.quickTextRight,
    setFocusedSettingsInput: input.setFocusedSettingsInput,
    setQuickTextLeft: input.setQuickTextLeft,
    setQuickTextRight: input.setQuickTextRight,
    themeTokens: input.themeTokens,
  };
}

export function buildTelemetrySectionProps(input) {
  return {
    copyTelemetryReport: input.copyTelemetryReport,
    gatewayProfiles: input.gatewayProfiles,
    resetTelemetry: input.resetTelemetry,
    telemetry: input.telemetry,
    themeTokens: input.themeTokens,
  };
}
