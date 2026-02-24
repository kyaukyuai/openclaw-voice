import type { SessionEntry, ConnectionState } from '../openclaw';
import type {
  ChatTurn,
  FocusField,
  HistoryListItem,
  HistoryRefreshNotice,
  MissingResponseRecoveryNotice,
  SessionPreferences,
  GatewayConnectDiagnostic,
  HomeDisplayMode,
  BottomActionStatus,
  QuickTextIcon,
} from '../types';
import {
  BOTTOM_ACTION_STATUS_LABELS,
  CONNECTION_LABELS,
  isMacDesktopRuntime,
  supportsSpeechRecognitionOnCurrentPlatform,
} from '../utils';
import { isIncompleteAssistantContent } from '../ui/runtime-logic';

export type HomeUiStateLogicInput = {
  transcript: string;
  interimTranscript: string;
  isRecognizing: boolean;
  quickTextLeft: string;
  quickTextRight: string;
  focusedField: FocusField;
  shouldShowSettingsScreen: boolean;
  isKeyboardVisible: boolean;
  isSending: boolean;
  settingsReady: boolean;
  isSessionOperationPending: boolean;
  isGatewayConnected: boolean;
  isSessionsLoading: boolean;
  sessions: SessionEntry[];
  sessionPreferences: SessionPreferences;
  sessionsError: string | null;
  isSettingsSaving: boolean;
  settingsPendingSaveCount: number;
  settingsSaveError: string | null;
  settingsLastSavedAt: number | null;
  isDarkTheme: boolean;
  isOnboardingCompleted: boolean;
  gatewayUrl: string;
  chatTurns: ChatTurn[];
  isGatewayConnecting: boolean;
  isOnboardingWaitingForResponse: boolean;
  gatewayConnectDiagnostic: GatewayConnectDiagnostic | null;
  outboxQueueLength: number;
  missingResponseNotice: MissingResponseRecoveryNotice | null;
  activeSessionKey: string;
  isMissingResponseRecoveryInFlight: boolean;
  historyRefreshNotice: HistoryRefreshNotice | null;
  historyLastSyncedAt: number | null;
  historyBottomInset: number;
  showScrollToBottomButton: boolean;
  gatewayError: string | null;
  speechError: string | null;
  gatewayEventState: string;
  connectionState: ConnectionState;
  isStartupAutoConnecting: boolean;
  isBottomCompletePulse: boolean;
  isKeyboardBarMounted: boolean;
  formatClockLabel: (timestamp: number) => string;
  getHistoryDayKey: (timestamp: number) => string;
  getHistoryDayLabel: (timestamp: number) => string;
  quickTextTooltipSide: 'left' | 'right' | null;
};

type HomeUiStateComputed = {
  visibleSessions: SessionEntry[];
  historyItems: HistoryListItem[];
  latestRetryText: string;
};

function resolveSpeechUnsupportedMessage() {
  return isMacDesktopRuntime()
    ? 'macOSでは音声入力未対応です。'
    : 'Webでは音声入力未対応です。';
}

