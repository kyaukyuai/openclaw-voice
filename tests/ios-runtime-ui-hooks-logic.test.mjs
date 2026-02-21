import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);

const {
  shouldTriggerLifecycleAutoConnect,
  clearLifecycleCleanupState,
} = require('../src/ios-runtime/app-lifecycle-runtime-logic.js');
const {
  getSpeechUnsupportedMessage,
  shouldIgnoreSpeechError,
  appendFinalSpeechTranscript,
} = require('../src/ios-runtime/speech-runtime-logic.js');
const {
  normalizeQuickText,
  shouldInsertQuickText,
  appendQuickText,
  shouldConsumeQuickTextPress,
} = require('../src/ios-runtime/quick-text-runtime-logic.js');
const {
  getSettingsKeyboardAdditionalOffset,
  getSettingsFieldVisibleDelayMs,
} = require('../src/ios-runtime/settings-ui-runtime-logic.js');
const {
  resolveKeyboardEventNames,
  resolveKeyboardBarAnimation,
} = require('../src/ios-runtime/keyboard-ui-runtime-logic.js');

function timerRef() {
  return { current: setTimeout(() => {}, 10_000) };
}

test('shouldTriggerLifecycleAutoConnect honors startup preconditions', () => {
  assert.equal(
    shouldTriggerLifecycleAutoConnect({
      localStateReady: false,
      settingsReady: true,
      alreadyAttempted: false,
      gatewayUrl: 'wss://example.com',
      connectionState: 'disconnected',
    }),
    false,
  );

  assert.equal(
    shouldTriggerLifecycleAutoConnect({
      localStateReady: true,
      settingsReady: true,
      alreadyAttempted: false,
      gatewayUrl: 'wss://example.com',
      connectionState: 'disconnected',
    }),
    true,
  );
});

test('clearLifecycleCleanupState clears refs and transient runtime state', () => {
  const state = {
    isUnmountingRef: { current: false },
    expectedSpeechStopRef: { current: false },
    holdStartTimerRef: timerRef(),
    historySyncTimerRef: timerRef(),
    historySyncRequestRef: { current: { sessionKey: 'main', attempt: 2 } },
    historyNoticeTimerRef: timerRef(),
    bottomCompletePulseTimerRef: timerRef(),
    authTokenMaskTimerRef: timerRef(),
    outboxRetryTimerRef: timerRef(),
    startupAutoConnectRetryTimerRef: timerRef(),
    finalResponseRecoveryTimerRef: timerRef(),
    missingResponseRecoveryTimerRef: timerRef(),
    missingResponseRecoveryRequestRef: {
      current: { sessionKey: 'main', turnId: 't1', attempt: 1 },
    },
    settingsFocusScrollTimerRef: timerRef(),
    quickTextTooltipTimerRef: timerRef(),
    quickTextLongPressResetTimerRef: timerRef(),
    quickTextLongPressSideRef: { current: 'left' },
  };

  clearLifecycleCleanupState(state);

  assert.equal(state.isUnmountingRef.current, true);
  assert.equal(state.expectedSpeechStopRef.current, true);
  assert.equal(state.historySyncRequestRef.current, null);
  assert.equal(state.missingResponseRecoveryRequestRef.current, null);
  assert.equal(state.quickTextLongPressSideRef.current, null);

  assert.equal(state.holdStartTimerRef.current, null);
  assert.equal(state.historySyncTimerRef.current, null);
  assert.equal(state.historyNoticeTimerRef.current, null);
  assert.equal(state.bottomCompletePulseTimerRef.current, null);
  assert.equal(state.authTokenMaskTimerRef.current, null);
  assert.equal(state.outboxRetryTimerRef.current, null);
  assert.equal(state.startupAutoConnectRetryTimerRef.current, null);
  assert.equal(state.finalResponseRecoveryTimerRef.current, null);
  assert.equal(state.missingResponseRecoveryTimerRef.current, null);
  assert.equal(state.settingsFocusScrollTimerRef.current, null);
  assert.equal(state.quickTextTooltipTimerRef.current, null);
  assert.equal(state.quickTextLongPressResetTimerRef.current, null);
});

test('speech runtime logic returns unsupported message and ignore predicate', () => {
  assert.equal(getSpeechUnsupportedMessage(true), 'macOSでは音声入力未対応です。');
  assert.equal(getSpeechUnsupportedMessage(false), 'Webでは音声入力未対応です。');

  assert.equal(
    shouldIgnoreSpeechError({
      isUnmounting: false,
      isAbortedLike: false,
      expectedSpeechStop: false,
      code: '',
    }),
    false,
  );
  assert.equal(
    shouldIgnoreSpeechError({
      isUnmounting: true,
      isAbortedLike: false,
      expectedSpeechStop: false,
      code: '',
    }),
    true,
  );
  assert.equal(
    shouldIgnoreSpeechError({
      isUnmounting: false,
      isAbortedLike: false,
      expectedSpeechStop: true,
      code: 'aborted',
    }),
    true,
  );
});

test('appendFinalSpeechTranscript appends newline for non-empty previous value', () => {
  assert.equal(appendFinalSpeechTranscript('', 'hello'), 'hello');
  assert.equal(appendFinalSpeechTranscript('a', 'b'), 'a\nb');
});

test('quick text runtime logic normalizes and appends transcript text', () => {
  assert.equal(normalizeQuickText('  hello  '), 'hello');
  assert.equal(shouldInsertQuickText('', false), false);
  assert.equal(shouldInsertQuickText('x', true), false);
  assert.equal(shouldInsertQuickText('x', false), true);
  assert.equal(appendQuickText('', 'hello'), 'hello');
  assert.equal(appendQuickText('foo', 'bar'), 'foo\nbar');
  assert.equal(
    shouldConsumeQuickTextPress({
      activeLongPressSide: 'left',
      pressedSide: 'left',
    }),
    true,
  );
  assert.equal(
    shouldConsumeQuickTextPress({
      activeLongPressSide: 'left',
      pressedSide: 'right',
    }),
    false,
  );
});

test('settings ui runtime logic resolves platform-specific offsets and delays', () => {
  assert.equal(getSettingsKeyboardAdditionalOffset('ios'), 28);
  assert.equal(getSettingsKeyboardAdditionalOffset('android'), 16);
  assert.equal(getSettingsFieldVisibleDelayMs('ios'), 240);
  assert.equal(getSettingsFieldVisibleDelayMs('android'), 120);
});

test('keyboard ui runtime logic resolves events and animation config', () => {
  assert.deepEqual(resolveKeyboardEventNames('ios'), {
    showEvent: 'keyboardWillShow',
    hideEvent: 'keyboardWillHide',
  });
  assert.deepEqual(resolveKeyboardEventNames('android'), {
    showEvent: 'keyboardDidShow',
    hideEvent: 'keyboardDidHide',
  });

  assert.deepEqual(resolveKeyboardBarAnimation(true), { toValue: 1, duration: 140 });
  assert.deepEqual(resolveKeyboardBarAnimation(false), { toValue: 0, duration: 120 });
});
