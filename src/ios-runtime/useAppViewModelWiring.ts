import { useMemo } from 'react';
import {
  ENABLE_DEBUG_WARNINGS,
  MAX_TEXT_SCALE,
  MAX_TEXT_SCALE_TIGHT,
} from '../utils';
import { createStyles } from '../ui/ios/styles';
import { useAppViewModel } from './useAppViewModel';
import {
  buildUseAppViewModelInput,
  type UseAppViewModelWiringInput,
} from './app-view-model-wiring-inputs-logic';

export function useAppViewModelWiring(input: UseAppViewModelWiringInput) {
  const styles = useMemo(() => createStyles(input.ui.isDarkTheme), [input.ui.isDarkTheme]);
  const placeholderColor = input.ui.isDarkTheme ? '#95a8ca' : '#C4C4C0';

  const viewModel = useAppViewModel(
    buildUseAppViewModelInput({
      wiringInput: input,
      styles,
      placeholderColor,
      maxTextScale: MAX_TEXT_SCALE,
      maxTextScaleTight: MAX_TEXT_SCALE_TIGHT,
      enableDebugWarnings: ENABLE_DEBUG_WARNINGS,
    }),
  );

  return {
    styles,
    ...viewModel,
  };
}
