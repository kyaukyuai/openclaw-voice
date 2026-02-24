import { useEffect } from 'react';
import { isIncompleteAssistantContent, shouldAttemptFinalRecovery } from '../ui/runtime-logic';
import { BOTTOM_STATUS_COMPLETE_HOLD_MS } from '../utils';
import {
  sanitizeGatewaySessionsForUi,
  shouldHoldBottomCompletePulse,
} from './runtime-effects-helpers';
import type { UseRuntimeUiEffectsInput } from './runtime-effects.types';

export function useRuntimeUiEffects(input: UseRuntimeUiEffectsInput) {
  useEffect(() => {
    if (!input.shouldShowSettingsScreen) {
      input.forceMaskAuthToken();
    }
  }, [input.forceMaskAuthToken, input.shouldShowSettingsScreen]);

  useEffect(() => {
    const notice = input.missingResponseNotice;
    if (!notice || notice.sessionKey !== input.activeSessionKey) return;
    const targetTurn = input.chatTurns.find((turn) => turn.id === notice.turnId);
    if (!targetTurn) {
      if (input.chatTurns.length > 0) {
        input.clearMissingResponseRecoveryState(notice.sessionKey);
      }
      return;
    }
    const stillIncomplete =
      input.isTurnWaitingState(targetTurn.state) ||
      shouldAttemptFinalRecovery(targetTurn.assistantText, targetTurn.assistantText);
    if (!stillIncomplete) {
      input.clearMissingResponseRecoveryState(notice.sessionKey);
    }
  }, [
    input.activeSessionKey,
    input.chatTurns,
    input.clearMissingResponseRecoveryState,
    input.isTurnWaitingState,
    input.missingResponseNotice,
  ]);

  useEffect(() => {
    input.transcriptRef.current = input.transcript;
  }, [input.transcript, input.transcriptRef]);

  useEffect(() => {
    input.interimTranscriptRef.current = input.interimTranscript;
  }, [input.interimTranscript, input.interimTranscriptRef]);

  useEffect(() => {
    input.activeSessionKeyRef.current = input.activeSessionKey;
  }, [input.activeSessionKey, input.activeSessionKeyRef]);

  useEffect(() => {
    input.historyAutoScrollRef.current = true;
    input.setShowScrollToBottomButton(false);
  }, [input.activeSessionKey, input.historyAutoScrollRef, input.setShowScrollToBottomButton]);

  useEffect(() => {
    input.gatewayUrlRef.current = input.gatewayUrl;
  }, [input.gatewayUrl, input.gatewayUrlRef]);

  useEffect(() => {
    input.connectionStateRef.current = input.connectionState;
  }, [input.connectionState, input.connectionStateRef]);

  useEffect(() => {
    input.outboxQueueRef.current = input.outboxQueue;
  }, [input.outboxQueue, input.outboxQueueRef]);

  useEffect(() => {
    const mergedSessions = sanitizeGatewaySessionsForUi({
      connectionState: input.connectionState,
      gatewaySessions: input.gatewaySessions,
      activeSessionKey: input.activeSessionKeyRef.current,
    });
    input.setSessions(mergedSessions);
  }, [
    input.connectionState,
    input.gatewaySessions,
    input.activeSessionKeyRef,
    input.setSessions,
  ]);

  useEffect(() => {
    if (!input.gatewaySessionsError) return;
    input.setSessionsError(
      (previous) => previous ?? `Sessions unavailable: ${input.gatewaySessionsError}`,
    );
  }, [input.gatewaySessionsError, input.setSessionsError]);

  useEffect(() => {
    input.gatewayEventStateRef.current = input.gatewayEventState;
  }, [input.gatewayEventState, input.gatewayEventStateRef]);

  useEffect(() => {
    const shouldHoldComplete = shouldHoldBottomCompletePulse({
      connectionState: input.connectionState,
      isSending: input.isSending,
      gatewayEventState: input.gatewayEventState,
    });

    if (!shouldHoldComplete) {
      input.setIsBottomCompletePulse(false);
      input.clearBottomCompletePulseTimer();
      return;
    }

    input.setIsBottomCompletePulse(true);
    input.clearBottomCompletePulseTimer();
    input.bottomCompletePulseTimerRef.current = setTimeout(() => {
      input.bottomCompletePulseTimerRef.current = null;
      input.setIsBottomCompletePulse(false);
      if (input.gatewayEventStateRef.current === 'complete') {
        input.setGatewayEventState('ready');
      }
    }, BOTTOM_STATUS_COMPLETE_HOLD_MS);

    return () => {
      input.clearBottomCompletePulseTimer();
    };
  }, [
    input.clearBottomCompletePulseTimer,
    input.connectionState,
    input.gatewayEventState,
    input.gatewayEventStateRef,
    input.isSending,
    input.setGatewayEventState,
    input.setIsBottomCompletePulse,
    input.bottomCompletePulseTimerRef,
  ]);

  useEffect(() => {
    input.sessionTurnsRef.current.set(input.activeSessionKey, input.chatTurns);
  }, [input.activeSessionKey, input.chatTurns, input.sessionTurnsRef]);

  useEffect(() => {
    if (input.chatTurns.length === 0 || !input.historyAutoScrollRef.current) return;
    input.scrollHistoryToBottom(true);
  }, [input.chatTurns.length, input.historyAutoScrollRef, input.scrollHistoryToBottom]);

  useEffect(() => {
    if (input.chatTurns.length > 0) return;
    input.historyAutoScrollRef.current = true;
    input.setShowScrollToBottomButton(false);
  }, [input.chatTurns.length, input.historyAutoScrollRef, input.setShowScrollToBottomButton]);

  useEffect(() => {
    if (input.isOnboardingCompleted || !input.isOnboardingWaitingForResponse) return;
    const hasFirstResponse = input.chatTurns.some(
      (turn) =>
        turn.state === 'complete' &&
        !isIncompleteAssistantContent(turn.assistantText),
    );
    if (!hasFirstResponse) return;
    input.setIsOnboardingCompleted(true);
    input.setIsOnboardingWaitingForResponse(false);
  }, [
    input.chatTurns,
    input.isOnboardingCompleted,
    input.isOnboardingWaitingForResponse,
    input.setIsOnboardingCompleted,
    input.setIsOnboardingWaitingForResponse,
  ]);

  useEffect(() => {
    if (!input.isGatewayConnected) {
      input.setIsSessionPanelOpen(false);
    }
  }, [input.isGatewayConnected, input.setIsSessionPanelOpen]);
}
