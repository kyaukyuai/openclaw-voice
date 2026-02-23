import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  canRunGatewayHealthCheck,
  resolveClearedMissingResponseNotice,
  shouldResetMissingRecoveryRequest,
} = require('../src/ios-runtime/runtime-ui-helpers-logic.js');

test('shouldResetMissingRecoveryRequest allows global clear and matching session clear', () => {
  assert.equal(
    shouldResetMissingRecoveryRequest({
      request: { sessionKey: 'main', turnId: 't1', attempt: 1 },
    }),
    true,
  );
  assert.equal(
    shouldResetMissingRecoveryRequest({
      targetSessionKey: 'main',
      request: { sessionKey: 'main', turnId: 't1', attempt: 1 },
    }),
    true,
  );
  assert.equal(
    shouldResetMissingRecoveryRequest({
      targetSessionKey: 'other',
      request: { sessionKey: 'main', turnId: 't1', attempt: 1 },
    }),
    false,
  );
});

test('resolveClearedMissingResponseNotice keeps unrelated session notice', () => {
  const currentNotice = {
    sessionKey: 'main',
    turnId: 'turn-1',
    attempt: 2,
    message: 'retry fetch',
  };

  assert.equal(resolveClearedMissingResponseNotice(null, 'main'), null);
  assert.equal(
    resolveClearedMissingResponseNotice(currentNotice, 'other'),
    currentNotice,
  );
  assert.equal(
    resolveClearedMissingResponseNotice(currentNotice, 'main'),
    null,
  );
  assert.equal(resolveClearedMissingResponseNotice(currentNotice), null);
});

test('canRunGatewayHealthCheck returns true only in connected state', () => {
  assert.equal(canRunGatewayHealthCheck('connected'), true);
  assert.equal(canRunGatewayHealthCheck('disconnected'), false);
  assert.equal(canRunGatewayHealthCheck('connecting'), false);
  assert.equal(canRunGatewayHealthCheck('reconnecting'), false);
});
