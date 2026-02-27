import assert from 'node:assert/strict';
import test from 'node:test';

import __srcModule0 from '../src/ui/runtime-logic.js';
const {
  buildHistoryRefreshNotice,
  computeAutoConnectRetryPlan,
  computeHistorySyncRetryPlan,
  mergeHistoryTurnsWithPendingLocal,
  resolveCompletedAssistantText,
  resolveSendDispatch,
  shouldAttemptFinalRecovery,
  shouldStartStartupAutoConnect,
} = __srcModule0;

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

test('computeHistorySyncRetryPlan stops retrying after max attempts to avoid Refreshing lock', () => {
  const exhausted = computeHistorySyncRetryPlan({
    attempt: 4,
    maxAttempts: 3,
    baseDelayMs: 900,
  });
  assert.deepEqual(exhausted, {
    shouldRetry: false,
    nextAttempt: 4,
    delayMs: 0,
  });
});

test('computeHistorySyncRetryPlan returns exponential retry delays', () => {
  const first = computeHistorySyncRetryPlan({
    attempt: 1,
    maxAttempts: 3,
    baseDelayMs: 900,
  });
  assert.deepEqual(first, {
    shouldRetry: true,
    nextAttempt: 2,
    delayMs: 900,
  });

  const second = computeHistorySyncRetryPlan({
    attempt: 2,
    maxAttempts: 3,
    baseDelayMs: 900,
  });
  assert.deepEqual(second, {
    shouldRetry: true,
    nextAttempt: 3,
    delayMs: 1800,
  });

  const exhausted = computeHistorySyncRetryPlan({
    attempt: 3,
    maxAttempts: 3,
    baseDelayMs: 900,
  });
  assert.deepEqual(exhausted, {
    shouldRetry: false,
    nextAttempt: 3,
    delayMs: 0,
  });
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

  assert.equal(
    shouldStartStartupAutoConnect({
      settingsReady: true,
      alreadyAttempted: false,
      gatewayUrl: 'wss://example.com',
      connectionState: 'connecting',
    }),
    false,
  );

  assert.equal(
    shouldStartStartupAutoConnect({
      settingsReady: true,
      alreadyAttempted: false,
      gatewayUrl: 'wss://example.com',
      connectionState: 'reconnecting',
    }),
    false,
  );
});

test('shouldAttemptFinalRecovery and buildHistoryRefreshNotice handle edge cases', () => {
  assert.equal(shouldAttemptFinalRecovery('', ''), true);
  assert.equal(shouldAttemptFinalRecovery('', 'Final answer'), false);
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

test('resolveCompletedAssistantText prefers final payload then streamed text then fallback', () => {
  assert.equal(
    resolveCompletedAssistantText({
      finalText: 'Final answer from gateway',
      streamedText: 'partial',
      stopReason: null,
    }),
    'Final answer from gateway',
  );

  assert.equal(
    resolveCompletedAssistantText({
      finalText: '',
      streamedText: 'streamed but complete answer',
      stopReason: null,
    }),
    'streamed but complete answer',
  );

  assert.equal(
    resolveCompletedAssistantText({
      finalText: '',
      streamedText: '',
      stopReason: 'max_tokens',
    }),
    'Response was truncated (max tokens reached).',
  );
});

test('mergeHistoryTurnsWithPendingLocal keeps synced final turns and appends unsynced pending turns', () => {
  const historyTurns = [
    {
      id: 'turn-a',
      userText: 'A',
      assistantText: 'Final A',
      state: 'complete',
      createdAt: 1000,
    },
    {
      id: 'turn-c',
      userText: 'C',
      assistantText: 'Final C',
      state: 'complete',
      createdAt: 3000,
    },
  ];

  const localTurns = [
    {
      id: 'turn-a',
      userText: 'A',
      assistantText: 'Responding...',
      state: 'streaming',
      createdAt: 1000,
    },
    {
      id: 'turn-b',
      userText: 'B',
      assistantText: 'Waiting for connection...',
      state: 'queued',
      createdAt: 2000,
    },
    {
      id: 'turn-d',
      userText: 'D',
      assistantText: 'Working...',
      state: 'streaming',
      createdAt: 4000,
    },
    {
      id: 'turn-e',
      userText: 'E',
      assistantText: 'Should be dropped',
      state: 'complete',
      createdAt: 5000,
    },
  ];

  const merged = mergeHistoryTurnsWithPendingLocal(
    historyTurns,
    localTurns,
    new Set(['turn-b']),
  );

  assert.equal(merged.length, 4);
  assert.deepEqual(
    merged.map((turn) => turn.id),
    ['turn-a', 'turn-b', 'turn-c', 'turn-d'],
  );
  assert.equal(
    merged.find((turn) => turn.id === 'turn-a')?.assistantText,
    'Final A',
  );
  assert.equal(merged.some((turn) => turn.id === 'turn-e'), false);
});
