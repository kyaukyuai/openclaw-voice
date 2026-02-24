import { useCallback } from 'react';
import { Keyboard } from 'react-native';
import {
  resolveTopBannerDismissTarget,
} from './home-ui-handlers-logic';
import type { UseHomeUiHandlersInput } from './home-ui-handlers.types';

export function useHomeUiBannerHandlers(input: UseHomeUiHandlersInput) {
  const handleReconnectFromError = useCallback(() => {
    if (!input.canReconnectFromError) return;
    Keyboard.dismiss();
    input.setFocusedField(null);
    void input.connectGateway();
  }, [input]);

  const handleRetryFromError = useCallback(() => {
    if (!input.canRetryFromError) return;
    Keyboard.dismiss();
    input.setFocusedField(null);
    void input.sendToGateway(input.latestRetryText);
  }, [input]);

  const handleRetryMissingResponse = useCallback(() => {
    const notice = input.activeMissingResponseNotice;
    if (!notice || input.isMissingResponseRecoveryInFlight) return;
    if (!input.isGatewayConnected) {
      input.setGatewayError('Reconnect to retry fetching final response.');
      return;
    }
    Keyboard.dismiss();
    input.setFocusedField(null);
    input.scheduleMissingResponseRecovery(notice.sessionKey, notice.turnId, {
      attempt: 1,
      delayMs: 0,
    });
  }, [input]);

  const handleDismissTopBanner = useCallback(() => {
    const dismissTarget = resolveTopBannerDismissTarget(input.topBannerKind);
    if (dismissTarget === 'gateway') {
      input.setGatewayError(null);
      return;
    }
    if (dismissTarget === 'recovery') {
      input.setMissingResponseNotice(null);
      return;
    }
    if (dismissTarget === 'history') {
      input.setHistoryRefreshNotice(null);
      return;
    }
    if (dismissTarget === 'speech') {
      input.setSpeechError(null);
    }
  }, [input]);

  return {
    handleReconnectFromError,
    handleRetryFromError,
    handleRetryMissingResponse,
    handleDismissTopBanner,
  };
}
