import { useCallback, useRef } from 'react';

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
    refreshEpochRef.current += 1;
    refreshRequestIdRef.current += 1;
    inFlightRef.current = null;
  }, []);

  const runHistoryRefresh = useCallback(async (input: RunHistoryRefreshInput) => {
    if (inFlightRef.current) {
      return inFlightRef.current;
    }

    const epoch = refreshEpochRef.current;
    const requestId = refreshRequestIdRef.current + 1;
    refreshRequestIdRef.current = requestId;

    const runPromise = (async () => {
      input.onStart?.();
      try {
        const timeoutPromise = new Promise<boolean>((resolve) => {
          setTimeout(() => resolve(false), Math.max(1, input.timeoutMs));
        });
        const ok = await Promise.race([input.run(), timeoutPromise]);
        if (
          refreshEpochRef.current !== epoch ||
          refreshRequestIdRef.current !== requestId
        ) {
          return false;
        }
        input.onFinish?.(ok);
        return ok;
      } catch (error) {
        if (
          refreshEpochRef.current === epoch &&
          refreshRequestIdRef.current === requestId
        ) {
          input.onError?.(error);
          input.onFinish?.(false);
        }
        return false;
      } finally {
        if (
          refreshEpochRef.current === epoch &&
          refreshRequestIdRef.current === requestId
        ) {
          inFlightRef.current = null;
        }
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