export function buildVisibleSessions(
  sessions: SessionEntry[],
  activeSessionKey: string,
  sessionPreferences: SessionPreferences,
): SessionEntry[] {
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

export function buildHistoryItems(
  chatTurns: ChatTurn[],
  getHistoryDayKey: (timestamp: number) => string,
  getHistoryDayLabel: (timestamp: number) => string,
): HistoryListItem[] {
  if (chatTurns.length === 0) return [];

  const items: HistoryListItem[] = [];
  let previousDayKey: string | null = null;

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

export function resolveLatestRetryText(
  chatTurns: ChatTurn[],
  transcript: string,
  interimTranscript: string,
): string {
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

export function resolveGatewayDiagnosticIconName(
  diagnostic: GatewayConnectDiagnostic | null,
): QuickTextIcon {
  const kind = diagnostic?.kind;
  if (kind === 'tls') return 'shield-checkmark-outline';
  if (kind === 'auth') return 'key-outline';
  if (kind === 'timeout') return 'time-outline';
  if (kind === 'dns') return 'globe-outline';
  if (kind === 'network') return 'cloud-offline-outline';
  if (kind === 'server') return 'server-outline';
  if (kind === 'pairing') return 'people-outline';
  if (kind === 'invalid-url') return 'link-outline';
  return 'alert-circle-outline';
}

export function buildHomeUiStateSnapshot(
  input: HomeUiStateLogicInput,
  computed: HomeUiStateComputed,
) {
  const { visibleSessions, historyItems, latestRetryText } = computed;

  const draftText = input.transcript.trim() || input.interimTranscript.trim();
  const hasDraft = Boolean(draftText);
  const canSendDraft = hasDraft && !input.isRecognizing;

  const quickTextLeftLabel = input.quickTextLeft.trim();
  const quickTextRightLabel = input.quickTextRight.trim();

  const isTranscriptFocused = input.focusedField === 'transcript';
  const isQuickTextFieldFocused =
    input.focusedField === 'quick-text-left' ||
    input.focusedField === 'quick-text-right';
  const isQuickTextSettingsEditMode =
    input.shouldShowSettingsScreen && isQuickTextFieldFocused;

  const isGatewayFieldFocused =
    input.focusedField === 'gateway-url' ||
    input.focusedField === 'auth-token' ||
    isQuickTextFieldFocused;

  const showKeyboardActionBar =
    input.isKeyboardVisible && (isTranscriptFocused || isGatewayFieldFocused);
  const showDoneOnlyAction = showKeyboardActionBar && isGatewayFieldFocused;
  const showClearInKeyboardBar = showKeyboardActionBar && isTranscriptFocused;
  const canSendFromKeyboardBar = hasDraft && !input.isRecognizing && !input.isSending;
  const canClearFromKeyboardBar =
    input.transcript.length > 0 || input.interimTranscript.length > 0;

  const speechRecognitionSupported = supportsSpeechRecognitionOnCurrentPlatform();
  const canUseQuickText = !input.isRecognizing && input.settingsReady;
  const canUseQuickTextLeft = canUseQuickText && quickTextLeftLabel.length > 0;
  const canUseQuickTextRight = canUseQuickText && quickTextRightLabel.length > 0;
  const showQuickTextLeftTooltip =
    input.quickTextTooltipSide === 'left' && canUseQuickTextLeft;
  const showQuickTextRightTooltip =
    input.quickTextTooltipSide === 'right' && canUseQuickTextRight;

  const isTranscriptEditingWithKeyboard =
    input.isKeyboardVisible && isTranscriptFocused;
  const isTranscriptExpanded = isTranscriptFocused || input.isRecognizing;

  const homeDisplayMode: HomeDisplayMode = input.isSending
    ? 'sending'
    : isTranscriptFocused || input.isRecognizing
      ? 'composing'
      : 'idle';

  const isHomeIdleMode = homeDisplayMode === 'idle';
  const isHomeComposingMode = homeDisplayMode === 'composing';
  const showHistorySecondaryUi = !isHomeComposingMode;
  const showHistoryCard = !isTranscriptEditingWithKeyboard;
  const showHistoryRefreshButton =
    showHistoryCard && showHistorySecondaryUi && !input.isSending;

  const transcriptPlaceholder = isTranscriptFocused
    ? 'Type your message.'
    : 'Tap to type or hold mic.';

  const shouldUseCompactTranscriptCard =
    isHomeIdleMode && !hasDraft && !isTranscriptExpanded;

  const canSwitchSession = !input.isSending && !input.isSessionOperationPending;
  const canRefreshSessions =
    input.isGatewayConnected &&
    !input.isSessionsLoading &&
    !input.isSessionOperationPending;
  const canCreateSession = canSwitchSession;
  const canRenameSession = canSwitchSession;
  const canPinSession = !input.isSessionOperationPending;

  const hasGatewaySessions = input.sessions.length > 0;
  const sessionPanelStatusText = input.sessionsError
    ? 'Error'
    : input.isSessionsLoading
      ? 'Loading sessions...'
      : hasGatewaySessions
        ? `${visibleSessions.length} sessions`
        : 'Local session only';

  const sessionListHintText = input.sessionsError
    ? 'Sync failed. Tap Refresh.'
    : !hasGatewaySessions
      ? 'No sessions yet. Tap New.'
      : input.isSending || input.isSessionOperationPending
        ? 'Busy now. Try again in a moment.'
        : null;

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

  const sectionIconColor = input.isDarkTheme ? '#9eb1d2' : '#70706A';
  const actionIconColor = input.isDarkTheme ? '#b8c9e6' : '#5C5C5C';
  const currentBadgeIconColor = input.isDarkTheme ? '#9ec0ff' : '#1D4ED8';
  const pinnedBadgeIconColor = input.isDarkTheme ? '#dbe7ff' : '#4B5563';
  const optionIconColor = input.isDarkTheme ? '#b8c9e6' : '#5C5C5C';

  const showOnboardingGuide = input.settingsReady && !input.isOnboardingCompleted;
  const isOnboardingGatewayConfigured = input.gatewayUrl.trim().length > 0;
  const isOnboardingConnectDone = input.isGatewayConnected;
  const isOnboardingResponseDone = input.chatTurns.some(
    (turn) =>
      turn.state === 'complete' && !isIncompleteAssistantContent(turn.assistantText),
  );

  const canRunOnboardingConnectTest =
    input.settingsReady && !input.isGatewayConnecting;
  const canRunOnboardingSampleSend =
    input.isGatewayConnected &&
    !input.isSending &&
    !input.isOnboardingWaitingForResponse;

  const onboardingSampleButtonLabel = input.isOnboardingWaitingForResponse
    ? 'Waiting reply...'
    : 'Send Sample';

  const showGatewayDiagnostic =
    !input.isGatewayConnected && input.gatewayConnectDiagnostic != null;
  const gatewayDiagnosticIconName = resolveGatewayDiagnosticIconName(
    input.gatewayConnectDiagnostic,
  );

  const activeMissingResponseNotice =
    input.missingResponseNotice?.sessionKey === input.activeSessionKey
      ? input.missingResponseNotice
      : null;

  const canRetryMissingResponse =
    Boolean(activeMissingResponseNotice) &&
    input.isGatewayConnected &&
    !input.isMissingResponseRecoveryInFlight;

  const historyRefreshErrorMessage =
    input.historyRefreshNotice?.kind === 'error'
      ? input.historyRefreshNotice.message
      : null;

  const historyUpdatedLabel =
    input.historyLastSyncedAt != null
      ? `Updated ${input.formatClockLabel(input.historyLastSyncedAt)}`
      : null;

  const showHistoryUpdatedMeta =
    showHistoryCard && showHistorySecondaryUi && Boolean(historyUpdatedLabel);

  const historyListBottomPadding = Math.max(
    12,
    input.historyBottomInset + (input.showScrollToBottomButton ? 28 : 0),
  );

  const hasRetryingState =
    Boolean(activeMissingResponseNotice) ||
    (input.outboxQueueLength > 0 && input.connectionState === 'connected');

  const hasErrorState =
    Boolean(input.gatewayError) ||
    Boolean(input.speechError) ||
    Boolean(historyRefreshErrorMessage);

  const isStreamingGatewayEvent =
    input.gatewayEventState === 'delta' || input.gatewayEventState === 'streaming';

  const bottomActionStatus: BottomActionStatus = input.isRecognizing
    ? 'recording'
    : input.isSending
      ? 'sending'
      : hasRetryingState
        ? 'retrying'
        : hasErrorState
          ? 'error'
          : !input.isGatewayConnected
            ? input.isGatewayConnecting || input.isStartupAutoConnecting
              ? 'connecting'
              : 'disconnected'
            : input.isBottomCompletePulse
              ? 'complete'
              : 'ready';

  const bottomActionDetailText =
    bottomActionStatus === 'recording'
      ? 'Release to stop'
      : bottomActionStatus === 'sending'
        ? isStreamingGatewayEvent
          ? 'Streaming response'
          : 'Waiting response'
        : bottomActionStatus === 'retrying'
          ? activeMissingResponseNotice
            ? input.isMissingResponseRecoveryInFlight
              ? 'Fetching final output'
              : 'Retry available'
            : `Queued ${input.outboxQueueLength}`
          : bottomActionStatus === 'complete'
            ? 'Sent successfully'
            : bottomActionStatus === 'connecting'
              ? input.outboxQueueLength > 0
                ? `Queued ${input.outboxQueueLength}`
                : 'Please wait'
              : bottomActionStatus === 'disconnected'
                ? input.outboxQueueLength > 0
                  ? `Queued ${input.outboxQueueLength}`
                  : 'Connect Gateway'
                : bottomActionStatus === 'error'
                  ? 'Check top banner'
                  : canSendDraft
                    ? 'Tap send'
                    : speechRecognitionSupported
                      ? 'Hold to record'
                      : resolveSpeechUnsupportedMessage();

  const showBottomStatus = !input.isKeyboardBarMounted && !isHomeComposingMode;
  const bottomActionStatusLabel = BOTTOM_ACTION_STATUS_LABELS[bottomActionStatus];
  const connectionStatusLabel = CONNECTION_LABELS[input.connectionState];
  const showHistoryDateDivider = showHistorySecondaryUi;
  const showHistoryScrollButton =
    input.showScrollToBottomButton && !isHomeComposingMode;

  const canReconnectFromError = input.settingsReady && !input.isGatewayConnecting;
  const canRetryFromError = Boolean(latestRetryText) && !input.isSending;

  const topBannerKind: 'gateway' | 'recovery' | 'history' | 'speech' | null =
    input.gatewayError
      ? 'gateway'
      : activeMissingResponseNotice
        ? 'recovery'
        : historyRefreshErrorMessage
          ? 'history'
          : input.speechError
            ? 'speech'
            : null;

  const topBannerMessage =
    input.gatewayError ??
    activeMissingResponseNotice?.message ??
    historyRefreshErrorMessage ??
    input.speechError;

  const topBannerIconName:
    | 'cloud-offline-outline'
    | 'time-outline'
    | 'refresh-outline'
    | 'mic-off-outline' =
    topBannerKind === 'gateway'
      ? 'cloud-offline-outline'
      : topBannerKind === 'recovery'
        ? 'time-outline'
        : topBannerKind === 'history'
          ? 'refresh-outline'
          : 'mic-off-outline';

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
