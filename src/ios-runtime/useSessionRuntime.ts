import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { ConnectionState } from '../openclaw';
import type { ChatTurn, MissingResponseRecoveryNotice } from '../types';
import { computeHistorySyncRetryPlan } from '../ui/runtime-logic';
import {
  FINAL_RESPONSE_RECOVERY_BASE_DELAY_MS,
  FINAL_RESPONSE_RECOVERY_MAX_ATTEMPTS,
  HISTORY_SYNC_INITIAL_DELAY_MS,
  HISTORY_SYNC_MAX_ATTEMPTS,
  HISTORY_SYNC_RETRY_BASE_MS,
  MISSING_RESPONSE_RECOVERY_INITIAL_DELAY_MS,
  MISSING_RESPONSE_RECOVERY_MAX_ATTEMPTS,
  MISSING_RESPONSE_RECOVERY_RETRY_BASE_MS,
} from '../utils';
import {
  resolveTimerSchedule,
  shouldContinueFinalResponseRecovery,
  shouldContinueMissingResponseRecovery,
} from './session-runtime-logic';

type HistorySyncRequest = {
  sessionKey: string;
  attempt: number;
};

type MissingResponseRecoveryRequest = {
  sessionKey: string;
  turnId: string;
  attempt: number;
};

type UseSessionRuntimeInput = {
  historySyncTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  historySyncRequestRef: MutableRefObject<HistorySyncRequest | null>;
  missingResponseRecoveryTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  missingResponseRecoveryRequestRef: MutableRefObject<MissingResponseRecoveryRequest | null>;
  finalResponseRecoveryTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  connectionStateRef: MutableRefObject<ConnectionState>;
  sessionTurnsRef: MutableRefObject<Map<string, ChatTurn[]>>;
  clearMissingResponseRecoveryTimer: () => void;
  clearFinalResponseRecoveryTimer: () => void;
  loadSessionHistory: (
    sessionKey: string,
    options?: {
      silentError?: boolean;
    },
  ) => Promise<boolean>;
  refreshSessions: () => Promise<unknown>;
  setIsMissingResponseRecoveryInFlight: (value: boolean) => void;
  setMissingResponseNotice: Dispatch<
    SetStateAction<MissingResponseRecoveryNotice | null>
  >;
  isTurnWaitingState: (state: string) => boolean;
};

