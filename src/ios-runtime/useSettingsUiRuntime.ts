import {
  useCallback,
  useRef,
  type Dispatch,
  type SetStateAction,
} from 'react';
import {
  Platform,
  findNodeHandle,
  type ScrollView,
  type TextInput,
} from 'react-native';
import type { QuickTextButtonSide, QuickTextFocusField } from '../types';
import { QUICK_TEXT_TOOLTIP_HIDE_MS } from '../utils';
import {
  getSettingsFieldVisibleDelayMs,
  getSettingsKeyboardAdditionalOffset,
} from './settings-ui-runtime-logic';

type TimerRef = ReturnType<typeof setTimeout> | null;

type UseSettingsUiRuntimeInput = {
  setQuickTextTooltipSide: Dispatch<SetStateAction<QuickTextButtonSide | null>>;
};

export function useSettingsUiRuntime(input: UseSettingsUiRuntimeInput) {
  const settingsScrollRef = useRef<ScrollView | null>(null);
  const settingsFocusScrollTimerRef = useRef<TimerRef>(null);
  const quickTextTooltipTimerRef = useRef<TimerRef>(null);
  const quickTextLongPressResetTimerRef = useRef<TimerRef>(null);
  const quickTextInputRefs = useRef<Record<QuickTextFocusField, TextInput | null>>({
    'quick-text-left': null,
    'quick-text-right': null,
  });
  const quickTextLongPressSideRef = useRef<QuickTextButtonSide | null>(null);

  const clearQuickTextTooltipTimer = useCallback(() => {
    if (!quickTextTooltipTimerRef.current) return;
    clearTimeout(quickTextTooltipTimerRef.current);
    quickTextTooltipTimerRef.current = null;
  }, []);

  const clearQuickTextLongPressResetTimer = useCallback(() => {
    if (!quickTextLongPressResetTimerRef.current) return;
    clearTimeout(quickTextLongPressResetTimerRef.current);
    quickTextLongPressResetTimerRef.current = null;
  }, []);

  const hideQuickTextTooltip = useCallback(() => {
    clearQuickTextTooltipTimer();
    input.setQuickTextTooltipSide(null);
  }, [clearQuickTextTooltipTimer, input]);

  const scheduleQuickTextTooltipHide = useCallback(() => {
    clearQuickTextTooltipTimer();
    quickTextTooltipTimerRef.current = setTimeout(() => {
      quickTextTooltipTimerRef.current = null;
      input.setQuickTextTooltipSide(null);
    }, QUICK_TEXT_TOOLTIP_HIDE_MS);
  }, [clearQuickTextTooltipTimer, input]);

  const ensureSettingsFieldVisible = useCallback((field: QuickTextFocusField) => {
    if (settingsFocusScrollTimerRef.current) {
      clearTimeout(settingsFocusScrollTimerRef.current);
    }
    settingsFocusScrollTimerRef.current = setTimeout(() => {
      settingsFocusScrollTimerRef.current = null;
      const scrollView = settingsScrollRef.current;
      const inputRef = quickTextInputRefs.current[field];
      if (!scrollView || !inputRef) {
        return;
      }
      const inputHandle = findNodeHandle(inputRef);
      if (!inputHandle) return;

      const responder = (scrollView as unknown as {
        getScrollResponder?: () => unknown;
      }).getScrollResponder?.() as
        | {
            scrollResponderScrollNativeHandleToKeyboard?: (
              nodeHandle: number,
              additionalOffset?: number,
              preventNegativeScrollOffset?: boolean,
            ) => void;
          }
        | undefined;

      if (responder?.scrollResponderScrollNativeHandleToKeyboard) {
        responder.scrollResponderScrollNativeHandleToKeyboard(
          inputHandle,
          getSettingsKeyboardAdditionalOffset(Platform.OS),
          true,
        );
        return;
      }

      scrollView.scrollToEnd({ animated: true });
    }, getSettingsFieldVisibleDelayMs(Platform.OS));
  }, []);

  return {
    settingsScrollRef,
    settingsFocusScrollTimerRef,
    quickTextTooltipTimerRef,
    quickTextLongPressResetTimerRef,
    quickTextInputRefs,
    quickTextLongPressSideRef,
    clearQuickTextLongPressResetTimer,
    hideQuickTextTooltip,
    scheduleQuickTextTooltipHide,
    ensureSettingsFieldVisible,
  };
}
