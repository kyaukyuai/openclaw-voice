import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  LogBox,
  Platform,
  SafeAreaView,
  View,
} from 'react-native';
import {
  ExpoSpeechRecognitionModule,
} from 'expo-speech-recognition';
import {
  setStorage,
  type ChatMessage,
  type ConnectionState,
  type SessionEntry,
  type Storage as OpenClawStorage,
} from './src/openclaw';
import {
  isIncompleteAssistantContent,
} from './src/ui/runtime-logic';

// Import extracted types
import type {
  AppTheme,
  FocusField,
  QuickTextButtonSide,
  SpeechLang,
} from './src/types';
import type {
  ChatTurn,
  HistoryListItem,
  HistoryRefreshNotice,
  MissingResponseRecoveryNotice,
  OutboxQueueItem,
} from './src/types';
import type { SessionPreferences } from './src/types';
import {
  STORAGE_KEYS,
  OPENCLAW_IDENTITY_STORAGE_KEY,
} from './src/types';

// Import extracted constants
import {
  ENABLE_DEBUG_WARNINGS,
  DEFAULTS,
  TIMINGS,
  UI,
  MESSAGES,
  // Legacy exports for backward compatibility
  DEFAULT_GATEWAY_URL,
  DEFAULT_THEME,
  DEFAULT_SPEECH_LANG,
  DEFAULT_SESSION_KEY,
  DEFAULT_QUICK_TEXT_LEFT,
  DEFAULT_QUICK_TEXT_RIGHT,
  DEFAULT_QUICK_TEXT_LEFT_ICON,
  DEFAULT_QUICK_TEXT_RIGHT_ICON,
  getKvStore,
  MAX_TEXT_SCALE,
  MAX_TEXT_SCALE_TIGHT,
  HISTORY_BOTTOM_THRESHOLD_PX,
  ONBOARDING_SAMPLE_MESSAGE,
} from './src/utils';

// Import extracted helpers
import {
  triggerHaptic,
  dedupeLines,
  getTextOverlapSize,
  isMacDesktopRuntime,
  supportsSpeechRecognitionOnCurrentPlatform,
} from './src/utils';
import { useGatewayRuntime } from './src/ios-runtime/useGatewayRuntime';
import { useHistoryRuntime } from './src/ios-runtime/useHistoryRuntime';
import { useComposerRuntime } from './src/ios-runtime/useComposerRuntime';
import { useHomeUiHandlers } from './src/ios-runtime/useHomeUiHandlers';
import { useHomeUiState } from './src/ios-runtime/useHomeUiState';
import { useGatewayEventBridge } from './src/ios-runtime/useGatewayEventBridge';
import { useSessionRuntime } from './src/ios-runtime/useSessionRuntime';
import { useGatewayConnectionFlow } from './src/ios-runtime/useGatewayConnectionFlow';
import { useOutboxRuntime } from './src/ios-runtime/useOutboxRuntime';
import { useSessionHistoryRuntime } from './src/ios-runtime/useSessionHistoryRuntime';
import { useSessionActionsRuntime } from './src/ios-runtime/useSessionActionsRuntime';
import { useSpeechRuntime } from './src/ios-runtime/useSpeechRuntime';
import { useAppLifecycleRuntime } from './src/ios-runtime/useAppLifecycleRuntime';
import { useSettingsUiRuntime } from './src/ios-runtime/useSettingsUiRuntime';
import { useQuickTextRuntime } from './src/ios-runtime/useQuickTextRuntime';
import { useKeyboardUiRuntime } from './src/ios-runtime/useKeyboardUiRuntime';
import {
  useRuntimePersistenceEffects,
  useRuntimeUiEffects,
} from './src/ios-runtime/useAppRuntimeEffects';
import { useRuntimeUiHelpers } from './src/ios-runtime/useRuntimeUiHelpers';
import {
  buildTurnsFromHistory,
  extractFinalChatEventText,
  formatClockLabel,
  formatSessionUpdatedAt,
  getHistoryDayKey,
  getHistoryDayLabel,
  isTurnWaitingState,
  normalizeQuickTextIcon,
  parseOutboxQueue,
  parseSessionPreferences,
} from './src/ios-runtime/app-runtime-pure';
import ConnectionHeader from './src/ui/ios/ConnectionHeader';
import SettingsScreenModal from './src/ui/ios/SettingsScreenModal';
import SessionsScreenModal from './src/ui/ios/SessionsScreenModal';
import SettingsPanelContent from './src/ui/ios/SettingsPanelContent';
import SessionsPanelContent from './src/ui/ios/SessionsPanelContent';
import HomeMainLayout from './src/ui/ios/HomeMainLayout';
import { createStyles } from './src/ui/ios/styles';

// Import contexts
import {
  ThemeProvider,
  useTheme,
  SettingsProvider,
  useSettings,
  GatewayProvider,
  useGateway,
} from './src/contexts';

if (__DEV__ && !ENABLE_DEBUG_WARNINGS) {
  LogBox.ignoreAllLogs(true);
}

const kvStore = getKvStore();
const openClawIdentityMemory = new Map<string, string>();

