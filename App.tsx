import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  LogBox,
  Platform,
  SafeAreaView,
  View,
} from 'react-native';
import {
  setStorage,
  type Storage as OpenClawStorage,
} from './src/openclaw';
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
} from './src/utils';

// Import extracted helpers
import {
  isMacDesktopRuntime,
} from './src/utils';
import { useGatewayRuntime } from './src/ios-runtime/useGatewayRuntime';
import { useHistoryRuntime } from './src/ios-runtime/useHistoryRuntime';
import { useComposerRuntime } from './src/ios-runtime/useComposerRuntime';
import { useAppRuntimeState } from './src/ios-runtime/useAppRuntimeState';
import { useAppRuntimeOrchestrator } from './src/ios-runtime/useAppRuntimeOrchestrator';
import { useAppContentWiring } from './src/ios-runtime/useAppContentWiring';
import { useAppViewModelWiring } from './src/ios-runtime/useAppViewModelWiring';
import { useSettingsUiRuntime } from './src/ios-runtime/useSettingsUiRuntime';
import { useKeyboardUiRuntime } from './src/ios-runtime/useKeyboardUiRuntime';
import { useAppRuntimeSideEffects } from './src/ios-runtime/useAppRuntimeSideEffects';
import { useRuntimeUiHelpers } from './src/ios-runtime/useRuntimeUiHelpers';
import {
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
  const settings = useSettings();
  const gateway = useGateway();

  const {
    state: gatewayRuntime,
    runAction: runGatewayRuntimeAction,
    setGatewayEventState,
    setIsSending,
    setIsSessionHistoryLoading,
    setIsMissingResponseRecoveryInFlight,
  } = useGatewayRuntime();
  const connectionState = gateway.connectionState;
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
  const appState = useAppRuntimeState({
    defaultSessionKey: DEFAULT_SESSION_KEY,
    initialGatewayEventState: gatewayEventState,
    initialGatewayUrl: settings.gatewayUrl,
    initialConnectionState: connectionState,
  });
  const runtimeRefs = appState;
  const {
    isAuthTokenMasked,
    setIsAuthTokenMasked,
    isSettingsPanelOpen,
    setIsSettingsPanelOpen,
    isSessionPanelOpen,
    setIsSessionPanelOpen,
    gatewayError,
    setGatewayError,
    activeRunId,
    setActiveRunId,
    chatTurns,
    setChatTurns,
    activeSessionKey,
    setActiveSessionKey,
    sessions,
    setSessions,
    sessionPreferences,
    setSessionPreferences,
    isSessionOperationPending,
    setIsSessionOperationPending,
    isSessionRenameOpen,
    setIsSessionRenameOpen,
    sessionRenameTargetKey,
    setSessionRenameTargetKey,
    sessionRenameDraft,
    setSessionRenameDraft,
    isStartupAutoConnecting,
    setIsStartupAutoConnecting,
    isOnboardingWaitingForResponse,
    setIsOnboardingWaitingForResponse,
    sessionsError,
    setSessionsError,
    historyLastSyncedAt,
    setHistoryLastSyncedAt,
    historyRefreshNotice,
    setHistoryRefreshNotice,
    missingResponseNotice,
    setMissingResponseNotice,
    showScrollToBottomButton,
    setShowScrollToBottomButton,
    outboxQueue,
    setOutboxQueue,
    quickTextTooltipSide,
    setQuickTextTooltipSide,
    focusedField,
    setFocusedField,
    isKeyboardBarMounted,
    setIsKeyboardBarMounted,
    isBottomCompletePulse,
    setIsBottomCompletePulse,
    isRecognizing,
    setIsRecognizing,
    transcript,
    setTranscript,
    interimTranscript,
    setInterimTranscript,
    speechError,
    setSpeechError,
    localStateReady,
    setLocalStateReady,
  } = appState;
  const setIsOnboardingCompleted = settings.setOnboardingCompleted;
  const settingsReady = settings.isReady;
  const isSettingsSaving = settings.isSaving;
  const settingsPendingSaveCount = settings.pendingSaveCount;
  const settingsLastSavedAt = settings.lastSavedAt;
  const settingsSaveError = settings.saveError;
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
  } = settings;
  const {
    connectDiagnostic: gatewayConnectDiagnostic,
    sessions: gatewaySessions,
    sessionsError: gatewaySessionsError,
    checkHealth: gatewayCheckHealth,
    refreshSessions: gatewayRefreshSessions,
    chatHistory: gatewayChatHistory,
    patchSession: gatewayPatchSession,
    chatSend: gatewayChatSend,
  } = gateway;
  const {
    activeSessionKeyRef,
    activeRunIdRef,
    pendingTurnIdRef,
    runIdToTurnIdRef,
    sessionTurnsRef,
    subscriptionsRef,
    transcriptRef,
    interimTranscriptRef,
    historyScrollRef,
    historyAutoScrollRef,
    historySyncTimerRef,
    historySyncRequestRef,
    missingResponseRecoveryTimerRef,
    missingResponseRecoveryRequestRef,
    historyNoticeTimerRef,
    bottomCompletePulseTimerRef,
    authTokenMaskTimerRef,
    outboxRetryTimerRef,
    outboxProcessingRef,
    outboxQueueRef,
    gatewayEventStateRef,
    gatewayUrlRef,
    connectionStateRef,
    startupAutoConnectRetryTimerRef,
    startupAutoConnectAttemptRef,
    finalResponseRecoveryTimerRef,
    sendFingerprintRef,
    holdStartTimerRef,
    holdActivatedRef,
    expectedSpeechStopRef,
    isUnmountingRef,
    startupAutoConnectAttemptedRef,
  } = runtimeRefs;
  // Theme is now managed by ThemeContext
  const { theme, setTheme, isDark: isDarkTheme } = useTheme();

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
  const isSessionsLoading = gateway.isSessionsLoading;
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

  const {
    refreshSessions,
    loadSessionHistory,
    switchSession,
    createAndSwitchSession,
    isSessionPinned,
    getSessionTitle,
    startSessionRename,
    submitSessionRename,
    toggleSessionPinned,
    connectGateway,
    disconnectGateway,
    sendToGateway,
    startRecognition,
    stopRecognition,
    scheduleSessionHistorySync,
    scheduleMissingResponseRecovery,
    scheduleFinalResponseRecovery,
  } = useAppRuntimeOrchestrator({
    setChatTurns,
    sessionHistoryInput: {
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
    },
    sessionActionsInput: {
      connectionState,
      isGatewayConnected,
      isSessionOperationPending,
      sessionRenameTargetKey,
      sessionRenameDraft,
      sessionPreferences,
      sessions,
      activeSessionKeyRef,
      gatewayPatchSession,
      setSessionsError,
      setIsSessionOperationPending,
      setSessionPreferences,
      setIsSessionRenameOpen,
      setSessionRenameTargetKey,
      setSessionRenameDraft,
    },
    sessionRuntimeInput: {
      historySyncTimerRef,
      historySyncRequestRef,
      missingResponseRecoveryTimerRef,
      missingResponseRecoveryRequestRef,
      finalResponseRecoveryTimerRef,
      connectionStateRef,
      sessionTurnsRef,
      clearMissingResponseRecoveryTimer,
      clearFinalResponseRecoveryTimer,
      setIsMissingResponseRecoveryInFlight,
      setMissingResponseNotice,
      isTurnWaitingState,
    },
    gatewayEventBridgeInput: {
      activeSessionKeyRef,
      activeRunIdRef,
      pendingTurnIdRef,
      runIdToTurnIdRef,
      sessionTurnsRef,
      setGatewayEventState,
      setIsSending,
      setActiveRunId,
      isOnboardingWaitingForResponse,
      setIsOnboardingWaitingForResponse,
      setIsOnboardingCompleted,
      clearFinalResponseRecoveryTimer,
      clearMissingResponseRecoveryState,
      setGatewayError,
    },
    gatewayConnectionFlowInput: {
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
    },
    outboxRuntimeInput: {
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
      clearOutboxRetryTimer,
      clearMissingResponseRecoveryState,
      setGatewayError,
      setGatewayEventState,
      setOutboxQueue,
      setChatTurns,
      setTranscript,
      setInterimTranscript,
      setActiveRunId,
    },
    speechRuntimeInput: {
      speechLang,
      isRecognizing,
      expectedSpeechStopRef,
      isUnmountingRef,
      setIsRecognizing,
      setSpeechError,
      setTranscript,
      setInterimTranscript,
    },
  });

  useAppRuntimeSideEffects({
    uiEffectsInput: {
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
    },
    persistenceEffectsInput: {
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
    },
    lifecycleInput: {
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
    },
  });

  const appContent = useAppContentWiring({
    homeUiStateInput: {
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
    },
    runtimeActions: {
      connectGateway,
      sendToGateway,
      refreshSessions,
      scheduleMissingResponseRecovery,
      startRecognition,
      stopRecognition,
    },
    gatewayActionHandlersHomeUiBaseInput: {
      setFocusedField,
      isMissingResponseRecoveryInFlight,
      isGatewayConnected,
      setGatewayError,
      setMissingResponseNotice,
      setHistoryRefreshNotice,
      setSpeechError,
      setIsOnboardingWaitingForResponse,
      setIsOnboardingCompleted,
      forceMaskAuthToken,
      isSessionPanelOpen,
      setIsSettingsPanelOpen,
      setIsSessionPanelOpen,
      setIsSessionRenameOpen,
      setSessionRenameTargetKey,
      setSessionRenameDraft,
      canToggleSettingsPanel,
      canDismissSettingsScreen,
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
      isRecognizing,
      isSending,
      holdActivatedRef,
      holdStartTimerRef,
      composerHeight,
      setComposerHeight,
    },
    gatewayActionHandlersInput: {
      quickTextInput: {
        isRecognizing,
        setTranscript,
        setInterimTranscript,
        setQuickTextTooltipSide,
        clearQuickTextLongPressResetTimer,
        scheduleQuickTextTooltipHide,
        hideQuickTextTooltip,
        quickTextLongPressSideRef,
        quickTextLongPressResetTimerRef,
      },
      transcriptRef,
      interimTranscriptRef,
      setTranscript,
      setInterimTranscript,
      setSpeechError,
    },
  });

  const { keyboardBarAnim } = useKeyboardUiRuntime({
    showKeyboardActionBar: appContent.showKeyboardActionBar,
    setKeyboardState,
    setIsKeyboardBarMounted,
  });

  const {
    styles,
    connectionHeaderProps,
    settingsScreenModalProps,
    settingsPanelContentProps,
    sessionsScreenModalProps,
    sessionsPanelContentProps,
    homeMainLayoutProps,
  } = useAppViewModelWiring({
    appContent,
    runtimeActions: {
      connectGateway,
      refreshSessions,
      createAndSwitchSession,
      switchSession,
      isSessionPinned,
      getSessionTitle,
      startSessionRename,
      toggleSessionPinned,
      submitSessionRename,
    },
    keyboardBarAnim,
    ui: {
      isDarkTheme,
      isGatewayConnected,
      isGatewayConnecting,
      isSessionPanelOpen,
      isSettingsPanelOpen,
      canToggleSettingsPanel,
      shouldShowSettingsScreen,
      canDismissSettingsScreen,
      isKeyboardVisible,
      isRecognizing,
      isSending,
      isSessionHistoryLoading,
      isMissingResponseRecoveryInFlight,
      isKeyboardBarMounted,
      showScrollToBottomButton,
      isOnboardingWaitingForResponse,
      transcript,
      interimTranscript,
      historyScrollRef,
      isSessionsLoading,
      settingsScrollRef,
      focusedField,
      setFocusedField,
      gatewayUrl,
      setGatewayUrl,
      authToken,
      setAuthToken,
      isAuthTokenMasked,
      toggleAuthTokenVisibility,
      settingsReady,
      isStartupAutoConnecting,
      gatewayDiagnosticIconName: appContent.gatewayDiagnosticIconName,
      gatewayConnectDiagnostic,
      theme,
      setTheme,
      speechLang,
      setSpeechLang,
      quickTextInputRefs,
      quickTextLeft,
      setQuickTextLeft,
      quickTextRight,
      setQuickTextRight,
      quickTextLeftIcon,
      setQuickTextLeftIcon,
      quickTextRightIcon,
      setQuickTextRightIcon,
      ensureSettingsFieldVisible,
      connectionState,
      gatewayEventState,
      activeSessionKey,
      activeRunId,
      historyLastSyncedAt,
      startupAutoConnectAttempt: startupAutoConnectAttemptRef.current,
      sessionRenameTargetKey,
      isSessionRenameOpen,
      sessionRenameDraft,
      setSessionRenameDraft,
      isSessionOperationPending,
      sessionsError,
      formatSessionUpdatedAt,
      setIsSessionRenameOpen,
      setSessionRenameTargetKey,
    },
  });

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style={isDarkTheme ? 'light' : 'dark'} />
      <KeyboardAvoidingView
        style={styles.keyboardWrap}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ConnectionHeader {...connectionHeaderProps} />

        <SettingsScreenModal {...settingsScreenModalProps}>
          <SettingsPanelContent {...settingsPanelContentProps} />
        </SettingsScreenModal>
        <SessionsScreenModal {...sessionsScreenModalProps}>
          <SessionsPanelContent {...sessionsPanelContentProps} />
        </SessionsScreenModal>
        <HomeMainLayout {...homeMainLayoutProps} />
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
