import type { ConnectionState } from '../openclaw';
import { shouldStartStartupAutoConnect } from '../ui/runtime-logic';

type TimerLikeRef = { current: ReturnType<typeof setTimeout> | null };

type ShouldTriggerLifecycleAutoConnectInput = {
  localStateReady: boolean;
  settingsReady: boolean;
  alreadyAttempted: boolean;
  gatewayUrl: string;
  connectionState: ConnectionState;
};

type LifecycleCleanupState = {
  isUnmountingRef: { current: boolean };
  expectedSpeechStopRef: { current: boolean };
  holdStartTimerRef: TimerLikeRef;
  historySyncTimerRef: TimerLikeRef;
  historySyncRequestRef: { current: { sessionKey: string; attempt: number } | null };
  historyNoticeTimerRef: TimerLikeRef;
  bottomCompletePulseTimerRef: TimerLikeRef;
  authTokenMaskTimerRef: TimerLikeRef;
  outboxRetryTimerRef: TimerLikeRef;
  startupAutoConnectRetryTimerRef: TimerLikeRef;
  finalResponseRecoveryTimerRef: TimerLikeRef;
  missingResponseRecoveryTimerRef: TimerLikeRef;
  missingResponseRecoveryRequestRef: {
    current: { sessionKey: string; turnId: string; attempt: number } | null;
  };
  settingsFocusScrollTimerRef: TimerLikeRef;
  quickTextTooltipTimerRef: TimerLikeRef;
  quickTextLongPressResetTimerRef: TimerLikeRef;
  quickTextLongPressSideRef: { current: 'left' | 'right' | null };
};

export function shouldTriggerLifecycleAutoConnect(
  input: ShouldTriggerLifecycleAutoConnectInput,
): boolean {
  if (!input.localStateReady) {
    return false;
  }
  return shouldStartStartupAutoConnect({
    settingsReady: input.settingsReady,
    alreadyAttempted: input.alreadyAttempted,
    gatewayUrl: input.gatewayUrl,
    connectionState: input.connectionState,
  });
}

export function clearLifecycleCleanupState(state: LifecycleCleanupState): void {
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

function clearTimer(timerRef: TimerLikeRef): void {
  if (!timerRef.current) return;
  clearTimeout(timerRef.current);
  timerRef.current = null;
}
