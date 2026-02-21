import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import {
  Animated,
  Keyboard,
  Platform,
} from 'react-native';

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
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

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
    Animated.timing(keyboardBarAnim, {
      toValue: showKeyboardActionBar ? 1 : 0,
      duration: showKeyboardActionBar ? 140 : 120,
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
