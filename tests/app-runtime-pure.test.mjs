import assert from 'node:assert/strict';
import test from 'node:test';

import __srcModule0 from '../src/ios-runtime/app-runtime-pure.ts';
const {
  buildTurnsFromHistory,
  normalizeQuickTextIcon,
  parseOutboxQueue,
  parseSessionPreferences,
  getHistoryDayLabel,
} = __srcModule0;

const DEFAULT_QUICK_TEXT_LEFT_ICON = 'chatbubble-ellipses-outline';

test('buildTurnsFromHistory builds normalized turns from history payload', () => {
  const turns = buildTurnsFromHistory(
    [
      { role: 'user', content: 'hello', timestamp: 1_000 },
      { role: 'assistant', content: 'partial', state: 'delta', timestamp: 1_001 },
      { role: 'assistant', content: 'done', status: 'complete', timestamp: 1_002 },
      { role: 'user', text: 'second', timestamp: 2_000 },
      { role: 'assistant', content: 'failed', error: 'boom', timestamp: 2_001 },
    ],
    'main',
  );

  assert.equal(turns.length, 2);
  assert.equal(turns[0].userText, 'hello');
  assert.equal(turns[0].assistantText, 'done');
  assert.equal(turns[0].state, 'complete');
  assert.equal(turns[1].userText, 'second');
  assert.equal(turns[1].assistantText, 'failed');
  assert.equal(turns[1].state, 'error');
});

test('normalizeQuickTextIcon falls back for unsupported icon', () => {
  assert.equal(
    normalizeQuickTextIcon('not-a-real-icon', DEFAULT_QUICK_TEXT_LEFT_ICON),
    DEFAULT_QUICK_TEXT_LEFT_ICON,
  );
  assert.equal(
    normalizeQuickTextIcon(DEFAULT_QUICK_TEXT_LEFT_ICON, 'chatbubble-ellipses-outline'),
    DEFAULT_QUICK_TEXT_LEFT_ICON,
  );
});

test('parseSessionPreferences keeps only sanitized alias/pin records', () => {
  const parsed = parseSessionPreferences(
    JSON.stringify({
      main: { alias: '  Work  ' },
      pinned: { pinned: true },
      empty: { alias: '   ', pinned: false },
      invalid: 'x',
    }),
  );

  assert.deepEqual(parsed, {
    main: { alias: 'Work' },
    pinned: { pinned: true },
  });
});

test('parseOutboxQueue sanitizes and sorts queue items', () => {
  const parsed = parseOutboxQueue(
    JSON.stringify([
      {
        id: 'b',
        sessionKey: 'main',
        message: 'world',
        turnId: 't2',
        idempotencyKey: 'k2',
        createdAt: 20,
        retryCount: 2.8,
        nextRetryAt: 25,
      },
      {
        id: 'a',
        sessionKey: 'main',
        message: 'hello',
        turnId: 't1',
        idempotencyKey: 'k1',
        createdAt: 10,
        retryCount: -3,
        nextRetryAt: 0,
        lastError: '  timeout  ',
      },
      {
        id: '',
        sessionKey: 'main',
        message: 'invalid',
        turnId: 'skip',
        idempotencyKey: 'k3',
      },
    ]),
  );

  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].id, 'a');
  assert.equal(parsed[0].retryCount, 0);
  assert.equal(parsed[0].nextRetryAt, 10);
  assert.equal(parsed[0].lastError, 'timeout');
  assert.equal(parsed[1].id, 'b');
  assert.equal(parsed[1].retryCount, 2);
});

test('getHistoryDayLabel resolves today and yesterday labels', () => {
  assert.equal(getHistoryDayLabel(Date.now()), 'Today');
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  assert.equal(getHistoryDayLabel(yesterday.getTime()), 'Yesterday');
});
