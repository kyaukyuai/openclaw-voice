import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { ChatEventPayload } from '../openclaw';
import type { ChatTurn } from '../types';
import { resolveCompletedAssistantText, shouldAttemptFinalRecovery } from '../ui/runtime-logic';
import { mergeAssistantStreamText, normalizeChatEventState, toTextContent, triggerHaptic } from '../utils';

type UseGatewayEventBridgeInput = {
  activeSessionKeyRef: MutableRefObject<string>;
  activeRunIdRef: MutableRefObject<string | null>;
  pendingTurnIdRef: MutableRefObject<string | null>;
  runIdToTurnIdRef: MutableRefObject<Map<string, string>>;
  sessionTurnsRef: MutableRefObject<Map<string, ChatTurn[]>>;
  updateChatTurn: (turnId: string, updater: (turn: ChatTurn) => ChatTurn) => void;
  setGatewayEventState: (value: string) => void;
  setIsSending: (value: boolean) => void;
  setActiveRunId: Dispatch<SetStateAction<string | null>>;
  isOnboardingWaitingForResponse: boolean;
  isIncompleteAssistantContent: (text: string | undefined) => boolean;
  setIsOnboardingWaitingForResponse: Dispatch<SetStateAction<boolean>>;
  setIsOnboardingCompleted: (next: boolean) => void;
  scheduleFinalResponseRecovery: (sessionKey: string, attempt?: number) => void;
  scheduleMissingResponseRecovery: (
    sessionKey: string,
    turnId: string,
    options?: {
      attempt?: number;
      delayMs?: number;
    },
  ) => void;
  scheduleSessionHistorySync: (
    sessionKey: string,
    options?: {
      attempt?: number;
      delayMs?: number;
    },
  ) => void;
  clearFinalResponseRecoveryTimer: () => void;
  clearMissingResponseRecoveryState: (sessionKey?: string) => void;
  refreshSessions: () => Promise<unknown>;
  setGatewayError: Dispatch<SetStateAction<string | null>>;
  extractFinalChatEventText: (payload: ChatEventPayload) => string;
};

