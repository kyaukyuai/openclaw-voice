function resolveSessionPanelSelectors(input) {
  const canSwitchSession = !input.isSending && !input.isSessionOperationPending;
  const canRefreshSessions =
    input.isGatewayConnected &&
    !input.isSessionsLoading &&
    !input.isSessionOperationPending;
  const canCreateSession = canSwitchSession;
  const canRenameSession = canSwitchSession;
  const canPinSession = !input.isSessionOperationPending;

  const hasGatewaySessions = input.sessionsCount > 0;
  const sessionPanelStatusText = input.sessionsError
    ? 'Error'
    : input.isSessionsLoading
      ? 'Loading sessions...'
      : hasGatewaySessions
        ? `${input.visibleSessionsCount} sessions`
        : 'Local session only';

  const sessionListHintText = input.sessionsError
    ? 'Sync failed. Tap Refresh.'
    : !hasGatewaySessions
      ? 'No sessions yet. Tap New.'
      : input.isSending || input.isSessionOperationPending
        ? 'Busy now. Try again in a moment.'
        : null;

  return {
    canSwitchSession,
    canRefreshSessions,
    canCreateSession,
    canRenameSession,
    canPinSession,
    sessionPanelStatusText,
    sessionListHintText,
  };
}

function resolveSettingsStatusSelectors(input) {
  const settingsStatusText = !input.settingsReady
    ? 'Loading settings...'
    : input.isSettingsSaving || input.settingsPendingSaveCount > 0
      ? 'Syncing...'
      : input.settingsSaveError
        ? input.settingsSaveError
        : input.settingsLastSavedAt
          ? `Saved ${input.formatClockLabel(input.settingsLastSavedAt)}`
          : 'Saved';

  const isSettingsStatusError = Boolean(input.settingsSaveError);
  const isSettingsStatusPending =
    input.isSettingsSaving || input.settingsPendingSaveCount > 0;

  return {
    settingsStatusText,
    isSettingsStatusError,
    isSettingsStatusPending,
  };
}

function resolveSectionIconColors(isDarkTheme) {
  return {
    sectionIconColor: isDarkTheme ? '#9eb1d2' : '#70706A',
    actionIconColor: isDarkTheme ? '#b8c9e6' : '#5C5C5C',
    currentBadgeIconColor: isDarkTheme ? '#9ec0ff' : '#1D4ED8',
    pinnedBadgeIconColor: isDarkTheme ? '#dbe7ff' : '#4B5563',
    optionIconColor: isDarkTheme ? '#b8c9e6' : '#5C5C5C',
  };
}

module.exports = {
  resolveSessionPanelSelectors,
  resolveSettingsStatusSelectors,
  resolveSectionIconColors,
};
