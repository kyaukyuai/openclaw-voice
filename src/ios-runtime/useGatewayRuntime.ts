import { useCallback, useReducer, useState } from 'react';
import type { ConnectionState } from '../openclaw';
import {
  gatewayRuntimeReducer,
  initialGatewayRuntimeState,
  type GatewayRuntimeAction,
  type GatewayRuntimeState,
} from './runtime-state';
import { applyGatewayRuntimeActionByMode } from './gateway-runtime-mode-logic';

type UseGatewayRuntimeInput = {
  enableV2?: boolean;
};

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
        applyGatewayRuntimeActionByMode(previous, action, { enableV2: false }),
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
