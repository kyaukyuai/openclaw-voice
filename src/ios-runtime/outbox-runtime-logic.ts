import type { ConnectionState } from '../openclaw';
import type { OutboxQueueItem, ChatTurn } from '../types';
import { resolveSendDispatch } from '../ui/runtime-logic';
import {
  DUPLICATE_SEND_BLOCK_MS,
  IDEMPOTENCY_REUSE_WINDOW_MS,
  getOutboxRetryDelayMs,
} from '../utils';

export type SendFingerprint = {
  sessionKey: string;
  message: string;
  sentAt: number;
  idempotencyKey: string;
};

type ResolveOutboxSendInput = {
  isSending: boolean;
  overrideText?: string;
  transcriptText?: string;
  interimTranscriptText?: string;
  sessionKey: string;
  previousFingerprint: SendFingerprint | null;
  now?: number;
};

type ResolveOutboxSendResult =
  | {
      type: 'noop';
      reason: 'already-sending' | 'missing-message';
      errorMessage?: string;
    }
  | {
      type: 'blocked-duplicate';
      errorMessage: string;
      nextFingerprint: SendFingerprint;
    }
  | {
      type: 'dispatch';
      message: string;
      idempotencyKey: string;
      nextFingerprint: SendFingerprint;
    };

export function resolveOutboxSendAction(
  input: ResolveOutboxSendInput,
): ResolveOutboxSendResult {
  if (input.isSending) {
    return { type: 'noop', reason: 'already-sending' };
  }
  const message =
    (input.overrideText ?? input.transcriptText ?? '').trim() ||
    (input.interimTranscriptText ?? '').trim();
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
      nextFingerprint: dispatch.nextFingerprint as SendFingerprint,
    };
  }

  return {
    type: 'dispatch',
    message,
    idempotencyKey: dispatch.idempotencyKey,
    nextFingerprint: dispatch.nextFingerprint as SendFingerprint,
  };
}

type CreateQueuedOutboxPayloadInput = {
  sessionKey: string;
  message: string;
  idempotencyKey: string;
  turnId: string;
  outboxItemId: string;
  createdAt: number;
  connectionState: ConnectionState;
};

export function createQueuedOutboxPayload(
  input: CreateQueuedOutboxPayloadInput,
): { turn: ChatTurn; outboxItem: OutboxQueueItem } {
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

export function applyOutboxHealthCheckFailure(
  queue: OutboxQueueItem[],
  headId: string,
  now = Date.now(),
): OutboxQueueItem[] {
  if (queue.length === 0 || queue[0].id !== headId) return queue;
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

export function applyOutboxSendFailure(
  queue: OutboxQueueItem[],
  headId: string,
  messageText: string,
  now = Date.now(),
): OutboxQueueItem[] {
  const index = queue.findIndex((item) => item.id === headId);
  if (index < 0) return queue;
  const current = queue[index];
  const retryCount = current.retryCount + 1;
  const nextRetryAt = now + getOutboxRetryDelayMs(retryCount);
  const nextQueue = [...queue];
  nextQueue[index] = {
    ...current,
    retryCount,
    nextRetryAt,
    lastError: messageText,
  };
  return nextQueue;
}

export function applyOutboxSendSuccess(
  queue: OutboxQueueItem[],
  headId: string,
): OutboxQueueItem[] {
  return queue.filter((item) => item.id !== headId);
}
