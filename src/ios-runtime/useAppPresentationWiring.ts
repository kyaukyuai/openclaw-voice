import { useKeyboardUiRuntime } from './useKeyboardUiRuntime';
import { useAppContentWiring } from './useAppContentWiring';
import { useAppViewModelWiring } from './useAppViewModelWiring';
import {
  buildAppContentWiringInput,
  buildAppViewModelWiringInput,
  buildKeyboardUiRuntimeInput,
} from './app-presentation-wiring-inputs-logic';
import type { SettingsContextValue, GatewayContextValue, ThemeContextValue } from '../contexts';
import type { GatewayUiFlags } from './app-screen-wiring-logic';
import type { useAppRuntimeState } from './useAppRuntimeState';
import type { useGatewayRuntime } from './useGatewayRuntime';
import type { useComposerRuntime } from './useComposerRuntime';
import type { useSettingsUiRuntime } from './useSettingsUiRuntime';
import type { useAppRuntimeWiring } from './useAppRuntimeWiring';

type AppRuntimeState = ReturnType<typeof useAppRuntimeState>;
type GatewayRuntimeController = ReturnType<typeof useGatewayRuntime>;
type ComposerRuntimeState = ReturnType<typeof useComposerRuntime>;
type SettingsUiRuntimeState = ReturnType<typeof useSettingsUiRuntime>;
type RuntimeWiringState = ReturnType<typeof useAppRuntimeWiring>;

type UseAppPresentationWiringInput = {
  settings: SettingsContextValue;
  gateway: GatewayContextValue;
  theme: ThemeContextValue;
  appState: AppRuntimeState;
  gatewayRuntimeController: GatewayRuntimeController;
  composerRuntime: ComposerRuntimeState;
  settingsUiRuntime: SettingsUiRuntimeState;
  uiFlags: GatewayUiFlags;
  runtimeWiring: RuntimeWiringState;
};

export function useAppPresentationWiring(input: UseAppPresentationWiringInput) {
  const {
    settings,
    gateway,
    theme,
    appState,
    gatewayRuntimeController,
    composerRuntime,
    settingsUiRuntime,
    uiFlags,
    runtimeWiring,
  } = input;

  const appContent = useAppContentWiring(
    buildAppContentWiringInput({
      settings,
      gateway,
      theme,
      appState,
      gatewayRuntimeController,
      composerRuntime,
      settingsUiRuntime,
      uiFlags,
      runtimeWiring,
    }),
  );

  const { keyboardBarAnim } = useKeyboardUiRuntime(
    buildKeyboardUiRuntimeInput({
      appContent,
      composerRuntime,
      appState,
    }),
  );

  return useAppViewModelWiring(
    buildAppViewModelWiringInput({
      settings,
      gateway,
      theme,
      appState,
      gatewayRuntimeController,
      composerRuntime,
      settingsUiRuntime,
      uiFlags,
      runtimeWiring,
      appContent,
      keyboardBarAnim,
    }),
  );
}
