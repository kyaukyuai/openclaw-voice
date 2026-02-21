import type { ConnectionState } from '../openclaw';

export type GatewayRuntimeState = {
  connectionState: ConnectionState;
  gatewayEventState: string;
  isSending: boolean;
  isSessionHistoryLoading: boolean;
  isMissingResponseRecoveryInFlight: boolean;
};

export type GatewayRuntimeAction =
  | { type: 'SET_CONNECTION_STATE'; value: ConnectionState }
  | { type: 'SET_GATEWAY_EVENT_STATE'; value: string }
  | { type: 'SET_IS_SENDING'; value: boolean }
  | { type: 'SET_IS_SESSION_HISTORY_LOADING'; value: boolean }
  | { type: 'SET_IS_MISSING_RESPONSE_RECOVERY_IN_FLIGHT'; value: boolean }
  | { type: 'CONNECT_REQUEST' }
  | { type: 'CONNECT_SUCCESS' }
  | { type: 'CONNECT_FAILED' }
  | { type: 'SEND_REQUEST' }
  | { type: 'SEND_STREAMING'; value?: string }
  | { type: 'SEND_COMPLETE' }
  | { type: 'SEND_ERROR' }
  | { type: 'SYNC_REQUEST' }
  | { type: 'SYNC_SUCCESS' }
  | { type: 'SYNC_TIMEOUT' }
  | { type: 'SYNC_ERROR' }
  | { type: 'MISSING_RECOVERY_REQUEST' }
  | { type: 'MISSING_RECOVERY_DONE' }
  | { type: 'RESET_RUNTIME' };

export const initialGatewayRuntimeState: GatewayRuntimeState = {
  connectionState: 'disconnected',
  gatewayEventState: 'idle',
  isSending: false,
  isSessionHistoryLoading: false,
  isMissingResponseRecoveryInFlight: false,
};

export function gatewayRuntimeReducer(
  state: GatewayRuntimeState,
  action: GatewayRuntimeAction,
): GatewayRuntimeState {
  switch (action.type) {
    case 'SET_CONNECTION_STATE':
      return {
        ...state,
        connectionState: action.value,
      };
    case 'SET_GATEWAY_EVENT_STATE':
      return {
        ...state,
        gatewayEventState: action.value,
      };
    case 'SET_IS_SENDING':
      return {
        ...state,
        isSending: action.value,
      };
    case 'SET_IS_SESSION_HISTORY_LOADING':
      return {
        ...state,
        isSessionHistoryLoading: action.value,
      };
    case 'SET_IS_MISSING_RESPONSE_RECOVERY_IN_FLIGHT':
      return {
        ...state,
        isMissingResponseRecoveryInFlight: action.value,
      };
    case 'CONNECT_REQUEST':
      return {
        ...state,
        connectionState: 'connecting',
      };
    case 'CONNECT_SUCCESS':
      return {
        ...state,
        connectionState: 'connected',
      };
    case 'CONNECT_FAILED':
      return {
        ...state,
        connectionState: 'disconnected',
        isSending: false,
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
      return {
        ...state,
        isSessionHistoryLoading: true,
      };
    case 'SYNC_SUCCESS':
    case 'SYNC_TIMEOUT':
    case 'SYNC_ERROR':
      return {
        ...state,
        isSessionHistoryLoading: false,
      };
    case 'MISSING_RECOVERY_REQUEST':
      return {
        ...state,
        isMissingResponseRecoveryInFlight: true,
      };
    case 'MISSING_RECOVERY_DONE':
      return {
        ...state,
        isMissingResponseRecoveryInFlight: false,
      };
    case 'RESET_RUNTIME':
      return {
        ...initialGatewayRuntimeState,
      };
    default:
      return state;
  }
}
