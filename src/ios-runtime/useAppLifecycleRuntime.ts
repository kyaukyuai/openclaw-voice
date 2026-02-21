import { useEffect, type MutableRefObject } from 'react';
import type { ConnectionState } from '../openclaw';
import { shouldStartStartupAutoConnect } from '../ui/runtime-logic';

type TimerRef = MutableRefObject<ReturnType<typeof setTimeout> | null>;

type UseAppLifecycleRuntimeInput = {
  localStateReady: boolean;
  settingsReady: boolean;
  gatewayUrl: string;
  connectionState: ConnectionState;
  startupAutoConnectAttemptedRef: MutableRefObject<boolean>;
  startupAutoConnectAttemptRef: MutableRefObject<number>;
  connectGateway: (options?: { auto?: boolean; autoAttempt?: number }) => Promise<void>;
  isUnmountingRef: MutableRefObject<boolean>;
  invalidateRefreshEpoch: () => void;
  expectedSpeechStopRef: MutableRefObject<boolean>;
  holdStartTimerRef: TimerRef;
  historySyncTimerRef: TimerRef;
  historySyncRequestRef: MutableRefObject<{
    sessionKey: string;
    attempt: number;
  } | null>;
  historyNoticeTimerRef: TimerRef;
  bottomCompletePulseTimerRef: TimerRef;
  authTokenMaskTimerRef: TimerRef;
  outboxRetryTimerRef: TimerRef;
  startupAutoConnectRetryTimerRef: TimerRef;
  finalResponseRecoveryTimerRef: TimerRef;
  missingResponseRecoveryTimerRef: TimerRef;
  missingResponseRecoveryRequestRef: MutableRefObject<{
    sessionKey: string;
    turnId: string;
    attempt: number;
  } | null>;
  settingsFocusScrollTimerRef: TimerRef;
  quickTextTooltipTimerRef: TimerRef;
  quickTextLongPressResetTimerRef: TimerRef;
  quickTextLongPressSideRef: MutableRefObject<'left' | 'right' | null>;
  disconnectGateway: () => void;
  abortSpeechRecognitionIfSupported: () => void;
};

function clearTimer(timerRef: TimerRef) {
  if (!timerRef.current) return;
  clearTimeout(timerRef.current);
  timerRef.current = null;
}

export function useAppLifecycleRuntime(input: UseAppLifecycleRuntimeInput) {
  useEffect(() => {
    if (!input.localStateReady) {
      return;
    }
    if (
      !shouldStartStartupAutoConnect({
        settingsReady: input.settingsReady,
        alreadyAttempted: input.startupAutoConnectAttemptedRef.current,
        gatewayUrl: input.gatewayUrl,
        connectionState: input.connectionState,
      })
    ) {
      return;
    }
    input.startupAutoConnectAttemptedRef.current = true;
    input.startupAutoConnectAttemptRef.current = 1;
    void input.connectGateway({ auto: true, autoAttempt: 1 });
  }, [
    input.connectionState,
    input.connectGateway,
    input.gatewayUrl,
    input.localStateReady,
    input.settingsReady,
    input.startupAutoConnectAttemptRef,
    input.startupAutoConnectAttemptedRef,
  ]);

  useEffect(() => {
    return () => {
      input.isUnmountingRef.current = true;
      input.invalidateRefreshEpoch();
      input.expectedSpeechStopRef.current = true;

      clearTimer(input.holdStartTimerRef);
      clearTimer(input.historySyncTimerRef);
      input.historySyncRequestRef.current = null;
      clearTimer(input.historyNoticeTimerRef);
      clearTimer(input.bottomCompletePulseTimerRef);
      clearTimer(input.authTokenMaskTimerRef);
      clearTimer(input.outboxRetryTimerRef);
      clearTimer(input.startupAutoConnectRetryTimerRef);
      clearTimer(input.finalResponseRecoveryTimerRef);
      clearTimer(input.missingResponseRecoveryTimerRef);
      input.missingResponseRecoveryRequestRef.current = null;
      clearTimer(input.settingsFocusScrollTimerRef);
      clearTimer(input.quickTextTooltipTimerRef);
      clearTimer(input.quickTextLongPressResetTimerRef);
      input.quickTextLongPressSideRef.current = null;

      input.disconnectGateway();
      input.abortSpeechRecognitionIfSupported();
    };
  }, [
    input.abortSpeechRecognitionIfSupported,
    input.authTokenMaskTimerRef,
    input.bottomCompletePulseTimerRef,
    input.disconnectGateway,
    input.expectedSpeechStopRef,
    input.finalResponseRecoveryTimerRef,
    input.historyNoticeTimerRef,
    input.historySyncRequestRef,
    input.historySyncTimerRef,
    input.holdStartTimerRef,
    input.invalidateRefreshEpoch,
    input.isUnmountingRef,
    input.missingResponseRecoveryRequestRef,
    input.missingResponseRecoveryTimerRef,
    input.outboxRetryTimerRef,
    input.quickTextLongPressResetTimerRef,
    input.quickTextLongPressSideRef,
    input.quickTextTooltipTimerRef,
    input.settingsFocusScrollTimerRef,
    input.startupAutoConnectRetryTimerRef,
  ]);
}
