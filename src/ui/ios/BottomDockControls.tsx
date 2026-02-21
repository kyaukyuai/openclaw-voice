import { Ionicons } from '@expo/vector-icons';
import { Animated, Pressable, Text, View } from 'react-native';
import type { BottomActionStatus, QuickTextIcon } from '../../types';

type BottomDockControlsProps = {
  styles: Record<string, any>;
  isKeyboardBarMounted: boolean;
  keyboardBarAnim: Animated.Value;
  showDoneOnlyAction: boolean;
  showClearInKeyboardBar: boolean;
  canClearFromKeyboardBar: boolean;
  canSendFromKeyboardBar: boolean;
  onDone: () => void;
  onClear: () => void;
  onSendFromKeyboardBar: () => void;
  showQuickTextLeftTooltip: boolean;
  showQuickTextRightTooltip: boolean;
  quickTextLeftLabel: string;
  quickTextRightLabel: string;
  quickTextLeftIcon: QuickTextIcon;
  quickTextRightIcon: QuickTextIcon;
  canUseQuickTextLeft: boolean;
  canUseQuickTextRight: boolean;
  onQuickTextLeftPress: () => void;
  onQuickTextLeftLongPress: () => void;
  onQuickTextLeftPressOut: () => void;
  onQuickTextRightPress: () => void;
  onQuickTextRightLongPress: () => void;
  onQuickTextRightPressOut: () => void;
  canSendDraft: boolean;
  isSending: boolean;
  isGatewayConnected: boolean;
  isRecognizing: boolean;
  speechRecognitionSupported: boolean;
  settingsReady: boolean;
  onSendDraft: () => void;
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

export default function BottomDockControls({
  styles,
  isKeyboardBarMounted,
  keyboardBarAnim,
  showDoneOnlyAction,
  showClearInKeyboardBar,
  canClearFromKeyboardBar,
  canSendFromKeyboardBar,
  onDone,
  onClear,
  onSendFromKeyboardBar,
  showQuickTextLeftTooltip,
  showQuickTextRightTooltip,
  quickTextLeftLabel,
  quickTextRightLabel,
  quickTextLeftIcon,
  quickTextRightIcon,
  canUseQuickTextLeft,
  canUseQuickTextRight,
  onQuickTextLeftPress,
  onQuickTextLeftLongPress,
  onQuickTextLeftPressOut,
  onQuickTextRightPress,
  onQuickTextRightLongPress,
  onQuickTextRightPressOut,
  canSendDraft,
  isSending,
  isGatewayConnected,
  isRecognizing,
  speechRecognitionSupported,
  settingsReady,
  onSendDraft,
  onMicPressIn,
  onMicPressOut,
  onActionPressHaptic,
  showBottomStatus,
  bottomActionStatus,
  bottomActionLabel,
  bottomActionDetailText,
  maxTextScale,
  maxTextScaleTight,
}: BottomDockControlsProps) {
  return (
    <>
      {isKeyboardBarMounted ? (
        <Animated.View
          style={[
            styles.keyboardActionRow,
            {
              opacity: keyboardBarAnim,
              transform: [
                {
                  translateY: keyboardBarAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [8, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <Pressable
            style={[
              styles.keyboardActionButton,
              showDoneOnlyAction
                ? styles.keyboardActionButtonSingle
                : styles.keyboardActionButtonWide,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Done editing"
            onPress={onDone}
          >
            <Text style={styles.keyboardActionButtonText} maxFontSizeMultiplier={maxTextScaleTight}>
              Done
            </Text>
          </Pressable>
          {showClearInKeyboardBar ? (
            <Pressable
              style={[
                styles.keyboardActionButton,
                styles.keyboardActionButtonWide,
                !canClearFromKeyboardBar && styles.keyboardActionButtonDisabled,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Clear transcript"
              onPress={onClear}
              disabled={!canClearFromKeyboardBar}
            >
              <Text
                style={[styles.keyboardActionButtonText, styles.keyboardClearActionButtonText]}
                maxFontSizeMultiplier={maxTextScaleTight}
              >
                Clear
              </Text>
            </Pressable>
          ) : null}
          {!showDoneOnlyAction ? (
            <Pressable
              style={[
                styles.keyboardActionButton,
                styles.keyboardActionButtonWide,
                styles.keyboardSendActionButton,
                !canSendFromKeyboardBar && styles.keyboardActionButtonDisabled,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Send transcript"
              onPress={onSendFromKeyboardBar}
              disabled={!canSendFromKeyboardBar}
            >
              <Text
                style={[styles.keyboardActionButtonText, styles.keyboardSendActionButtonText]}
                maxFontSizeMultiplier={maxTextScaleTight}
              >
                Send
              </Text>
            </Pressable>
          ) : null}
        </Animated.View>
      ) : (
        <View style={styles.bottomActionRow}>
          <View style={styles.quickTextButtonSlot}>
            {showQuickTextLeftTooltip ? (
              <View style={styles.quickTextTooltip} pointerEvents="none">
                <Text
                  style={styles.quickTextTooltipText}
                  numberOfLines={3}
                  maxFontSizeMultiplier={maxTextScaleTight}
                >
                  {quickTextLeftLabel}
                </Text>
              </View>
            ) : null}
            <Pressable
              style={({ pressed }) => [
                styles.quickTextButton,
                pressed && canUseQuickTextLeft && styles.bottomActionButtonPressed,
                !canUseQuickTextLeft && styles.quickTextButtonDisabled,
              ]}
              accessibilityRole="button"
              accessibilityLabel={
                canUseQuickTextLeft
                  ? `Insert quick text ${quickTextLeftLabel}`
                  : 'Left quick text is empty'
              }
              accessibilityHint="Tap to insert. Long press to preview."
              onPress={onQuickTextLeftPress}
              onLongPress={onQuickTextLeftLongPress}
              onPressOut={onQuickTextLeftPressOut}
              delayLongPress={280}
              disabled={!canUseQuickTextLeft}
            >
              <Ionicons name={quickTextLeftIcon} size={20} style={styles.quickTextButtonIcon} />
            </Pressable>
          </View>
          {canSendDraft ? (
            <Pressable
              style={({ pressed }) => [
                styles.roundButton,
                styles.sendRoundButton,
                pressed && !isSending && styles.bottomActionButtonPressed,
                isSending && styles.roundButtonDisabled,
              ]}
              accessibilityRole="button"
              accessibilityLabel={
                isSending
                  ? 'Sending in progress'
                  : isGatewayConnected
                    ? 'Send transcript'
                    : 'Queue transcript and send after reconnect'
              }
              onPress={onSendDraft}
              onPressIn={onActionPressHaptic}
              disabled={isSending}
            >
              <Ionicons name={isSending ? 'time-outline' : 'send'} size={26} color="#ffffff" />
            </Pressable>
          ) : (
            <Pressable
              style={({ pressed }) => [
                styles.roundButton,
                styles.micRoundButton,
                isRecognizing && styles.recordingRoundButton,
                pressed && !isSending && settingsReady && styles.bottomActionButtonPressed,
                (isSending || !settingsReady || !speechRecognitionSupported) &&
                  styles.roundButtonDisabled,
              ]}
              accessibilityRole="button"
              accessibilityLabel={
                !speechRecognitionSupported
                  ? 'Voice input is unavailable on web'
                  : isRecognizing
                    ? 'Stop voice recording'
                    : isSending
                      ? 'Recording disabled while sending'
                      : 'Hold to record voice'
              }
              onPressIn={onMicPressIn}
              onPressOut={onMicPressOut}
              disabled={isSending || !settingsReady || !speechRecognitionSupported}
            >
              <Ionicons
                name={
                  !speechRecognitionSupported ? 'mic-off' : isRecognizing ? 'stop' : 'mic'
                }
                size={26}
                color="#ffffff"
              />
            </Pressable>
          )}
          <View style={styles.quickTextButtonSlot}>
            {showQuickTextRightTooltip ? (
              <View style={styles.quickTextTooltip} pointerEvents="none">
                <Text
                  style={styles.quickTextTooltipText}
                  numberOfLines={3}
                  maxFontSizeMultiplier={maxTextScaleTight}
                >
                  {quickTextRightLabel}
                </Text>
              </View>
            ) : null}
            <Pressable
              style={({ pressed }) => [
                styles.quickTextButton,
                pressed && canUseQuickTextRight && styles.bottomActionButtonPressed,
                !canUseQuickTextRight && styles.quickTextButtonDisabled,
              ]}
              accessibilityRole="button"
              accessibilityLabel={
                canUseQuickTextRight
                  ? `Insert quick text ${quickTextRightLabel}`
                  : 'Right quick text is empty'
              }
              accessibilityHint="Tap to insert. Long press to preview."
              onPress={onQuickTextRightPress}
              onLongPress={onQuickTextRightLongPress}
              onPressOut={onQuickTextRightPressOut}
              delayLongPress={280}
              disabled={!canUseQuickTextRight}
            >
              <Ionicons
                name={quickTextRightIcon}
                size={20}
                style={styles.quickTextButtonIcon}
              />
            </Pressable>
          </View>
        </View>
      )}

      {showBottomStatus ? (
        <View style={styles.bottomStateRow}>
          <View
            style={[
              styles.bottomStateDot,
              bottomActionStatus === 'connecting' && styles.bottomStateDotConnecting,
              bottomActionStatus === 'disconnected' && styles.bottomStateDotDisconnected,
              bottomActionStatus === 'recording' && styles.bottomStateDotRecording,
              bottomActionStatus === 'sending' && styles.bottomStateDotSending,
              bottomActionStatus === 'retrying' && styles.bottomStateDotRetrying,
              bottomActionStatus === 'complete' && styles.bottomStateDotComplete,
              bottomActionStatus === 'error' && styles.bottomStateDotError,
            ]}
          />
          <Text
            style={[
              styles.bottomStateLabel,
              bottomActionStatus === 'connecting' && styles.bottomStateLabelConnecting,
              bottomActionStatus === 'disconnected' && styles.bottomStateLabelDisconnected,
              bottomActionStatus === 'recording' && styles.bottomStateLabelRecording,
              bottomActionStatus === 'sending' && styles.bottomStateLabelSending,
              bottomActionStatus === 'retrying' && styles.bottomStateLabelRetrying,
              bottomActionStatus === 'complete' && styles.bottomStateLabelComplete,
              bottomActionStatus === 'error' && styles.bottomStateLabelError,
            ]}
            maxFontSizeMultiplier={maxTextScale}
          >
            {bottomActionLabel}
          </Text>
          <Text
            style={styles.bottomStateDetail}
            maxFontSizeMultiplier={maxTextScale}
            numberOfLines={1}
          >
            {bottomActionDetailText}
          </Text>
        </View>
      ) : null}
    </>
  );
}
