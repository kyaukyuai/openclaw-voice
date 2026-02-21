import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  gatewayRuntimeReducer,
  initialGatewayRuntimeState,
} = require('../src/ios-runtime/runtime-state.js');

test('gatewayRuntimeReducer handles connect-send-sync lifecycle transitions', () => {
  let state = { ...initialGatewayRuntimeState };

  state = gatewayRuntimeReducer(state, { type: 'CONNECT_REQUEST' });
  assert.equal(state.connectionState, 'connecting');

  state = gatewayRuntimeReducer(state, { type: 'CONNECT_SUCCESS' });
  assert.equal(state.connectionState, 'connected');

  state = gatewayRuntimeReducer(state, { type: 'SEND_REQUEST' });
  assert.equal(state.isSending, true);
  assert.equal(state.gatewayEventState, 'sending');

  state = gatewayRuntimeReducer(state, { type: 'SEND_COMPLETE' });
  assert.equal(state.isSending, false);
  assert.equal(state.gatewayEventState, 'complete');

  state = gatewayRuntimeReducer(state, { type: 'SYNC_REQUEST' });
  assert.equal(state.isSessionHistoryLoading, true);

  state = gatewayRuntimeReducer(state, { type: 'SYNC_TIMEOUT' });
  assert.equal(state.isSessionHistoryLoading, false);

  state = gatewayRuntimeReducer(state, { type: 'MISSING_RECOVERY_REQUEST' });
  assert.equal(state.isMissingResponseRecoveryInFlight, true);

  state = gatewayRuntimeReducer(state, { type: 'MISSING_RECOVERY_DONE' });
  assert.equal(state.isMissingResponseRecoveryInFlight, false);
});

test('gatewayRuntimeReducer forces terminal state on connect/send failures', () => {
  let state = {
    ...initialGatewayRuntimeState,
    connectionState: 'connected',
    gatewayEventState: 'streaming',
    isSending: true,
  };

  state = gatewayRuntimeReducer(state, { type: 'CONNECT_FAILED' });
  assert.equal(state.connectionState, 'disconnected');
  assert.equal(state.isSending, false);

  state = gatewayRuntimeReducer(state, { type: 'SEND_ERROR' });
  assert.equal(state.gatewayEventState, 'error');
  assert.equal(state.isSending, false);

  state = gatewayRuntimeReducer(state, { type: 'RESET_RUNTIME' });
  assert.deepEqual(state, initialGatewayRuntimeState);
});
