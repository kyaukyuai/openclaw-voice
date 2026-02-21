import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { QuickTextButtonSide } from '../types';
import { triggerHaptic } from '../utils';
import {
  appendQuickText,
  normalizeQuickText,
  shouldConsumeQuickTextPress,
  shouldInsertQuickText,
} from './quick-text-runtime-logic';

type UseQuickTextRuntimeInput = {
  isRecognizing: boolean;
  setTranscript: Dispatch<SetStateAction<string>>;
  setInterimTranscript: Dispatch<SetStateAction<string>>;
  setQuickTextTooltipSide: Dispatch<SetStateAction<QuickTextButtonSide | null>>;
  clearQuickTextLongPressResetTimer: () => void;
  scheduleQuickTextTooltipHide: () => void;
  hideQuickTextTooltip: () => void;
  quickTextLongPressSideRef: MutableRefObject<QuickTextButtonSide | null>;
  quickTextLongPressResetTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
};

export function useQuickTextRuntime(input: UseQuickTextRuntimeInput) {
  const insertQuickText = useCallback(
    (rawText: string) => {
      const nextText = normalizeQuickText(rawText);
      if (!shouldInsertQuickText(nextText, input.isRecognizing)) return;
      input.setTranscript((previous) => {
        return appendQuickText(previous, nextText);
      });
      input.setInterimTranscript('');
      void triggerHaptic('button-press');
    },
    [input],
  );

  const handleQuickTextLongPress = useCallback(
    (side: QuickTextButtonSide, rawText: string) => {
      if (!rawText.trim()) return;
      input.quickTextLongPressSideRef.current = side;
      input.clearQuickTextLongPressResetTimer();
      input.setQuickTextTooltipSide(side);
      void triggerHaptic('button-press');
      input.scheduleQuickTextTooltipHide();
    },
    [input],
  );

  const handleQuickTextPress = useCallback(
    (side: QuickTextButtonSide, rawText: string) => {
      if (
        shouldConsumeQuickTextPress({
          activeLongPressSide: input.quickTextLongPressSideRef.current,
          pressedSide: side,
        })
      ) {
        input.quickTextLongPressSideRef.current = null;
        return;
      }
      input.hideQuickTextTooltip();
      insertQuickText(rawText);
    },
    [input, insertQuickText],
  );

  const handleQuickTextPressOut = useCallback(
    (side: QuickTextButtonSide) => {
      if (input.quickTextLongPressSideRef.current !== side) {
        input.hideQuickTextTooltip();
        return;
      }
      input.clearQuickTextLongPressResetTimer();
      input.quickTextLongPressResetTimerRef.current = setTimeout(() => {
        input.quickTextLongPressResetTimerRef.current = null;
        input.quickTextLongPressSideRef.current = null;
      }, 260);
    },
    [input],
  );

  return {
    handleQuickTextLongPress,
    handleQuickTextPress,
    handleQuickTextPressOut,
  };
}
