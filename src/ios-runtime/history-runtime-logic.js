function beginHistoryRefreshRequest(refs) {
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

function invalidateHistoryRefreshState(refs) {
  refs.refreshEpochRef.current += 1;
  refs.refreshRequestIdRef.current += 1;
  refs.inFlightRef.current = null;
}

function isCurrentHistoryRefreshRequest(refs, epoch, requestId) {
  return (
    refs.refreshEpochRef.current === epoch &&
    refs.refreshRequestIdRef.current === requestId
  );
}

function clearHistoryRefreshInFlightIfCurrent(refs, epoch, requestId) {
  if (!isCurrentHistoryRefreshRequest(refs, epoch, requestId)) {
    return;
  }
  refs.inFlightRef.current = null;
}

async function raceHistoryRefreshWithTimeout(run, timeoutMs) {
  const boundedTimeoutMs = Math.max(1, timeoutMs);
  const timeoutPromise = new Promise((resolve) => {
    setTimeout(() => resolve(false), boundedTimeoutMs);
  });
  return Promise.race([run(), timeoutPromise]);
}

module.exports = {
  beginHistoryRefreshRequest,
  invalidateHistoryRefreshState,
  isCurrentHistoryRefreshRequest,
  clearHistoryRefreshInFlightIfCurrent,
  raceHistoryRefreshWithTimeout,
};
