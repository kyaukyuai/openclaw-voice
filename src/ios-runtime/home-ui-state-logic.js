const {
  resolveSessionPanelSelectors,
  resolveSettingsStatusSelectors,
  resolveSectionIconColors,
} = require('./home-ui-session-selectors');
const {
  resolveHistoryRefreshErrorMessage,
  resolveHistoryUpdatedLabel,
  resolveHistoryUiSelectors,
} = require('./home-ui-history-selectors');
const {
  resolveActiveMissingResponseNotice,
  resolveTopBannerSelectors,
} = require('./home-ui-banner-selectors');
const { resolveBottomStatusSelectors } = require('./home-ui-bottom-status-selectors');
const { resolveComposerDisplaySelectors } = require('./home-ui-composer-selectors');
const {
  resolveGatewayDiagnosticIconName,
  resolveOnboardingDiagnosticSelectors,
} = require('./home-ui-onboarding-selectors');

const CONNECTION_LABELS = {
  disconnected: 'Disconnected',
  connecting: 'Connecting',
  connected: 'Connected',
  reconnecting: 'Connecting',
};

const BOTTOM_ACTION_STATUS_LABELS = {
  disconnected: 'Disconnected',
  connecting: 'Connecting',
  ready: 'Ready',
  recording: 'Recording',
  sending: 'Sending',
  retrying: 'Retrying',
  complete: 'Complete',
  error: 'Error',
};

function resolvePlatform() {
  try {
    const { Platform } = require('react-native');
    return Platform;
  } catch {
    return {
      OS: 'ios',
      constants: {},
    };
  }
}

function isWebPlatform() {
  const platform = resolvePlatform();
  return platform.OS === 'web';
}

function isMacDesktopRuntime() {
  const platform = resolvePlatform();
  if (platform.OS === 'macos') return true;
  if (platform.OS !== 'ios') return false;
  const constants = platform.constants;
  return constants?.interfaceIdiom === 'mac';
}

function supportsSpeechRecognitionOnCurrentPlatform() {
  const platform = resolvePlatform();
  if (isWebPlatform()) return false;
  if (isMacDesktopRuntime()) return false;
  return platform.OS === 'ios' || platform.OS === 'android';
}

function resolveSpeechUnsupportedMessage() {
  return isMacDesktopRuntime()
    ? 'macOSでは音声入力未対応です。'
    : 'Webでは音声入力未対応です。';
}

