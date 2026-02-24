import { useCallback } from 'react';
import { triggerHaptic } from '../utils';
import {
  useHomeUiHandlers,
  type UseHomeUiHandlersInput,
} from './useHomeUiHandlers';

type UseHomeUiWiringInput = Omit<UseHomeUiHandlersInput, 'onButtonPressHaptic'>;

export function useHomeUiWiring(input: UseHomeUiWiringInput) {
  const onButtonPressHaptic = useCallback(() => {
    void triggerHaptic('button-press');
  }, []);

  return useHomeUiHandlers({
    ...input,
    onButtonPressHaptic,
  });
}
