import assert from 'node:assert/strict';
import test from 'node:test';

import __srcModule0 from '../src/ios-runtime/runtime-effects-helpers.ts';
const {
  sanitizeGatewaySessionsForUi,
  shouldHoldBottomCompletePulse,
  buildOutboxQueuedTurnsBySession,
  resolveRestoredActiveSessionKey,
} = __srcModule0;

test('sanitizeGatewaySessionsForUi returns empty when disconnected', () => {
  const result = sanitizeGatewaySessionsForUi({
    connectionState: 'disconnected',
    gatewaySessions: [{ key: 'a' }],
    activeSessionKey: 'main',
  });
  assert.deepEqual(result, []);
});

test('sanitizeGatewaySessionsForUi filters invalid entries and ensures active key exists', () => {
  const result = sanitizeGatewaySessionsForUi({
    connectionState: 'connected',
    gatewaySessions: [
      { key: 'a', updatedAt: 10 },
      { key: '', updatedAt: 999 },
      { key: 'b', updatedAt: 20 },
    ],
    activeSessionKey: 'main',
  });

  assert.equal(result[0].key, 'b');
  assert.equal(result[1].key, 'a');
  assert.equal(result[2].key, 'main');
});

test('shouldHoldBottomCompletePulse requires connected + complete + not sending', () => {
  assert.equal(
    shouldHoldBottomCompletePulse({
      connectionState: 'connected',
      isSending: false,
      gatewayEventState: 'complete',
    }),
    true,
  );
  assert.equal(
    shouldHoldBottomCompletePulse({
      connectionState: 'connected',
      isSending: true,
      gatewayEventState: 'complete',
    }),
    false,
  );
  assert.equal(
    shouldHoldBottomCompletePulse({
      connectionState: 'disconnected',
      isSending: false,
      gatewayEventState: 'complete',
    }),
    false,
  );
});

test('buildOutboxQueuedTurnsBySession groups by session and sorts by createdAt', () => {
  const turnsBySession = buildOutboxQueuedTurnsBySession([
    {
      sessionKey: 's1',
      turnId: 't2',
      message: 'm2',
      createdAt: 20,
      lastError: null,
    },
    {
      sessionKey: 's1',
      turnId: 't1',
      message: 'm1',
      createdAt: 10,
      lastError: 'network',
    },
    {
      sessionKey: 's2',
      turnId: 'x1',
      message: 'x',
      createdAt: 5,
      lastError: null,
    },
  ]);

  assert.deepEqual(
    turnsBySession.get('s1')?.map((turn) => turn.id),
    ['t1', 't2'],
  );
  assert.equal(
    turnsBySession.get('s1')?.[0]?.assistantText,
    'Retrying automatically... (network)',
  );
  assert.equal(
    turnsBySession.get('s2')?.[0]?.assistantText,
    'Waiting for connection...',
  );
});

test('resolveRestoredActiveSessionKey prefers saved, then ref, then default', () => {
  assert.equal(
    resolveRestoredActiveSessionKey({
      savedSessionKey: ' saved ',
      activeSessionKeyRefValue: 'ref',
      defaultSessionKey: 'main',
    }),
    'saved',
  );
  assert.equal(
    resolveRestoredActiveSessionKey({
      savedSessionKey: null,
      activeSessionKeyRefValue: 'ref',
      defaultSessionKey: 'main',
    }),
    'ref',
  );
  assert.equal(
    resolveRestoredActiveSessionKey({
      savedSessionKey: ' ',
      activeSessionKeyRefValue: '',
      defaultSessionKey: 'main',
    }),
    'main',
  );
});
