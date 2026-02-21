import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  beginHistoryRefreshRequest,
  invalidateHistoryRefreshState,
  isCurrentHistoryRefreshRequest,
  clearHistoryRefreshInFlightIfCurrent,
  raceHistoryRefreshWithTimeout,
} = require('../src/ios-runtime/history-runtime-logic.js');

function createHistoryRefs() {
  return {
    inFlightRef: { current: null },
    refreshEpochRef: { current: 0 },
    refreshRequestIdRef: { current: 0 },
  };
}

test('beginHistoryRefreshRequest reuses in-flight promise and avoids duplicate refresh', () => {
  const refs = createHistoryRefs();
  const firstBegin = beginHistoryRefreshRequest(refs);
  assert.equal(firstBegin.reused, false);
  if (!firstBegin.reused) {
    assert.equal(firstBegin.epoch, 0);
    assert.equal(firstBegin.requestId, 1);
  }

  const inFlightPromise = Promise.resolve(true);
  refs.inFlightRef.current = inFlightPromise;

  const reusedBegin = beginHistoryRefreshRequest(refs);
  assert.equal(reusedBegin.reused, true);
  if (reusedBegin.reused) {
    assert.equal(reusedBegin.promise, inFlightPromise);
  }
});

test('invalidateHistoryRefreshState advances epoch/request and drops in-flight promise', () => {
  const refs = createHistoryRefs();
  refs.inFlightRef.current = Promise.resolve(true);
  refs.refreshEpochRef.current = 3;
  refs.refreshRequestIdRef.current = 9;

  invalidateHistoryRefreshState(refs);

  assert.equal(refs.refreshEpochRef.current, 4);
  assert.equal(refs.refreshRequestIdRef.current, 10);
  assert.equal(refs.inFlightRef.current, null);
});

test('stale refresh request does not mutate current in-flight state', () => {
  const refs = createHistoryRefs();
  refs.refreshEpochRef.current = 1;
  refs.refreshRequestIdRef.current = 5;
  const currentPromise = Promise.resolve(false);
  refs.inFlightRef.current = currentPromise;

  assert.equal(isCurrentHistoryRefreshRequest(refs, 0, 4), false);
  clearHistoryRefreshInFlightIfCurrent(refs, 0, 4);
  assert.equal(refs.inFlightRef.current, currentPromise);

  assert.equal(isCurrentHistoryRefreshRequest(refs, 1, 5), true);
  clearHistoryRefreshInFlightIfCurrent(refs, 1, 5);
  assert.equal(refs.inFlightRef.current, null);
});

test('raceHistoryRefreshWithTimeout returns false when refresh does not resolve in time', async () => {
  const neverResolve = () => new Promise(() => {});
  const result = await raceHistoryRefreshWithTimeout(neverResolve, 5);
  assert.equal(result, false);
});

test('raceHistoryRefreshWithTimeout returns run result when run resolves before timeout', async () => {
  const result = await raceHistoryRefreshWithTimeout(async () => true, 200);
  assert.equal(result, true);
});