export function useSessionRuntime(input: UseSessionRuntimeInput) {
  const scheduleSessionHistorySync = useCallback(
    (
      sessionKey: string,
      options?: {
        attempt?: number;
        delayMs?: number;
      },
    ) => {
      const targetSessionKey = sessionKey.trim();
      if (!targetSessionKey) return;
      const { attempt, delayMs } = resolveTimerSchedule({
        attempt: options?.attempt,
        delayMs: options?.delayMs,
        initialDelayMs: HISTORY_SYNC_INITIAL_DELAY_MS,
        retryBaseDelayMs: HISTORY_SYNC_RETRY_BASE_MS,
      });

      input.historySyncRequestRef.current = {
        sessionKey: targetSessionKey,
        attempt,
      };

      if (input.historySyncTimerRef.current) {
        clearTimeout(input.historySyncTimerRef.current);
        input.historySyncTimerRef.current = null;
      }

      input.historySyncTimerRef.current = setTimeout(() => {
        input.historySyncTimerRef.current = null;
        const request = input.historySyncRequestRef.current;
        if (
          !request ||
          request.sessionKey !== targetSessionKey ||
          request.attempt !== attempt
        ) {
          return;
        }

        void (async () => {
          const synced = await input.loadSessionHistory(targetSessionKey, {
            silentError: attempt > 1,
          });
          if (synced) {
            const currentRequest = input.historySyncRequestRef.current;
            if (
              currentRequest &&
              currentRequest.sessionKey === targetSessionKey &&
              currentRequest.attempt === attempt
            ) {
              input.historySyncRequestRef.current = null;
            }
            void input.refreshSessions();
            return;
          }

          const retryPlan = computeHistorySyncRetryPlan({
            attempt,
            maxAttempts: HISTORY_SYNC_MAX_ATTEMPTS,
            baseDelayMs: HISTORY_SYNC_RETRY_BASE_MS,
          });
          if (
            !retryPlan.shouldRetry ||
            input.connectionStateRef.current !== 'connected'
          ) {
            const currentRequest = input.historySyncRequestRef.current;
            if (
              currentRequest &&
              currentRequest.sessionKey === targetSessionKey &&
              currentRequest.attempt === attempt
            ) {
              input.historySyncRequestRef.current = null;
            }
            return;
          }

          scheduleSessionHistorySync(targetSessionKey, {
            attempt: retryPlan.nextAttempt,
            delayMs: retryPlan.delayMs,
          });
        })();
      }, delayMs);
    },
    [input],
  );

  const scheduleMissingResponseRecovery = useCallback(
    (
      sessionKey: string,
      turnId: string,
      options?: {
        attempt?: number;
        delayMs?: number;
      },
    ) => {
      const targetSessionKey = sessionKey.trim();
      const targetTurnId = turnId.trim();
      if (!targetSessionKey || !targetTurnId) return;

      const { attempt, delayMs } = resolveTimerSchedule({
        attempt: options?.attempt,
        delayMs: options?.delayMs,
        initialDelayMs: MISSING_RESPONSE_RECOVERY_INITIAL_DELAY_MS,
        retryBaseDelayMs: MISSING_RESPONSE_RECOVERY_RETRY_BASE_MS,
        exponentialRetry: true,
      });

      input.missingResponseRecoveryRequestRef.current = {
        sessionKey: targetSessionKey,
        turnId: targetTurnId,
        attempt,
      };

      input.clearMissingResponseRecoveryTimer();
      input.missingResponseRecoveryTimerRef.current = setTimeout(() => {
        input.missingResponseRecoveryTimerRef.current = null;
        const request = input.missingResponseRecoveryRequestRef.current;
        if (
          !request ||
          request.sessionKey !== targetSessionKey ||
          request.turnId !== targetTurnId ||
          request.attempt !== attempt
        ) {
          return;
        }

        if (input.connectionStateRef.current !== 'connected') {
          input.setMissingResponseNotice({
            sessionKey: targetSessionKey,
            turnId: targetTurnId,
            attempt,
            message: 'Final response may be stale. Reconnect and tap retry fetch.',
          });
          input.missingResponseRecoveryRequestRef.current = null;
          return;
        }

        void (async () => {
          input.setIsMissingResponseRecoveryInFlight(true);
          const synced = await input.loadSessionHistory(targetSessionKey, {
            silentError: true,
          });
          input.setIsMissingResponseRecoveryInFlight(false);

          const currentRequest = input.missingResponseRecoveryRequestRef.current;
          if (
            !currentRequest ||
            currentRequest.sessionKey !== targetSessionKey ||
            currentRequest.turnId !== targetTurnId ||
            currentRequest.attempt !== attempt
          ) {
            return;
          }

          if (synced) {
            void input.refreshSessions();
          }

          const turns = input.sessionTurnsRef.current.get(targetSessionKey) ?? [];
          const targetTurn = turns.find((turn) => turn.id === targetTurnId);
          const latestTurn = turns[turns.length - 1];
          const turnForCheck = targetTurn ?? latestTurn;
          const stillIncomplete = shouldContinueMissingResponseRecovery({
            synced,
            targetTurnId,
            turnForCheck,
            isTurnWaitingState: input.isTurnWaitingState,
          });

          if (!stillIncomplete) {
            input.missingResponseRecoveryRequestRef.current = null;
            input.setMissingResponseNotice((previous) => {
              if (
                !previous ||
                previous.sessionKey !== targetSessionKey ||
                previous.turnId !== targetTurnId
              ) {
                return previous;
              }
              return null;
            });
            return;
          }

          if (attempt >= MISSING_RESPONSE_RECOVERY_MAX_ATTEMPTS) {
            input.missingResponseRecoveryRequestRef.current = null;
            input.setMissingResponseNotice({
              sessionKey: targetSessionKey,
              turnId: targetTurnId,
              attempt,
              message: 'Final response not synced yet. Tap retry fetch.',
            });
            return;
          }

          input.setMissingResponseNotice({
            sessionKey: targetSessionKey,
            turnId: targetTurnId,
            attempt,
            message: `Final response delayed. Auto retrying (${attempt}/${MISSING_RESPONSE_RECOVERY_MAX_ATTEMPTS})...`,
          });
          scheduleMissingResponseRecovery(targetSessionKey, targetTurnId, {
            attempt: attempt + 1,
          });
        })();
      }, delayMs);
    },
    [input],
  );

  const scheduleFinalResponseRecovery = useCallback(
    (sessionKey: string, attempt = 1) => {
      if (attempt > FINAL_RESPONSE_RECOVERY_MAX_ATTEMPTS) return;
      input.clearFinalResponseRecoveryTimer();
      input.finalResponseRecoveryTimerRef.current = setTimeout(() => {
        input.finalResponseRecoveryTimerRef.current = null;
        void (async () => {
          const synced = await input.loadSessionHistory(sessionKey, { silentError: true });
          if (!synced) {
            if (input.connectionStateRef.current !== 'connected') return;
            scheduleFinalResponseRecovery(sessionKey, attempt + 1);
            return;
          }
          void input.refreshSessions();

          const turns = input.sessionTurnsRef.current.get(sessionKey) ?? [];
          const latestTurn = turns[turns.length - 1];
          const stillIncomplete = shouldContinueFinalResponseRecovery({
            latestTurn,
            isTurnWaitingState: input.isTurnWaitingState,
          });

          if (stillIncomplete) {
            scheduleFinalResponseRecovery(sessionKey, attempt + 1);
          }
        })();
      }, FINAL_RESPONSE_RECOVERY_BASE_DELAY_MS * attempt);
    },
    [input],
  );

  return {
    scheduleSessionHistorySync,
    scheduleMissingResponseRecovery,
    scheduleFinalResponseRecovery,
  };
}
