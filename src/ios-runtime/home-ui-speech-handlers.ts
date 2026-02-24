import { useCallback } from 'react';
import { Keyboard } from 'react-native';
import { shouldStartHoldToTalk } from './home-ui-handlers-logic';
import type { UseHomeUiHandlersInput } from './home-ui-handlers.types';

export function useHomeUiSpeechHandlers(input: UseHomeUiHandlersInput) {
  const handleHoldToTalkPressIn = useCallback(() => {
    if (
      !shouldStartHoldToTalk({
        speechRecognitionSupported: input.speechRecognitionSupported,
        isRecognizing: input.isRecognizing,
        isSending: input.isSending,
      })
    ) {
      return;
    }

    input.onButtonPressHaptic();
    Keyboard.dismiss();
    input.setFocusedField(null);
    input.holdActivatedRef.current = false;

    if (input.holdStartTimerRef.current) {
      clearTimeout(input.holdStartTimerRef.current);
    }

    input.holdStartTimerRef.current = setTimeout(() => {
      input.holdStartTimerRef.current = null;
      input.holdActivatedRef.current = true;
      void input.startRecognition();
    }, 120);
  }, [input]);

  const handleHoldToTalkPressOut = useCallback(() => {
    if (input.holdStartTimerRef.current) {
      clearTimeout(input.holdStartTimerRef.current);
      input.holdStartTimerRef.current = null;
    }
    if (!input.holdActivatedRef.current) return;
    input.holdActivatedRef.current = false;
    if (!input.isRecognizing) return;
    input.stopRecognition();
  }, [input]);

  return {
    handleHoldToTalkPressIn,
    handleHoldToTalkPressOut,
  };
}
