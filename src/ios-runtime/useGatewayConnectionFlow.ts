import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type {
  ChatEventPayload,
  ConnectionState,
} from '../openclaw';
import { useGateway } from '../contexts';
import type { GatewayConnectDiagnostic } from '../types';
import {
  GATEWAY_DISPLAY_NAME,
  GATEWAY_PLATFORM,
  REQUESTED_GATEWAY_CLIENT_ID,
  STARTUP_AUTO_CONNECT_MAX_ATTEMPTS,
  STARTUP_AUTO_CONNECT_RETRY_BASE_MS,
} from '../utils';
import { classifyGatewayConnectFailure, errorMessage } from '../utils';
import { computeAutoConnectRetryPlan } from '../ui/runtime-logic';
import {
  applyDisconnectReset,
  shouldRunAutoConnectRetry,
  validateGatewayConnectPreflight,
} from './gateway-connection-flow-logic';

type UseGatewayConnectionFlowInput = {
  gatewayUrl: string;
  authToken: string;
  settingsReady: boolean;
  gatewayUrlRef: MutableRefObject<string>;
  connectionStateRef: MutableRefObject<ConnectionState>;
  isUnmountingRef: MutableRefObject<boolean>;
  subscriptionsRef: MutableRefObject<Array<() => void>>;
  historySyncTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  historySyncRequestRef: MutableRefObject<{
    sessionKey: string;
    attempt: number;
  } | null>;
  outboxProcessingRef: MutableRefObject<boolean>;
  startupAutoConnectAttemptRef: MutableRefObject<number>;
  startupAutoConnectRetryTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  activeRunIdRef: MutableRefObject<string | null>;
  pendingTurnIdRef: MutableRefObject<string | null>;
  runIdToTurnIdRef: MutableRefObject<Map<string, string>>;
  setActiveRunId: Dispatch<SetStateAction<string | null>>;
  setGatewayError: Dispatch<SetStateAction<string | null>>;
  setGatewayConnectDiagnostic: Dispatch<
    SetStateAction<GatewayConnectDiagnostic | null>
  >;
  setSessionsError: Dispatch<SetStateAction<string | null>>;
  setGatewayEventState: (value: string) => void;
  setIsSettingsPanelOpen: Dispatch<SetStateAction<boolean>>;
  setIsStartupAutoConnecting: Dispatch<SetStateAction<boolean>>;
  setIsSessionOperationPending: Dispatch<SetStateAction<boolean>>;
  setIsBottomCompletePulse: Dispatch<SetStateAction<boolean>>;
  clearFinalResponseRecoveryTimer: () => void;
  clearMissingResponseRecoveryState: (sessionKey?: string) => void;
  clearStartupAutoConnectRetryTimer: () => void;
  clearBottomCompletePulseTimer: () => void;
  clearOutboxRetryTimer: () => void;
  invalidateRefreshEpoch: () => void;
  forceMaskAuthToken: () => void;
  runGatewayRuntimeAction: (action: { type: 'RESET_RUNTIME' }) => void;
  handleChatEvent: (payload: ChatEventPayload) => void;
};

