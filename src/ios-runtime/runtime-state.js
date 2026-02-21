const initialGatewayRuntimeState = {
  connectionState: 'disconnected',
  gatewayEventState: 'idle',
  isSending: false,
  isSessionHistoryLoading: false,
  isMissingResponseRecoveryInFlight: false,
};

function gatewayRuntimeReducer(state, action) {
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
      return {
        ...state,
        isMissingResponseRecoveryInFlight: action.value,
      };
    case 'CONNECT_REQUEST':
      return { ...state, connectionState: 'connecting' };
    case 'CONNECT_SUCCESS':
      return { ...state, connectionState: 'connected' };
    case 'CONNECT_FAILED':
      return { ...state, connectionState: 'disconnected', isSending: false };
    case 'SEND_REQUEST':
      return { ...state, isSending: true, gatewayEventState: 'sending' };
    case 'SEND_STREAMING':
      return {
        ...state,
        isSending: true,
        gatewayEventState: action.value || 'streaming',
      };
    case 'SEND_COMPLETE':
      return { ...state, isSending: false, gatewayEventState: 'complete' };
    case 'SEND_ERROR':
      return { ...state, isSending: false, gatewayEventState: 'error' };
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

module.exports = {
  initialGatewayRuntimeState,
  gatewayRuntimeReducer,
};
