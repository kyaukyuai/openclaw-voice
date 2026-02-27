import assert from 'node:assert/strict';
import test from 'node:test';

import __srcModule0 from '../src/ios-runtime/outbox-runtime-logic.ts';
const {
  resolveOutboxSendAction,
  createQueuedOutboxPayload,
  applyOutboxHealthCheckFailure,
  applyOutboxSendFailure,
  applyOutboxSendSuccess,
} = __srcModule0;

function createQueueItem(overrides = {}) {
  return {
    id: 'outbox-1',
    sessionKey: 'main',
    message: 'hello',
    turnId: 'turn-1',
    idempotencyKey: 'idem-1',
    createdAt: 1000,
    retryCount: 0,
    nextRetryAt: 1000,
    lastError: null,
    ...overrides,
  };
}

test('resolveOutboxSendAction handles already-sending, missing-message, duplicate-block, and dispatch', () => {
  assert.deepEqual(
    resolveOutboxSendAction({
      isSending: true,
      sessionKey: 'main',
      previousFingerprint: null,
    }),
    {
      type: 'noop',
      reason: 'already-sending',
    },
  );

  assert.deepEqual(
    resolveOutboxSendAction({
      isSending: false,
      transcriptText: '   ',
      interimTranscriptText: '',
      sessionKey: 'main',
      previousFingerprint: null,
    }),
    {
      type: 'noop',
      reason: 'missing-message',
      errorMessage: 'No text to send. Please record your voice first.',
    },
  );

  const previousFingerprint = {
    sessionKey: 'main',
    message: 'hello world',
    sentAt: 1_000,
    idempotencyKey: 'idem-rapid',
  };
  const blocked = resolveOutboxSendAction({
    isSending: false,
    transcriptText: 'hello   world',
    sessionKey: 'main',
    previousFingerprint,
    now: 1_500,
  });
  assert.equal(blocked.type, 'blocked-duplicate');
  assert.equal(blocked.errorMessage, 'This message was already sent. Please wait a moment.');
  assert.deepEqual(blocked.nextFingerprint, previousFingerprint);

  const dispatched = resolveOutboxSendAction({
    isSending: false,
    transcriptText: '',
    interimTranscriptText: '  queued from interim  ',
    sessionKey: 'main',
    previousFingerprint: null,
    now: 10_000,
  });
  assert.equal(dispatched.type, 'dispatch');
  assert.equal(dispatched.message, 'queued from interim');
  assert.equal(typeof dispatched.idempotencyKey, 'string');
  assert.equal(dispatched.idempotencyKey.length > 0, true);
  assert.equal(dispatched.nextFingerprint.message, 'queued from interim');
});

test('createQueuedOutboxPayload maps connected/disconnected turn text and queue fields', () => {
  const disconnected = createQueuedOutboxPayload({
    sessionKey: 'main',
    message: 'queued message',
    idempotencyKey: 'idem-1',
    turnId: 'turn-1',
    outboxItemId: 'outbox-1',
    createdAt: 5_000,
    connectionState: 'disconnected',
  });
  assert.equal(disconnected.turn.assistantText, 'Waiting for connection...');
  assert.equal(disconnected.turn.state, 'queued');
  assert.equal(disconnected.outboxItem.retryCount, 0);
  assert.equal(disconnected.outboxItem.nextRetryAt, 5_000);

  const connected = createQueuedOutboxPayload({
    sessionKey: 'main',
    message: 'send now',
    idempotencyKey: 'idem-2',
    turnId: 'turn-2',
    outboxItemId: 'outbox-2',
    createdAt: 7_000,
    connectionState: 'connected',
  });
  assert.equal(connected.turn.assistantText, '');
});

test('applyOutboxHealthCheckFailure updates only matching head and schedules retry', () => {
  const queue = [
    createQueueItem({
      id: 'head',
      retryCount: 0,
      nextRetryAt: 1000,
      lastError: null,
    }),
    createQueueItem({
      id: 'tail',
      turnId: 'turn-2',
    }),
  ];

  const updated = applyOutboxHealthCheckFailure(queue, 'head', 10_000);
  assert.equal(updated[0].retryCount, 1);
  assert.equal(updated[0].nextRetryAt, 11_800);
  assert.equal(updated[0].lastError, 'health check failed');
  assert.deepEqual(updated[1], queue[1]);

  const unchanged = applyOutboxHealthCheckFailure(queue, 'missing', 10_000);
  assert.equal(unchanged, queue);
});

test('applyOutboxSendFailure updates matching item with retry metadata', () => {
  const queue = [
    createQueueItem({
      id: 'head',
      retryCount: 1,
      nextRetryAt: 2000,
    }),
    createQueueItem({
      id: 'target',
      turnId: 'turn-2',
      retryCount: 2,
      nextRetryAt: 3000,
      lastError: null,
    }),
  ];

  const updated = applyOutboxSendFailure(queue, 'target', 'gateway timeout', 5_000);
  assert.equal(updated[0], queue[0]);
  assert.equal(updated[1].retryCount, 3);
  assert.equal(updated[1].nextRetryAt, 12_200);
  assert.equal(updated[1].lastError, 'gateway timeout');

  const unchanged = applyOutboxSendFailure(queue, 'missing', 'x', 5_000);
  assert.equal(unchanged, queue);
});

test('applyOutboxSendSuccess removes acknowledged queue item', () => {
  const queue = [
    createQueueItem({ id: 'head' }),
    createQueueItem({ id: 'tail', turnId: 'turn-2' }),
  ];

  const updated = applyOutboxSendSuccess(queue, 'head');
  assert.equal(updated.length, 1);
  assert.equal(updated[0].id, 'tail');
});
