const { resolveSendDispatch } = require('../ui/runtime-logic.js');

const DUPLICATE_SEND_BLOCK_MS = 1400;
const IDEMPOTENCY_REUSE_WINDOW_MS = 60_000;
const OUTBOX_RETRY_BASE_MS = 1800;
const OUTBOX_RETRY_MAX_MS = 20_000;

function getOutboxRetryDelayMs(retryCount) {
  const safeRetryCount = Math.max(1, Number(retryCount) || 1);
  const delay = OUTBOX_RETRY_BASE_MS * 2 ** (safeRetryCount - 1);
  return Math.min(OUTBOX_RETRY_MAX_MS, delay);
}

function resolveOutboxSendAction(input) {
  if (input.isSending) {
    return { type: 'noop', reason: 'already-sending' };
  }

  const message =
    String(input.overrideText ?? input.transcriptText ?? '').trim() ||
    String(input.interimTranscriptText ?? '').trim();
  if (!message) {
    return {
      type: 'noop',
      reason: 'missing-message',
      errorMessage: 'No text to send. Please record your voice first.',
    };
  }

  const dispatch = resolveSendDispatch(
    input.previousFingerprint,
    {
      sessionKey: input.sessionKey,
      message,
      now: input.now ?? Date.now(),
    },
    {
      duplicateBlockMs: DUPLICATE_SEND_BLOCK_MS,
      reuseWindowMs: IDEMPOTENCY_REUSE_WINDOW_MS,
    },
  );

  if (dispatch.blocked) {
    return {
      type: 'blocked-duplicate',
      errorMessage: 'This message was already sent. Please wait a moment.',
      nextFingerprint: dispatch.nextFingerprint,
    };
  }

  return {
    type: 'dispatch',
    message,
    idempotencyKey: dispatch.idempotencyKey,
    nextFingerprint: dispatch.nextFingerprint,
  };
}

function createQueuedOutboxPayload(input) {
  return {
    turn: {
      id: input.turnId,
      userText: input.message,
      assistantText:
        input.connectionState === 'connected' ? '' : 'Waiting for connection...',
      state: 'queued',
      createdAt: input.createdAt,
    },
    outboxItem: {
      id: input.outboxItemId,
      sessionKey: input.sessionKey,
      message: input.message,
      turnId: input.turnId,
      idempotencyKey: input.idempotencyKey,
      createdAt: input.createdAt,
      retryCount: 0,
      nextRetryAt: input.createdAt,
      lastError: null,
    },
  };
}

function applyOutboxHealthCheckFailure(queue, headId, now = Date.now()) {
  if (!Array.isArray(queue) || queue.length === 0 || queue[0].id !== headId) {
    return queue;
  }

  const retryCount = queue[0].retryCount + 1;
  const nextRetryAt = now + getOutboxRetryDelayMs(retryCount);
  return [
    {
      ...queue[0],
      retryCount,
      nextRetryAt,
      lastError: 'health check failed',
    },
    ...queue.slice(1),
  ];
}

function applyOutboxSendFailure(queue, headId, messageText, now = Date.now()) {
  const index = Array.isArray(queue)
    ? queue.findIndex((item) => item.id === headId)
    : -1;
  if (index < 0) return queue;

  const current = queue[index];
  const retryCount = current.retryCount + 1;
  const nextRetryAt = now + getOutboxRetryDelayMs(retryCount);
  const nextQueue = [...queue];
  nextQueue[index] = {
    ...current,
    retryCount,
    nextRetryAt,
    lastError: String(messageText ?? ''),
  };
  return nextQueue;
}

function applyOutboxSendSuccess(queue, headId) {
  if (!Array.isArray(queue)) return queue;
  return queue.filter((item) => item.id !== headId);
}

module.exports = {
  resolveOutboxSendAction,
  createQueuedOutboxPayload,
  applyOutboxHealthCheckFailure,
  applyOutboxSendFailure,
  applyOutboxSendSuccess,
};
