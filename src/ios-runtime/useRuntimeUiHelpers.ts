import {
  useCallback,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import type { ConnectionState } from '../openclaw';
import type {
  HistoryRefreshNotice,
  MissingResponseRecoveryNotice,
} from '../types';
import {
  AUTH_TOKEN_AUTO_MASK_MS,
  HISTORY_NOTICE_HIDE_MS,
} from '../utils';
import { scheduleHistoryScrollToEnd } from '../ui/history-layout';

type TimerRef = MutableRefObject<ReturnType<typeof setTimeout> | null>;

type MissingResponseRecoveryRequest = {
  sessionKey: string;
  turnId: string;
  attempt: number;
};

type UseRuntimeUiHelpersInput = {
  historyNoticeTimerRef: TimerRef;
  bottomCompletePulseTimerRef: TimerRef;
  authTokenMaskTimerRef: TimerRef;
  outboxRetryTimerRef: TimerRef;
  startupAutoConnectRetryTimerRef: TimerRef;
  finalResponseRecoveryTimerRef: TimerRef;
  missingResponseRecoveryTimerRef: TimerRef;
  missingResponseRecoveryRequestRef: MutableRefObject<MissingResponseRecoveryRequest | null>;
  connectionStateRef: MutableRefObject<ConnectionState>;
  historyScrollRef: MutableRefObject<{
    scrollToEnd: (params?: { animated?: boolean }) => void;
  } | null>;
  historyAutoScrollRef: MutableRefObject<boolean>;
  gatewayCheckHealth: (
    options?: { silent?: boolean; timeoutMs?: number },
  ) => Promise<boolean>;
  setIsAuthTokenMasked: Dispatch<SetStateAction<boolean>>;
  setHistoryRefreshNotice: Dispatch<
    SetStateAction<HistoryRefreshNotice | null>
  >;
  setShowScrollToBottomButton: Dispatch<SetStateAction<boolean>>;
  setIsMissingResponseRecoveryInFlight: (value: boolean) => void;
  setMissingResponseNotice: Dispatch<
    SetStateAction<MissingResponseRecoveryNotice | null>
  >;
};

export function useRuntimeUiHelpers(input: UseRuntimeUiHelpersInput) {
  const {
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
  } = input;

  const persistRuntimeSetting = useCallback((task: () => Promise<void>) => {
    void task().catch(() => {
      // ignore runtime persistence errors
    });
  }, []);

  const clearHistoryNoticeTimer = useCallback(() => {
    if (historyNoticeTimerRef.current) {
      clearTimeout(historyNoticeTimerRef.current);
      historyNoticeTimerRef.current = null;
    }
  }, [historyNoticeTimerRef]);

  const clearBottomCompletePulseTimer = useCallback(() => {
    if (bottomCompletePulseTimerRef.current) {
      clearTimeout(bottomCompletePulseTimerRef.current);
      bottomCompletePulseTimerRef.current = null;
    }
  }, [bottomCompletePulseTimerRef]);

  const clearAuthTokenMaskTimer = useCallback(() => {
    if (authTokenMaskTimerRef.current) {
      clearTimeout(authTokenMaskTimerRef.current);
      authTokenMaskTimerRef.current = null;
    }
  }, [authTokenMaskTimerRef]);

  const forceMaskAuthToken = useCallback(() => {
    clearAuthTokenMaskTimer();
    setIsAuthTokenMasked(true);
  }, [clearAuthTokenMaskTimer, setIsAuthTokenMasked]);

  const toggleAuthTokenVisibility = useCallback(() => {
    setIsAuthTokenMasked((current) => {
      const next = !current;
      clearAuthTokenMaskTimer();
      if (!next) {
        authTokenMaskTimerRef.current = setTimeout(() => {
          authTokenMaskTimerRef.current = null;
          setIsAuthTokenMasked(true);
        }, AUTH_TOKEN_AUTO_MASK_MS);
      }
      return next;
    });
  }, [authTokenMaskTimerRef, clearAuthTokenMaskTimer, setIsAuthTokenMasked]);

  const clearOutboxRetryTimer = useCallback(() => {
    if (outboxRetryTimerRef.current) {
      clearTimeout(outboxRetryTimerRef.current);
      outboxRetryTimerRef.current = null;
    }
  }, [outboxRetryTimerRef]);

  const showHistoryRefreshNotice = useCallback(
    (kind: HistoryRefreshNotice['kind'], message: string) => {
      clearHistoryNoticeTimer();
      setHistoryRefreshNotice({ kind, message });
      historyNoticeTimerRef.current = setTimeout(() => {
        historyNoticeTimerRef.current = null;
        setHistoryRefreshNotice(null);
      }, HISTORY_NOTICE_HIDE_MS);
    },
    [clearHistoryNoticeTimer, historyNoticeTimerRef, setHistoryRefreshNotice],
  );

  const clearStartupAutoConnectRetryTimer = useCallback(() => {
    if (startupAutoConnectRetryTimerRef.current) {
      clearTimeout(startupAutoConnectRetryTimerRef.current);
      startupAutoConnectRetryTimerRef.current = null;
    }
  }, [startupAutoConnectRetryTimerRef]);

  const clearFinalResponseRecoveryTimer = useCallback(() => {
    if (finalResponseRecoveryTimerRef.current) {
      clearTimeout(finalResponseRecoveryTimerRef.current);
      finalResponseRecoveryTimerRef.current = null;
    }
  }, [finalResponseRecoveryTimerRef]);

  const clearMissingResponseRecoveryTimer = useCallback(() => {
    if (missingResponseRecoveryTimerRef.current) {
      clearTimeout(missingResponseRecoveryTimerRef.current);
      missingResponseRecoveryTimerRef.current = null;
    }
  }, [missingResponseRecoveryTimerRef]);

  const clearMissingResponseRecoveryState = useCallback(
    (sessionKey?: string) => {
      const targetSessionKey = sessionKey?.trim();
      const request = missingResponseRecoveryRequestRef.current;
      if (!targetSessionKey || request?.sessionKey === targetSessionKey) {
        clearMissingResponseRecoveryTimer();
        missingResponseRecoveryRequestRef.current = null;
        setIsMissingResponseRecoveryInFlight(false);
      }
      setMissingResponseNotice((previous) => {
        if (!previous) return previous;
        if (targetSessionKey && previous.sessionKey !== targetSessionKey) {
          return previous;
        }
        return null;
      });
    },
    [
      clearMissingResponseRecoveryTimer,
      missingResponseRecoveryRequestRef,
      setIsMissingResponseRecoveryInFlight,
      setMissingResponseNotice,
    ],
  );

  const runGatewayHealthCheck = useCallback(
    async (options?: { silent?: boolean; timeoutMs?: number }): Promise<boolean> => {
      if (connectionStateRef.current !== 'connected') {
        return false;
      }
      try {
        return await gatewayCheckHealth(options);
      } catch {
        return false;
      }
    },
    [connectionStateRef, gatewayCheckHealth],
  );

  const scrollHistoryToBottom = useCallback(
    (animated = true) => {
      scheduleHistoryScrollToEnd(() => {
        historyScrollRef.current?.scrollToEnd({ animated });
        setShowScrollToBottomButton(false);
        historyAutoScrollRef.current = true;
      });
    },
    [historyScrollRef, setShowScrollToBottomButton, historyAutoScrollRef],
  );

  return {
    persistRuntimeSetting,
    clearHistoryNoticeTimer,
    clearBottomCompletePulseTimer,
    clearAuthTokenMaskTimer,
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
  };
}
