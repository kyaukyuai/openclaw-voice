import type { ConnectionState } from '../openclaw';
import type { GatewayConnectDiagnostic } from '../types';

type GatewayConnectPreflightInput = {
  settingsReady: boolean;
  gatewayUrl: string;
};

type GatewayConnectPreflightResult =
  | {
      ok: true;
      trimmedGatewayUrl: string;
    }
  | {
      ok: false;
      message: string;
      diagnostic?: GatewayConnectDiagnostic;
    };

export function validateGatewayConnectPreflight(
  input: GatewayConnectPreflightInput,
): GatewayConnectPreflightResult {
  if (!input.settingsReady) {
    return {
      ok: false,
      message: 'Initializing. Please wait a few seconds and try again.',
    };
  }

  const trimmedGatewayUrl = input.gatewayUrl.trim();
  if (!trimmedGatewayUrl) {
    return {
      ok: false,
      message: 'Please enter a Gateway URL.',
    };
  }

  let parsedGatewayUrl: URL;
  try {
    parsedGatewayUrl = new URL(trimmedGatewayUrl);
  } catch {
    const diagnostic: GatewayConnectDiagnostic = {
      kind: 'invalid-url',
      summary: 'Gateway URL is invalid.',
      guidance: 'Use ws:// or wss:// with a valid host.',
    };
    return {
      ok: false,
      message: `${diagnostic.summary} ${diagnostic.guidance}`,
      diagnostic,
    };
  }

  if (!/^wss?:$/i.test(parsedGatewayUrl.protocol)) {
    const diagnostic: GatewayConnectDiagnostic = {
      kind: 'invalid-url',
      summary: 'Gateway URL must start with ws:// or wss://.',
      guidance: `Current protocol is ${parsedGatewayUrl.protocol}`,
    };
    return {
      ok: false,
      message: `${diagnostic.summary} ${diagnostic.guidance}`,
      diagnostic,
    };
  }

  return {
    ok: true,
    trimmedGatewayUrl,
  };
}

type AutoConnectRetryGuardInput = {
  isUnmounting: boolean;
  gatewayUrl: string;
  connectionState: ConnectionState;
};

export function shouldRunAutoConnectRetry(
  input: AutoConnectRetryGuardInput,
): boolean {
  if (input.isUnmounting) return false;
  if (!input.gatewayUrl.trim()) return false;
  if (input.connectionState !== 'disconnected') return false;
  return true;
}

type DisconnectResetInput = {
  historySyncTimerRef: { current: ReturnType<typeof setTimeout> | null };
  historySyncRequestRef: { current: { sessionKey: string; attempt: number } | null };
  outboxProcessingRef: { current: boolean };
  activeRunIdRef: { current: string | null };
  pendingTurnIdRef: { current: string | null };
  runIdToTurnIdRef: { current: Map<string, string> };
  setActiveRunId: (value: string | null) => void;
  setIsSessionOperationPending: (value: boolean) => void;
  setGatewayConnectDiagnostic: (value: GatewayConnectDiagnostic | null) => void;
  setIsBottomCompletePulse: (value: boolean) => void;
  runGatewayRuntimeAction: (action: { type: 'RESET_RUNTIME' }) => void;
  gatewayDisconnect: () => void;
  clearFinalResponseRecoveryTimer: () => void;
  clearMissingResponseRecoveryState: () => void;
  clearStartupAutoConnectRetryTimer: () => void;
  clearBottomCompletePulseTimer: () => void;
  clearOutboxRetryTimer: () => void;
  invalidateRefreshEpoch: () => void;
};

export function applyDisconnectReset(input: DisconnectResetInput): void {
  input.invalidateRefreshEpoch();
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
}