export function useGatewayEventBridge(input: UseGatewayEventBridgeInput) {
  const handleChatEvent = useCallback(
    (payload: ChatEventPayload) => {
      const activeSessionKey = input.activeSessionKeyRef.current;
      const hasMatchingSession = payload.sessionKey === activeSessionKey;
      const eventSessionKey = (payload.sessionKey ?? '').trim() || activeSessionKey;
      const streamText = toTextContent(payload.message, { trim: false, dedupe: false });
      const finalEventText = input.extractFinalChatEventText(payload);
      const state = normalizeChatEventState(payload.state);
      input.setGatewayEventState(state);
      let turnId = input.runIdToTurnIdRef.current.get(payload.runId);
      const canBindPendingTurn =
        Boolean(input.pendingTurnIdRef.current) &&
        (hasMatchingSession || payload.runId === input.activeRunIdRef.current);

      if (!hasMatchingSession && !turnId && !canBindPendingTurn) {
        return;
      }

      if (!turnId && input.pendingTurnIdRef.current && canBindPendingTurn) {
        turnId = input.pendingTurnIdRef.current;
        input.pendingTurnIdRef.current = null;
        input.runIdToTurnIdRef.current.set(payload.runId, turnId);
        input.updateChatTurn(turnId, (turn) => ({
          ...turn,
          runId: payload.runId,
        }));
      }

      if (!turnId) {
        if (finalEventText || state === 'complete' || state === 'error' || state === 'aborted') {
          if (state === 'complete' || state === 'error' || state === 'aborted') {
            input.setIsSending(false);
            input.activeRunIdRef.current = null;
            input.setActiveRunId(null);
            if (
              state === 'complete' &&
              input.isOnboardingWaitingForResponse &&
              !input.isIncompleteAssistantContent(finalEventText)
            ) {
              input.setIsOnboardingWaitingForResponse(false);
              input.setIsOnboardingCompleted(true);
            }
            if (
              (state === 'error' || state === 'aborted') &&
              input.isOnboardingWaitingForResponse
            ) {
              input.setIsOnboardingWaitingForResponse(false);
            }
            if (state === 'complete' && shouldAttemptFinalRecovery(finalEventText)) {
              input.scheduleFinalResponseRecovery(eventSessionKey);
              const latestTurns = input.sessionTurnsRef.current.get(eventSessionKey) ?? [];
              const latestTurn = latestTurns[latestTurns.length - 1];
              if (latestTurn?.id) {
                input.scheduleMissingResponseRecovery(eventSessionKey, latestTurn.id);
              }
            }
          }
          input.scheduleSessionHistorySync(eventSessionKey);
        }
        return;
      }

      if (state === 'delta' || state === 'streaming') {
        input.activeRunIdRef.current = payload.runId;
        input.setActiveRunId(payload.runId);
        input.setIsSending(true);
        input.updateChatTurn(turnId, (turn) => ({
          ...turn,
          runId: payload.runId,
          state,
          assistantText: mergeAssistantStreamText(turn.assistantText, streamText),
        }));
        return;
      }

      if (state === 'complete') {
        input.setIsSending(false);
        input.activeRunIdRef.current = null;
        input.setActiveRunId(null);
        input.runIdToTurnIdRef.current.delete(payload.runId);
        input.clearFinalResponseRecoveryTimer();
        let finalAssistantText = '';
        input.updateChatTurn(turnId, (turn) => {
          finalAssistantText = resolveCompletedAssistantText({
            finalText: finalEventText,
            streamedText: turn.assistantText,
            stopReason: payload.stopReason,
          });
          return {
            ...turn,
            runId: payload.runId,
            state: 'complete',
            assistantText: finalAssistantText,
          };
        });
        if (
          input.isOnboardingWaitingForResponse &&
          !input.isIncompleteAssistantContent(finalAssistantText)
        ) {
          input.setIsOnboardingWaitingForResponse(false);
          input.setIsOnboardingCompleted(true);
        }
        if (shouldAttemptFinalRecovery(finalEventText, finalAssistantText || undefined)) {
          input.scheduleFinalResponseRecovery(eventSessionKey);
          input.scheduleMissingResponseRecovery(eventSessionKey, turnId);
        } else {
          input.clearMissingResponseRecoveryState(eventSessionKey);
        }
        input.scheduleSessionHistorySync(eventSessionKey);
        void input.refreshSessions();
        return;
      }

      if (state === 'error') {
        input.clearFinalResponseRecoveryTimer();
        const message = payload.errorMessage ?? 'An error occurred on the Gateway.';
        void triggerHaptic('send-error');
        input.setGatewayError(`Gateway error: ${message}`);
        input.setIsSending(false);
        input.activeRunIdRef.current = null;
        input.setActiveRunId(null);
        input.runIdToTurnIdRef.current.delete(payload.runId);
        input.updateChatTurn(turnId, (turn) => ({
          ...turn,
          runId: payload.runId,
          state: 'error',
          assistantText: finalEventText || message,
        }));
        if (input.isOnboardingWaitingForResponse) {
          input.setIsOnboardingWaitingForResponse(false);
        }
        input.clearMissingResponseRecoveryState(eventSessionKey);
        input.scheduleSessionHistorySync(eventSessionKey);
        void input.refreshSessions();
        return;
      }

      if (state === 'aborted') {
        input.clearFinalResponseRecoveryTimer();
        void triggerHaptic('send-error');
        input.setGatewayError('The Gateway response was aborted.');
        input.setIsSending(false);
        input.activeRunIdRef.current = null;
        input.setActiveRunId(null);
        input.runIdToTurnIdRef.current.delete(payload.runId);
        input.updateChatTurn(turnId, (turn) => ({
          ...turn,
          runId: payload.runId,
          state: 'aborted',
          assistantText: turn.assistantText || 'Response was aborted.',
        }));
        if (input.isOnboardingWaitingForResponse) {
          input.setIsOnboardingWaitingForResponse(false);
        }
        input.clearMissingResponseRecoveryState(eventSessionKey);
        input.scheduleSessionHistorySync(eventSessionKey);
        void input.refreshSessions();
        return;
      }

      if (streamText) {
        input.updateChatTurn(turnId, (turn) => ({
          ...turn,
          runId: payload.runId,
          state,
          assistantText: mergeAssistantStreamText(turn.assistantText, streamText),
        }));
      }
    },
    [input],
  );

  return {
    handleChatEvent,
  };
}