function buildVisibleSessions(sessions, activeSessionKey, sessionPreferences) {
  const merged = [...sessions];
  if (!merged.some((session) => session.key === activeSessionKey)) {
    merged.unshift({ key: activeSessionKey, displayName: activeSessionKey });
  }

  merged.sort((a, b) => {
    if (a.key === activeSessionKey && b.key !== activeSessionKey) return -1;
    if (b.key === activeSessionKey && a.key !== activeSessionKey) return 1;

    const aPinned = sessionPreferences[a.key]?.pinned === true;
    const bPinned = sessionPreferences[b.key]?.pinned === true;
    if (aPinned !== bPinned) return aPinned ? -1 : 1;

    const byUpdatedAt = (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
    if (byUpdatedAt !== 0) return byUpdatedAt;
    return a.key.localeCompare(b.key);
  });

  return merged.slice(0, 20);
}

function buildHistoryItems(chatTurns, getHistoryDayKey, getHistoryDayLabel) {
  if (chatTurns.length === 0) return [];

  const items = [];
  let previousDayKey = null;

  chatTurns.forEach((turn, index) => {
    const dayKey = getHistoryDayKey(turn.createdAt);
    if (dayKey !== previousDayKey) {
      items.push({
        kind: 'date',
        id: `date-${dayKey}`,
        label: getHistoryDayLabel(turn.createdAt),
      });
      previousDayKey = dayKey;
    }

    items.push({
      kind: 'turn',
      id: turn.id,
      turn,
      isLast: index === chatTurns.length - 1,
    });
  });

  return items;
}

function resolveLatestRetryText(chatTurns, transcript, interimTranscript) {
  const currentDraft = (transcript.trim() || interimTranscript.trim()).trim();
  if (currentDraft) return currentDraft;

  for (let index = chatTurns.length - 1; index >= 0; index -= 1) {
    const turn = chatTurns[index];
    if ((turn.state === 'error' || turn.state === 'aborted') && turn.userText.trim()) {
      return turn.userText.trim();
    }
  }

  return '';
}

function buildHomeUiStateSnapshot(input, computed) {
  const { visibleSessions, historyItems, latestRetryText } = computed;

  const speechRecognitionSupported = supportsSpeechRecognitionOnCurrentPlatform();
  const {
    canSendDraft,
    quickTextLeftLabel,
    quickTextRightLabel,
    isTranscriptFocused,
    isQuickTextSettingsEditMode,
    showKeyboardActionBar,
    showDoneOnlyAction,
    showClearInKeyboardBar,
    canSendFromKeyboardBar,
    canClearFromKeyboardBar,
    canUseQuickTextLeft,
    canUseQuickTextRight,
    showQuickTextLeftTooltip,
    showQuickTextRightTooltip,
    isTranscriptEditingWithKeyboard,
    isHomeComposingMode,
    showHistorySecondaryUi,
    showHistoryCard,
    showHistoryRefreshButton,
    transcriptPlaceholder,
    shouldUseCompactTranscriptCard,
  } = resolveComposerDisplaySelectors({
    transcript: input.transcript,
    interimTranscript: input.interimTranscript,
    isRecognizing: input.isRecognizing,
    quickTextLeft: input.quickTextLeft,
    quickTextRight: input.quickTextRight,
    focusedField: input.focusedField,
    shouldShowSettingsScreen: input.shouldShowSettingsScreen,
    isKeyboardVisible: input.isKeyboardVisible,
    isSending: input.isSending,
    settingsReady: input.settingsReady,
    quickTextTooltipSide: input.quickTextTooltipSide,
    speechRecognitionSupported,
  });

  const {
    canSwitchSession,
    canRefreshSessions,
    canCreateSession,
    canRenameSession,
    canPinSession,
    sessionPanelStatusText,
    sessionListHintText,
  } = resolveSessionPanelSelectors({
    isSending: input.isSending,
    isSessionOperationPending: input.isSessionOperationPending,
    isGatewayConnected: input.isGatewayConnected,
    isSessionsLoading: input.isSessionsLoading,
    sessionsError: input.sessionsError,
    sessionsCount: input.sessions.length,
    visibleSessionsCount: visibleSessions.length,
  });

  const {
    settingsStatusText,
    isSettingsStatusError,
    isSettingsStatusPending,
  } = resolveSettingsStatusSelectors({
    settingsReady: input.settingsReady,
    isSettingsSaving: input.isSettingsSaving,
    settingsPendingSaveCount: input.settingsPendingSaveCount,
    settingsSaveError: input.settingsSaveError,
    settingsLastSavedAt: input.settingsLastSavedAt,
    formatClockLabel: input.formatClockLabel,
  });

  const {
    sectionIconColor,
    actionIconColor,
    currentBadgeIconColor,
    pinnedBadgeIconColor,
    optionIconColor,
  } = resolveSectionIconColors(input.isDarkTheme);

  const {
    showOnboardingGuide,
    isOnboardingGatewayConfigured,
    isOnboardingConnectDone,
    isOnboardingResponseDone,
    canRunOnboardingConnectTest,
    canRunOnboardingSampleSend,
    onboardingSampleButtonLabel,
    showGatewayDiagnostic,
    gatewayDiagnosticIconName,
  } = resolveOnboardingDiagnosticSelectors({
    settingsReady: input.settingsReady,
    isOnboardingCompleted: input.isOnboardingCompleted,
    gatewayUrl: input.gatewayUrl,
    isGatewayConnected: input.isGatewayConnected,
    chatTurns: input.chatTurns,
    isGatewayConnecting: input.isGatewayConnecting,
    isSending: input.isSending,
    isOnboardingWaitingForResponse: input.isOnboardingWaitingForResponse,
    gatewayConnectDiagnostic: input.gatewayConnectDiagnostic,
  });

  const activeMissingResponseNotice = resolveActiveMissingResponseNotice(
    input.missingResponseNotice,
    input.activeSessionKey,
  );

  const canRetryMissingResponse =
    Boolean(activeMissingResponseNotice) &&
    input.isGatewayConnected &&
    !input.isMissingResponseRecoveryInFlight;

  const historyRefreshErrorMessage = resolveHistoryRefreshErrorMessage(
    input.historyRefreshNotice,
  );

  const historyUpdatedLabel = resolveHistoryUpdatedLabel(
    input.historyLastSyncedAt,
    input.formatClockLabel,
  );

  const {
    showHistoryUpdatedMeta,
    historyListBottomPadding,
    showHistoryDateDivider,
    showHistoryScrollButton,
  } = resolveHistoryUiSelectors({
    showHistoryCard,
    showHistorySecondaryUi,
    historyUpdatedLabel,
    historyBottomInset: input.historyBottomInset,
    showScrollToBottomButton: input.showScrollToBottomButton,
    isHomeComposingMode,
  });

  const isStreamingGatewayEvent =
    input.gatewayEventState === 'delta' || input.gatewayEventState === 'streaming';
  const {
    bottomActionStatus,
    bottomActionDetailText,
    showBottomStatus,
    bottomActionStatusLabel,
    connectionStatusLabel,
  } = resolveBottomStatusSelectors({
    isRecognizing: input.isRecognizing,
    isSending: input.isSending,
    activeMissingResponseNotice,
    outboxQueueLength: input.outboxQueueLength,
    connectionState: input.connectionState,
    gatewayError: input.gatewayError,
    speechError: input.speechError,
    historyRefreshErrorMessage,
    isGatewayConnected: input.isGatewayConnected,
    isGatewayConnecting: input.isGatewayConnecting,
    isStartupAutoConnecting: input.isStartupAutoConnecting,
    isBottomCompletePulse: input.isBottomCompletePulse,
    isStreamingGatewayEvent,
    isMissingResponseRecoveryInFlight: input.isMissingResponseRecoveryInFlight,
    canSendDraft,
    speechRecognitionSupported,
    speechUnsupportedMessage: resolveSpeechUnsupportedMessage(),
    isKeyboardBarMounted: input.isKeyboardBarMounted,
    isHomeComposingMode,
    bottomActionStatusLabels: BOTTOM_ACTION_STATUS_LABELS,
    connectionLabels: CONNECTION_LABELS,
  });
  const canReconnectFromError = input.settingsReady && !input.isGatewayConnecting;
  const canRetryFromError = Boolean(latestRetryText) && !input.isSending;

  const { topBannerKind, topBannerMessage, topBannerIconName } =
    resolveTopBannerSelectors({
      gatewayError: input.gatewayError,
      activeMissingResponseNotice,
      historyRefreshErrorMessage,
      speechError: input.speechError,
    });

  return {
    canSendDraft,
    quickTextLeftLabel,
    quickTextRightLabel,
    isTranscriptFocused,
    isQuickTextSettingsEditMode,
    showKeyboardActionBar,
    showDoneOnlyAction,
    showClearInKeyboardBar,
    canSendFromKeyboardBar,
    canClearFromKeyboardBar,
    speechRecognitionSupported,
    canUseQuickTextLeft,
    canUseQuickTextRight,
    showQuickTextLeftTooltip,
    showQuickTextRightTooltip,
    isTranscriptEditingWithKeyboard,
    isHomeComposingMode,
    showHistoryCard,
    showHistoryRefreshButton,
    transcriptPlaceholder,
    shouldUseCompactTranscriptCard,
    canSwitchSession,
    canRefreshSessions,
    canCreateSession,
    canRenameSession,
    canPinSession,
    visibleSessions,
    sessionPanelStatusText,
    sessionListHintText,
    settingsStatusText,
    isSettingsStatusError,
    isSettingsStatusPending,
    sectionIconColor,
    actionIconColor,
    currentBadgeIconColor,
    pinnedBadgeIconColor,
    optionIconColor,
    showOnboardingGuide,
    isOnboardingGatewayConfigured,
    isOnboardingConnectDone,
    isOnboardingResponseDone,
    canRunOnboardingConnectTest,
    canRunOnboardingSampleSend,
    onboardingSampleButtonLabel,
    showGatewayDiagnostic,
    gatewayDiagnosticIconName,
    activeMissingResponseNotice,
    canRetryMissingResponse,
    historyUpdatedLabel,
    showHistoryUpdatedMeta,
    historyListBottomPadding,
    bottomActionStatus,
    bottomActionDetailText,
    showBottomStatus,
    bottomActionStatusLabel,
    connectionStatusLabel,
    showHistoryDateDivider,
    showHistoryScrollButton,
    historyItems,
    latestRetryText,
    canReconnectFromError,
    canRetryFromError,
    topBannerKind,
    topBannerMessage,
    topBannerIconName,
  };
}

module.exports = {
  buildVisibleSessions,
  buildHistoryItems,
  resolveLatestRetryText,
  resolveGatewayDiagnosticIconName,
  buildHomeUiStateSnapshot,
};
