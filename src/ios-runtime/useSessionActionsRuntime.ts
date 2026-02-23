import { useCallback, useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { ConnectionState, SessionEntry, SessionPatchInput } from '../openclaw';
import type { SessionPreference, SessionPreferences } from '../types';
import { errorMessage, sessionDisplayName } from '../utils';

type UseSessionActionsRuntimeInput = {
  connectionState: ConnectionState;
  isGatewayConnected: boolean;
  isSessionOperationPending: boolean;
  sessionRenameTargetKey: string | null;
  sessionRenameDraft: string;
  sessionPreferences: SessionPreferences;
  sessions: SessionEntry[];
  activeSessionKeyRef: MutableRefObject<string>;
  refreshSessions: () => Promise<unknown>;
  loadSessionHistory: (
    sessionKey: string,
    options?: {
      silentError?: boolean;
    },
  ) => Promise<boolean>;
  switchSession: (sessionKey: string) => Promise<void>;
  createAndSwitchSession: () => Promise<void>;
  gatewayPatchSession: (sessionKey: string, patch: SessionPatchInput) => Promise<void>;
  setSessionsError: Dispatch<SetStateAction<string | null>>;
  setIsSessionOperationPending: Dispatch<SetStateAction<boolean>>;
  setSessionPreferences: Dispatch<SetStateAction<SessionPreferences>>;
  setIsSessionRenameOpen: Dispatch<SetStateAction<boolean>>;
  setSessionRenameTargetKey: Dispatch<SetStateAction<string | null>>;
  setSessionRenameDraft: Dispatch<SetStateAction<string>>;
};

export function useSessionActionsRuntime(input: UseSessionActionsRuntimeInput) {
  const {
    connectionState,
    isGatewayConnected,
    isSessionOperationPending,
    sessionRenameTargetKey,
    sessionRenameDraft,
    sessionPreferences,
    sessions,
    activeSessionKeyRef,
    refreshSessions,
    loadSessionHistory,
    switchSession,
    createAndSwitchSession,
    gatewayPatchSession,
    setSessionsError,
    setIsSessionOperationPending,
    setSessionPreferences,
    setIsSessionRenameOpen,
    setSessionRenameTargetKey,
    setSessionRenameDraft,
  } = input;

  const isSessionPinned = useCallback(
    (sessionKey: string) => sessionPreferences[sessionKey]?.pinned === true,
    [sessionPreferences],
  );

  const getSessionTitle = useCallback(
    (session: SessionEntry) => {
      const alias = sessionPreferences[session.key]?.alias?.trim();
      if (alias) return alias;
      return sessionDisplayName(session);
    },
    [sessionPreferences],
  );

  const startSessionRename = useCallback(
    (sessionKey: string) => {
      const targetKey = sessionKey.trim();
      if (!targetKey) return;
      const currentAlias = sessionPreferences[targetKey]?.alias?.trim();
      const baseSession =
        sessions.find((session) => session.key === targetKey) ??
        ({ key: targetKey, displayName: targetKey } as SessionEntry);

      setSessionRenameTargetKey(targetKey);
      setSessionRenameDraft(currentAlias || sessionDisplayName(baseSession));
      setIsSessionRenameOpen(true);
    },
    [sessionPreferences, sessions, setSessionRenameTargetKey, setSessionRenameDraft, setIsSessionRenameOpen],
  );

  const submitSessionRename = useCallback(async () => {
    const sessionKey = (sessionRenameTargetKey ?? '').trim();
    if (!sessionKey || isSessionOperationPending) return;

    const alias = sessionRenameDraft.trim();
    setSessionsError(null);
    setIsSessionOperationPending(true);
    try {
      if (connectionState === 'connected') {
        try {
          await gatewayPatchSession(sessionKey, {
            label: alias || undefined,
            displayName: alias || undefined,
          });
        } catch (err) {
          setSessionsError(`Session rename synced locally only: ${errorMessage(err)}`);
        }
      }

      setSessionPreferences((previous) => {
        const current = previous[sessionKey] ?? {};
        const next: SessionPreference = {
          ...current,
          alias: alias || undefined,
        };
        if (!next.alias && !next.pinned) {
          if (!(sessionKey in previous)) return previous;
          const { [sessionKey]: _removed, ...rest } = previous;
          return rest;
        }
        return { ...previous, [sessionKey]: next };
      });

      setIsSessionRenameOpen(false);
      setSessionRenameTargetKey(null);
      setSessionRenameDraft('');
      void refreshSessions();
    } finally {
      setIsSessionOperationPending(false);
    }
  }, [
    sessionRenameTargetKey,
    isSessionOperationPending,
    sessionRenameDraft,
    setSessionsError,
    setIsSessionOperationPending,
    connectionState,
    gatewayPatchSession,
    setSessionPreferences,
    setIsSessionRenameOpen,
    setSessionRenameTargetKey,
    setSessionRenameDraft,
    refreshSessions,
  ]);

  const toggleSessionPinned = useCallback(
    (sessionKey: string) => {
      const targetKey = sessionKey.trim();
      if (!targetKey || isSessionOperationPending) return;
      setSessionPreferences((previous) => {
        const current = previous[targetKey] ?? {};
        const next: SessionPreference = {
          ...current,
          pinned: !current.pinned,
        };
        if (!next.alias && !next.pinned) {
          if (!(targetKey in previous)) return previous;
          const { [targetKey]: _removed, ...rest } = previous;
          return rest;
        }
        return { ...previous, [targetKey]: next };
      });
    },
    [isSessionOperationPending, setSessionPreferences],
  );

  const switchSessionAction = useCallback(
    (sessionKey: string) => switchSession(sessionKey),
    [switchSession],
  );

  const createAndSwitchSessionAction = useCallback(
    () => createAndSwitchSession(),
    [createAndSwitchSession],
  );

  useEffect(() => {
    if (!isGatewayConnected) return;
    void refreshSessions();
    void loadSessionHistory(activeSessionKeyRef.current);
  }, [activeSessionKeyRef, isGatewayConnected, loadSessionHistory, refreshSessions]);

  return {
    isSessionPinned,
    getSessionTitle,
    startSessionRename,
    submitSessionRename,
    toggleSessionPinned,
    switchSession: switchSessionAction,
    createAndSwitchSession: createAndSwitchSessionAction,
  };
}
