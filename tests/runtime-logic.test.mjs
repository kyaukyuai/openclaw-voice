import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  buildHistoryRefreshNotice,
  computeAutoConnectRetryPlan,
  resolveSendDispatch,
  shouldAttemptFinalRecovery,
  shouldStartStartupAutoConnect,
} = require('../src/ui/runtime-logic.js');

test('resolveSendDispatch blocks rapid duplicate sends and reuses idempotency key', () => {
  const first = resolveSendDispatch(
    null,
    {
      sessionKey: 'main',
      message: 'hello world',
      now: 1_000,
    },
    {
      duplicateBlockMs: 1_400,
      reuseWindowMs: 60_000,
    },
  );

  assert.equal(first.blocked, false);
  assert.equal(typeof first.idempotencyKey, 'string');
  assert.equal(first.idempotencyKey.length > 0, true);

  const rapidDuplicate = resolveSendDispatch(
    first.nextFingerprint,
    {
      sessionKey: 'main',
      message: 'hello    world',
      now: 1_500,
    },
    {
      duplicateBlockMs: 1_400,
      reuseWindowMs: 60_000,
    },
  );

  assert.equal(rapidDuplicate.blocked, true);
  assert.equal(rapidDuplicate.reason, 'duplicate-rapid');
  assert.equal(rapidDuplicate.idempotencyKey, first.idempotencyKey);
  assert.equal(rapidDuplicate.reusedIdempotencyKey, true);
});

test('resolveSendDispatch reuses key only within reuse window', () => {
  const baseFingerprint = {
    sessionKey: 'main',
    message: 'ping',
    sentAt: 2_000,
    idempotencyKey: 'idem-1',
  };

  const reused = resolveSendDispatch(
    baseFingerprint,
    {
      sessionKey: 'main',
      message: 'ping',
      now: 5_000,
    },
    {
      duplicateBlockMs: 1_000,
      reuseWindowMs: 60_000,
    },
  );
  assert.equal(reused.blocked, false);
  assert.equal(reused.idempotencyKey, 'idem-1');
  assert.equal(reused.reusedIdempotencyKey, true);

  const regenerated = resolveSendDispatch(
    reused.nextFingerprint,
    {
      sessionKey: 'main',
      message: 'ping',
      now: 70_001,
    },
    {
      duplicateBlockMs: 1_000,
      reuseWindowMs: 60_000,
    },
  );
  assert.equal(regenerated.blocked, false);
  assert.notEqual(regenerated.idempotencyKey, 'idem-1');
  assert.equal(regenerated.reusedIdempotencyKey, false);
});

test('computeAutoConnectRetryPlan returns retry plan until max attempts', () => {
  const retry = computeAutoConnectRetryPlan({
    attempt: 1,
    maxAttempts: 3,
    baseDelayMs: 1_400,
    errorText: 'timeout',
  });
  assert.deepEqual(retry, {
    shouldRetry: true,
    nextAttempt: 2,
    delayMs: 1_400,
    message: 'Gateway auto-connect failed (1/3). Retrying...',
  });

  const exhausted = computeAutoConnectRetryPlan({
    attempt: 3,
    maxAttempts: 3,
    baseDelayMs: 1_400,
    errorText: 'timeout',
  });
  assert.equal(exhausted.shouldRetry, false);
  assert.equal(exhausted.nextAttempt, 3);
  assert.equal(exhausted.delayMs, 0);
  assert.equal(
    exhausted.message,
    'Gateway auto-connect failed: timeout. Tap Connect to retry manually.',
  );
});

test('shouldStartStartupAutoConnect checks required startup conditions', () => {
  assert.equal(
    shouldStartStartupAutoConnect({
      settingsReady: true,
      alreadyAttempted: false,
      gatewayUrl: 'wss://example.com',
      connectionState: 'disconnected',
    }),
    true,
  );

  assert.equal(
    shouldStartStartupAutoConnect({
      settingsReady: false,
      alreadyAttempted: false,
      gatewayUrl: 'wss://example.com',
      connectionState: 'disconnected',
    }),
    false,
  );

  assert.equal(
    shouldStartStartupAutoConnect({
      settingsReady: true,
      alreadyAttempted: true,
      gatewayUrl: 'wss://example.com',
      connectionState: 'disconnected',
    }),
    false,
  );

  assert.equal(
    shouldStartStartupAutoConnect({
      settingsReady: true,
      alreadyAttempted: false,
      gatewayUrl: '',
      connectionState: 'disconnected',
    }),
    false,
  );

  assert.equal(
    shouldStartStartupAutoConnect({
      settingsReady: true,
      alreadyAttempted: false,
      gatewayUrl: 'wss://example.com',
      connectionState: 'connected',
    }),
    false,
  );
});

test('shouldAttemptFinalRecovery and buildHistoryRefreshNotice handle edge cases', () => {
  assert.equal(shouldAttemptFinalRecovery('', ''), true);
  assert.equal(shouldAttemptFinalRecovery('Responding...', 'Responding...'), true);
  assert.equal(shouldAttemptFinalRecovery('Completed', 'No response'), true);
  assert.equal(shouldAttemptFinalRecovery('Completed', 'Final answer'), false);

  assert.deepEqual(buildHistoryRefreshNotice(true, '12:34'), {
    kind: 'success',
    message: 'Updated 12:34',
  });
  assert.deepEqual(buildHistoryRefreshNotice(false), {
    kind: 'error',
    message: 'Refresh failed',
  });
});
