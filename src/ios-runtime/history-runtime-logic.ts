type HistoryRuntimeRefs = {
  inFlightRef: { current: Promise<boolean> | null };
  refreshEpochRef: { current: number };
  refreshRequestIdRef: { current: number };
};

type BeginHistoryRefreshRequestResult =
  | {
      reused: true;
      promise: Promise<boolean>;
    }
  | {
      reused: false;
      epoch: number;
      requestId: number;
    };

export function beginHistoryRefreshRequest(
  refs: HistoryRuntimeRefs,
): BeginHistoryRefreshRequestResult {
  if (refs.inFlightRef.current) {
    return {
      reused: true,
      promise: refs.inFlightRef.current,
    };
  }

  const epoch = refs.refreshEpochRef.current;
  const requestId = refs.refreshRequestIdRef.current + 1;
  refs.refreshRequestIdRef.current = requestId;
  return {
    reused: false,
    epoch,
    requestId,
  };
}

export function invalidateHistoryRefreshState(refs: HistoryRuntimeRefs): void {
  refs.refreshEpochRef.current += 1;
  refs.refreshRequestIdRef.current += 1;
  refs.inFlightRef.current = null;
}

export function isCurrentHistoryRefreshRequest(
  refs: HistoryRuntimeRefs,
  epoch: number,
  requestId: number,
): boolean {
  return (
    refs.refreshEpochRef.current === epoch &&
    refs.refreshRequestIdRef.current === requestId
  );
}

export function clearHistoryRefreshInFlightIfCurrent(
  refs: HistoryRuntimeRefs,
  epoch: number,
  requestId: number,
): void {
  if (!isCurrentHistoryRefreshRequest(refs, epoch, requestId)) {
    return;
  }
  refs.inFlightRef.current = null;
}

export async function raceHistoryRefreshWithTimeout(
  run: () => Promise<boolean>,
  timeoutMs: number,
): Promise<boolean> {
  const boundedTimeoutMs = Math.max(1, timeoutMs);
  const timeoutPromise = new Promise<boolean>((resolve) => {
    setTimeout(() => resolve(false), boundedTimeoutMs);
  });
  return Promise.race([run(), timeoutPromise]);
}
