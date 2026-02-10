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
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  GatewayClient,
  type ConnectionState,
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
  connect: (url: string, token?: string) => Promise<void>;
  disconnect: () => void;
  checkHealth: () => Promise<void>;
  refreshSessions: () => Promise<void>;
  getClient: () => GatewayClient | null;
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
  // Connection state
  const [connectionState, setConnectionState] =
    useState<ConnectionState>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const [eventState, setEventState] = useState('idle');
  const [healthState, setHealthState] = useState<GatewayHealthState>('unknown');
  const [healthCheckedAt, setHealthCheckedAt] = useState<number | null>(null);
  const [connectDiagnostic, setConnectDiagnostic] =
    useState<GatewayConnectDiagnostic | null>(null);

  // Sessions state
  const [sessions, setSessions] = useState<SessionEntry[]>([]);
  const [isSessionsLoading, setIsSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);

  // Refs
  const clientRef = useRef<GatewayClient | null>(null);
  const healthCheckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const healthCheckInFlightRef = useRef(false);
  const connectionStateRef = useRef<ConnectionState>(connectionState);
  const subscriptionsRef = useRef<Array<() => void>>([]);

  // Keep ref in sync
  useEffect(() => {
    connectionStateRef.current = connectionState;
  }, [connectionState]);

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
  const checkHealth = useCallback(async () => {
    if (healthCheckInFlightRef.current) return;
    if (connectionStateRef.current !== 'connected') return;

    const client = clientRef.current;
    if (!client) return;

    healthCheckInFlightRef.current = true;
    setHealthState('checking');

    try {
      const isHealthy = await client.health(GATEWAY_HEALTH_CHECK_TIMEOUT_MS);
      setHealthState(isHealthy ? 'ok' : 'degraded');
      setHealthCheckedAt(Date.now());
    } catch {
      setHealthState('degraded');
    } finally {
      healthCheckInFlightRef.current = false;
    }
  }, []);

  // Start health check interval
  const startHealthCheckInterval = useCallback(() => {
    if (healthCheckIntervalRef.current) {
      clearInterval(healthCheckIntervalRef.current);
    }
    healthCheckIntervalRef.current = setInterval(() => {
      void checkHealth();
    }, GATEWAY_HEALTH_CHECK_INTERVAL_MS);
  }, [checkHealth]);

  // Connect to gateway
  const connect = useCallback(
    async (url: string, token?: string) => {
      // Disconnect existing client
      if (clientRef.current) {
        subscriptionsRef.current.forEach((unsub) => unsub());
        subscriptionsRef.current = [];
        clientRef.current.disconnect();
        clientRef.current = null;
      }

      setConnectionState('connecting');
      setError(null);
      setConnectDiagnostic(null);

      try {
        const client = new GatewayClient(url, {
          clientId: REQUESTED_GATEWAY_CLIENT_ID,
          platform: GATEWAY_PLATFORM,
          ...(token ? { token } : {}),
        });

        clientRef.current = client;

        // Subscribe to connection state changes
        const unsubConnection = client.onConnectionStateChange((state) => {
          setConnectionState(state);
          if (state === 'connected') {
            setError(null);
            setHealthState('unknown');
            startHealthCheckInterval();
          } else if (state === 'disconnected') {
            if (healthCheckIntervalRef.current) {
              clearInterval(healthCheckIntervalRef.current);
              healthCheckIntervalRef.current = null;
            }
          }
        });
        subscriptionsRef.current.push(unsubConnection);

        // Connect
        await client.connect();
        setConnectionState('connected');
      } catch (err) {
        const message = errorMessage(err);
        setError(message);
        setConnectionState('disconnected');

        const diagnostic = classifyGatewayConnectFailure({
          error: err,
          hasToken: Boolean(token),
        });
        setConnectDiagnostic(diagnostic);

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

    setConnectionState('disconnected');
    setError(null);
    setHealthState('unknown');
    setConnectDiagnostic(null);
  }, []);

  // Refresh sessions
  const refreshSessions = useCallback(async () => {
    const client = clientRef.current;
    if (!client || connectionStateRef.current !== 'connected') {
      setSessionsError('Not connected');
      return;
    }

    setIsSessionsLoading(true);
    setSessionsError(null);

    try {
      const result = await client.sessionsList();
      setSessions(result.sessions ?? []);
    } catch (err) {
      const message = errorMessage(err);
      setSessionsError(message);
    } finally {
      setIsSessionsLoading(false);
    }
  }, []);

  // Get client ref
  const getClient = useCallback(() => clientRef.current, []);

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
      checkHealth,
      refreshSessions,
      getClient,
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
      checkHealth,
      refreshSessions,
      getClient,
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
