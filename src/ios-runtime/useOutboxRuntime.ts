import { useCallback, useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { ChatSendResponse, ConnectionState } from '../openclaw';
import type { ChatTurn, OutboxQueueItem } from '../types';
import {
  SEND_TIMEOUT_MS,
  createOutboxItemId,
  createTurnId,
} from '../utils';
import { errorMessage, triggerHaptic } from '../utils';
import {
  applyOutboxHealthCheckFailure,
  applyOutboxSendFailure,
  applyOutboxSendSuccess,
  createQueuedOutboxPayload,
  resolveOutboxSendAction,
  type SendFingerprint,
} from './outbox-runtime-logic';

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
  gatewaySendChat: (
    sessionKey: string,
    message: string,
    options?: {
      idempotencyKey?: string;
      timeoutMs?: number;
    },
  ) => Promise<ChatSendResponse>;
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
      input.setOutboxQueue((previous) => applyOutboxHealthCheckFailure(previous, head.id));
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
      const result = await input.gatewaySendChat(head.sessionKey, head.message, {
        timeoutMs: SEND_TIMEOUT_MS,
        idempotencyKey: head.idempotencyKey,
      });
      void triggerHaptic('send-success');
      input.activeRunIdRef.current = result.runId;
      input.setActiveRunId(result.runId);
      input.runIdToTurnIdRef.current.set(result.runId, head.turnId);
      input.pendingTurnIdRef.current = null;
      input.setOutboxQueue((previous) => applyOutboxSendSuccess(previous, head.id));
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
      input.setOutboxQueue((previous) =>
        applyOutboxSendFailure(previous, head.id, messageText),
      );
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
      const sessionKey = input.activeSessionKeyRef.current;
      input.clearMissingResponseRecoveryState(sessionKey);
      const sendAction = resolveOutboxSendAction({
        isSending: input.isSending,
        overrideText,
        transcriptText: input.transcriptRef.current,
        interimTranscriptText: input.interimTranscriptRef.current,
        sessionKey,
        previousFingerprint: input.sendFingerprintRef.current,
      });

      if (sendAction.type === 'noop') {
        if (sendAction.errorMessage) {
          input.setGatewayError(sendAction.errorMessage);
        }
        return;
      }

      if (sendAction.type === 'blocked-duplicate') {
        input.sendFingerprintRef.current = sendAction.nextFingerprint;
        input.setGatewayError(sendAction.errorMessage);
        return;
      }

      const turnId = createTurnId();
      const createdAt = Date.now();
      input.sendFingerprintRef.current = sendAction.nextFingerprint;
      const { turn, outboxItem } = createQueuedOutboxPayload({
        sessionKey,
        message: sendAction.message,
        idempotencyKey: sendAction.idempotencyKey,
        turnId,
        outboxItemId: createOutboxItemId(),
        createdAt,
        connectionState: input.connectionState,
      });

      input.setChatTurns((previous) => [...previous, turn]);
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
