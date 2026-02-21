import { useCallback, useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { ConnectionState, GatewayClient } from '../openclaw';
import type { ChatTurn, OutboxQueueItem } from '../types';
import { resolveSendDispatch } from '../ui/runtime-logic';
import {
  DUPLICATE_SEND_BLOCK_MS,
  IDEMPOTENCY_REUSE_WINDOW_MS,
  SEND_TIMEOUT_MS,
  createOutboxItemId,
  createTurnId,
  getOutboxRetryDelayMs,
} from '../utils';
import { errorMessage, triggerHaptic } from '../utils';

type SendFingerprint = {
  sessionKey: string;
  message: string;
  sentAt: number;
  idempotencyKey: string;
};

type UseOutboxRuntimeInput = {
  isSending: boolean;
  connectionState: ConnectionState;
  outboxQueue: OutboxQueueItem[];
  outboxQueueRef: MutableRefObject<OutboxQueueItem[]>;
  outboxProcessingRef: MutableRefObject<boolean>;
  outboxRetryTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  connectionStateRef: MutableRefObject<ConnectionState>;
  activeSessionKeyRef: MutableRefObject<string>;
  transcriptRef: MutableRefObject<string>;
  interimTranscriptRef: MutableRefObject<string>;
  sendFingerprintRef: MutableRefObject<SendFingerprint | null>;
  pendingTurnIdRef: MutableRefObject<string | null>;
  activeRunIdRef: MutableRefObject<string | null>;
  runIdToTurnIdRef: MutableRefObject<Map<string, string>>;
  gatewayGetClient: () => GatewayClient | null;
  runGatewayHealthCheck: (options?: { silent?: boolean; timeoutMs?: number }) => Promise<boolean>;
  runGatewayRuntimeAction: (action: { type: 'SEND_REQUEST' | 'SEND_ERROR' }) => void;
  updateChatTurn: (turnId: string, updater: (turn: ChatTurn) => ChatTurn) => void;
  refreshSessions: () => Promise<unknown>;
  clearOutboxRetryTimer: () => void;
  clearMissingResponseRecoveryState: (sessionKey?: string) => void;
  setGatewayError: Dispatch<SetStateAction<string | null>>;
  setGatewayEventState: (value: string) => void;
  setOutboxQueue: Dispatch<SetStateAction<OutboxQueueItem[]>>;
  setChatTurns: Dispatch<SetStateAction<ChatTurn[]>>;
  setTranscript: Dispatch<SetStateAction<string>>;
  setInterimTranscript: Dispatch<SetStateAction<string>>;
  setActiveRunId: Dispatch<SetStateAction<string | null>>;
};

export function useOutboxRuntime(input: UseOutboxRuntimeInput) {
  const processOutboxQueue = useCallback(async () => {
    if (input.outboxProcessingRef.current) return;
    if (input.connectionStateRef.current !== 'connected') return;
    if (input.isSending) return;

    const client = input.gatewayGetClient();
    if (!client) return;

    const head = input.outboxQueueRef.current[0];
    if (!head) {
      input.clearOutboxRetryTimer();
      return;
    }

    const now = Date.now();
    if (head.nextRetryAt > now) {
      const waitMs = head.nextRetryAt - now;
      input.clearOutboxRetryTimer();
      input.outboxRetryTimerRef.current = setTimeout(() => {
        input.outboxRetryTimerRef.current = null;
        void processOutboxQueue();
      }, waitMs);
      return;
    }

    input.outboxProcessingRef.current = true;
    input.clearOutboxRetryTimer();

    const healthy = await input.runGatewayHealthCheck({ silent: true });
    if (input.connectionStateRef.current !== 'connected') {
      input.outboxProcessingRef.current = false;
      return;
    }
    if (!healthy) {
      input.setOutboxQueue((previous) => {
        if (previous.length === 0 || previous[0].id !== head.id) return previous;
        const retryCount = previous[0].retryCount + 1;
        const nextRetryAt = Date.now() + getOutboxRetryDelayMs(retryCount);
        return [
          {
            ...previous[0],
            retryCount,
            nextRetryAt,
            lastError: 'health check failed',
          },
          ...previous.slice(1),
        ];
      });
      input.setGatewayError('Gateway health check failed. Retrying queued message...');
      input.outboxProcessingRef.current = false;
      return;
    }

    input.setGatewayError(null);
    input.runGatewayRuntimeAction({ type: 'SEND_REQUEST' });
    input.pendingTurnIdRef.current = head.turnId;
    input.updateChatTurn(head.turnId, (turn) => ({
      ...turn,
      state: 'sending',
      assistantText:
        turn.assistantText === 'Waiting for connection...' ? '' : turn.assistantText,
    }));

    try {
      const result = await client.chatSend(head.sessionKey, head.message, {
        timeoutMs: SEND_TIMEOUT_MS,
        idempotencyKey: head.idempotencyKey,
      });
      void triggerHaptic('send-success');
      input.activeRunIdRef.current = result.runId;
      input.setActiveRunId(result.runId);
      input.runIdToTurnIdRef.current.set(result.runId, head.turnId);
      input.pendingTurnIdRef.current = null;
      input.setOutboxQueue((previous) => previous.filter((item) => item.id !== head.id));
      input.updateChatTurn(head.turnId, (turn) => ({
        ...turn,
        runId: result.runId,
        state: 'queued',
      }));
      void input.refreshSessions();
    } catch (err) {
      const messageText = errorMessage(err);
      void triggerHaptic('send-error');
      input.pendingTurnIdRef.current = null;
      input.runGatewayRuntimeAction({ type: 'SEND_ERROR' });
      input.setOutboxQueue((previous) => {
        const index = previous.findIndex((item) => item.id === head.id);
        if (index < 0) return previous;
        const current = previous[index];
        const retryCount = current.retryCount + 1;
        const nextRetryAt = Date.now() + getOutboxRetryDelayMs(retryCount);
        const nextQueue = [...previous];
        nextQueue[index] = {
          ...current,
          retryCount,
          nextRetryAt,
          lastError: messageText,
        };
        return nextQueue;
      });
      input.setGatewayError(`Send delayed: ${messageText}. Auto retrying...`);
      input.updateChatTurn(head.turnId, (turn) => ({
        ...turn,
        state: 'queued',
        assistantText: `Retrying automatically... (${messageText})`,
      }));
    } finally {
      input.outboxProcessingRef.current = false;
    }
  }, [input]);

  useEffect(() => {
    if (input.outboxQueue.length === 0) {
      input.clearOutboxRetryTimer();
      return;
    }
    if (input.connectionState !== 'connected') {
      input.clearOutboxRetryTimer();
      return;
    }
    if (input.isSending) return;

    const head = input.outboxQueue[0];
    const waitMs = Math.max(0, head.nextRetryAt - Date.now());
    input.clearOutboxRetryTimer();
    if (waitMs > 0) {
      input.outboxRetryTimerRef.current = setTimeout(() => {
        input.outboxRetryTimerRef.current = null;
        void processOutboxQueue();
      }, waitMs);
      return;
    }

    void processOutboxQueue();
  }, [
    input.clearOutboxRetryTimer,
    input.connectionState,
    input.isSending,
    input.outboxQueue,
    input.outboxRetryTimerRef,
    processOutboxQueue,
  ]);

  const sendToGateway = useCallback(
    async (overrideText?: string) => {
      if (input.isSending) return;

      const sessionKey = input.activeSessionKeyRef.current;
      input.clearMissingResponseRecoveryState(sessionKey);
      const message =
        (overrideText ?? input.transcriptRef.current ?? '').trim() ||
        (input.interimTranscriptRef.current ?? '').trim();
      if (!message) {
        input.setGatewayError('No text to send. Please record your voice first.');
        return;
      }
      const dispatch = resolveSendDispatch(
        input.sendFingerprintRef.current,
        {
          sessionKey,
          message,
          now: Date.now(),
        },
        {
          duplicateBlockMs: DUPLICATE_SEND_BLOCK_MS,
          reuseWindowMs: IDEMPOTENCY_REUSE_WINDOW_MS,
        },
      );
      if (dispatch.blocked) {
        input.setGatewayError('This message was already sent. Please wait a moment.');
        return;
      }
      const { idempotencyKey } = dispatch;
      input.sendFingerprintRef.current = dispatch.nextFingerprint;

      const turnId = createTurnId();
      const createdAt = Date.now();
      const outboxItem: OutboxQueueItem = {
        id: createOutboxItemId(),
        sessionKey,
        message,
        turnId,
        idempotencyKey,
        createdAt,
        retryCount: 0,
        nextRetryAt: createdAt,
        lastError: null,
      };

      input.setChatTurns((previous) => [
        ...previous,
        {
          id: turnId,
          userText: message,
          assistantText:
            input.connectionState === 'connected' ? '' : 'Waiting for connection...',
          state: 'queued',
          createdAt,
        },
      ]);
      input.setOutboxQueue((previous) => [...previous, outboxItem]);

      input.transcriptRef.current = '';
      input.interimTranscriptRef.current = '';
      input.setTranscript('');
      input.setInterimTranscript('');

      if (input.connectionState === 'connected') {
        input.setGatewayError(null);
        void processOutboxQueue();
      } else {
        input.setGatewayEventState('queued');
        input.setGatewayError('Message queued. Connect to send automatically.');
      }
    },
    [input, processOutboxQueue],
  );

  return {
    processOutboxQueue,
    sendToGateway,
  };
}
