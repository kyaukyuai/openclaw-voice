import assert from 'node:assert/strict';
import test from 'node:test';

import __srcModule0 from '../src/ui/history-layout.ts';
const {
  clamp,
  computeHistoryBottomInset,
} = __srcModule0;

test('clamp limits to min and max bounds', () => {
  assert.equal(clamp(5, 10, 20), 10);
  assert.equal(clamp(15, 10, 20), 15);
  assert.equal(clamp(25, 10, 20), 20);
});

test('computeHistoryBottomInset responds to keyboard/composer and clamps values', () => {
  const collapsed = computeHistoryBottomInset({
    keyboardHeight: 0,
    composerHeight: 0,
    safeAreaBottom: 0,
    isKeyboardVisible: false,
  });
  assert.equal(collapsed, 14);

  const expanded = computeHistoryBottomInset({
    keyboardHeight: 320,
    composerHeight: 110,
    safeAreaBottom: 20,
    isKeyboardVisible: true,
    extraInset: 8,
  });
  assert.equal(expanded > collapsed, true);
  assert.equal(expanded <= 220, true);

  const clampedMax = computeHistoryBottomInset({
    keyboardHeight: 800,
    composerHeight: 800,
    safeAreaBottom: 120,
    isKeyboardVisible: true,
  });
  assert.equal(clampedMax, 220);
});
