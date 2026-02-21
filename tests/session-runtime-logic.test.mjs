import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  resolveTimerSchedule,
  shouldContinueMissingResponseRecovery,
  shouldContinueFinalResponseRecovery,
} = require('../src/ios-runtime/session-runtime-logic.js');

test('resolveTimerSchedule computes initial, fixed retry, exponential retry, and override delays', () => {
  assert.deepEqual(
    resolveTimerSchedule({
      initialDelayMs: 300,
      retryBaseDelayMs: 900,
    }),
    { attempt: 1, delayMs: 300 },
  );

  assert.deepEqual(
    resolveTimerSchedule({
      attempt: 3,
      initialDelayMs: 300,
      retryBaseDelayMs: 900,
    }),
    { attempt: 3, delayMs: 900 },
  );

  assert.deepEqual(
    resolveTimerSchedule({
      attempt: 3,
      initialDelayMs: 300,
      retryBaseDelayMs: 900,
      exponentialRetry: true,
    }),
    { attempt: 3, delayMs: 3600 },
  );

  assert.deepEqual(
    resolveTimerSchedule({
      attempt: 2,
      delayMs: -1,
      initialDelayMs: 300,
      retryBaseDelayMs: 900,
    }),
    { attempt: 2, delayMs: 0 },
  );
});

test('shouldContinueMissingResponseRecovery follows synced/turn matching rules', () => {
  const isTurnWaitingState = (state) => ['sending', 'streaming'].includes(state);

  assert.equal(
    shouldContinueMissingResponseRecovery({
      synced: false,
      targetTurnId: 'turn-1',
      turnForCheck: {
        id: 'turn-1',
        state: 'complete',
        assistantText: 'Done',
      },
      isTurnWaitingState,
    }),
    true,
  );

  assert.equal(
    shouldContinueMissingResponseRecovery({
      synced: true,
      targetTurnId: 'turn-1',
      turnForCheck: undefined,
      isTurnWaitingState,
    }),
    true,
  );

  assert.equal(
    shouldContinueMissingResponseRecovery({
      synced: true,
      targetTurnId: 'turn-1',
      turnForCheck: {
        id: 'turn-2',
        state: 'complete',
        assistantText: 'Done',
      },
      isTurnWaitingState,
    }),
    false,
  );

  assert.equal(
    shouldContinueMissingResponseRecovery({
      synced: true,
      targetTurnId: 'turn-1',
      turnForCheck: {
        id: 'turn-1',
        state: 'streaming',
        assistantText: 'Responding...',
      },
      isTurnWaitingState,
    }),
    true,
  );

  assert.equal(
    shouldContinueMissingResponseRecovery({
      synced: true,
      targetTurnId: 'turn-1',
      turnForCheck: {
        id: 'turn-1',
        state: 'complete',
        assistantText: 'No response',
      },
      isTurnWaitingState,
    }),
    true,
  );

  assert.equal(
    shouldContinueMissingResponseRecovery({
      synced: true,
      targetTurnId: 'turn-1',
      turnForCheck: {
        id: 'turn-1',
        state: 'complete',
        assistantText: 'Final answer',
      },
      isTurnWaitingState,
    }),
    false,
  );
});

test('shouldContinueFinalResponseRecovery requires retry only for waiting/incomplete turns', () => {
  const isTurnWaitingState = (state) => ['sending', 'streaming'].includes(state);

  assert.equal(
    shouldContinueFinalResponseRecovery({
      latestTurn: undefined,
      isTurnWaitingState,
    }),
    true,
  );

  assert.equal(
    shouldContinueFinalResponseRecovery({
      latestTurn: {
        id: 'turn-1',
        state: 'streaming',
        assistantText: 'Responding...',
      },
      isTurnWaitingState,
    }),
    true,
  );

  assert.equal(
    shouldContinueFinalResponseRecovery({
      latestTurn: {
        id: 'turn-1',
        state: 'complete',
        assistantText: 'No response',
      },
      isTurnWaitingState,
    }),
    true,
  );

  assert.equal(
    shouldContinueFinalResponseRecovery({
      latestTurn: {
        id: 'turn-1',
        state: 'complete',
        assistantText: 'Final answer',
      },
      isTurnWaitingState,
    }),
    false,
  );
});
