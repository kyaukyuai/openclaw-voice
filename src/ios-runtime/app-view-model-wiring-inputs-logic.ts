import type { ComponentProps } from 'react';
import type { Animated } from 'react-native';
import type ConnectionHeader from '../ui/ios/ConnectionHeader';
import type HomeMainLayout from '../ui/ios/HomeMainLayout';
import type SessionsPanelContent from '../ui/ios/SessionsPanelContent';
import type SessionsScreenModal from '../ui/ios/SessionsScreenModal';
import type SettingsPanelContent from '../ui/ios/SettingsPanelContent';
import type SettingsScreenModal from '../ui/ios/SettingsScreenModal';
import type { useAppContentWiring } from './useAppContentWiring';
import type { useAppRuntimeOrchestrator } from './useAppRuntimeOrchestrator';
import type { useAppViewModel } from './useAppViewModel';

type AppContentState = ReturnType<typeof useAppContentWiring>;
type RuntimeActions = Pick<
  ReturnType<typeof useAppRuntimeOrchestrator>,
  | 'connectGateway'
  | 'refreshSessions'
  | 'createAndSwitchSession'
  | 'switchSession'
  | 'isSessionPinned'
  | 'getSessionTitle'
  | 'startSessionRename'
  | 'toggleSessionPinned'
  | 'submitSessionRename'
>;

type SettingsPanelProps = ComponentProps<typeof SettingsPanelContent>;
type SessionsPanelProps = ComponentProps<typeof SessionsPanelContent>;
type HomeMainLayoutProps = ComponentProps<typeof HomeMainLayout>;
type SettingsScreenModalProps = Omit<
  ComponentProps<typeof SettingsScreenModal>,
  'children'
>;
type SessionsScreenModalProps = Omit<
  ComponentProps<typeof SessionsScreenModal>,
  'children'
>;

export type UseAppViewModelWiringInput = {
  appContent: AppContentState;
  runtimeActions: RuntimeActions;
  keyboardBarAnim: Animated.Value;
  ui: {
    isDarkTheme: boolean;
    isGatewayConnected: boolean;
    isGatewayConnecting: boolean;
    isSessionPanelOpen: boolean;
    isSettingsPanelOpen: boolean;
    canToggleSettingsPanel: boolean;
    shouldShowSettingsScreen: boolean;
    canDismissSettingsScreen: boolean;
    isKeyboardVisible: boolean;
    isRecognizing: boolean;
    isSending: boolean;
    isSessionHistoryLoading: boolean;
    isMissingResponseRecoveryInFlight: boolean;
    isKeyboardBarMounted: boolean;
    showScrollToBottomButton: boolean;
    isOnboardingWaitingForResponse: boolean;
    transcript: string;
    interimTranscript: string;
    historyScrollRef: HomeMainLayoutProps['historyScrollRef'];
    isSessionsLoading: boolean;
    settingsScrollRef: SettingsScreenModalProps['settingsScrollRef'];
    focusedField: SettingsPanelProps['focusedField'];
    setFocusedField: SettingsPanelProps['setFocusedField'];
    gatewayUrl: SettingsPanelProps['gatewayUrl'];
    setGatewayUrl: SettingsPanelProps['setGatewayUrl'];
    authToken: SettingsPanelProps['authToken'];
    setAuthToken: SettingsPanelProps['setAuthToken'];
    isAuthTokenMasked: SettingsPanelProps['isAuthTokenMasked'];
    toggleAuthTokenVisibility: SettingsPanelProps['toggleAuthTokenVisibility'];
    settingsReady: SettingsPanelProps['settingsReady'];
    isStartupAutoConnecting: SettingsPanelProps['isStartupAutoConnecting'];
    gatewayDiagnosticIconName: SettingsPanelProps['gatewayDiagnosticIconName'];
    gatewayConnectDiagnostic: SettingsPanelProps['gatewayConnectDiagnostic'];
    theme: SettingsPanelProps['theme'];
    setTheme: SettingsPanelProps['setTheme'];
    speechLang: SettingsPanelProps['speechLang'];
    setSpeechLang: SettingsPanelProps['setSpeechLang'];
    quickTextInputRefs: SettingsPanelProps['quickTextInputRefs'];
    quickTextLeft: SettingsPanelProps['quickTextLeft'];
    setQuickTextLeft: SettingsPanelProps['setQuickTextLeft'];
    quickTextRight: SettingsPanelProps['quickTextRight'];
    setQuickTextRight: SettingsPanelProps['setQuickTextRight'];
    quickTextLeftIcon: SettingsPanelProps['quickTextLeftIcon'];
    setQuickTextLeftIcon: SettingsPanelProps['setQuickTextLeftIcon'];
    quickTextRightIcon: SettingsPanelProps['quickTextRightIcon'];
    setQuickTextRightIcon: SettingsPanelProps['setQuickTextRightIcon'];
    ensureSettingsFieldVisible: SettingsPanelProps['ensureSettingsFieldVisible'];
    connectionState: SettingsPanelProps['connectionState'];
    gatewayEventState: SettingsPanelProps['gatewayEventState'];
    activeSessionKey: SettingsPanelProps['activeSessionKey'];
    activeRunId: SettingsPanelProps['activeRunId'];
    historyLastSyncedAt: SettingsPanelProps['historyLastSyncedAt'];
    startupAutoConnectAttempt: SettingsPanelProps['startupAutoConnectAttempt'];
    sessionRenameTargetKey: SessionsPanelProps['sessionRenameTargetKey'];
    isSessionRenameOpen: SessionsPanelProps['isSessionRenameOpen'];
    sessionRenameDraft: SessionsPanelProps['sessionRenameDraft'];
    setSessionRenameDraft: SessionsPanelProps['setSessionRenameDraft'];
    isSessionOperationPending: SessionsPanelProps['isSessionOperationPending'];
    sessionsError: SessionsPanelProps['sessionsError'];
    formatSessionUpdatedAt: SessionsPanelProps['formatSessionUpdatedAt'];
    setIsSessionRenameOpen: SessionsPanelProps['setIsSessionRenameOpen'];
    setSessionRenameTargetKey: SessionsPanelProps['setSessionRenameTargetKey'];
  };
};

