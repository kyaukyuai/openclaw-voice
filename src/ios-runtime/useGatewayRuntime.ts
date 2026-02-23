import { useCallback, useReducer, useState } from 'react';
import type { ConnectionState } from '../openclaw';
import {
  gatewayRuntimeReducer,
  initialGatewayRuntimeState,
  type GatewayRuntimeAction,
  type GatewayRuntimeState,
} from './runtime-state';

type UseGatewayRuntimeInput = {
  enableV2?: boolean;
};

function applyGatewayLegacyRuntimeAction(
  state: GatewayRuntimeState,
  action: GatewayRuntimeAction,
): GatewayRuntimeState {
  switch (action.type) {
    case 'SET_CONNECTION_STATE':
      return { ...state, connectionState: action.value };
    case 'SET_GATEWAY_EVENT_STATE':
      return { ...state, gatewayEventState: action.value };
    case 'SET_IS_SENDING':
      return { ...state, isSending: action.value };
    case 'SET_IS_SESSION_HISTORY_LOADING':
      return { ...state, isSessionHistoryLoading: action.value };
    case 'SET_IS_MISSING_RESPONSE_RECOVERY_IN_FLIGHT':
      return { ...state, isMissingResponseRecoveryInFlight: action.value };
    case 'CONNECT_REQUEST':
      return { ...state, connectionState: 'connecting' };
    case 'CONNECT_SUCCESS':
      return { ...state, connectionState: 'connected' };
    case 'CONNECT_FAILED':
      return {
        ...state,
        connectionState: 'disconnected',
        isSending: false,
        isSessionHistoryLoading: false,
        isMissingResponseRecoveryInFlight: false,
        gatewayEventState: 'idle',
      };
    case 'SEND_REQUEST':
      return {
        ...state,
        isSending: true,
        gatewayEventState: 'sending',
      };
    case 'SEND_STREAMING':
      return {
        ...state,
        isSending: true,
        gatewayEventState: action.value ?? 'streaming',
      };
    case 'SEND_COMPLETE':
      return {
        ...state,
        isSending: false,
        gatewayEventState: 'complete',
      };
    case 'SEND_ERROR':
      return {
        ...state,
        isSending: false,
        gatewayEventState: 'error',
      };
    case 'SYNC_REQUEST':
      return { ...state, isSessionHistoryLoading: true };
    case 'SYNC_SUCCESS':
    case 'SYNC_TIMEOUT':
    case 'SYNC_ERROR':
      return { ...state, isSessionHistoryLoading: false };
    case 'MISSING_RECOVERY_REQUEST':
      return { ...state, isMissingResponseRecoveryInFlight: true };
    case 'MISSING_RECOVERY_DONE':
      return { ...state, isMissingResponseRecoveryInFlight: false };
    case 'RESET_RUNTIME':
      return { ...initialGatewayRuntimeState };
    default:
      return state;
  }
}

export function useGatewayRuntime(input?: UseGatewayRuntimeInput) {
  const enableV2 = input?.enableV2 ?? true;
  const [state, dispatch] = useReducer(
    gatewayRuntimeReducer,
    initialGatewayRuntimeState,
  );
  const [legacyState, setLegacyState] = useState<GatewayRuntimeState>(
    initialGatewayRuntimeState,
  );

  const runAction = useCallback(
    (action: GatewayRuntimeAction) => {
      if (enableV2) {
        dispatch(action);
        return;
      }
      setLegacyState((previous) =>
        applyGatewayLegacyRuntimeAction(previous, action),
      );
    },
    [enableV2],
  );

  const setConnectionState = useCallback((value: ConnectionState) => {
    runAction({ type: 'SET_CONNECTION_STATE', value });
  }, [runAction]);

  const setGatewayEventState = useCallback((value: string) => {
    runAction({ type: 'SET_GATEWAY_EVENT_STATE', value });
  }, [runAction]);

  const setIsSending = useCallback((value: boolean) => {
    runAction({ type: 'SET_IS_SENDING', value });
  }, [runAction]);

  const setIsSessionHistoryLoading = useCallback((value: boolean) => {
    runAction({ type: 'SET_IS_SESSION_HISTORY_LOADING', value });
  }, [runAction]);

  const setIsMissingResponseRecoveryInFlight = useCallback((value: boolean) => {
    runAction({ type: 'SET_IS_MISSING_RESPONSE_RECOVERY_IN_FLIGHT', value });
  }, [runAction]);

  return {
    state: enableV2 ? state : legacyState,
    runAction,
    setConnectionState,
    setGatewayEventState,
    setIsSending,
    setIsSessionHistoryLoading,
    setIsMissingResponseRecoveryInFlight,
    isV2Enabled: enableV2,
  };
}
