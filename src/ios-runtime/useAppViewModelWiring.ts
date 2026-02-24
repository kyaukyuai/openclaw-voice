import { useMemo, type ComponentProps } from 'react';
import type { Animated } from 'react-native';
import HomeMainLayout from '../ui/ios/HomeMainLayout';
import SettingsPanelContent from '../ui/ios/SettingsPanelContent';
import SessionsPanelContent from '../ui/ios/SessionsPanelContent';
import SettingsScreenModal from '../ui/ios/SettingsScreenModal';
import {
  ENABLE_DEBUG_WARNINGS,
  MAX_TEXT_SCALE,
  MAX_TEXT_SCALE_TIGHT,
} from '../utils';
import { createStyles } from '../ui/ios/styles';
import { useAppViewModel } from './useAppViewModel';
import type { useAppContentWiring } from './useAppContentWiring';
import type { useAppRuntimeOrchestrator } from './useAppRuntimeOrchestrator';

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

type UseAppViewModelWiringInput = {
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

export function useAppViewModelWiring(input: UseAppViewModelWiringInput) {
  const styles = useMemo(() => createStyles(input.ui.isDarkTheme), [input.ui.isDarkTheme]);
  const placeholderColor = input.ui.isDarkTheme ? '#95a8ca' : '#C4C4C0';

  const viewModel = useAppViewModel({
    styles,
    isDarkTheme: input.ui.isDarkTheme,
    maxTextScale: MAX_TEXT_SCALE,
    maxTextScaleTight: MAX_TEXT_SCALE_TIGHT,
    placeholderColor,
    connectionHeader: {
      connectionLabel: input.appContent.connectionStatusLabel,
      isGatewayConnected: input.ui.isGatewayConnected,
      isGatewayConnecting: input.ui.isGatewayConnecting,
      isSessionPanelOpen: input.ui.isSessionPanelOpen,
      isSettingsPanelOpen: input.ui.isSettingsPanelOpen,
      canToggleSettingsPanel: input.ui.canToggleSettingsPanel,
      onToggleSessionPanel: input.appContent.handleToggleSessionPanel,
      onToggleSettingsPanel: input.appContent.handleToggleSettingsPanel,
    },
    settingsScreenModal: {
      visible: input.ui.shouldShowSettingsScreen,
      canDismissSettingsScreen: input.ui.canDismissSettingsScreen,
      isSettingsStatusPending: input.appContent.isSettingsStatusPending,
      isSettingsStatusError: input.appContent.isSettingsStatusError,
      settingsStatusText: input.appContent.settingsStatusText,
      isKeyboardVisible: input.ui.isKeyboardVisible,
      settingsScrollRef: input.ui.settingsScrollRef,
      onClose: input.appContent.handleCloseSettingsPanel,
    },
    settingsPanelContent: {
      showOnboardingGuide: input.appContent.showOnboardingGuide,
      isQuickTextSettingsEditMode: input.appContent.isQuickTextSettingsEditMode,
      sectionIconColor: input.appContent.sectionIconColor,
      currentBadgeIconColor: input.appContent.currentBadgeIconColor,
      optionIconColor: input.appContent.optionIconColor,
      actionIconColor: input.appContent.actionIconColor,
      isOnboardingGatewayConfigured: input.appContent.isOnboardingGatewayConfigured,
      isOnboardingConnectDone: input.appContent.isOnboardingConnectDone,
      isOnboardingResponseDone: input.appContent.isOnboardingResponseDone,
      isOnboardingWaitingForResponse: input.ui.isOnboardingWaitingForResponse,
      canRunOnboardingConnectTest: input.appContent.canRunOnboardingConnectTest,
      canRunOnboardingSampleSend: input.appContent.canRunOnboardingSampleSend,
      isGatewayConnecting: input.ui.isGatewayConnecting,
      onboardingSampleButtonLabel: input.appContent.onboardingSampleButtonLabel,
      onOnboardingConnectTest: input.appContent.handleOnboardingConnectTest,
      onOnboardingSendSample: input.appContent.handleOnboardingSendSample,
      onCompleteOnboarding: input.appContent.handleCompleteOnboarding,
      focusedField: input.ui.focusedField,
      setFocusedField: input.ui.setFocusedField,
      gatewayUrl: input.ui.gatewayUrl,
      setGatewayUrl: input.ui.setGatewayUrl,
      authToken: input.ui.authToken,
      setAuthToken: input.ui.setAuthToken,
      isAuthTokenMasked: input.ui.isAuthTokenMasked,
      toggleAuthTokenVisibility: input.ui.toggleAuthTokenVisibility,
      settingsReady: input.ui.settingsReady,
      connectGateway: input.runtimeActions.connectGateway,
      isStartupAutoConnecting: input.ui.isStartupAutoConnecting,
      showGatewayDiagnostic: input.appContent.showGatewayDiagnostic,
      gatewayDiagnosticIconName: input.ui.gatewayDiagnosticIconName,
      gatewayConnectDiagnostic: input.ui.gatewayConnectDiagnostic,
      theme: input.ui.theme,
      setTheme: input.ui.setTheme,
      speechLang: input.ui.speechLang,
      setSpeechLang: input.ui.setSpeechLang,
      quickTextInputRefs: input.ui.quickTextInputRefs,
      quickTextLeft: input.ui.quickTextLeft,
      setQuickTextLeft: input.ui.setQuickTextLeft,
      quickTextRight: input.ui.quickTextRight,
      setQuickTextRight: input.ui.setQuickTextRight,
      quickTextLeftIcon: input.ui.quickTextLeftIcon,
      setQuickTextLeftIcon: input.ui.setQuickTextLeftIcon,
      quickTextRightIcon: input.ui.quickTextRightIcon,
      setQuickTextRightIcon: input.ui.setQuickTextRightIcon,
      ensureSettingsFieldVisible: input.ui.ensureSettingsFieldVisible,
      enableDebugWarnings: ENABLE_DEBUG_WARNINGS,
      connectionState: input.ui.connectionState,
      gatewayEventState: input.ui.gatewayEventState,
      activeSessionKey: input.ui.activeSessionKey,
      activeRunId: input.ui.activeRunId,
      historyLastSyncedAt: input.ui.historyLastSyncedAt,
      startupAutoConnectAttempt: input.ui.startupAutoConnectAttempt,
    },
    sessionsScreenModal: {
      visible: input.ui.isGatewayConnected && input.ui.isSessionPanelOpen,
      isSessionsLoading: input.ui.isSessionsLoading,
      hasSessionsError: Boolean(input.ui.sessionsError),
      sessionPanelStatusText: input.appContent.sessionPanelStatusText,
      onClose: input.appContent.handleCloseSessionPanel,
    },
    sessionsPanelContent: {
      sectionIconColor: input.appContent.sectionIconColor,
      actionIconColor: input.appContent.actionIconColor,
      currentBadgeIconColor: input.appContent.currentBadgeIconColor,
      pinnedBadgeIconColor: input.appContent.pinnedBadgeIconColor,
      isGatewayConnected: input.ui.isGatewayConnected,
      canRefreshSessions: input.appContent.canRefreshSessions,
      canCreateSession: input.appContent.canCreateSession,
      canSwitchSession: input.appContent.canSwitchSession,
      canRenameSession: input.appContent.canRenameSession,
      canPinSession: input.appContent.canPinSession,
      activeSessionKey: input.ui.activeSessionKey,
      visibleSessions: input.appContent.visibleSessions,
      sessionRenameTargetKey: input.ui.sessionRenameTargetKey,
      isSessionRenameOpen: input.ui.isSessionRenameOpen,
      sessionRenameDraft: input.ui.sessionRenameDraft,
      setSessionRenameDraft: input.ui.setSessionRenameDraft,
      isSessionOperationPending: input.ui.isSessionOperationPending,
      sessionsError: input.ui.sessionsError,
      sessionListHintText: input.appContent.sessionListHintText,
      refreshSessions: input.runtimeActions.refreshSessions,
      createAndSwitchSession: input.runtimeActions.createAndSwitchSession,
      switchSession: input.runtimeActions.switchSession,
      isSessionPinned: input.runtimeActions.isSessionPinned,
      getSessionTitle: input.runtimeActions.getSessionTitle,
      formatSessionUpdatedAt: input.ui.formatSessionUpdatedAt,
      startSessionRename: input.runtimeActions.startSessionRename,
      toggleSessionPinned: input.runtimeActions.toggleSessionPinned,
      submitSessionRename: input.runtimeActions.submitSessionRename,
      setIsSessionRenameOpen: input.ui.setIsSessionRenameOpen,
      setSessionRenameTargetKey: input.ui.setSessionRenameTargetKey,
    },
    homeMainLayout: {
      topBannerKind: input.appContent.topBannerKind,
      topBannerMessage: input.appContent.topBannerMessage ?? null,
      topBannerIconName: input.appContent.topBannerIconName,
      canReconnectFromError: input.appContent.canReconnectFromError,
      canRetryFromError: input.appContent.canRetryFromError,
      canRetryMissingResponse: input.appContent.canRetryMissingResponse,
      isMissingResponseRecoveryInFlight: input.ui.isMissingResponseRecoveryInFlight,
      isGatewayConnected: input.ui.isGatewayConnected,
      onReconnectFromError: input.appContent.handleReconnectFromError,
      onRetryFromError: input.appContent.handleRetryFromError,
      onRetryMissingResponse: input.appContent.handleRetryMissingResponse,
      onDismissTopBanner: input.appContent.handleDismissTopBanner,
      showHistoryCard: input.appContent.showHistoryCard,
      showHistoryRefreshButton: input.appContent.showHistoryRefreshButton,
      isSessionHistoryLoading: input.ui.isSessionHistoryLoading,
      onRefreshHistory: input.appContent.handleRefreshHistory,
      showHistoryUpdatedMeta: input.appContent.showHistoryUpdatedMeta,
      historyUpdatedLabel: input.appContent.historyUpdatedLabel,
      historyScrollRef: input.ui.historyScrollRef,
      historyItems: input.appContent.historyItems,
      historyListBottomPadding: input.appContent.historyListBottomPadding,
      showScrollToBottomButton: input.ui.showScrollToBottomButton,
      showHistoryScrollButton: input.appContent.showHistoryScrollButton,
      isHomeComposingMode: input.appContent.isHomeComposingMode,
      showHistoryDateDivider: input.appContent.showHistoryDateDivider,
      onHistoryScroll: input.appContent.handleHistoryScroll,
      onHistoryAutoScroll: input.appContent.handleHistoryAutoScroll,
      onHistoryLayoutAutoScroll: input.appContent.handleHistoryLayoutAutoScroll,
      onScrollHistoryToBottom: input.appContent.handleScrollHistoryToBottom,
      isRecognizing: input.ui.isRecognizing,
      isTranscriptEditingWithKeyboard:
        input.appContent.isTranscriptEditingWithKeyboard,
      shouldUseCompactTranscriptCard: input.appContent.shouldUseCompactTranscriptCard,
      focusedField: input.ui.focusedField,
      transcript: input.ui.transcript,
      transcriptPlaceholder: input.appContent.transcriptPlaceholder,
      interimTranscript: input.ui.interimTranscript,
      onTranscriptChange: input.appContent.handleTranscriptChange,
      onFocusTranscript: input.appContent.handleTranscriptFocus,
      onBlurTranscript: input.appContent.handleTranscriptBlur,
      isTranscriptFocused: input.appContent.isTranscriptFocused,
      isKeyboardVisible: input.ui.isKeyboardVisible,
      onBottomDockHeightChange: input.appContent.handleBottomDockHeightChange,
      isKeyboardBarMounted: input.ui.isKeyboardBarMounted,
      keyboardBarAnim: input.keyboardBarAnim,
      showDoneOnlyAction: input.appContent.showDoneOnlyAction,
      showClearInKeyboardBar: input.appContent.showClearInKeyboardBar,
      canClearFromKeyboardBar: input.appContent.canClearFromKeyboardBar,
      canSendFromKeyboardBar: input.appContent.canSendFromKeyboardBar,
      onDoneKeyboardAction: input.appContent.handleDoneKeyboardAction,
      onClearKeyboardAction: input.appContent.handleClearKeyboardAction,
      onSendKeyboardAction: input.appContent.handleSendKeyboardAction,
      showQuickTextLeftTooltip: input.appContent.showQuickTextLeftTooltip,
      showQuickTextRightTooltip: input.appContent.showQuickTextRightTooltip,
      quickTextLeftLabel: input.appContent.quickTextLeftLabel,
      quickTextRightLabel: input.appContent.quickTextRightLabel,
      quickTextLeftIcon: input.ui.quickTextLeftIcon,
      quickTextRightIcon: input.ui.quickTextRightIcon,
      canUseQuickTextLeft: input.appContent.canUseQuickTextLeft,
      canUseQuickTextRight: input.appContent.canUseQuickTextRight,
      onQuickTextPress: input.appContent.handleQuickTextPress,
      onQuickTextLongPress: input.appContent.handleQuickTextLongPress,
      onQuickTextPressOut: input.appContent.handleQuickTextPressOut,
      canSendDraft: input.appContent.canSendDraft,
      isSending: input.ui.isSending,
      speechRecognitionSupported: input.appContent.speechRecognitionSupported,
      settingsReady: input.ui.settingsReady,
      onSendDraftAction: input.appContent.handleSendDraftAction,
      onMicPressIn: input.appContent.handleHoldToTalkPressIn,
      onMicPressOut: input.appContent.handleHoldToTalkPressOut,
      onActionPressHaptic: input.appContent.handleBottomDockActionPressHaptic,
      showBottomStatus: input.appContent.showBottomStatus,
      bottomActionStatus: input.appContent.bottomActionStatus,
      bottomActionLabel: input.appContent.bottomActionStatusLabel,
      bottomActionDetailText: input.appContent.bottomActionDetailText,
    },
  });

  return {
    styles,
    ...viewModel,
  };
}
