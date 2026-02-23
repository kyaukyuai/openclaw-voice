/**
 * Gateway Context for OpenClaw Voice
 *
 * Manages WebSocket connection to the Gateway server.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react';
import {
  type ChatAttachmentPayload,
  GatewayClient,
  type GatewayClientOptions,
  type ChatEventPayload,
  type ChatHistoryPayload,
  type ChatSendResponse,
  type ConnectionState,
  type SessionPatchInput,
  type SessionEntry,
} from '../openclaw';
import type { GatewayConnectDiagnostic, GatewayHealthState } from '../types';
import {
  GATEWAY_HEALTH_CHECK_INTERVAL_MS,
  GATEWAY_HEALTH_CHECK_TIMEOUT_MS,
  GATEWAY_PLATFORM,
  REQUESTED_GATEWAY_CLIENT_ID,
} from '../utils';
import { classifyGatewayConnectFailure, errorMessage } from '../utils';
import {
  gatewayContextRuntimeReducer,
  initialGatewayContextRuntimeState,
} from './gateway-runtime-state';

// ============================================================================
// Types
// ============================================================================

type GatewayState = {
  connectionState: ConnectionState;
  error: string | null;
  eventState: string;
  healthState: GatewayHealthState;
  healthCheckedAt: number | null;
  connectDiagnostic: GatewayConnectDiagnostic | null;
  sessions: SessionEntry[];
  isSessionsLoading: boolean;
  sessionsError: string | null;
};

type GatewayActions = {
  connect: (url: string, options?: GatewayClientOptions) => Promise<void>;
  disconnect: () => void;
  setConnectDiagnostic: (
    diagnostic: GatewayConnectDiagnostic | null,
  ) => void;
  checkHealth: (options?: {
    silent?: boolean;
    timeoutMs?: number;
  }) => Promise<boolean>;
  refreshSessions: (options?: {
    limit?: number;
    includeGlobal?: boolean;
  }) => Promise<SessionEntry[]>;
  chatHistory: (
    sessionKey: string,
    options?: { limit?: number },
  ) => Promise<ChatHistoryPayload>;
  chatSend: (
    sessionKey: string,
    message: string,
    options?: {
      thinking?: string;
      attachments?: ChatAttachmentPayload[];
      idempotencyKey?: string;
      timeoutMs?: number;
    },
  ) => Promise<ChatSendResponse>;
  patchSession: (sessionKey: string, patch: SessionPatchInput) => Promise<void>;
  subscribeChatEvent: (callback: (payload: ChatEventPayload) => void) => () => void;
  subscribeEvent: (
    eventName: string,
    callback: (payload: unknown) => void,
  ) => () => void;
};

type GatewayContextValue = GatewayState & GatewayActions;

// ============================================================================
// Context
// ============================================================================

const GatewayContext = createContext<GatewayContextValue | undefined>(
  undefined,
);

// ============================================================================
// Provider
// ============================================================================

type GatewayProviderProps = {
  children: ReactNode;
};

export function GatewayProvider({ children }: GatewayProviderProps) {
  const [runtimeState, dispatchRuntimeState] = useReducer(
    gatewayContextRuntimeReducer,
    initialGatewayContextRuntimeState,
  );
  const {
    connectionState,
    error,
    healthState,
    healthCheckedAt,
    connectDiagnostic,
    sessions,
    isSessionsLoading,
    sessionsError,
  } = runtimeState;

  const eventState = 'idle';

  // Refs
  const clientRef = useRef<GatewayClient | null>(null);
  const healthCheckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const healthCheckInFlightRef = useRef(false);
  const healthStateRef = useRef<GatewayHealthState>('unknown');
  const connectionStateRef = useRef<ConnectionState>(connectionState);
  const subscriptionsRef = useRef<Array<() => void>>([]);

  // Keep ref in sync
  useEffect(() => {
    connectionStateRef.current = connectionState;
  }, [connectionState]);

  useEffect(() => {
    healthStateRef.current = healthState;
  }, [healthState]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (healthCheckIntervalRef.current) {
        clearInterval(healthCheckIntervalRef.current);
      }
      subscriptionsRef.current.forEach((unsub) => unsub());
      if (clientRef.current) {
        clientRef.current.disconnect();
      }
    };
  }, []);

  // Health check
  const checkHealth = useCallback(
    async (options?: { silent?: boolean; timeoutMs?: number }) => {
      if (healthCheckInFlightRef.current) {
        return healthStateRef.current !== 'degraded';
      }
      if (connectionStateRef.current !== 'connected') {
        dispatchRuntimeState({ type: 'HEALTH_RESET' });
        return false;
      }

      const client = clientRef.current;
      if (!client) return false;

      healthCheckInFlightRef.current = true;
      if (!options?.silent) {
        dispatchRuntimeState({ type: 'HEALTH_CHECK_START' });
      }

      try {
        const isHealthy = await client.health(
          options?.timeoutMs ?? GATEWAY_HEALTH_CHECK_TIMEOUT_MS,
        );
        dispatchRuntimeState({
          type: 'HEALTH_CHECK_RESULT',
          healthy: isHealthy,
          checkedAt: Date.now(),
        });
        return isHealthy;
      } catch {
        dispatchRuntimeState({
          type: 'HEALTH_CHECK_RESULT',
          healthy: false,
          checkedAt: Date.now(),
        });
        return false;
      } finally {
        healthCheckInFlightRef.current = false;
      }
    },
    [],
  );

  // Start health check interval
  const startHealthCheckInterval = useCallback(() => {
    if (healthCheckIntervalRef.current) {
      clearInterval(healthCheckIntervalRef.current);
    }
    healthCheckIntervalRef.current = setInterval(() => {
      void checkHealth({ silent: true });
    }, GATEWAY_HEALTH_CHECK_INTERVAL_MS);
  }, [checkHealth]);

  // Connect to gateway
  const connect = useCallback(
    async (url: string, options?: GatewayClientOptions) => {
      // Disconnect existing client
      if (clientRef.current) {
        subscriptionsRef.current.forEach((unsub) => unsub());
        subscriptionsRef.current = [];
        clientRef.current.disconnect();
        clientRef.current = null;
      }

      dispatchRuntimeState({ type: 'CONNECT_REQUEST' });

      try {
        const client = new GatewayClient(url, {
          autoReconnect: true,
          clientId: REQUESTED_GATEWAY_CLIENT_ID,
          platform: GATEWAY_PLATFORM,
          ...(options ?? {}),
        });

        clientRef.current = client;

        // Subscribe to connection state changes
        const unsubConnection = client.onConnectionStateChange((state) => {
          if (state === 'connected') {
            dispatchRuntimeState({ type: 'CONNECT_SUCCESS' });
            startHealthCheckInterval();
          } else {
            dispatchRuntimeState({
              type: 'CONNECTION_STATE_CHANGED',
              value: state,
            });
          }

          if (state === 'disconnected') {
            if (healthCheckIntervalRef.current) {
              clearInterval(healthCheckIntervalRef.current);
              healthCheckIntervalRef.current = null;
            }
          }
        });
        subscriptionsRef.current.push(unsubConnection);

        // Connect
        await client.connect();
        dispatchRuntimeState({ type: 'CONNECT_SUCCESS' });
      } catch (err) {
        const message = errorMessage(err);

        const diagnostic = classifyGatewayConnectFailure({
          error: err,
          hasToken: Boolean(options?.token || options?.password),
        });
        dispatchRuntimeState({
          type: 'CONNECT_FAILED',
          message,
          diagnostic,
        });

        throw err;
      }
    },
    [startHealthCheckInterval],
  );

  // Disconnect
  const disconnect = useCallback(() => {
    if (healthCheckIntervalRef.current) {
      clearInterval(healthCheckIntervalRef.current);
      healthCheckIntervalRef.current = null;
    }

    subscriptionsRef.current.forEach((unsub) => unsub());
    subscriptionsRef.current = [];

    if (clientRef.current) {
      clientRef.current.disconnect();
      clientRef.current = null;
    }

    dispatchRuntimeState({ type: 'DISCONNECT' });
  }, []);

  const setConnectDiagnostic = useCallback(
    (diagnostic: GatewayConnectDiagnostic | null) => {
      dispatchRuntimeState({ type: 'SET_CONNECT_DIAGNOSTIC', diagnostic });
    },
    [],
  );

  // Refresh sessions
  const refreshSessions = useCallback(
    async (options?: { limit?: number; includeGlobal?: boolean }) => {
      const client = clientRef.current;
      if (!client || connectionStateRef.current !== 'connected') {
        dispatchRuntimeState({ type: 'SESSIONS_NOT_CONNECTED' });
        return [];
      }

      dispatchRuntimeState({ type: 'SESSIONS_REFRESH_START' });

      try {
        const result = await client.sessionsList({
          ...(typeof options?.limit === 'number' ? { limit: options.limit } : {}),
          ...(typeof options?.includeGlobal === 'boolean'
            ? { includeGlobal: options.includeGlobal }
            : {}),
        });
        const nextSessions = result.sessions ?? [];
        dispatchRuntimeState({
          type: 'SESSIONS_REFRESH_SUCCESS',
          sessions: nextSessions,
        });
        return nextSessions;
      } catch (err) {
        const message = errorMessage(err);
        dispatchRuntimeState({
          type: 'SESSIONS_REFRESH_FAILED',
          message,
        });
        throw err;
      }
    },
    [],
  );

  const requireConnectedClient = useCallback((action: string) => {
    const client = clientRef.current;
    if (!client || connectionStateRef.current !== 'connected') {
      throw new Error(`Gateway is not connected (${action}).`);
    }
    return client;
  }, []);

  const chatHistory = useCallback(
    async (sessionKey: string, options?: { limit?: number }) => {
      const client = requireConnectedClient('chat history');
      return client.chatHistory(sessionKey, options);
    },
    [requireConnectedClient],
  );

  const chatSend = useCallback(
    async (
      sessionKey: string,
      message: string,
      options?: {
        thinking?: string;
        attachments?: ChatAttachmentPayload[];
        idempotencyKey?: string;
        timeoutMs?: number;
      },
    ) => {
      const client = requireConnectedClient('chat send');
      return client.chatSend(sessionKey, message, options);
    },
    [requireConnectedClient],
  );

  const patchSession = useCallback(
    async (sessionKey: string, patch: SessionPatchInput) => {
      const client = requireConnectedClient('session patch');
      await client.sessionsPatch(sessionKey, patch);
    },
    [requireConnectedClient],
  );

  const subscribeChatEvent = useCallback(
    (callback: (payload: ChatEventPayload) => void) => {
      const client = requireConnectedClient('chat event subscribe');
      return client.onChatEvent(callback);
    },
    [requireConnectedClient],
  );

  const subscribeEvent = useCallback(
    (eventName: string, callback: (payload: unknown) => void) => {
      const client = requireConnectedClient(`event subscribe: ${eventName}`);
      client.on(eventName, callback);
      return () => {
        client.off(eventName, callback);
      };
    },
    [requireConnectedClient],
  );

  const value = useMemo<GatewayContextValue>(
    () => ({
      // State
      connectionState,
      error,
      eventState,
      healthState,
      healthCheckedAt,
      connectDiagnostic,
      sessions,
      isSessionsLoading,
      sessionsError,
      // Actions
      connect,
      disconnect,
      setConnectDiagnostic,
      checkHealth,
      refreshSessions,
      chatHistory,
      chatSend,
      patchSession,
      subscribeChatEvent,
      subscribeEvent,
    }),
    [
      connectionState,
      error,
      eventState,
      healthState,
      healthCheckedAt,
      connectDiagnostic,
      sessions,
      isSessionsLoading,
      sessionsError,
      connect,
      disconnect,
      setConnectDiagnostic,
      checkHealth,
      refreshSessions,
      chatHistory,
      chatSend,
      patchSession,
      subscribeChatEvent,
      subscribeEvent,
    ],
  );

  return (
    <GatewayContext.Provider value={value}>{children}</GatewayContext.Provider>
  );
}

// ============================================================================
// Hook
// ============================================================================

export function useGateway(): GatewayContextValue {
  const context = useContext(GatewayContext);
  if (context === undefined) {
    throw new Error('useGateway must be used within a GatewayProvider');
  }
  return context;
}

// ============================================================================
// Exports
// ============================================================================

export type { GatewayState, GatewayActions, GatewayContextValue };
