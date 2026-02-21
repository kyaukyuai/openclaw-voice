import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { Keyboard } from 'react-native';
import type { ChatHistoryPayload, ConnectionState, SessionEntry } from '../openclaw';
import { mergeHistoryTurnsWithPendingLocal } from '../ui/runtime-logic';
import { HISTORY_REFRESH_TIMEOUT_MS, createSessionKey } from '../utils';
import { errorMessage } from '../utils';
import type { ChatTurn, FocusField, OutboxQueueItem } from '../types';

type RunHistoryRefresh = (input: {
  sessionKey: string;
  timeoutMs: number;
  run: () => Promise<boolean>;
  onStart?: () => void;
  onFinish?: (ok: boolean) => void;
  onError?: (error: unknown) => void;
}) => Promise<boolean>;

type UseSessionHistoryRuntimeInput = {
  connectionState: ConnectionState;
  connectionStateRef: MutableRefObject<ConnectionState>;
  isSending: boolean;
  isSessionOperationPending: boolean;
  activeSessionKeyRef: MutableRefObject<string>;
  activeRunIdRef: MutableRefObject<string | null>;
  pendingTurnIdRef: MutableRefObject<string | null>;
  runIdToTurnIdRef: MutableRefObject<Map<string, string>>;
  sessionTurnsRef: MutableRefObject<Map<string, ChatTurn[]>>;
  outboxQueueRef: MutableRefObject<OutboxQueueItem[]>;
  gatewayRefreshSessions: (options?: {
    limit?: number;
    includeGlobal?: boolean;
  }) => Promise<SessionEntry[]>;
  gatewayChatHistory: (
    sessionKey: string,
    options?: { limit?: number },
  ) => Promise<ChatHistoryPayload>;
  runHistoryRefresh: RunHistoryRefresh;
  runGatewayRuntimeAction: (action: {
    type: 'SYNC_REQUEST' | 'SYNC_SUCCESS' | 'SYNC_ERROR';
  }) => void;
  invalidateRefreshEpoch: () => void;
  buildTurnsFromHistory: (messages: unknown[] | undefined, sessionKey: string) => ChatTurn[];
  setSessions: Dispatch<SetStateAction<SessionEntry[]>>;
  setSessionsError: Dispatch<SetStateAction<string | null>>;
  setGatewayError: Dispatch<SetStateAction<string | null>>;
  setChatTurns: Dispatch<SetStateAction<ChatTurn[]>>;
  setActiveSessionKey: Dispatch<SetStateAction<string>>;
  setFocusedField: Dispatch<SetStateAction<FocusField>>;
  setIsSessionRenameOpen: Dispatch<SetStateAction<boolean>>;
  setSessionRenameTargetKey: Dispatch<SetStateAction<string | null>>;
  setSessionRenameDraft: Dispatch<SetStateAction<string>>;
  setIsSending: (value: boolean) => void;
  setGatewayEventState: (value: string) => void;
  setHistoryLastSyncedAt: Dispatch<SetStateAction<number | null>>;
  setActiveRunId: Dispatch<SetStateAction<string | null>>;
};