export function useGatewayConnectionFlow(input: UseGatewayConnectionFlowInput) {
  const {
    connect: gatewayConnect,
    disconnect: gatewayDisconnect,
    subscribeChatEvent: gatewaySubscribeChatEvent,
    subscribeEvent: gatewaySubscribeEvent,
    connectDiagnostic: gatewayContextConnectDiagnostic,
  } = useGateway();

  const clearSubscriptions = useCallback(() => {
    input.subscriptionsRef.current.forEach((unsubscribe) => {
      try {
        unsubscribe();
      } catch {
        // ignore
      }
    });
    input.subscriptionsRef.current = [];
  }, [input]);

  const disconnectGateway = useCallback(() => {
    clearSubscriptions();
    applyDisconnectReset({
      historySyncTimerRef: input.historySyncTimerRef,
      historySyncRequestRef: input.historySyncRequestRef,
      outboxProcessingRef: input.outboxProcessingRef,
      activeRunIdRef: input.activeRunIdRef,
      pendingTurnIdRef: input.pendingTurnIdRef,
      runIdToTurnIdRef: input.runIdToTurnIdRef,
      setActiveRunId: input.setActiveRunId,
      setIsSessionOperationPending: input.setIsSessionOperationPending,
      setGatewayConnectDiagnostic: input.setGatewayConnectDiagnostic,
      setIsBottomCompletePulse: input.setIsBottomCompletePulse,
      runGatewayRuntimeAction: input.runGatewayRuntimeAction,
      gatewayDisconnect,
      clearFinalResponseRecoveryTimer: input.clearFinalResponseRecoveryTimer,
      clearMissingResponseRecoveryState: input.clearMissingResponseRecoveryState,
      clearStartupAutoConnectRetryTimer: input.clearStartupAutoConnectRetryTimer,
      clearBottomCompletePulseTimer: input.clearBottomCompletePulseTimer,
      clearOutboxRetryTimer: input.clearOutboxRetryTimer,
      invalidateRefreshEpoch: input.invalidateRefreshEpoch,
    });
  }, [clearSubscriptions, gatewayDisconnect, input]);

  const connectGateway = useCallback(
    async (options?: { auto?: boolean; autoAttempt?: number }) => {
      const isAutoConnect = options?.auto === true;
      const autoAttempt = options?.autoAttempt ?? 1;
      const trimmedGatewayUrl = input.gatewayUrl.trim();
      const hasToken = input.authToken.trim().length > 0;
      if (!isAutoConnect) {
        input.clearStartupAutoConnectRetryTimer();
        input.setIsStartupAutoConnecting(false);
      }

      const preflight = validateGatewayConnectPreflight({
        settingsReady: input.settingsReady,
        gatewayUrl: trimmedGatewayUrl,
      });
      if (!preflight.ok) {
        if (preflight.diagnostic) {
          input.setGatewayConnectDiagnostic(preflight.diagnostic);
        }
        input.setGatewayError(preflight.message);
        if (isAutoConnect) {
          input.setIsStartupAutoConnecting(false);
        }
        return;
      }

      if (isAutoConnect) {
        input.setIsStartupAutoConnecting(true);
        input.startupAutoConnectAttemptRef.current = autoAttempt;
      }

      const connectOnce = async (clientId: string) => {
        input.invalidateRefreshEpoch();
        disconnectGateway();
        input.setGatewayError(null);
        input.setGatewayConnectDiagnostic(null);
        input.setSessionsError(null);
        await gatewayConnect(trimmedGatewayUrl, {
          token: input.authToken.trim() || undefined,
          autoReconnect: true,
          platform: GATEWAY_PLATFORM,
          clientId,
          displayName: GATEWAY_DISPLAY_NAME,
          scopes: ['operator.read', 'operator.write'],
          caps: ['talk'],
        });

        const pairingListener = () => {
          input.setGatewayError(
            'Pairing approval required. Please allow this device on OpenClaw.',
          );
          input.setGatewayConnectDiagnostic({
            kind: 'pairing',
            summary: 'Pairing approval required.',
            guidance: 'Approve this device from OpenClaw pairing screen.',
          });
          input.setGatewayEventState('pairing-required');
        };

        input.subscriptionsRef.current = [
          gatewaySubscribeChatEvent(input.handleChatEvent),
          gatewaySubscribeEvent('pairing.required', pairingListener),
        ];
      };

      try {
        await connectOnce(REQUESTED_GATEWAY_CLIENT_ID);
        input.setGatewayError(null);
        input.setGatewayConnectDiagnostic(null);
        input.setGatewayEventState('ready');
        input.setIsSettingsPanelOpen(false);
        input.forceMaskAuthToken();
        if (isAutoConnect) {
          input.clearStartupAutoConnectRetryTimer();
          input.startupAutoConnectAttemptRef.current = 0;
        }
      } catch (err) {
        disconnectGateway();
        const errorText = errorMessage(err);
        const diagnostic =
          gatewayContextConnectDiagnostic ??
          classifyGatewayConnectFailure({
            error: err,
            hasToken,
          });
        input.setGatewayConnectDiagnostic(diagnostic);
        if (isAutoConnect) {
          const retryPlan = computeAutoConnectRetryPlan({
            attempt: autoAttempt,
            maxAttempts: STARTUP_AUTO_CONNECT_MAX_ATTEMPTS,
            baseDelayMs: STARTUP_AUTO_CONNECT_RETRY_BASE_MS,
            errorText: `${diagnostic.summary} ${errorText}`,
          });
          if (retryPlan.shouldRetry) {
            input.clearStartupAutoConnectRetryTimer();
            input.startupAutoConnectRetryTimerRef.current = setTimeout(() => {
              input.startupAutoConnectRetryTimerRef.current = null;
              if (
                !shouldRunAutoConnectRetry({
                  isUnmounting: input.isUnmountingRef.current,
                  gatewayUrl: input.gatewayUrlRef.current,
                  connectionState: input.connectionStateRef.current,
                })
              ) {
                return;
              }
              void connectGateway({ auto: true, autoAttempt: retryPlan.nextAttempt });
            }, retryPlan.delayMs);
            input.setGatewayError(retryPlan.message);
          } else {
            input.setGatewayError(retryPlan.message);
          }
        } else {
          input.setGatewayError(`${diagnostic.summary} ${diagnostic.guidance}`);
        }
      } finally {
        if (isAutoConnect) {
          input.setIsStartupAutoConnecting(false);
        }
      }
    },
    [
      disconnectGateway,
      gatewayConnect,
      gatewayContextConnectDiagnostic,
      gatewaySubscribeChatEvent,
      gatewaySubscribeEvent,
      input,
    ],
  );

  return {
    clearSubscriptions,
    disconnectGateway,
    connectGateway,
  };
}
