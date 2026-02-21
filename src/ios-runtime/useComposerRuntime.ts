import { useCallback, useMemo, useState } from 'react';
import { computeHistoryBottomInset } from '../ui/history-layout';

type UseComposerRuntimeInput = {
  safeAreaBottom?: number;
};

export function useComposerRuntime(input?: UseComposerRuntimeInput) {
  const [composerHeight, setComposerHeight] = useState(0);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  const setKeyboardState = useCallback((visible: boolean, height: number) => {
    setIsKeyboardVisible(visible);
    setKeyboardHeight(Math.max(0, height));
  }, []);

  const historyBottomInset = useMemo(
    () =>
      computeHistoryBottomInset({
        keyboardHeight,
        composerHeight,
        safeAreaBottom: input?.safeAreaBottom ?? 0,
        isKeyboardVisible,
      }),
    [composerHeight, input?.safeAreaBottom, isKeyboardVisible, keyboardHeight],
  );

  return {
    composerHeight,
    setComposerHeight,
    keyboardHeight,
    setKeyboardState,
    isKeyboardVisible,
    historyBottomInset,
  };
}
