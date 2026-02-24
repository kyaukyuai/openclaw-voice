import { useGatewayActionHandlers } from './useGatewayActionHandlers';
import { useHomeUiState } from './useHomeUiState';
import { ONBOARDING_SAMPLE_MESSAGE, HISTORY_BOTTOM_THRESHOLD_PX } from '../utils';
import type { useAppRuntimeOrchestrator } from './useAppRuntimeOrchestrator';

type GatewayActionHandlersInput = Parameters<typeof useGatewayActionHandlers>[0];
type HomeUiStateInput = Parameters<typeof useHomeUiState>[0];
type HomeUiInputForGatewayHandlers = GatewayActionHandlersInput['homeUiInput'];

type RuntimeActions = Pick<
  ReturnType<typeof useAppRuntimeOrchestrator>,
  | 'connectGateway'
  | 'sendToGateway'
  | 'refreshSessions'
  | 'scheduleMissingResponseRecovery'
  | 'startRecognition'
  | 'stopRecognition'
>;

type UseAppContentWiringInput = {
  homeUiStateInput: HomeUiStateInput;
  runtimeActions: RuntimeActions;
  gatewayActionHandlersInput: Omit<GatewayActionHandlersInput, 'homeUiInput'>;
  gatewayActionHandlersHomeUiBaseInput: Omit<
    HomeUiInputForGatewayHandlers,
    | 'canReconnectFromError'
    | 'canRetryFromError'
    | 'latestRetryText'
    | 'connectGateway'
    | 'sendToGateway'
    | 'activeMissingResponseNotice'
    | 'canRunOnboardingConnectTest'
    | 'canRunOnboardingSampleSend'
    | 'onboardingSampleMessage'
    | 'topBannerKind'
    | 'speechRecognitionSupported'
    | 'canClearFromKeyboardBar'
    | 'canSendFromKeyboardBar'
    | 'refreshSessions'
    | 'scheduleMissingResponseRecovery'
    | 'startRecognition'
    | 'stopRecognition'
    | 'historyBottomThresholdPx'
  >;
};

export function useAppContentWiring(input: UseAppContentWiringInput) {
  const homeUiState = useHomeUiState(input.homeUiStateInput);

  const gatewayActionHandlers = useGatewayActionHandlers({
    ...input.gatewayActionHandlersInput,
    homeUiInput: {
      ...input.gatewayActionHandlersHomeUiBaseInput,
      canReconnectFromError: homeUiState.canReconnectFromError,
      canRetryFromError: homeUiState.canRetryFromError,
      latestRetryText: homeUiState.latestRetryText,
      connectGateway: input.runtimeActions.connectGateway,
      sendToGateway: input.runtimeActions.sendToGateway,
      activeMissingResponseNotice: homeUiState.activeMissingResponseNotice,
      canRunOnboardingConnectTest: homeUiState.canRunOnboardingConnectTest,
      canRunOnboardingSampleSend: homeUiState.canRunOnboardingSampleSend,
      onboardingSampleMessage: ONBOARDING_SAMPLE_MESSAGE,
      topBannerKind: homeUiState.topBannerKind,
      speechRecognitionSupported: homeUiState.speechRecognitionSupported,
      canClearFromKeyboardBar: homeUiState.canClearFromKeyboardBar,
      canSendFromKeyboardBar: homeUiState.canSendFromKeyboardBar,
      refreshSessions: input.runtimeActions.refreshSessions,
      scheduleMissingResponseRecovery:
        input.runtimeActions.scheduleMissingResponseRecovery,
      startRecognition: input.runtimeActions.startRecognition,
      stopRecognition: input.runtimeActions.stopRecognition,
      historyBottomThresholdPx: HISTORY_BOTTOM_THRESHOLD_PX,
    },
  });

  return {
    ...homeUiState,
    ...gatewayActionHandlers,
  };
}
