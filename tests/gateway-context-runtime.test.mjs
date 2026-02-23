import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  gatewayContextRuntimeReducer,
  initialGatewayContextRuntimeState,
} = require('../src/contexts/gateway-runtime-state.js');

test('gateway context runtime handles connect success/failure and disconnect reset', () => {
  let state = { ...initialGatewayContextRuntimeState };

  state = gatewayContextRuntimeReducer(state, { type: 'CONNECT_REQUEST' });
  assert.equal(state.connectionState, 'connecting');
  assert.equal(state.error, null);

  state = gatewayContextRuntimeReducer(state, { type: 'CONNECT_SUCCESS' });
  assert.equal(state.connectionState, 'connected');
  assert.equal(state.error, null);
  assert.equal(state.healthState, 'unknown');

  state = gatewayContextRuntimeReducer(state, {
    type: 'CONNECT_FAILED',
    message: 'invalid token',
    diagnostic: {
      kind: 'auth',
      summary: 'Token rejected',
      guidance: 'Verify token',
    },
  });
  assert.equal(state.connectionState, 'disconnected');
  assert.equal(state.error, 'invalid token');
  assert.equal(state.connectDiagnostic?.kind, 'auth');

  state = gatewayContextRuntimeReducer(state, {
    type: 'SET_CONNECT_DIAGNOSTIC',
    diagnostic: {
      kind: 'pairing',
      summary: 'Pairing approval required',
      guidance: 'Approve this device',
    },
  });
  assert.equal(state.connectDiagnostic?.kind, 'pairing');

  state = gatewayContextRuntimeReducer(state, {
    type: 'CONNECTION_STATE_CHANGED',
    value: 'reconnecting',
  });
  assert.equal(state.connectionState, 'reconnecting');

  state = gatewayContextRuntimeReducer(state, { type: 'DISCONNECT' });
  assert.deepEqual(state, initialGatewayContextRuntimeState);
});

test('gateway context runtime handles health checks', () => {
  let state = {
    ...initialGatewayContextRuntimeState,
    connectionState: 'connected',
    healthState: 'ok',
  };

  state = gatewayContextRuntimeReducer(state, { type: 'HEALTH_CHECK_START' });
  assert.equal(state.healthState, 'checking');

  state = gatewayContextRuntimeReducer(state, {
    type: 'HEALTH_CHECK_RESULT',
    healthy: true,
    checkedAt: 1234,
  });
  assert.equal(state.healthState, 'ok');
  assert.equal(state.healthCheckedAt, 1234);

  state = gatewayContextRuntimeReducer(state, {
    type: 'HEALTH_CHECK_RESULT',
    healthy: false,
    checkedAt: 5678,
  });
  assert.equal(state.healthState, 'degraded');
  assert.equal(state.healthCheckedAt, 5678);

  state = gatewayContextRuntimeReducer(state, { type: 'HEALTH_RESET' });
  assert.equal(state.healthState, 'unknown');
});

test('gateway context runtime handles sessions refresh lifecycle', () => {
  let state = {
    ...initialGatewayContextRuntimeState,
    connectionState: 'connected',
    sessions: [{ key: 'stale-session', updatedAt: 100 }],
  };

  state = gatewayContextRuntimeReducer(state, { type: 'SESSIONS_REFRESH_START' });
  assert.equal(state.isSessionsLoading, true);
  assert.equal(state.sessionsError, null);

  state = gatewayContextRuntimeReducer(state, {
    type: 'SESSIONS_REFRESH_SUCCESS',
    sessions: [
      { key: 'main', updatedAt: 200 },
      { key: 'ops-room', updatedAt: 300 },
    ],
  });
  assert.equal(state.isSessionsLoading, false);
  assert.equal(state.sessions.length, 2);
  assert.equal(state.sessions[0].key, 'main');

  state = gatewayContextRuntimeReducer(state, {
    type: 'SESSIONS_REFRESH_FAILED',
    message: 'timeout',
  });
  assert.equal(state.isSessionsLoading, false);
  assert.equal(state.sessionsError, 'timeout');

  state = gatewayContextRuntimeReducer(state, { type: 'SESSIONS_NOT_CONNECTED' });
  assert.equal(state.isSessionsLoading, false);
  assert.equal(state.sessionsError, 'Not connected');
});
