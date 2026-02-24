import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  gatewayRuntimeReducer,
  initialGatewayRuntimeState,
} = require('../src/ios-runtime/runtime-state.js');
const {
  resolveUnboundGatewayEventDecision,
} = require('../src/ios-runtime/gateway-event-bridge-logic.js');
const {
  beginHistoryRefreshRequest,
  clearHistoryRefreshInFlightIfCurrent,
  raceHistoryRefreshWithTimeout,
} = require('../src/ios-runtime/history-runtime-logic.js');
const {
  applyDisconnectReset,
} = require('../src/ios-runtime/gateway-connection-flow-logic.js');

test('integration: send flow always reaches terminal state from streaming/failure branches', () => {
  let state = { ...initialGatewayRuntimeState };

  state = gatewayRuntimeReducer(state, { type: 'CONNECT_SUCCESS' });
  state = gatewayRuntimeReducer(state, { type: 'SEND_REQUEST' });
  assert.equal(state.isSending, true);

  const streamingDecision = resolveUnboundGatewayEventDecision('streaming', '');
  assert.equal(streamingDecision.shouldEndSending, false);
  state = gatewayRuntimeReducer(state, {
    type: 'SEND_STREAMING',
    value: streamingDecision.normalizedState,
  });
  assert.equal(state.isSending, true);
  assert.equal(state.gatewayEventState, 'streaming');

  const completeDecision = resolveUnboundGatewayEventDecision('complete', 'final');
  assert.equal(completeDecision.shouldEndSending, true);
  state = gatewayRuntimeReducer(state, { type: 'SEND_COMPLETE' });
  assert.equal(state.isSending, false);
  assert.equal(state.gatewayEventState, 'complete');

  let failureState = gatewayRuntimeReducer(
    { ...initialGatewayRuntimeState, connectionState: 'connected' },
    { type: 'SEND_REQUEST' },
  );
  failureState = gatewayRuntimeReducer(failureState, { type: 'SEND_ERROR' });
  assert.equal(failureState.isSending, false);
  assert.equal(failureState.gatewayEventState, 'error');
});

test('integration: refresh timeout fails closed and clears in-flight tracking', async () => {
  const refs = {
    inFlightRef: { current: null },
    refreshEpochRef: { current: 0 },
    refreshRequestIdRef: { current: 0 },
  };

  const begin = beginHistoryRefreshRequest(refs);
  assert.equal(begin.reused, false);
  if (begin.reused) return;

  let state = gatewayRuntimeReducer(
    { ...initialGatewayRuntimeState, connectionState: 'connected' },
    { type: 'SYNC_REQUEST' },
  );
  assert.equal(state.isSessionHistoryLoading, true);

  const inFlight = raceHistoryRefreshWithTimeout(
    () => new Promise(() => {}),
    5,
  );
  refs.inFlightRef.current = inFlight;

  const completed = await inFlight;
  assert.equal(completed, false);

  state = gatewayRuntimeReducer(state, { type: 'SYNC_TIMEOUT' });
  clearHistoryRefreshInFlightIfCurrent(refs, begin.epoch, begin.requestId);

  assert.equal(state.isSessionHistoryLoading, false);
  assert.equal(refs.inFlightRef.current, null);
});

test('integration: reconnecting disconnect reset returns to clean runtime and can reconnect', () => {
  let state = {
    ...initialGatewayRuntimeState,
    connectionState: 'reconnecting',
    gatewayEventState: 'streaming',
    isSending: true,
    isSessionHistoryLoading: true,
    isMissingResponseRecoveryInFlight: true,
  };

  const historyTimer = setTimeout(() => {}, 10_000);
  const historySyncTimerRef = { current: historyTimer };
  const historySyncRequestRef = { current: { sessionKey: 'main', attempt: 2 } };
  const outboxProcessingRef = { current: true };
  const activeRunIdRef = { current: 'run-1' };
  const pendingTurnIdRef = { current: 'turn-1' };
  const runIdToTurnIdRef = { current: new Map([['run-1', 'turn-1']]) };

  applyDisconnectReset({
    historySyncTimerRef,
    historySyncRequestRef,
    outboxProcessingRef,
    activeRunIdRef,
    pendingTurnIdRef,
    runIdToTurnIdRef,
    setActiveRunId: () => {},
    setIsSessionOperationPending: () => {},
    setGatewayConnectDiagnostic: () => {},
    setIsBottomCompletePulse: () => {},
    runGatewayRuntimeAction: (action) => {
      state = gatewayRuntimeReducer(state, action);
    },
    gatewayDisconnect: () => {},
    clearFinalResponseRecoveryTimer: () => {},
    clearMissingResponseRecoveryState: () => {},
    clearStartupAutoConnectRetryTimer: () => {},
    clearBottomCompletePulseTimer: () => {},
    clearOutboxRetryTimer: () => {},
    invalidateRefreshEpoch: () => {},
  });

  assert.deepEqual(state, initialGatewayRuntimeState);
  assert.equal(historySyncTimerRef.current, null);
  assert.equal(historySyncRequestRef.current, null);
  assert.equal(outboxProcessingRef.current, false);
  assert.equal(activeRunIdRef.current, null);
  assert.equal(pendingTurnIdRef.current, null);
  assert.equal(runIdToTurnIdRef.current.size, 0);

  state = gatewayRuntimeReducer(state, { type: 'CONNECT_REQUEST' });
  state = gatewayRuntimeReducer(state, { type: 'CONNECT_SUCCESS' });
  assert.equal(state.connectionState, 'connected');
});
