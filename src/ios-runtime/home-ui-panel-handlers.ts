import { useCallback } from 'react';
import { Keyboard } from 'react-native';
import type { UseHomeUiHandlersInput } from './home-ui-handlers.types';

export function useHomeUiPanelHandlers(input: UseHomeUiHandlersInput) {
  const handleCompleteOnboarding = useCallback(() => {
    Keyboard.dismiss();
    input.setFocusedField(null);
    input.setIsOnboardingWaitingForResponse(false);
    input.setIsOnboardingCompleted(true);
  }, [input]);

  const handleOnboardingConnectTest = useCallback(() => {
    if (!input.canRunOnboardingConnectTest) return;
    Keyboard.dismiss();
    input.setFocusedField(null);
    void input.connectGateway();
  }, [input]);

  const handleOnboardingSendSample = useCallback(() => {
    if (!input.canRunOnboardingSampleSend) return;
    Keyboard.dismiss();
    input.setFocusedField(null);
    input.setIsOnboardingWaitingForResponse(true);
    void input.sendToGateway(input.onboardingSampleMessage);
  }, [input]);

  const handleToggleSessionPanel = useCallback(() => {
    if (!input.isGatewayConnected) return;
    Keyboard.dismiss();
    input.setFocusedField(null);
    input.setIsSettingsPanelOpen(false);
    input.forceMaskAuthToken();
    const next = !input.isSessionPanelOpen;
    input.setIsSessionPanelOpen(next);
    if (next) {
      void input.refreshSessions();
      return;
    }
    input.setIsSessionRenameOpen(false);
    input.setSessionRenameTargetKey(null);
    input.setSessionRenameDraft('');
  }, [input]);

  const handleToggleSettingsPanel = useCallback(() => {
    if (!input.canToggleSettingsPanel) return;
    Keyboard.dismiss();
    input.setFocusedField(null);
    input.setIsSessionPanelOpen(false);
    input.setIsSettingsPanelOpen((current) => {
      const next = !current;
      if (!next) {
        input.forceMaskAuthToken();
      }
      return next;
    });
  }, [input]);

  const handleCloseSettingsPanel = useCallback(() => {
    if (!input.canDismissSettingsScreen) return;
    input.forceMaskAuthToken();
    input.setIsSettingsPanelOpen(false);
    input.setFocusedField(null);
    Keyboard.dismiss();
  }, [input]);

  const handleCloseSessionPanel = useCallback(() => {
    input.setIsSessionPanelOpen(false);
    input.setIsSessionRenameOpen(false);
    input.setSessionRenameTargetKey(null);
    input.setSessionRenameDraft('');
    Keyboard.dismiss();
  }, [input]);

  return {
    handleCompleteOnboarding,
    handleOnboardingConnectTest,
    handleOnboardingSendSample,
    handleToggleSessionPanel,
    handleToggleSettingsPanel,
    handleCloseSettingsPanel,
    handleCloseSessionPanel,
  };
}
