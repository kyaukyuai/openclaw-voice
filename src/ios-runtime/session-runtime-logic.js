const { shouldAttemptFinalRecovery } = require('../ui/runtime-logic.js');

function resolveTimerSchedule(input) {
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

function shouldContinueMissingResponseRecovery(input) {
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

function shouldContinueFinalResponseRecovery(input) {
  if (!input.latestTurn) return true;
  return (
    input.isTurnWaitingState(input.latestTurn.state) ||
    shouldAttemptFinalRecovery(
      input.latestTurn.assistantText,
      input.latestTurn.assistantText,
    )
  );
}

module.exports = {
  resolveTimerSchedule,
  shouldContinueMissingResponseRecovery,
  shouldContinueFinalResponseRecovery,
};
