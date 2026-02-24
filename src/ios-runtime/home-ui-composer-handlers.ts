import { useCallback } from 'react';
import { Keyboard } from 'react-native';
import { resolveDraftText } from './home-ui-handlers-logic';
import type { UseHomeUiHandlersInput } from './home-ui-handlers.types';

export function useHomeUiComposerHandlers(input: UseHomeUiHandlersInput) {
  const handleDoneKeyboardAction = useCallback(() => {
    Keyboard.dismiss();
    input.setFocusedField(null);
  }, [input]);

  const handleClearKeyboardAction = useCallback(() => {
    if (!input.canClearFromKeyboardBar) return;
    input.clearTranscriptDraft();
  }, [input]);

  const handleSendKeyboardAction = useCallback(() => {
    if (!input.canSendFromKeyboardBar) return;
    const text = resolveDraftText(input.transcript, input.interimTranscript);
    if (!text) return;
    Keyboard.dismiss();
    input.setFocusedField(null);
    void input.sendToGateway(text);
  }, [input]);

  const handleSendDraftAction = useCallback(() => {
    const text = resolveDraftText(input.transcript, input.interimTranscript);
    if (!text) return;
    Keyboard.dismiss();
    input.setFocusedField(null);
    void input.sendToGateway(text);
  }, [input]);

  const handleTranscriptChange = useCallback(
    (value: string) => {
      input.setTranscript(value);
      input.setInterimTranscript('');
    },
    [input],
  );

  const handleTranscriptFocus = useCallback(() => {
    input.setFocusedField('transcript');
  }, [input]);

  const handleTranscriptBlur = useCallback(() => {
    input.setFocusedField((current) => (current === 'transcript' ? null : current));
  }, [input]);

  const handleBottomDockHeightChange = useCallback(
    (nextHeight: number) => {
      if (input.composerHeight !== nextHeight) {
        input.setComposerHeight(nextHeight);
      }
    },
    [input],
  );

  const handleBottomDockActionPressHaptic = useCallback(() => {
    input.onButtonPressHaptic();
  }, [input]);

  return {
    handleDoneKeyboardAction,
    handleClearKeyboardAction,
    handleSendKeyboardAction,
    handleSendDraftAction,
    handleTranscriptChange,
    handleTranscriptFocus,
    handleTranscriptBlur,
    handleBottomDockHeightChange,
    handleBottomDockActionPressHaptic,
  };
}