type BuildUseAppViewModelInputArgs = {
  wiringInput: UseAppViewModelWiringInput;
  styles: Record<string, unknown>;
  placeholderColor: string;
  maxTextScale: number;
  maxTextScaleTight: number;
  enableDebugWarnings: boolean;
};

export function buildUseAppViewModelInput(
  input: BuildUseAppViewModelInputArgs,
): Parameters<typeof useAppViewModel>[0] {
  const {
    wiringInput,
    styles,
    placeholderColor,
    maxTextScale,
    maxTextScaleTight,
    enableDebugWarnings,
  } = input;
  const { appContent, runtimeActions, keyboardBarAnim, ui } = wiringInput;

  return {
    styles,
    isDarkTheme: ui.isDarkTheme,
    maxTextScale,
    maxTextScaleTight,
    placeholderColor,
    connectionHeader: {
      connectionLabel: appContent.connectionStatusLabel,
      isGatewayConnected: ui.isGatewayConnected,
      isGatewayConnecting: ui.isGatewayConnecting,
      isSessionPanelOpen: ui.isSessionPanelOpen,
      isSettingsPanelOpen: ui.isSettingsPanelOpen,
      canToggleSettingsPanel: ui.canToggleSettingsPanel,
      onToggleSessionPanel: appContent.handleToggleSessionPanel,
      onToggleSettingsPanel: appContent.handleToggleSettingsPanel,
    },
    settingsScreenModal: {
      visible: ui.shouldShowSettingsScreen,
      canDismissSettingsScreen: ui.canDismissSettingsScreen,
      isSettingsStatusPending: appContent.isSettingsStatusPending,
      isSettingsStatusError: appContent.isSettingsStatusError,
      settingsStatusText: appContent.settingsStatusText,
      isKeyboardVisible: ui.isKeyboardVisible,
      settingsScrollRef: ui.settingsScrollRef,
      onClose: appContent.handleCloseSettingsPanel,
    },
    settingsPanelContent: {
      showOnboardingGuide: appContent.showOnboardingGuide,
      isQuickTextSettingsEditMode: appContent.isQuickTextSettingsEditMode,
      sectionIconColor: appContent.sectionIconColor,
      currentBadgeIconColor: appContent.currentBadgeIconColor,
      optionIconColor: appContent.optionIconColor,
      actionIconColor: appContent.actionIconColor,
      isOnboardingGatewayConfigured: appContent.isOnboardingGatewayConfigured,
      isOnboardingConnectDone: appContent.isOnboardingConnectDone,
      isOnboardingResponseDone: appContent.isOnboardingResponseDone,
      isOnboardingWaitingForResponse: ui.isOnboardingWaitingForResponse,
      canRunOnboardingConnectTest: appContent.canRunOnboardingConnectTest,
      canRunOnboardingSampleSend: appContent.canRunOnboardingSampleSend,
      isGatewayConnecting: ui.isGatewayConnecting,
      onboardingSampleButtonLabel: appContent.onboardingSampleButtonLabel,
      onOnboardingConnectTest: appContent.handleOnboardingConnectTest,
      onOnboardingSendSample: appContent.handleOnboardingSendSample,
      onCompleteOnboarding: appContent.handleCompleteOnboarding,
      focusedField: ui.focusedField,
      setFocusedField: ui.setFocusedField,
      gatewayUrl: ui.gatewayUrl,
      setGatewayUrl: ui.setGatewayUrl,
      authToken: ui.authToken,
      setAuthToken: ui.setAuthToken,
      isAuthTokenMasked: ui.isAuthTokenMasked,
      toggleAuthTokenVisibility: ui.toggleAuthTokenVisibility,
      settingsReady: ui.settingsReady,
      connectGateway: runtimeActions.connectGateway,
      isStartupAutoConnecting: ui.isStartupAutoConnecting,
      showGatewayDiagnostic: appContent.showGatewayDiagnostic,
      gatewayDiagnosticIconName: ui.gatewayDiagnosticIconName,
      gatewayConnectDiagnostic: ui.gatewayConnectDiagnostic,
      theme: ui.theme,
      setTheme: ui.setTheme,
      speechLang: ui.speechLang,
      setSpeechLang: ui.setSpeechLang,
      quickTextInputRefs: ui.quickTextInputRefs,
      quickTextLeft: ui.quickTextLeft,
      setQuickTextLeft: ui.setQuickTextLeft,
      quickTextRight: ui.quickTextRight,
      setQuickTextRight: ui.setQuickTextRight,
      quickTextLeftIcon: ui.quickTextLeftIcon,
      setQuickTextLeftIcon: ui.setQuickTextLeftIcon,
      quickTextRightIcon: ui.quickTextRightIcon,
      setQuickTextRightIcon: ui.setQuickTextRightIcon,
      ensureSettingsFieldVisible: ui.ensureSettingsFieldVisible,
      enableDebugWarnings,
      connectionState: ui.connectionState,
      gatewayEventState: ui.gatewayEventState,
      activeSessionKey: ui.activeSessionKey,
      activeRunId: ui.activeRunId,
      historyLastSyncedAt: ui.historyLastSyncedAt,
      startupAutoConnectAttempt: ui.startupAutoConnectAttempt,
    },
    sessionsScreenModal: {
      visible: ui.isGatewayConnected && ui.isSessionPanelOpen,
      isSessionsLoading: ui.isSessionsLoading,
      hasSessionsError: Boolean(ui.sessionsError),
      sessionPanelStatusText: appContent.sessionPanelStatusText,
      onClose: appContent.handleCloseSessionPanel,
    },
    sessionsPanelContent: {
      sectionIconColor: appContent.sectionIconColor,
      actionIconColor: appContent.actionIconColor,
      currentBadgeIconColor: appContent.currentBadgeIconColor,
      pinnedBadgeIconColor: appContent.pinnedBadgeIconColor,
      isGatewayConnected: ui.isGatewayConnected,
      canRefreshSessions: appContent.canRefreshSessions,
      canCreateSession: appContent.canCreateSession,
      canSwitchSession: appContent.canSwitchSession,
      canRenameSession: appContent.canRenameSession,
      canPinSession: appContent.canPinSession,
      activeSessionKey: ui.activeSessionKey,
      visibleSessions: appContent.visibleSessions,
      sessionRenameTargetKey: ui.sessionRenameTargetKey,
      isSessionRenameOpen: ui.isSessionRenameOpen,
      sessionRenameDraft: ui.sessionRenameDraft,
      setSessionRenameDraft: ui.setSessionRenameDraft,
      isSessionOperationPending: ui.isSessionOperationPending,
      sessionsError: ui.sessionsError,
      sessionListHintText: appContent.sessionListHintText,
      refreshSessions: runtimeActions.refreshSessions,
      createAndSwitchSession: runtimeActions.createAndSwitchSession,
      switchSession: runtimeActions.switchSession,
      isSessionPinned: runtimeActions.isSessionPinned,
      getSessionTitle: runtimeActions.getSessionTitle,
      formatSessionUpdatedAt: ui.formatSessionUpdatedAt,
      startSessionRename: runtimeActions.startSessionRename,
      toggleSessionPinned: runtimeActions.toggleSessionPinned,
      submitSessionRename: runtimeActions.submitSessionRename,
      setIsSessionRenameOpen: ui.setIsSessionRenameOpen,
      setSessionRenameTargetKey: ui.setSessionRenameTargetKey,
    },
    homeMainLayout: {
      topBannerKind: appContent.topBannerKind,
      topBannerMessage: appContent.topBannerMessage ?? null,
      topBannerIconName: appContent.topBannerIconName,
      canReconnectFromError: appContent.canReconnectFromError,
      canRetryFromError: appContent.canRetryFromError,
      canRetryMissingResponse: appContent.canRetryMissingResponse,
      isMissingResponseRecoveryInFlight: ui.isMissingResponseRecoveryInFlight,
      isGatewayConnected: ui.isGatewayConnected,
      onReconnectFromError: appContent.handleReconnectFromError,
      onRetryFromError: appContent.handleRetryFromError,
      onRetryMissingResponse: appContent.handleRetryMissingResponse,
      onDismissTopBanner: appContent.handleDismissTopBanner,
      showHistoryCard: appContent.showHistoryCard,
      showHistoryRefreshButton: appContent.showHistoryRefreshButton,
      isSessionHistoryLoading: ui.isSessionHistoryLoading,
      onRefreshHistory: appContent.handleRefreshHistory,
      showHistoryUpdatedMeta: appContent.showHistoryUpdatedMeta,
      historyUpdatedLabel: appContent.historyUpdatedLabel,
      historyScrollRef: ui.historyScrollRef,
      historyItems: appContent.historyItems,
      historyListBottomPadding: appContent.historyListBottomPadding,
      showScrollToBottomButton: ui.showScrollToBottomButton,
      showHistoryScrollButton: appContent.showHistoryScrollButton,
      isHomeComposingMode: appContent.isHomeComposingMode,
      showHistoryDateDivider: appContent.showHistoryDateDivider,
      onHistoryScroll: appContent.handleHistoryScroll,
      onHistoryAutoScroll: appContent.handleHistoryAutoScroll,
      onHistoryLayoutAutoScroll: appContent.handleHistoryLayoutAutoScroll,
      onScrollHistoryToBottom: appContent.handleScrollHistoryToBottom,
      isRecognizing: ui.isRecognizing,
      isTranscriptEditingWithKeyboard:
        appContent.isTranscriptEditingWithKeyboard,
      shouldUseCompactTranscriptCard: appContent.shouldUseCompactTranscriptCard,
      focusedField: ui.focusedField,
      transcript: ui.transcript,
      transcriptPlaceholder: appContent.transcriptPlaceholder,
      interimTranscript: ui.interimTranscript,
      onTranscriptChange: appContent.handleTranscriptChange,
      onFocusTranscript: appContent.handleTranscriptFocus,
      onBlurTranscript: appContent.handleTranscriptBlur,
      isTranscriptFocused: appContent.isTranscriptFocused,
      isKeyboardVisible: ui.isKeyboardVisible,
      onBottomDockHeightChange: appContent.handleBottomDockHeightChange,
      isKeyboardBarMounted: ui.isKeyboardBarMounted,
      keyboardBarAnim,
      showDoneOnlyAction: appContent.showDoneOnlyAction,
      showClearInKeyboardBar: appContent.showClearInKeyboardBar,
      canClearFromKeyboardBar: appContent.canClearFromKeyboardBar,
      canSendFromKeyboardBar: appContent.canSendFromKeyboardBar,
      onDoneKeyboardAction: appContent.handleDoneKeyboardAction,
      onClearKeyboardAction: appContent.handleClearKeyboardAction,
      onSendKeyboardAction: appContent.handleSendKeyboardAction,
      showQuickTextLeftTooltip: appContent.showQuickTextLeftTooltip,
      showQuickTextRightTooltip: appContent.showQuickTextRightTooltip,
      quickTextLeftLabel: appContent.quickTextLeftLabel,
      quickTextRightLabel: appContent.quickTextRightLabel,
      quickTextLeftIcon: ui.quickTextLeftIcon,
      quickTextRightIcon: ui.quickTextRightIcon,
      canUseQuickTextLeft: appContent.canUseQuickTextLeft,
      canUseQuickTextRight: appContent.canUseQuickTextRight,
      onQuickTextPress: appContent.handleQuickTextPress,
      onQuickTextLongPress: appContent.handleQuickTextLongPress,
      onQuickTextPressOut: appContent.handleQuickTextPressOut,
      canSendDraft: appContent.canSendDraft,
      isSending: ui.isSending,
      speechRecognitionSupported: appContent.speechRecognitionSupported,
      settingsReady: ui.settingsReady,
      onSendDraftAction: appContent.handleSendDraftAction,
      onMicPressIn: appContent.handleHoldToTalkPressIn,
      onMicPressOut: appContent.handleHoldToTalkPressOut,
      onActionPressHaptic: appContent.handleBottomDockActionPressHaptic,
      showBottomStatus: appContent.showBottomStatus,
      bottomActionStatus: appContent.bottomActionStatus,
      bottomActionLabel: appContent.bottomActionStatusLabel,
      bottomActionDetailText: appContent.bottomActionDetailText,
    },
  };
}
