import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  validateGatewayConnectPreflight,
  shouldRunAutoConnectRetry,
  applyDisconnectReset,
} = require('../src/ios-runtime/gateway-connection-flow-logic.js');

test('validateGatewayConnectPreflight validates settings, URL format, and ws/wss scheme', () => {
  assert.deepEqual(
    validateGatewayConnectPreflight({
      settingsReady: false,
      gatewayUrl: 'wss://example.com',
    }),
    {
      ok: false,
      message: 'Initializing. Please wait a few seconds and try again.',
    },
  );

  assert.deepEqual(
    validateGatewayConnectPreflight({
      settingsReady: true,
      gatewayUrl: '  ',
    }),
    {
      ok: false,
      message: 'Please enter a Gateway URL.',
    },
  );

  const invalid = validateGatewayConnectPreflight({
    settingsReady: true,
    gatewayUrl: 'not-a-url',
  });
  assert.equal(invalid.ok, false);
  if (!invalid.ok) {
    assert.equal(invalid.diagnostic?.kind, 'invalid-url');
    assert.equal(
      invalid.message,
      'Gateway URL is invalid. Use ws:// or wss:// with a valid host.',
    );
  }

  const invalidScheme = validateGatewayConnectPreflight({
    settingsReady: true,
    gatewayUrl: 'https://example.com',
  });
  assert.equal(invalidScheme.ok, false);
  if (!invalidScheme.ok) {
    assert.equal(invalidScheme.diagnostic?.kind, 'invalid-url');
    assert.match(invalidScheme.message, /Gateway URL must start with ws:\/\/ or wss:\/\//);
  }

  assert.deepEqual(
    validateGatewayConnectPreflight({
      settingsReady: true,
      gatewayUrl: '  wss://example.com/path  ',
    }),
    {
      ok: true,
      trimmedGatewayUrl: 'wss://example.com/path',
    },
  );
});

test('shouldRunAutoConnectRetry stops retry when unmounted, missing URL, or connected', () => {
  assert.equal(
    shouldRunAutoConnectRetry({
      isUnmounting: true,
      gatewayUrl: 'wss://example.com',
      connectionState: 'disconnected',
    }),
    false,
  );

  assert.equal(
    shouldRunAutoConnectRetry({
      isUnmounting: false,
      gatewayUrl: '  ',
      connectionState: 'disconnected',
    }),
    false,
  );

  assert.equal(
    shouldRunAutoConnectRetry({
      isUnmounting: false,
      gatewayUrl: 'wss://example.com',
      connectionState: 'connected',
    }),
    false,
  );

  assert.equal(
    shouldRunAutoConnectRetry({
      isUnmounting: false,
      gatewayUrl: 'wss://example.com',
      connectionState: 'connecting',
    }),
    false,
  );

  assert.equal(
    shouldRunAutoConnectRetry({
      isUnmounting: false,
      gatewayUrl: 'wss://example.com',
      connectionState: 'reconnecting',
    }),
    false,
  );

  assert.equal(
    shouldRunAutoConnectRetry({
      isUnmounting: false,
      gatewayUrl: 'wss://example.com',
      connectionState: 'disconnected',
    }),
    true,
  );
});

test('applyDisconnectReset clears timers/refs and resets runtime state', () => {
  const historyTimer = setTimeout(() => {}, 10_000);
  const calls = {
    invalidateRefreshEpoch: 0,
    clearFinalResponseRecoveryTimer: 0,
    clearMissingResponseRecoveryState: 0,
    clearStartupAutoConnectRetryTimer: 0,
    clearBottomCompletePulseTimer: 0,
    clearOutboxRetryTimer: 0,
    gatewayDisconnect: 0,
    setActiveRunId: [],
    setIsSessionOperationPending: [],
    setGatewayConnectDiagnostic: [],
    setIsBottomCompletePulse: [],
    runGatewayRuntimeAction: [],
  };

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
    setActiveRunId: (value) => calls.setActiveRunId.push(value),
    setIsSessionOperationPending: (value) =>
      calls.setIsSessionOperationPending.push(value),
    setGatewayConnectDiagnostic: (value) =>
      calls.setGatewayConnectDiagnostic.push(value),
    setIsBottomCompletePulse: (value) => calls.setIsBottomCompletePulse.push(value),
    runGatewayRuntimeAction: (action) => calls.runGatewayRuntimeAction.push(action),
    gatewayDisconnect: () => {
      calls.gatewayDisconnect += 1;
    },
    clearFinalResponseRecoveryTimer: () => {
      calls.clearFinalResponseRecoveryTimer += 1;
    },
    clearMissingResponseRecoveryState: () => {
      calls.clearMissingResponseRecoveryState += 1;
    },
    clearStartupAutoConnectRetryTimer: () => {
      calls.clearStartupAutoConnectRetryTimer += 1;
    },
    clearBottomCompletePulseTimer: () => {
      calls.clearBottomCompletePulseTimer += 1;
    },
    clearOutboxRetryTimer: () => {
      calls.clearOutboxRetryTimer += 1;
    },
    invalidateRefreshEpoch: () => {
      calls.invalidateRefreshEpoch += 1;
    },
  });

  assert.equal(historySyncTimerRef.current, null);
  assert.equal(historySyncRequestRef.current, null);
  assert.equal(outboxProcessingRef.current, false);
  assert.equal(activeRunIdRef.current, null);
  assert.equal(pendingTurnIdRef.current, null);
  assert.equal(runIdToTurnIdRef.current.size, 0);
  assert.deepEqual(calls.setActiveRunId, [null]);
  assert.deepEqual(calls.setIsSessionOperationPending, [false]);
  assert.deepEqual(calls.setGatewayConnectDiagnostic, [null]);
  assert.deepEqual(calls.setIsBottomCompletePulse, [false]);
  assert.deepEqual(calls.runGatewayRuntimeAction, [{ type: 'RESET_RUNTIME' }]);
  assert.equal(calls.invalidateRefreshEpoch, 1);
  assert.equal(calls.clearFinalResponseRecoveryTimer, 1);
  assert.equal(calls.clearMissingResponseRecoveryState, 1);
  assert.equal(calls.clearStartupAutoConnectRetryTimer, 1);
  assert.equal(calls.clearBottomCompletePulseTimer, 1);
  assert.equal(calls.clearOutboxRetryTimer, 1);
  assert.equal(calls.gatewayDisconnect, 1);
});
