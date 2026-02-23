const initialGatewayContextRuntimeState = {
  connectionState: 'disconnected',
  error: null,
  healthState: 'unknown',
  healthCheckedAt: null,
  connectDiagnostic: null,
  sessions: [],
  isSessionsLoading: false,
  sessionsError: null,
};

function gatewayContextRuntimeReducer(state, action) {
  switch (action.type) {
    case 'CONNECT_REQUEST':
      return {
        ...state,
        connectionState: 'connecting',
        error: null,
        connectDiagnostic: null,
      };
    case 'CONNECT_SUCCESS':
      return {
        ...state,
        connectionState: 'connected',
        error: null,
        healthState: 'unknown',
        connectDiagnostic: null,
      };
    case 'CONNECT_FAILED':
      return {
        ...state,
        connectionState: 'disconnected',
        error: action.message,
        connectDiagnostic: action.diagnostic,
      };
    case 'SET_CONNECT_DIAGNOSTIC':
      return {
        ...state,
        connectDiagnostic: action.diagnostic,
      };
    case 'CONNECTION_STATE_CHANGED':
      return {
        ...state,
        connectionState: action.value,
      };
    case 'DISCONNECT':
      return {
        ...initialGatewayContextRuntimeState,
      };
    case 'HEALTH_RESET':
      return {
        ...state,
        healthState: 'unknown',
      };
    case 'HEALTH_CHECK_START':
      return {
        ...state,
        healthState: 'checking',
      };
    case 'HEALTH_CHECK_RESULT':
      return {
        ...state,
        healthState: action.healthy ? 'ok' : 'degraded',
        healthCheckedAt: action.checkedAt,
      };
    case 'SESSIONS_NOT_CONNECTED':
      return {
        ...state,
        sessionsError: 'Not connected',
        isSessionsLoading: false,
      };
    case 'SESSIONS_REFRESH_START':
      return {
        ...state,
        isSessionsLoading: true,
        sessionsError: null,
      };
    case 'SESSIONS_REFRESH_SUCCESS':
      return {
        ...state,
        sessions: action.sessions,
        isSessionsLoading: false,
        sessionsError: null,
      };
    case 'SESSIONS_REFRESH_FAILED':
      return {
        ...state,
        isSessionsLoading: false,
        sessionsError: action.message,
      };
    default:
      return state;
  }
}

module.exports = {
  initialGatewayContextRuntimeState,
  gatewayContextRuntimeReducer,
};
