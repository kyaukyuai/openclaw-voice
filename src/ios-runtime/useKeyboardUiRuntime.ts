import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import {
  Animated,
  Keyboard,
  Platform,
} from 'react-native';
import {
  resolveKeyboardBarAnimation,
  resolveKeyboardEventNames,
} from './keyboard-ui-runtime-logic';

type UseKeyboardUiRuntimeInput = {
  showKeyboardActionBar: boolean;
  setKeyboardState: (visible: boolean, height: number) => void;
  setIsKeyboardBarMounted: Dispatch<SetStateAction<boolean>>;
};

export function useKeyboardUiRuntime({
  showKeyboardActionBar,
  setKeyboardState,
  setIsKeyboardBarMounted,
}: UseKeyboardUiRuntimeInput) {
  const keyboardBarAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const { showEvent, hideEvent } = resolveKeyboardEventNames(Platform.OS);

    const showSub = Keyboard.addListener(showEvent, (event) => {
      const height = event.endCoordinates?.height ?? 0;
      setKeyboardState(true, height);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardState(false, 0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [setKeyboardState]);

  useEffect(() => {
    if (showKeyboardActionBar) {
      setIsKeyboardBarMounted(true);
    }
    keyboardBarAnim.stopAnimation();
    const animation = resolveKeyboardBarAnimation(showKeyboardActionBar);
    Animated.timing(keyboardBarAnim, {
      toValue: animation.toValue,
      duration: animation.duration,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !showKeyboardActionBar) {
        setIsKeyboardBarMounted(false);
      }
    });
  }, [keyboardBarAnim, setIsKeyboardBarMounted, showKeyboardActionBar]);

  return {
    keyboardBarAnim,
  };
}
