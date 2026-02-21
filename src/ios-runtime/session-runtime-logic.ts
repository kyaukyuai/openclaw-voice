import type { ChatTurn } from '../types';
import { shouldAttemptFinalRecovery } from '../ui/runtime-logic';

type TurnSnapshot = Pick<ChatTurn, 'id' | 'state' | 'assistantText'>;

type ResolveTimerScheduleInput = {
  attempt?: number;
  delayMs?: number;
  initialDelayMs: number;
  retryBaseDelayMs: number;
  exponentialRetry?: boolean;
};

type ResolveTimerScheduleResult = {
  attempt: number;
  delayMs: number;
};

export function resolveTimerSchedule(
  input: ResolveTimerScheduleInput,
): ResolveTimerScheduleResult {
  const attempt = Math.max(1, input.attempt ?? 1);
  if (typeof input.delayMs === 'number') {
    return { attempt, delayMs: Math.max(0, input.delayMs) };
  }
  if (attempt === 1) {
    return { attempt, delayMs: Math.max(0, input.initialDelayMs) };
  }
  if (input.exponentialRetry) {
    return {
      attempt,
      delayMs: Math.max(0, input.retryBaseDelayMs * 2 ** (attempt - 1)),
    };
  }
  return { attempt, delayMs: Math.max(0, input.retryBaseDelayMs) };
}

type ShouldContinueMissingResponseRecoveryInput = {
  synced: boolean;
  targetTurnId: string;
  turnForCheck?: TurnSnapshot;
  isTurnWaitingState: (state: string) => boolean;
};

export function shouldContinueMissingResponseRecovery(
  input: ShouldContinueMissingResponseRecoveryInput,
): boolean {
  if (!input.synced) return true;
  if (!input.turnForCheck) return true;
  if (input.turnForCheck.id !== input.targetTurnId) return false;
  return (
    input.isTurnWaitingState(input.turnForCheck.state) ||
    shouldAttemptFinalRecovery(
      input.turnForCheck.assistantText,
      input.turnForCheck.assistantText,
    )
  );
}

type ShouldContinueFinalResponseRecoveryInput = {
  latestTurn?: TurnSnapshot;
  isTurnWaitingState: (state: string) => boolean;
};

export function shouldContinueFinalResponseRecovery(
  input: ShouldContinueFinalResponseRecoveryInput,
): boolean {
  if (!input.latestTurn) return true;
  return (
    input.isTurnWaitingState(input.latestTurn.state) ||
    shouldAttemptFinalRecovery(
      input.latestTurn.assistantText,
      input.latestTurn.assistantText,
    )
  );
}
