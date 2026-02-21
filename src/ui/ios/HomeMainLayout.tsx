import type { RefObject } from 'react';
import { Animated, View } from 'react-native';
import type {
  BottomActionStatus,
  FocusField,
  HistoryListItem,
  QuickTextButtonSide,
  QuickTextIcon,
} from '../../types';
import BottomDockControls from './BottomDockControls';
import HistoryTimelineCard from './HistoryTimelineCard';
import TopBanner from './TopBanner';
import TranscriptComposerCard from './TranscriptComposerCard';

type TopBannerKind = 'gateway' | 'recovery' | 'history' | 'speech';
type TopBannerIconName =
  | 'cloud-offline-outline'
  | 'time-outline'
  | 'refresh-outline'
  | 'mic-off-outline';

type HomeMainLayoutProps = {
  styles: Record<string, any>;
  isDarkTheme: boolean;
  topBannerKind: TopBannerKind | null;
  topBannerMessage: string | null;
  topBannerIconName: TopBannerIconName;
  canReconnectFromError: boolean;
  canRetryFromError: boolean;
  canRetryMissingResponse: boolean;
  isMissingResponseRecoveryInFlight: boolean;
  isGatewayConnected: boolean;
  onReconnectFromError: () => void;
  onRetryFromError: () => void;
  onRetryMissingResponse: () => void;
  onDismissTopBanner: () => void;
  showHistoryCard: boolean;
  showHistoryRefreshButton: boolean;
  isSessionHistoryLoading: boolean;
  onRefreshHistory: () => void;
  showHistoryUpdatedMeta: boolean;
  historyUpdatedLabel: string | null;
  historyScrollRef: RefObject<any>;
  historyItems: HistoryListItem[];
  historyListBottomPadding: number;
  showScrollToBottomButton: boolean;
  showHistoryScrollButton: boolean;
  isHomeComposingMode: boolean;
  showHistoryDateDivider: boolean;
  onHistoryScroll: (event: any) => void;
  onHistoryAutoScroll: () => void;
  onHistoryLayoutAutoScroll: () => void;
  onScrollHistoryToBottom: () => void;
  isRecognizing: boolean;
  isTranscriptEditingWithKeyboard: boolean;
  shouldUseCompactTranscriptCard: boolean;
  focusedField: FocusField;
  transcript: string;
  transcriptPlaceholder: string;
  placeholderColor: string;
  interimTranscript: string;
  onTranscriptChange: (value: string) => void;
  onFocusTranscript: () => void;
  onBlurTranscript: () => void;
  isTranscriptFocused: boolean;
  isKeyboardVisible: boolean;
  onBottomDockHeightChange: (nextHeight: number) => void;
  isKeyboardBarMounted: boolean;
  keyboardBarAnim: Animated.Value;
  showDoneOnlyAction: boolean;
  showClearInKeyboardBar: boolean;
  canClearFromKeyboardBar: boolean;
  canSendFromKeyboardBar: boolean;
  onDoneKeyboardAction: () => void;
  onClearKeyboardAction: () => void;
  onSendKeyboardAction: () => void;
  showQuickTextLeftTooltip: boolean;
  showQuickTextRightTooltip: boolean;
  quickTextLeftLabel: string;
  quickTextRightLabel: string;
  quickTextLeftIcon: QuickTextIcon;
  quickTextRightIcon: QuickTextIcon;
  canUseQuickTextLeft: boolean;
  canUseQuickTextRight: boolean;
  onQuickTextPress: (side: QuickTextButtonSide, text: string) => void;
  onQuickTextLongPress: (side: QuickTextButtonSide, text: string) => void;
  onQuickTextPressOut: (side: QuickTextButtonSide) => void;
  canSendDraft: boolean;
  isSending: boolean;
  speechRecognitionSupported: boolean;
  settingsReady: boolean;
  onSendDraftAction: () => void;
  onMicPressIn: () => void;
  onMicPressOut: () => void;
  onActionPressHaptic: () => void;
  showBottomStatus: boolean;
  bottomActionStatus: BottomActionStatus;
  bottomActionLabel: string;
  bottomActionDetailText: string;
  maxTextScale: number;
  maxTextScaleTight: number;
};

