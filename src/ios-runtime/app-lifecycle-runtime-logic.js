function shouldTriggerLifecycleAutoConnect(input) {
  if (!input.localStateReady) {
    return false;
  }
  return (
    input.settingsReady &&
    !input.alreadyAttempted &&
    input.gatewayUrl.trim().length > 0 &&
    input.connectionState === 'disconnected'
  );
}

function clearLifecycleCleanupState(state) {
  state.isUnmountingRef.current = true;
  state.expectedSpeechStopRef.current = true;

  clearTimer(state.holdStartTimerRef);
  clearTimer(state.historySyncTimerRef);
  state.historySyncRequestRef.current = null;
  clearTimer(state.historyNoticeTimerRef);
  clearTimer(state.bottomCompletePulseTimerRef);
  clearTimer(state.authTokenMaskTimerRef);
  clearTimer(state.outboxRetryTimerRef);
  clearTimer(state.startupAutoConnectRetryTimerRef);
  clearTimer(state.finalResponseRecoveryTimerRef);
  clearTimer(state.missingResponseRecoveryTimerRef);
  state.missingResponseRecoveryRequestRef.current = null;
  clearTimer(state.settingsFocusScrollTimerRef);
  clearTimer(state.quickTextTooltipTimerRef);
  clearTimer(state.quickTextLongPressResetTimerRef);
  state.quickTextLongPressSideRef.current = null;
}

function clearTimer(timerRef) {
  if (!timerRef.current) return;
  clearTimeout(timerRef.current);
  timerRef.current = null;
}

module.exports = {
  shouldTriggerLifecycleAutoConnect,
  clearLifecycleCleanupState,
};
