import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type {
  ChatEventPayload,
  ConnectionState,
  GatewayClient,
  GatewayClientOptions,
} from '../openclaw';
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

type UseGatewayConnectionFlowInput = {
  gatewayUrl: string;
  authToken: string;
  settingsReady: boolean;
  gatewayContextConnectDiagnostic: GatewayConnectDiagnostic | null;
  gatewayConnect: (url: string, options?: GatewayClientOptions) => Promise<void>;
  gatewayDisconnect: () => void;
  gatewayGetClient: () => GatewayClient | null;
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
    input.invalidateRefreshEpoch();
    clearSubscriptions();
    input.clearFinalResponseRecoveryTimer();
    input.clearMissingResponseRecoveryState();
    input.clearStartupAutoConnectRetryTimer();
    input.clearBottomCompletePulseTimer();
    input.clearOutboxRetryTimer();
    if (input.historySyncTimerRef.current) {
      clearTimeout(input.historySyncTimerRef.current);
      input.historySyncTimerRef.current = null;
    }
    input.historySyncRequestRef.current = null;
    input.outboxProcessingRef.current = false;
    input.gatewayDisconnect();
    input.activeRunIdRef.current = null;
    input.setActiveRunId(null);
    input.pendingTurnIdRef.current = null;
    input.runIdToTurnIdRef.current.clear();
    input.setIsSessionOperationPending(false);
    input.runGatewayRuntimeAction({ type: 'RESET_RUNTIME' });
    input.setGatewayConnectDiagnostic(null);
    input.setIsBottomCompletePulse(false);
  }, [clearSubscriptions, input]);

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

      if (!input.settingsReady) {
        input.setGatewayError('Initializing. Please wait a few seconds and try again.');
        if (isAutoConnect) input.setIsStartupAutoConnecting(false);
        return;
      }

      if (!trimmedGatewayUrl) {
        input.setGatewayError('Please enter a Gateway URL.');
        if (isAutoConnect) input.setIsStartupAutoConnecting(false);
        return;
      }

      let parsedGatewayUrl: URL;
      try {
        parsedGatewayUrl = new URL(trimmedGatewayUrl);
      } catch {
        const invalidUrlDiagnostic: GatewayConnectDiagnostic = {
          kind: 'invalid-url',
          summary: 'Gateway URL is invalid.',
          guidance: 'Use ws:// or wss:// with a valid host.',
        };
        input.setGatewayConnectDiagnostic(invalidUrlDiagnostic);
        input.setGatewayError(
          `${invalidUrlDiagnostic.summary} ${invalidUrlDiagnostic.guidance}`,
        );
        if (isAutoConnect) input.setIsStartupAutoConnecting(false);
        return;
      }

      if (!/^wss?:$/i.test(parsedGatewayUrl.protocol)) {
        const invalidSchemeDiagnostic: GatewayConnectDiagnostic = {
          kind: 'invalid-url',
          summary: 'Gateway URL must start with ws:// or wss://.',
          guidance: `Current protocol is ${parsedGatewayUrl.protocol}`,
        };
        input.setGatewayConnectDiagnostic(invalidSchemeDiagnostic);
        input.setGatewayError(
          `${invalidSchemeDiagnostic.summary} ${invalidSchemeDiagnostic.guidance}`,
        );
        if (isAutoConnect) input.setIsStartupAutoConnecting(false);
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
        await input.gatewayConnect(trimmedGatewayUrl, {
          token: input.authToken.trim() || undefined,
          autoReconnect: true,
          platform: GATEWAY_PLATFORM,
          clientId,
          displayName: GATEWAY_DISPLAY_NAME,
          scopes: ['operator.read', 'operator.write'],
          caps: ['talk'],
        });

        const client = input.gatewayGetClient();
        if (!client) {
          throw new Error('Connection established but Gateway client is unavailable.');
        }

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

        const onChatEvent = client.onChatEvent(input.handleChatEvent);
        client.on('pairing.required', pairingListener);

        input.subscriptionsRef.current = [
          onChatEvent,
          () => client.off('pairing.required', pairingListener),
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
          input.gatewayContextConnectDiagnostic ??
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
              if (input.isUnmountingRef.current) return;
              if (!input.gatewayUrlRef.current.trim()) return;
              if (input.connectionStateRef.current !== 'disconnected') return;
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
    [disconnectGateway, input],
  );

  return {
    clearSubscriptions,
    disconnectGateway,
    connectGateway,
  };
}