export default function HomeMainLayout({
  styles,
  isDarkTheme,
  topBannerKind,
  topBannerMessage,
  topBannerIconName,
  canReconnectFromError,
  canRetryFromError,
  canRetryMissingResponse,
  isMissingResponseRecoveryInFlight,
  isGatewayConnected,
  onReconnectFromError,
  onRetryFromError,
  onRetryMissingResponse,
  onDismissTopBanner,
  showHistoryCard,
  showHistoryRefreshButton,
  isSessionHistoryLoading,
  onRefreshHistory,
  showHistoryUpdatedMeta,
  historyUpdatedLabel,
  historyScrollRef,
  historyItems,
  historyListBottomPadding,
  showScrollToBottomButton,
  showHistoryScrollButton,
  isHomeComposingMode,
  showHistoryDateDivider,
  onHistoryScroll,
  onHistoryAutoScroll,
  onHistoryLayoutAutoScroll,
  onScrollHistoryToBottom,
  isRecognizing,
  isTranscriptEditingWithKeyboard,
  shouldUseCompactTranscriptCard,
  focusedField,
  transcript,
  transcriptPlaceholder,
  placeholderColor,
  interimTranscript,
  onTranscriptChange,
  onFocusTranscript,
  onBlurTranscript,
  isTranscriptFocused,
  isKeyboardVisible,
  onBottomDockHeightChange,
  isKeyboardBarMounted,
  keyboardBarAnim,
  showDoneOnlyAction,
  showClearInKeyboardBar,
  canClearFromKeyboardBar,
  canSendFromKeyboardBar,
  onDoneKeyboardAction,
  onClearKeyboardAction,
  onSendKeyboardAction,
  showQuickTextLeftTooltip,
  showQuickTextRightTooltip,
  quickTextLeftLabel,
  quickTextRightLabel,
  quickTextLeftIcon,
  quickTextRightIcon,
  canUseQuickTextLeft,
  canUseQuickTextRight,
  onQuickTextPress,
  onQuickTextLongPress,
  onQuickTextPressOut,
  canSendDraft,
  isSending,
  speechRecognitionSupported,
  settingsReady,
  onSendDraftAction,
  onMicPressIn,
  onMicPressOut,
  onActionPressHaptic,
  showBottomStatus,
  bottomActionStatus,
  bottomActionLabel,
  bottomActionDetailText,
  maxTextScale,
  maxTextScaleTight,
}: HomeMainLayoutProps) {
  return (
    <>
      <View style={styles.headerBoundary} pointerEvents="none" />
      {topBannerMessage && topBannerKind ? (
        <TopBanner
          styles={styles}
          kind={topBannerKind}
          message={topBannerMessage}
          iconName={topBannerIconName}
          canReconnectFromError={canReconnectFromError}
          canRetryFromError={canRetryFromError}
          canRetryMissingResponse={canRetryMissingResponse}
          isMissingResponseRecoveryInFlight={isMissingResponseRecoveryInFlight}
          isGatewayConnected={isGatewayConnected}
          onReconnectFromError={onReconnectFromError}
          onRetryFromError={onRetryFromError}
          onRetryMissingResponse={onRetryMissingResponse}
          onDismiss={onDismissTopBanner}
          maxTextScaleTight={maxTextScaleTight}
        />
      ) : null}
      <View style={styles.main}>
        <HistoryTimelineCard
          styles={styles}
          isDarkTheme={isDarkTheme}
          showHistoryCard={showHistoryCard}
          showHistoryRefreshButton={showHistoryRefreshButton}
          isGatewayConnected={isGatewayConnected}
          isSessionHistoryLoading={isSessionHistoryLoading}
          onRefreshHistory={onRefreshHistory}
          showHistoryUpdatedMeta={showHistoryUpdatedMeta}
          historyUpdatedLabel={historyUpdatedLabel}
          historyScrollRef={historyScrollRef}
          historyItems={historyItems}
          historyListBottomPadding={historyListBottomPadding}
          showScrollToBottomButton={showScrollToBottomButton}
          showHistoryScrollButton={showHistoryScrollButton}
          isHomeComposingMode={isHomeComposingMode}
          showHistoryDateDivider={showHistoryDateDivider}
          onHistoryScroll={onHistoryScroll}
          onHistoryAutoScroll={onHistoryAutoScroll}
          onHistoryLayoutAutoScroll={onHistoryLayoutAutoScroll}
          onScrollToBottom={onScrollHistoryToBottom}
          maxTextScale={maxTextScale}
          maxTextScaleTight={maxTextScaleTight}
        />
        <TranscriptComposerCard
          styles={styles}
          isRecognizing={isRecognizing}
          isTranscriptEditingWithKeyboard={isTranscriptEditingWithKeyboard}
          shouldUseCompactTranscriptCard={shouldUseCompactTranscriptCard}
          focusedField={focusedField}
          transcript={transcript}
          transcriptPlaceholder={transcriptPlaceholder}
          placeholderColor={placeholderColor}
          interimTranscript={interimTranscript}
          maxTextScale={maxTextScale}
          onTranscriptChange={onTranscriptChange}
          onFocusTranscript={onFocusTranscript}
          onBlurTranscript={onBlurTranscript}
        />
      </View>
      <View
        style={[
          styles.bottomDock,
          isHomeComposingMode && styles.bottomDockComposing,
          isTranscriptFocused && styles.bottomDockKeyboardOpen,
          isKeyboardVisible && styles.bottomDockKeyboardCompact,
        ]}
        onLayout={(event) => {
          const nextHeight = Math.round(event.nativeEvent.layout.height);
          onBottomDockHeightChange(nextHeight);
        }}
      >
        <BottomDockControls
          styles={styles}
          isKeyboardBarMounted={isKeyboardBarMounted}
          keyboardBarAnim={keyboardBarAnim}
          showDoneOnlyAction={showDoneOnlyAction}
          showClearInKeyboardBar={showClearInKeyboardBar}
          canClearFromKeyboardBar={canClearFromKeyboardBar}
          canSendFromKeyboardBar={canSendFromKeyboardBar}
          onDone={onDoneKeyboardAction}
          onClear={onClearKeyboardAction}
          onSendFromKeyboardBar={onSendKeyboardAction}
          showQuickTextLeftTooltip={showQuickTextLeftTooltip}
          showQuickTextRightTooltip={showQuickTextRightTooltip}
          quickTextLeftLabel={quickTextLeftLabel}
          quickTextRightLabel={quickTextRightLabel}
          quickTextLeftIcon={quickTextLeftIcon}
          quickTextRightIcon={quickTextRightIcon}
          canUseQuickTextLeft={canUseQuickTextLeft}
          canUseQuickTextRight={canUseQuickTextRight}
          onQuickTextLeftPress={() => {
            onQuickTextPress('left', quickTextLeftLabel);
          }}
          onQuickTextLeftLongPress={() => {
            onQuickTextLongPress('left', quickTextLeftLabel);
          }}
          onQuickTextLeftPressOut={() => {
            onQuickTextPressOut('left');
          }}
          onQuickTextRightPress={() => {
            onQuickTextPress('right', quickTextRightLabel);
          }}
          onQuickTextRightLongPress={() => {
            onQuickTextLongPress('right', quickTextRightLabel);
          }}
          onQuickTextRightPressOut={() => {
            onQuickTextPressOut('right');
          }}
          canSendDraft={canSendDraft}
          isSending={isSending}
          isGatewayConnected={isGatewayConnected}
          isRecognizing={isRecognizing}
          speechRecognitionSupported={speechRecognitionSupported}
          settingsReady={settingsReady}
          onSendDraft={onSendDraftAction}
          onMicPressIn={onMicPressIn}
          onMicPressOut={onMicPressOut}
          onActionPressHaptic={onActionPressHaptic}
          showBottomStatus={showBottomStatus}
          bottomActionStatus={bottomActionStatus}
          bottomActionLabel={bottomActionLabel}
          bottomActionDetailText={bottomActionDetailText}
          maxTextScale={maxTextScale}
          maxTextScaleTight={maxTextScaleTight}
        />
      </View>
    </>
  );
}
