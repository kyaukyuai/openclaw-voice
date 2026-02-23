import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  initialGatewayRuntimeState,
  gatewayRuntimeReducer,
} = require('../src/ios-runtime/runtime-state.js');
const {
  applyGatewayRuntimeActionByMode,
} = require('../src/ios-runtime/gateway-runtime-mode-logic.js');

function runSequence(actions, enableV2) {
  let state = { ...initialGatewayRuntimeState };
  for (const action of actions) {
    state = applyGatewayRuntimeActionByMode(state, action, { enableV2 });
  }
  return state;
}

test('ios runtime V2 rollout: default mode follows V2 reducer behavior', () => {
  const action = { type: 'SEND_STREAMING', value: 'streaming' };
  const expected = gatewayRuntimeReducer(initialGatewayRuntimeState, action);
  const actual = applyGatewayRuntimeActionByMode(initialGatewayRuntimeState, action);
  assert.deepEqual(actual, expected);
});

test('ios runtime V2 rollout: lifecycle sequence parity (V2 vs fallback)', () => {
  const actions = [
    { type: 'CONNECT_REQUEST' },
    { type: 'CONNECT_SUCCESS' },
    { type: 'SEND_REQUEST' },
    { type: 'SEND_COMPLETE' },
    { type: 'SYNC_REQUEST' },
    { type: 'SYNC_TIMEOUT' },
  ];

  const v2 = runSequence(actions, true);
  const fallback = runSequence(actions, false);

  assert.deepEqual(v2, fallback);
  assert.equal(v2.connectionState, 'connected');
  assert.equal(v2.isSending, false);
  assert.equal(v2.isSessionHistoryLoading, false);
  assert.equal(v2.gatewayEventState, 'complete');
});

test('ios runtime V2 rollout: sending state always reaches terminal on failures', () => {
  const failedConnectActions = [
    { type: 'SEND_REQUEST' },
    { type: 'SYNC_REQUEST' },
    { type: 'MISSING_RECOVERY_REQUEST' },
    { type: 'CONNECT_FAILED' },
  ];
  const failedSendActions = [
    { type: 'CONNECT_REQUEST' },
    { type: 'CONNECT_SUCCESS' },
    { type: 'SEND_REQUEST' },
    { type: 'SEND_ERROR' },
  ];

  const v2ConnectFailure = runSequence(failedConnectActions, true);
  const fallbackConnectFailure = runSequence(failedConnectActions, false);
  assert.deepEqual(v2ConnectFailure, fallbackConnectFailure);
  assert.equal(v2ConnectFailure.isSending, false);
  assert.equal(v2ConnectFailure.isSessionHistoryLoading, false);
  assert.equal(v2ConnectFailure.isMissingResponseRecoveryInFlight, false);
  assert.equal(v2ConnectFailure.gatewayEventState, 'idle');

  const v2SendFailure = runSequence(failedSendActions, true);
  const fallbackSendFailure = runSequence(failedSendActions, false);
  assert.deepEqual(v2SendFailure, fallbackSendFailure);
  assert.equal(v2SendFailure.isSending, false);
  assert.equal(v2SendFailure.gatewayEventState, 'error');
});

test('ios runtime V2 rollout: reconnecting + reset clears active runtime flags', () => {
  const actions = [
    { type: 'SET_CONNECTION_STATE', value: 'reconnecting' },
    { type: 'SEND_REQUEST' },
    { type: 'SYNC_REQUEST' },
    { type: 'RESET_RUNTIME' },
  ];

  const v2 = runSequence(actions, true);
  const fallback = runSequence(actions, false);
  assert.deepEqual(v2, fallback);
  assert.deepEqual(v2, initialGatewayRuntimeState);
});