export function useSessionHistoryRuntime(input: UseSessionHistoryRuntimeInput) {
  const applySessionTurns = useCallback(
    (sessionKey: string, turns: ChatTurn[]) => {
      input.sessionTurnsRef.current.set(sessionKey, turns);
      if (input.activeSessionKeyRef.current === sessionKey) {
        input.setChatTurns(turns);
      }
    },
    [input],
  );

  const refreshSessions = useCallback(async () => {
    if (input.connectionState !== 'connected') {
      input.setSessions([]);
      input.setSessionsError(null);
      return;
    }

    input.setSessionsError(null);
    try {
      await input.gatewayRefreshSessions({ limit: 40, includeGlobal: true });
    } catch (err) {
      input.setSessionsError(`Sessions unavailable: ${errorMessage(err)}`);
    }
  }, [input]);

  const loadSessionHistory = useCallback(
    async (
      sessionKey: string,
      options?: {
        silentError?: boolean;
      },
    ): Promise<boolean> => {
      if (input.connectionState !== 'connected') {
        applySessionTurns(
          sessionKey,
          input.sessionTurnsRef.current.get(sessionKey) ?? [],
        );
        return false;
      }

      const synced = await input.runHistoryRefresh({
        sessionKey,
        timeoutMs: HISTORY_REFRESH_TIMEOUT_MS,
        onStart: () => {
          input.runGatewayRuntimeAction({ type: 'SYNC_REQUEST' });
        },
        onError: (err) => {
          if (!options?.silentError) {
            input.setGatewayError(`Failed to load session history: ${errorMessage(err)}`);
          }
        },
        onFinish: (ok) => {
          input.runGatewayRuntimeAction({
            type: ok ? 'SYNC_SUCCESS' : 'SYNC_ERROR',
          });
        },
        run: async () => {
          const response = await input.gatewayChatHistory(sessionKey, { limit: 80 });
          const turns = input.buildTurnsFromHistory(response.messages, sessionKey);
          const localTurns = input.sessionTurnsRef.current.get(sessionKey) ?? [];
          const queuedTurnIds = new Set(
            input.outboxQueueRef.current
              .filter((item) => item.sessionKey === sessionKey)
              .map((item) => item.turnId),
          );
          const mergedTurns = mergeHistoryTurnsWithPendingLocal(
            turns,
            localTurns,
            queuedTurnIds,
          );
          applySessionTurns(sessionKey, mergedTurns);
          if (input.activeSessionKeyRef.current === sessionKey) {
            input.setHistoryLastSyncedAt(Date.now());
          }
          return true;
        },
      });

      if (!synced) {
        applySessionTurns(
          sessionKey,
          input.sessionTurnsRef.current.get(sessionKey) ?? [],
        );
        if (!options?.silentError && input.connectionStateRef.current === 'connected') {
          input.setGatewayError((previous) =>
            previous || 'Refresh failed: request timed out. Please retry.',
          );
        }
      }
      return synced;
    },
    [applySessionTurns, input],
  );

  const switchSession = useCallback(
    async (sessionKey: string) => {
      const nextKey = sessionKey.trim();
      if (!nextKey || nextKey === input.activeSessionKeyRef.current) return;
      if (input.isSending || input.isSessionOperationPending) return;

      Keyboard.dismiss();
      input.setFocusedField(null);
      input.setGatewayError(null);
      input.setSessionsError(null);
      input.setIsSessionRenameOpen(false);
      input.setSessionRenameTargetKey(null);
      input.setSessionRenameDraft('');
      input.setIsSending(false);
      input.setGatewayEventState('idle');
      input.activeRunIdRef.current = null;
      input.setActiveRunId(null);
      input.pendingTurnIdRef.current = null;
      input.runIdToTurnIdRef.current.clear();

      const cached = input.sessionTurnsRef.current.get(nextKey) ?? [];
      input.setChatTurns(cached);
      input.setActiveSessionKey(nextKey);
      input.activeSessionKeyRef.current = nextKey;

      input.invalidateRefreshEpoch();
      await loadSessionHistory(nextKey);
      void refreshSessions();
    },
    [input, loadSessionHistory, refreshSessions],
  );

  const createAndSwitchSession = useCallback(async () => {
    if (input.isSending || input.isSessionOperationPending) return;
    const nextKey = createSessionKey();
    input.sessionTurnsRef.current.set(nextKey, []);
    input.setSessions((previous) => [{ key: nextKey, displayName: nextKey }, ...previous]);
    await switchSession(nextKey);
  }, [input, switchSession]);

  return {
    applySessionTurns,
    refreshSessions,
    loadSessionHistory,
    switchSession,
    createAndSwitchSession,
  };
}
