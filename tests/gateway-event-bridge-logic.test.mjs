import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  shouldEndSendingForGatewayState,
  resolveUnboundGatewayEventDecision,
} = require('../src/ios-runtime/gateway-event-bridge-logic.js');

test('shouldEndSendingForGatewayState treats complete/error/aborted as terminal', () => {
  assert.equal(shouldEndSendingForGatewayState('complete'), true);
  assert.equal(shouldEndSendingForGatewayState('error'), true);
  assert.equal(shouldEndSendingForGatewayState('aborted'), true);

  // Alias states should normalize to terminal state.
  assert.equal(shouldEndSendingForGatewayState('done'), true);
  assert.equal(shouldEndSendingForGatewayState('final'), true);
});

test('shouldEndSendingForGatewayState keeps non-terminal states active', () => {
  assert.equal(shouldEndSendingForGatewayState('delta'), false);
  assert.equal(shouldEndSendingForGatewayState('streaming'), false);
  assert.equal(shouldEndSendingForGatewayState('sending'), false);
  assert.equal(shouldEndSendingForGatewayState('queued'), false);
  assert.equal(shouldEndSendingForGatewayState('unknown'), false);
});

test('resolveUnboundGatewayEventDecision schedules sync and ends sending for terminal states', () => {
  const completeDecision = resolveUnboundGatewayEventDecision('complete', '');
  assert.deepEqual(completeDecision, {
    normalizedState: 'complete',
    shouldSyncHistory: true,
    shouldEndSending: true,
  });

  const errorDecision = resolveUnboundGatewayEventDecision('error', '');
  assert.deepEqual(errorDecision, {
    normalizedState: 'error',
    shouldSyncHistory: true,
    shouldEndSending: true,
  });

  const abortedDecision = resolveUnboundGatewayEventDecision('aborted', '');
  assert.deepEqual(abortedDecision, {
    normalizedState: 'aborted',
    shouldSyncHistory: true,
    shouldEndSending: true,
  });
});

test('resolveUnboundGatewayEventDecision syncs non-terminal final text without ending sending', () => {
  const decision = resolveUnboundGatewayEventDecision('streaming', 'partial final text');
  assert.deepEqual(decision, {
    normalizedState: 'streaming',
    shouldSyncHistory: true,
    shouldEndSending: false,
  });

  const noFinal = resolveUnboundGatewayEventDecision('streaming', '');
  assert.deepEqual(noFinal, {
    normalizedState: 'streaming',
    shouldSyncHistory: false,
    shouldEndSending: false,
  });
});
