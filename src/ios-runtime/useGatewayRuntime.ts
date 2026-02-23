import { useCallback, useReducer } from 'react';
import type { ConnectionState } from '../openclaw';
import {
  gatewayRuntimeReducer,
  initialGatewayRuntimeState,
  type GatewayRuntimeAction,
} from './runtime-state';
export function useGatewayRuntime() {
  const [state, dispatch] = useReducer(
    gatewayRuntimeReducer,
    initialGatewayRuntimeState,
  );
  const runAction = useCallback((action: GatewayRuntimeAction) => {
    dispatch(action);
  }, []);

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
    state,
    runAction,
    setConnectionState,
    setGatewayEventState,
    setIsSending,
    setIsSessionHistoryLoading,
    setIsMissingResponseRecoveryInFlight,
  };
}