const openClawStorage: OpenClawStorage = {
  getString(key) {
    return openClawIdentityMemory.get(key);
  },
  set(key, value) {
    openClawIdentityMemory.set(key, value);
    void kvStore.setItemAsync(key, value).catch(() => {
      // ignore persistence errors
    });
  },
};

setStorage(openClawStorage);

function AppContent() {
  // Settings are now managed by SettingsContext
  const {
    gatewayUrl,
    setGatewayUrl,
    authToken,
    setAuthToken,
    speechLang,
    setSpeechLang,
    quickTextLeft,
    setQuickTextLeft,
    quickTextRight,
    setQuickTextRight,
    quickTextLeftIcon,
    setQuickTextLeftIcon,
    quickTextRightIcon,
    setQuickTextRightIcon,
    isOnboardingCompleted,
    setOnboardingCompleted: setIsOnboardingCompleted,
    isReady: settingsReady,
    isSaving: isSettingsSaving,
    pendingSaveCount: settingsPendingSaveCount,
    lastSavedAt: settingsLastSavedAt,
    saveError: settingsSaveError,
  } = useSettings();
  const {
    checkHealth: gatewayCheckHealth,
    refreshSessions: gatewayRefreshSessions,
    chatHistory: gatewayChatHistory,
    chatSend: gatewayChatSend,
    patchSession: gatewayPatchSession,
    connectionState: gatewayConnectionState,
    connectDiagnostic: gatewayConnectDiagnostic,
    sessions: gatewaySessions,
    isSessionsLoading: gatewaySessionsLoading,
    sessionsError: gatewaySessionsError,
  } = useGateway();

  const [isAuthTokenMasked, setIsAuthTokenMasked] = useState(true);
  const [isSettingsPanelOpen, setIsSettingsPanelOpen] = useState(false);
  const [isSessionPanelOpen, setIsSessionPanelOpen] = useState(false);
  const {
    state: gatewayRuntime,
    runAction: runGatewayRuntimeAction,
    setGatewayEventState,
    setIsSending,
    setIsSessionHistoryLoading,
    setIsMissingResponseRecoveryInFlight,
  } = useGatewayRuntime();
  const connectionState = gatewayConnectionState;
  const gatewayEventState = gatewayRuntime.gatewayEventState;
  const isSending = gatewayRuntime.isSending;
  const isSessionHistoryLoading = gatewayRuntime.isSessionHistoryLoading;
  const isMissingResponseRecoveryInFlight =
    gatewayRuntime.isMissingResponseRecoveryInFlight;
  const {
    composerHeight,
    setComposerHeight,
    setKeyboardState,
    isKeyboardVisible,
    historyBottomInset,
  } = useComposerRuntime();
  const { runHistoryRefresh, invalidateRefreshEpoch } = useHistoryRuntime();
  const [gatewayError, setGatewayError] = useState<string | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [chatTurns, setChatTurns] = useState<ChatTurn[]>([]);
  const [activeSessionKey, setActiveSessionKey] = useState(DEFAULT_SESSION_KEY);
  const [sessions, setSessions] = useState<SessionEntry[]>([]);
  const [sessionPreferences, setSessionPreferences] = useState<SessionPreferences>({});
  const [isSessionOperationPending, setIsSessionOperationPending] = useState(false);
  const [isSessionRenameOpen, setIsSessionRenameOpen] = useState(false);
  const [sessionRenameTargetKey, setSessionRenameTargetKey] = useState<string | null>(null);
  const [sessionRenameDraft, setSessionRenameDraft] = useState('');
  const [isStartupAutoConnecting, setIsStartupAutoConnecting] = useState(false);
  // isOnboardingCompleted is now managed by SettingsContext
  const [isOnboardingWaitingForResponse, setIsOnboardingWaitingForResponse] =
    useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [historyLastSyncedAt, setHistoryLastSyncedAt] = useState<number | null>(null);
  const [historyRefreshNotice, setHistoryRefreshNotice] =
    useState<HistoryRefreshNotice | null>(null);
  const [missingResponseNotice, setMissingResponseNotice] =
    useState<MissingResponseRecoveryNotice | null>(null);
  const [showScrollToBottomButton, setShowScrollToBottomButton] = useState(false);
  const [outboxQueue, setOutboxQueue] = useState<OutboxQueueItem[]>([]);
  // Theme is now managed by ThemeContext
  const { theme, setTheme, isDark: isDarkTheme } = useTheme();
  const [quickTextTooltipSide, setQuickTextTooltipSide] =
    useState<QuickTextButtonSide | null>(null);
  const [focusedField, setFocusedField] = useState<FocusField>(null);
  const [isKeyboardBarMounted, setIsKeyboardBarMounted] = useState(false);
  const [isBottomCompletePulse, setIsBottomCompletePulse] = useState(false);

  const [isRecognizing, setIsRecognizing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [localStateReady, setLocalStateReady] = useState(false);

  const activeSessionKeyRef = useRef(DEFAULT_SESSION_KEY);
  const activeRunIdRef = useRef<string | null>(null);
  const pendingTurnIdRef = useRef<string | null>(null);
  const runIdToTurnIdRef = useRef<Map<string, string>>(new Map());
  const sessionTurnsRef = useRef<Map<string, ChatTurn[]>>(new Map());
  const subscriptionsRef = useRef<Array<() => void>>([]);
  const transcriptRef = useRef('');
  const interimTranscriptRef = useRef('');
  const historyScrollRef = useRef<FlatList<HistoryListItem> | null>(null);
  const historyAutoScrollRef = useRef(true);
  const historySyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const historySyncRequestRef = useRef<{
    sessionKey: string;
    attempt: number;
  } | null>(null);
  const missingResponseRecoveryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const missingResponseRecoveryRequestRef = useRef<{
    sessionKey: string;
    turnId: string;
    attempt: number;
  } | null>(null);
  const historyNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bottomCompletePulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const authTokenMaskTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const outboxRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const outboxProcessingRef = useRef(false);
  const outboxQueueRef = useRef<OutboxQueueItem[]>([]);
  const gatewayEventStateRef = useRef(gatewayEventState);
  const gatewayUrlRef = useRef(gatewayUrl);
  const connectionStateRef = useRef<ConnectionState>(connectionState);
  const startupAutoConnectRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const startupAutoConnectAttemptRef = useRef(0);
  const finalResponseRecoveryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const sendFingerprintRef = useRef<{
    sessionKey: string;
    message: string;
    sentAt: number;
    idempotencyKey: string;
  } | null>(null);
  const holdStartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdActivatedRef = useRef(false);
  const expectedSpeechStopRef = useRef(false);
  const isUnmountingRef = useRef(false);
  const startupAutoConnectAttemptedRef = useRef(false);

  const {
    settingsScrollRef,
    settingsFocusScrollTimerRef,
    quickTextTooltipTimerRef,
    quickTextLongPressResetTimerRef,
    quickTextInputRefs,
    quickTextLongPressSideRef,
    clearQuickTextLongPressResetTimer,
    hideQuickTextTooltip,
    scheduleQuickTextTooltipHide,
    ensureSettingsFieldVisible,
  } = useSettingsUiRuntime({
    setQuickTextTooltipSide,
  });

  const isGatewayConnected = connectionState === 'connected';
  const isGatewayConnecting =
    connectionState === 'connecting' || connectionState === 'reconnecting';
  const isMacRuntime = isMacDesktopRuntime();
  const shouldForceSettingsScreen = !isGatewayConnected && !isMacRuntime;
  const shouldShowSettingsScreen = shouldForceSettingsScreen || isSettingsPanelOpen;
  const canToggleSettingsPanel = isGatewayConnected || isMacRuntime;
  const canDismissSettingsScreen = isGatewayConnected || isMacRuntime;
  const isSessionsLoading = gatewaySessionsLoading;
  // isDarkTheme is now provided by useTheme()

  const {
    persistRuntimeSetting,
    clearHistoryNoticeTimer,
    clearBottomCompletePulseTimer,
    forceMaskAuthToken,
    toggleAuthTokenVisibility,
    clearOutboxRetryTimer,
    showHistoryRefreshNotice,
    clearStartupAutoConnectRetryTimer,
    clearFinalResponseRecoveryTimer,
    clearMissingResponseRecoveryTimer,
    clearMissingResponseRecoveryState,
    runGatewayHealthCheck,
    scrollHistoryToBottom,
  } = useRuntimeUiHelpers({
    historyNoticeTimerRef,
    bottomCompletePulseTimerRef,
    authTokenMaskTimerRef,
    outboxRetryTimerRef,
    startupAutoConnectRetryTimerRef,
    finalResponseRecoveryTimerRef,
    missingResponseRecoveryTimerRef,
    missingResponseRecoveryRequestRef,
    connectionStateRef,
    historyScrollRef,
    historyAutoScrollRef,
    gatewayCheckHealth,
    setIsAuthTokenMasked,
    setHistoryRefreshNotice,
    setShowScrollToBottomButton,
    setIsMissingResponseRecoveryInFlight,
    setMissingResponseNotice,
  });

  useRuntimeUiEffects({
    shouldShowSettingsScreen,
    forceMaskAuthToken,
    missingResponseNotice,
    activeSessionKey,
    chatTurns,
    clearMissingResponseRecoveryState,
    isTurnWaitingState,
    transcript,
    transcriptRef,
    interimTranscript,
    interimTranscriptRef,
    activeSessionKeyRef,
    historyAutoScrollRef,
    setShowScrollToBottomButton,
    gatewayUrl,
    gatewayUrlRef,
    connectionState,
    connectionStateRef,
    outboxQueue,
    outboxQueueRef,
    gatewaySessions,
    setSessions,
    gatewaySessionsError,
    setSessionsError,
    gatewayEventState,
    gatewayEventStateRef,
    isSending,
    setIsBottomCompletePulse,
    clearBottomCompletePulseTimer,
    bottomCompletePulseTimerRef,
    setGatewayEventState,
    sessionTurnsRef,
    scrollHistoryToBottom,
    isOnboardingCompleted,
    isOnboardingWaitingForResponse,
    setIsOnboardingCompleted,
    setIsOnboardingWaitingForResponse,
    isGatewayConnected,
    setIsSessionPanelOpen,
  });

  useRuntimePersistenceEffects({
    settingsReady,
    persistRuntimeSetting,
    activeSessionKey,
    sessionPreferences,
    outboxQueue,
    kvStore,
    sessionKeyStorageKey: STORAGE_KEYS.sessionKey,
    sessionPrefsStorageKey: STORAGE_KEYS.sessionPrefs,
    outboxQueueStorageKey: STORAGE_KEYS.outboxQueue,
    identityStorageKey: OPENCLAW_IDENTITY_STORAGE_KEY,
    openClawIdentityMemory,
    parseSessionPreferences,
    parseOutboxQueue,
    defaultSessionKey: DEFAULT_SESSION_KEY,
    activeSessionKeyRef,
    sessionTurnsRef,
    setActiveSessionKey,
    setSessionPreferences,
    setOutboxQueue,
    setGatewayEventState,
    setChatTurns,
    setLocalStateReady,
  });

  const updateChatTurn = useCallback(
    (turnId: string, updater: (turn: ChatTurn) => ChatTurn) => {
      setChatTurns((previous) =>
        previous.map((turn) => (turn.id === turnId ? updater(turn) : turn)),
      );
    },
    [],
  );

  const {
    refreshSessions,
    loadSessionHistory,
    switchSession,
    createAndSwitchSession,
  } = useSessionHistoryRuntime({
    connectionState,
    connectionStateRef,
    isSending,
    isSessionOperationPending,
    activeSessionKeyRef,
    activeRunIdRef,
    pendingTurnIdRef,
    runIdToTurnIdRef,
    sessionTurnsRef,
    outboxQueueRef,
    gatewayRefreshSessions,
    gatewayChatHistory,
    runHistoryRefresh,
    runGatewayRuntimeAction,
    invalidateRefreshEpoch,
    buildTurnsFromHistory,
    setSessions,
    setSessionsError,
    setGatewayError,
    setChatTurns,
    setActiveSessionKey,
    setFocusedField,
    setIsSessionRenameOpen,
    setSessionRenameTargetKey,
    setSessionRenameDraft,
    setIsSending,
    setGatewayEventState,
    setHistoryLastSyncedAt,
    setActiveRunId,
  });

  const {
    isSessionPinned,
    getSessionTitle,
    startSessionRename,
    submitSessionRename,
    toggleSessionPinned,
    switchSession: switchSessionAction,
    createAndSwitchSession: createAndSwitchSessionAction,
  } = useSessionActionsRuntime({
    connectionState,
    isGatewayConnected,
    isSessionOperationPending,
    sessionRenameTargetKey,
    sessionRenameDraft,
    sessionPreferences,
    sessions,
    activeSessionKeyRef,
    refreshSessions,
    loadSessionHistory,
    switchSession,
    createAndSwitchSession,
    gatewayPatchSession,
    setSessionsError,
    setIsSessionOperationPending,
    setSessionPreferences,
    setIsSessionRenameOpen,
    setSessionRenameTargetKey,
    setSessionRenameDraft,
  });

  const { handleChatEvent } = useGatewayEventBridge({
    activeSessionKeyRef,
    activeRunIdRef,
    pendingTurnIdRef,
    runIdToTurnIdRef,
    sessionTurnsRef,
    updateChatTurn,
    setGatewayEventState,
    setIsSending,
    setActiveRunId,
    isOnboardingWaitingForResponse,
    isIncompleteAssistantContent,
    setIsOnboardingWaitingForResponse,
    setIsOnboardingCompleted,
    scheduleFinalResponseRecovery: (sessionKey, attempt) => {
      scheduleFinalResponseRecovery(sessionKey, attempt);
    },
    scheduleMissingResponseRecovery: (sessionKey, turnId, options) => {
      scheduleMissingResponseRecovery(sessionKey, turnId, options);
    },
    scheduleSessionHistorySync: (sessionKey, options) => {
      scheduleSessionHistorySync(sessionKey, options);
    },
    clearFinalResponseRecoveryTimer,
    clearMissingResponseRecoveryState,
    refreshSessions,
    setGatewayError,
    extractFinalChatEventText,
  });

  const { disconnectGateway, connectGateway } = useGatewayConnectionFlow({
    gatewayUrl,
    authToken,
    settingsReady,
    gatewayUrlRef,
    connectionStateRef,
    isUnmountingRef,
    subscriptionsRef,
    historySyncTimerRef,
    historySyncRequestRef,
    outboxProcessingRef,
    startupAutoConnectAttemptRef,
    startupAutoConnectRetryTimerRef,
    activeRunIdRef,
    pendingTurnIdRef,
    runIdToTurnIdRef,
    setActiveRunId,
    setGatewayError,
    setSessionsError,
    setGatewayEventState,
    setIsSettingsPanelOpen,
    setIsStartupAutoConnecting,
    setIsSessionOperationPending,
    setIsBottomCompletePulse,
    clearFinalResponseRecoveryTimer,
    clearMissingResponseRecoveryState,
    clearStartupAutoConnectRetryTimer,
    clearBottomCompletePulseTimer,
    clearOutboxRetryTimer,
    invalidateRefreshEpoch,
    forceMaskAuthToken,
    runGatewayRuntimeAction,
    handleChatEvent,
  });

  const { sendToGateway } = useOutboxRuntime({
    isSending,
    connectionState,
    outboxQueue,
    outboxQueueRef,
    outboxProcessingRef,
    outboxRetryTimerRef,
    connectionStateRef,
    activeSessionKeyRef,
    transcriptRef,
    interimTranscriptRef,
    sendFingerprintRef,
    pendingTurnIdRef,
    activeRunIdRef,
    runIdToTurnIdRef,
    gatewaySendChat: gatewayChatSend,
    runGatewayHealthCheck,
    runGatewayRuntimeAction,
    updateChatTurn,
    refreshSessions,
    clearOutboxRetryTimer,
    clearMissingResponseRecoveryState,
    setGatewayError,
    setGatewayEventState,
    setOutboxQueue,
    setChatTurns,
    setTranscript,
    setInterimTranscript,
    setActiveRunId,
  });

  const abortSpeechRecognitionIfSupported = useCallback(() => {
    if (!supportsSpeechRecognitionOnCurrentPlatform()) return;
    ExpoSpeechRecognitionModule.abort();
  }, []);

  useAppLifecycleRuntime({
    localStateReady,
    settingsReady,
    gatewayUrl,
    connectionState,
    startupAutoConnectAttemptedRef,
    startupAutoConnectAttemptRef,
    connectGateway,
    isUnmountingRef,
    invalidateRefreshEpoch,
    expectedSpeechStopRef,
    holdStartTimerRef,
    historySyncTimerRef,
    historySyncRequestRef,
    historyNoticeTimerRef,
    bottomCompletePulseTimerRef,
    authTokenMaskTimerRef,
    outboxRetryTimerRef,
    startupAutoConnectRetryTimerRef,
    finalResponseRecoveryTimerRef,
    missingResponseRecoveryTimerRef,
    missingResponseRecoveryRequestRef,
    settingsFocusScrollTimerRef,
    quickTextTooltipTimerRef,
    quickTextLongPressResetTimerRef,
    quickTextLongPressSideRef,
    disconnectGateway,
    abortSpeechRecognitionIfSupported,
  });

  const { startRecognition, stopRecognition } = useSpeechRuntime({
    speechLang,
    isRecognizing,
    expectedSpeechStopRef,
    isUnmountingRef,
    setIsRecognizing,
    setSpeechError,
    setTranscript,
    setInterimTranscript,
  });

  const clearTranscriptDraft = useCallback(() => {
    transcriptRef.current = '';
    interimTranscriptRef.current = '';
    setTranscript('');
    setInterimTranscript('');
    setSpeechError(null);
    void triggerHaptic('button-press');
  }, []);

  const {
    handleQuickTextLongPress,
    handleQuickTextPress,
    handleQuickTextPressOut,
  } = useQuickTextRuntime({
    isRecognizing,
    setTranscript,
    setInterimTranscript,
    setQuickTextTooltipSide,
    clearQuickTextLongPressResetTimer,
    scheduleQuickTextTooltipHide,
    hideQuickTextTooltip,
    quickTextLongPressSideRef,
    quickTextLongPressResetTimerRef,
  });

  const {
    scheduleSessionHistorySync,
    scheduleMissingResponseRecovery,
    scheduleFinalResponseRecovery,
  } = useSessionRuntime({
    historySyncTimerRef,
    historySyncRequestRef,
    missingResponseRecoveryTimerRef,
    missingResponseRecoveryRequestRef,
    finalResponseRecoveryTimerRef,
    connectionStateRef,
    sessionTurnsRef,
    clearMissingResponseRecoveryTimer,
    clearFinalResponseRecoveryTimer,
    loadSessionHistory,
    refreshSessions,
    setIsMissingResponseRecoveryInFlight,
    setMissingResponseNotice,
    isTurnWaitingState,
  });

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
  } = useHomeUiState({
    transcript,
    interimTranscript,
    isRecognizing,
    quickTextLeft,
    quickTextRight,
    focusedField,
    shouldShowSettingsScreen,
    isKeyboardVisible,
    isSending,
    settingsReady,
    isSessionOperationPending,
    isGatewayConnected,
    isSessionsLoading,
    sessions,
    sessionPreferences,
    sessionsError,
    isSettingsSaving,
    settingsPendingSaveCount,
    settingsSaveError,
    settingsLastSavedAt,
    isDarkTheme,
    isOnboardingCompleted,
    gatewayUrl,
    chatTurns,
    isGatewayConnecting,
    isOnboardingWaitingForResponse,
    gatewayConnectDiagnostic,
    outboxQueueLength: outboxQueue.length,
    missingResponseNotice,
    activeSessionKey,
    isMissingResponseRecoveryInFlight,
    historyRefreshNotice,
    historyLastSyncedAt,
    historyBottomInset,
    showScrollToBottomButton,
    gatewayError,
    speechError,
    gatewayEventState,
    connectionState,
    isStartupAutoConnecting,
    isBottomCompletePulse,
    isKeyboardBarMounted,
    formatClockLabel,
    getHistoryDayKey,
    getHistoryDayLabel,
    quickTextTooltipSide,
  });
  const handleButtonPressHaptic = useCallback(() => {
    void triggerHaptic('button-press');
  }, []);

  const {
    handleReconnectFromError,
    handleRetryFromError,
    handleRetryMissingResponse,
    handleDismissTopBanner,
    handleCompleteOnboarding,
    handleOnboardingConnectTest,
    handleOnboardingSendSample,
    handleToggleSessionPanel,
    handleToggleSettingsPanel,
    handleCloseSettingsPanel,
    handleCloseSessionPanel,
    handleDoneKeyboardAction,
    handleClearKeyboardAction,
    handleSendKeyboardAction,
    handleSendDraftAction,
    handleTranscriptChange,
    handleTranscriptFocus,
    handleTranscriptBlur,
    handleRefreshHistory,
    handleScrollHistoryToBottom,
    handleHoldToTalkPressIn,
    handleHoldToTalkPressOut,
    handleHistoryScroll,
    handleHistoryAutoScroll,
    handleHistoryLayoutAutoScroll,
    handleBottomDockHeightChange,
    handleBottomDockActionPressHaptic,
  } = useHomeUiHandlers({
    onButtonPressHaptic: handleButtonPressHaptic,
    canReconnectFromError,
    canRetryFromError,
    latestRetryText,
    connectGateway,
    sendToGateway,
    setFocusedField,
    activeMissingResponseNotice,
    isMissingResponseRecoveryInFlight,
    isGatewayConnected,
    setGatewayError,
    scheduleMissingResponseRecovery,
    topBannerKind,
    setMissingResponseNotice,
    setHistoryRefreshNotice,
    setSpeechError,
    setIsOnboardingWaitingForResponse,
    setIsOnboardingCompleted,
    canRunOnboardingConnectTest,
    canRunOnboardingSampleSend,
    onboardingSampleMessage: ONBOARDING_SAMPLE_MESSAGE,
    forceMaskAuthToken,
    isSessionPanelOpen,
    refreshSessions,
    setIsSettingsPanelOpen,
    setIsSessionPanelOpen,
    setIsSessionRenameOpen,
    setSessionRenameTargetKey,
    setSessionRenameDraft,
    canToggleSettingsPanel,
    canDismissSettingsScreen,
    canClearFromKeyboardBar,
    clearTranscriptDraft,
    canSendFromKeyboardBar,
    transcript,
    interimTranscript,
    setTranscript,
    setInterimTranscript,
    isSessionHistoryLoading,
    clearHistoryNoticeTimer,
    activeSessionKeyRef,
    loadSessionHistory,
    setHistoryLastSyncedAt,
    showHistoryRefreshNotice,
    formatClockLabel,
    scrollHistoryToBottom,
    historyAutoScrollRef,
    setShowScrollToBottomButton,
    chatTurnsLength: chatTurns.length,
    historyBottomThresholdPx: HISTORY_BOTTOM_THRESHOLD_PX,
    speechRecognitionSupported,
    isRecognizing,
    isSending,
    holdActivatedRef,
    holdStartTimerRef,
    startRecognition,
    stopRecognition,
    composerHeight,
    setComposerHeight,
  });

  const styles = useMemo(() => createStyles(isDarkTheme), [isDarkTheme]);
  const placeholderColor = isDarkTheme ? '#95a8ca' : '#C4C4C0';

  const { keyboardBarAnim } = useKeyboardUiRuntime({
    showKeyboardActionBar,
    setKeyboardState,
    setIsKeyboardBarMounted,
  });

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style={isDarkTheme ? 'light' : 'dark'} />
      <KeyboardAvoidingView
        style={styles.keyboardWrap}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ConnectionHeader
          styles={styles}
          isDarkTheme={isDarkTheme}
          connectionLabel={connectionStatusLabel}
          isGatewayConnected={isGatewayConnected}
          isGatewayConnecting={isGatewayConnecting}
          isSessionPanelOpen={isSessionPanelOpen}
          isSettingsPanelOpen={isSettingsPanelOpen}
          canToggleSettingsPanel={canToggleSettingsPanel}
          onToggleSessionPanel={handleToggleSessionPanel}
          onToggleSettingsPanel={handleToggleSettingsPanel}
          maxTextScaleTight={MAX_TEXT_SCALE_TIGHT}
        />

        <SettingsScreenModal
          visible={shouldShowSettingsScreen}
          styles={styles}
          isDarkTheme={isDarkTheme}
          canDismissSettingsScreen={canDismissSettingsScreen}
          isSettingsStatusPending={isSettingsStatusPending}
          isSettingsStatusError={isSettingsStatusError}
          settingsStatusText={settingsStatusText}
          isKeyboardVisible={isKeyboardVisible}
          settingsScrollRef={settingsScrollRef}
          onClose={handleCloseSettingsPanel}
          maxTextScaleTight={MAX_TEXT_SCALE_TIGHT}
        >
          <SettingsPanelContent
            styles={styles}
            maxTextScale={MAX_TEXT_SCALE}
            maxTextScaleTight={MAX_TEXT_SCALE_TIGHT}
            showOnboardingGuide={showOnboardingGuide}
            isQuickTextSettingsEditMode={isQuickTextSettingsEditMode}
            sectionIconColor={sectionIconColor}
            currentBadgeIconColor={currentBadgeIconColor}
            optionIconColor={optionIconColor}
            actionIconColor={actionIconColor}
            isOnboardingGatewayConfigured={isOnboardingGatewayConfigured}
            isOnboardingConnectDone={isOnboardingConnectDone}
            isOnboardingResponseDone={isOnboardingResponseDone}
            isOnboardingWaitingForResponse={isOnboardingWaitingForResponse}
            canRunOnboardingConnectTest={canRunOnboardingConnectTest}
            canRunOnboardingSampleSend={canRunOnboardingSampleSend}
            isGatewayConnecting={isGatewayConnecting}
            onboardingSampleButtonLabel={onboardingSampleButtonLabel}
            onOnboardingConnectTest={handleOnboardingConnectTest}
            onOnboardingSendSample={handleOnboardingSendSample}
            onCompleteOnboarding={handleCompleteOnboarding}
            focusedField={focusedField}
            setFocusedField={setFocusedField}
            gatewayUrl={gatewayUrl}
            setGatewayUrl={setGatewayUrl}
            authToken={authToken}
            setAuthToken={setAuthToken}
            placeholderColor={placeholderColor}
            isAuthTokenMasked={isAuthTokenMasked}
            toggleAuthTokenVisibility={toggleAuthTokenVisibility}
            settingsReady={settingsReady}
            connectGateway={connectGateway}
            isStartupAutoConnecting={isStartupAutoConnecting}
            isDarkTheme={isDarkTheme}
            showGatewayDiagnostic={showGatewayDiagnostic}
            gatewayDiagnosticIconName={gatewayDiagnosticIconName}
            gatewayConnectDiagnostic={gatewayConnectDiagnostic}
            theme={theme}
            setTheme={setTheme}
            speechLang={speechLang}
            setSpeechLang={setSpeechLang}
            quickTextInputRefs={quickTextInputRefs}
            quickTextLeft={quickTextLeft}
            setQuickTextLeft={setQuickTextLeft}
            quickTextRight={quickTextRight}
            setQuickTextRight={setQuickTextRight}
            quickTextLeftIcon={quickTextLeftIcon}
            setQuickTextLeftIcon={setQuickTextLeftIcon}
            quickTextRightIcon={quickTextRightIcon}
            setQuickTextRightIcon={setQuickTextRightIcon}
            ensureSettingsFieldVisible={ensureSettingsFieldVisible}
            enableDebugWarnings={ENABLE_DEBUG_WARNINGS}
            connectionState={connectionState}
            gatewayEventState={gatewayEventState}
            activeSessionKey={activeSessionKey}
            activeRunId={activeRunId}
            historyLastSyncedAt={historyLastSyncedAt}
            startupAutoConnectAttempt={startupAutoConnectAttemptRef.current}
          />
        </SettingsScreenModal>
      <SessionsScreenModal
        visible={isGatewayConnected && isSessionPanelOpen}
        styles={styles}
        isDarkTheme={isDarkTheme}
        isSessionsLoading={isSessionsLoading}
        hasSessionsError={Boolean(sessionsError)}
        sessionPanelStatusText={sessionPanelStatusText}
        onClose={handleCloseSessionPanel}
        maxTextScaleTight={MAX_TEXT_SCALE_TIGHT}
      >
        <SessionsPanelContent
          styles={styles}
          sectionIconColor={sectionIconColor}
          actionIconColor={actionIconColor}
          currentBadgeIconColor={currentBadgeIconColor}
          pinnedBadgeIconColor={pinnedBadgeIconColor}
          isGatewayConnected={isGatewayConnected}
          canRefreshSessions={canRefreshSessions}
          canCreateSession={canCreateSession}
          canSwitchSession={canSwitchSession}
          canRenameSession={canRenameSession}
          canPinSession={canPinSession}
          activeSessionKey={activeSessionKey}
          visibleSessions={visibleSessions}
          sessionRenameTargetKey={sessionRenameTargetKey}
          isSessionRenameOpen={isSessionRenameOpen}
          sessionRenameDraft={sessionRenameDraft}
          setSessionRenameDraft={setSessionRenameDraft}
          placeholderColor={placeholderColor}
          isSessionOperationPending={isSessionOperationPending}
          sessionsError={sessionsError}
          sessionListHintText={sessionListHintText}
          maxTextScale={MAX_TEXT_SCALE}
          maxTextScaleTight={MAX_TEXT_SCALE_TIGHT}
          refreshSessions={refreshSessions}
          createAndSwitchSession={createAndSwitchSession}
          switchSession={switchSession}
          isSessionPinned={isSessionPinned}
          getSessionTitle={getSessionTitle}
          formatSessionUpdatedAt={formatSessionUpdatedAt}
          startSessionRename={startSessionRename}
          toggleSessionPinned={toggleSessionPinned}
          submitSessionRename={submitSessionRename}
          setIsSessionRenameOpen={setIsSessionRenameOpen}
          setSessionRenameTargetKey={setSessionRenameTargetKey}
        />
      </SessionsScreenModal>
        <HomeMainLayout
          styles={styles}
          isDarkTheme={isDarkTheme}
          topBannerKind={topBannerKind}
          topBannerMessage={topBannerMessage ?? null}
          topBannerIconName={topBannerIconName}
          canReconnectFromError={canReconnectFromError}
          canRetryFromError={canRetryFromError}
          canRetryMissingResponse={canRetryMissingResponse}
          isMissingResponseRecoveryInFlight={isMissingResponseRecoveryInFlight}
          isGatewayConnected={isGatewayConnected}
          onReconnectFromError={handleReconnectFromError}
          onRetryFromError={handleRetryFromError}
          onRetryMissingResponse={handleRetryMissingResponse}
          onDismissTopBanner={handleDismissTopBanner}
          showHistoryCard={showHistoryCard}
          showHistoryRefreshButton={showHistoryRefreshButton}
          isSessionHistoryLoading={isSessionHistoryLoading}
          onRefreshHistory={handleRefreshHistory}
          showHistoryUpdatedMeta={showHistoryUpdatedMeta}
          historyUpdatedLabel={historyUpdatedLabel}
          historyScrollRef={historyScrollRef}
          historyItems={historyItems}
          historyListBottomPadding={historyListBottomPadding}
          showScrollToBottomButton={showScrollToBottomButton}
          showHistoryScrollButton={showHistoryScrollButton}
          isHomeComposingMode={isHomeComposingMode}
          showHistoryDateDivider={showHistoryDateDivider}
          onHistoryScroll={handleHistoryScroll}
          onHistoryAutoScroll={handleHistoryAutoScroll}
          onHistoryLayoutAutoScroll={handleHistoryLayoutAutoScroll}
          onScrollHistoryToBottom={handleScrollHistoryToBottom}
          isRecognizing={isRecognizing}
          isTranscriptEditingWithKeyboard={isTranscriptEditingWithKeyboard}
          shouldUseCompactTranscriptCard={shouldUseCompactTranscriptCard}
          focusedField={focusedField}
          transcript={transcript}
          transcriptPlaceholder={transcriptPlaceholder}
          placeholderColor={placeholderColor}
          interimTranscript={interimTranscript}
          onTranscriptChange={handleTranscriptChange}
          onFocusTranscript={handleTranscriptFocus}
          onBlurTranscript={handleTranscriptBlur}
          isTranscriptFocused={isTranscriptFocused}
          isKeyboardVisible={isKeyboardVisible}
          onBottomDockHeightChange={handleBottomDockHeightChange}
          isKeyboardBarMounted={isKeyboardBarMounted}
          keyboardBarAnim={keyboardBarAnim}
          showDoneOnlyAction={showDoneOnlyAction}
          showClearInKeyboardBar={showClearInKeyboardBar}
          canClearFromKeyboardBar={canClearFromKeyboardBar}
          canSendFromKeyboardBar={canSendFromKeyboardBar}
          onDoneKeyboardAction={handleDoneKeyboardAction}
          onClearKeyboardAction={handleClearKeyboardAction}
          onSendKeyboardAction={handleSendKeyboardAction}
          showQuickTextLeftTooltip={showQuickTextLeftTooltip}
          showQuickTextRightTooltip={showQuickTextRightTooltip}
          quickTextLeftLabel={quickTextLeftLabel}
          quickTextRightLabel={quickTextRightLabel}
          quickTextLeftIcon={quickTextLeftIcon}
          quickTextRightIcon={quickTextRightIcon}
          canUseQuickTextLeft={canUseQuickTextLeft}
          canUseQuickTextRight={canUseQuickTextRight}
          onQuickTextPress={handleQuickTextPress}
          onQuickTextLongPress={handleQuickTextLongPress}
          onQuickTextPressOut={handleQuickTextPressOut}
          canSendDraft={canSendDraft}
          isSending={isSending}
          speechRecognitionSupported={speechRecognitionSupported}
          settingsReady={settingsReady}
          onSendDraftAction={handleSendDraftAction}
          onMicPressIn={handleHoldToTalkPressIn}
          onMicPressOut={handleHoldToTalkPressOut}
          onActionPressHaptic={handleBottomDockActionPressHaptic}
          showBottomStatus={showBottomStatus}
          bottomActionStatus={bottomActionStatus}
          bottomActionLabel={bottomActionStatusLabel}
          bottomActionDetailText={bottomActionDetailText}
          maxTextScale={MAX_TEXT_SCALE}
          maxTextScaleTight={MAX_TEXT_SCALE_TIGHT}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/**
 * Root App component with Providers
 */
export default function App() {
  return (
    <ThemeProvider>
      <SettingsProvider>
        <GatewayProvider>
          <AppContent />
        </GatewayProvider>
      </SettingsProvider>
    </ThemeProvider>
  );
}
