import type { ConnectionState } from '../openclaw';
import type { MissingResponseRecoveryNotice } from '../types';

type MissingRecoveryRequest = {
  sessionKey: string;
  turnId: string;
  attempt: number;
};

type ShouldResetMissingRecoveryRequestInput = {
  targetSessionKey?: string;
  request: MissingRecoveryRequest | null;
};

export function shouldResetMissingRecoveryRequest(
  input: ShouldResetMissingRecoveryRequestInput,
): boolean {
  if (!input.targetSessionKey) return true;
  return input.request?.sessionKey === input.targetSessionKey;
}

export function resolveClearedMissingResponseNotice(
  previous: MissingResponseRecoveryNotice | null,
  targetSessionKey?: string,
): MissingResponseRecoveryNotice | null {
  if (!previous) return previous;
  if (targetSessionKey && previous.sessionKey !== targetSessionKey) {
    return previous;
  }
  return null;
}

export function canRunGatewayHealthCheck(
  connectionState: ConnectionState,
): boolean {
  return connectionState === 'connected';
}
