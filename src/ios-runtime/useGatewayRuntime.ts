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

  const setConnectionState = useCallback((value: ConnectionState) => {
    dispatch({ type: 'SET_CONNECTION_STATE', value });
  }, []);

  const setGatewayEventState = useCallback((value: string) => {
    dispatch({ type: 'SET_GATEWAY_EVENT_STATE', value });
  }, []);

  const setIsSending = useCallback((value: boolean) => {
    dispatch({ type: 'SET_IS_SENDING', value });
  }, []);

  const setIsSessionHistoryLoading = useCallback((value: boolean) => {
    dispatch({ type: 'SET_IS_SESSION_HISTORY_LOADING', value });
  }, []);

  const setIsMissingResponseRecoveryInFlight = useCallback((value: boolean) => {
    dispatch({ type: 'SET_IS_MISSING_RESPONSE_RECOVERY_IN_FLIGHT', value });
  }, []);

  const runAction = useCallback((action: GatewayRuntimeAction) => {
    dispatch(action);
  }, []);

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
