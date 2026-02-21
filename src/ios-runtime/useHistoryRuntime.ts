import { useCallback, useRef } from 'react';
import {
  beginHistoryRefreshRequest,
  clearHistoryRefreshInFlightIfCurrent,
  invalidateHistoryRefreshState,
  isCurrentHistoryRefreshRequest,
  raceHistoryRefreshWithTimeout,
} from './history-runtime-logic';

type RunHistoryRefreshInput = {
  sessionKey: string;
  timeoutMs: number;
  run: () => Promise<boolean>;
  onStart?: () => void;
  onFinish?: (ok: boolean) => void;
  onError?: (error: unknown) => void;
};

export function useHistoryRuntime() {
  const inFlightRef = useRef<Promise<boolean> | null>(null);
  const refreshEpochRef = useRef(0);
  const refreshRequestIdRef = useRef(0);

  const invalidateRefreshEpoch = useCallback(() => {
    invalidateHistoryRefreshState({
      inFlightRef,
      refreshEpochRef,
      refreshRequestIdRef,
    });
  }, []);

  const runHistoryRefresh = useCallback(async (input: RunHistoryRefreshInput) => {
    const begin = beginHistoryRefreshRequest({
      inFlightRef,
      refreshEpochRef,
      refreshRequestIdRef,
    });
    if (begin.reused) {
      return begin.promise;
    }
    const { epoch, requestId } = begin;

    const runPromise = (async () => {
      input.onStart?.();
      try {
        const ok = await raceHistoryRefreshWithTimeout(input.run, input.timeoutMs);
        if (
          !isCurrentHistoryRefreshRequest(
            {
              inFlightRef,
              refreshEpochRef,
              refreshRequestIdRef,
            },
            epoch,
            requestId,
          )
        ) {
          return false;
        }
        input.onFinish?.(ok);
        return ok;
      } catch (error) {
        if (
          isCurrentHistoryRefreshRequest(
            {
              inFlightRef,
              refreshEpochRef,
              refreshRequestIdRef,
            },
            epoch,
            requestId,
          )
        ) {
          input.onError?.(error);
          input.onFinish?.(false);
        }
        return false;
      } finally {
        clearHistoryRefreshInFlightIfCurrent(
          {
            inFlightRef,
            refreshEpochRef,
            refreshRequestIdRef,
          },
          epoch,
          requestId,
        );
      }
    })();

    inFlightRef.current = runPromise;
    return runPromise;
  }, []);

  return {
    runHistoryRefresh,
    invalidateRefreshEpoch,
  };
}
