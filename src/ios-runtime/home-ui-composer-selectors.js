function resolveComposerDisplaySelectors(input) {
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
  const canSendFromKeyboardBar =
    hasDraft && !input.isRecognizing && !input.isSending;
  const canClearFromKeyboardBar =
    input.transcript.length > 0 || input.interimTranscript.length > 0;

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

  const homeDisplayMode = input.isSending
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
    speechRecognitionSupported: input.speechRecognitionSupported,
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
  };
}

module.exports = {
  resolveComposerDisplaySelectors,
};
