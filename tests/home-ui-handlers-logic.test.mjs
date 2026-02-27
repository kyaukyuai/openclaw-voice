import assert from 'node:assert/strict';
import test from 'node:test';

import __srcModule0 from '../src/ios-runtime/home-ui-handlers-logic.ts';
const {
  resolveDraftText,
  resolveTopBannerDismissTarget,
  shouldStartHoldToTalk,
  resolveHistoryScrollState,
} = __srcModule0;

test('resolveDraftText returns trimmed transcript or interim fallback', () => {
  assert.equal(resolveDraftText(' hello ', ''), 'hello');
  assert.equal(resolveDraftText('   ', ' interim '), 'interim');
});

test('resolveTopBannerDismissTarget maps each banner kind', () => {
  assert.equal(resolveTopBannerDismissTarget('gateway'), 'gateway');
  assert.equal(resolveTopBannerDismissTarget('recovery'), 'recovery');
  assert.equal(resolveTopBannerDismissTarget('history'), 'history');
  assert.equal(resolveTopBannerDismissTarget('speech'), 'speech');
  assert.equal(resolveTopBannerDismissTarget(null), null);
});

test('shouldStartHoldToTalk requires support and idle runtime state', () => {
  assert.equal(
    shouldStartHoldToTalk({
      speechRecognitionSupported: true,
      isRecognizing: false,
      isSending: false,
    }),
    true,
  );
  assert.equal(
    shouldStartHoldToTalk({
      speechRecognitionSupported: false,
      isRecognizing: false,
      isSending: false,
    }),
    false,
  );
  assert.equal(
    shouldStartHoldToTalk({
      speechRecognitionSupported: true,
      isRecognizing: true,
      isSending: false,
    }),
    false,
  );
});

test('resolveHistoryScrollState computes near-bottom threshold', () => {
  const near = resolveHistoryScrollState(
    {
      contentSize: { height: 500 },
      contentOffset: { y: 320 },
      layoutMeasurement: { height: 160 },
    },
    30,
  );
  assert.equal(near.distanceFromBottom, 20);
  assert.equal(near.isNearBottom, true);

  const far = resolveHistoryScrollState(
    {
      contentSize: { height: 500 },
      contentOffset: { y: 200 },
      layoutMeasurement: { height: 160 },
    },
    30,
  );
  assert.equal(far.distanceFromBottom, 140);
  assert.equal(far.isNearBottom, false);
});
