import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { ConnectionState, SessionEntry } from '../openclaw';
import type {
  ChatTurn,
  GatewayConnectDiagnostic,
  MissingResponseRecoveryNotice,
  OutboxQueueItem,
  SessionPreferences,
} from '../types';
import { BOTTOM_STATUS_COMPLETE_HOLD_MS } from '../utils';
import { isIncompleteAssistantContent, shouldAttemptFinalRecovery } from '../ui/runtime-logic';

type UseRuntimeUiEffectsInput = {
  shouldShowSettingsScreen: boolean;
  forceMaskAuthToken: () => void;
  missingResponseNotice: MissingResponseRecoveryNotice | null;
  activeSessionKey: string;
  chatTurns: ChatTurn[];
  clearMissingResponseRecoveryState: (sessionKey?: string) => void;
  isTurnWaitingState: (state: string) => boolean;
  transcript: string;
  transcriptRef: MutableRefObject<string>;
  interimTranscript: string;
  interimTranscriptRef: MutableRefObject<string>;
  activeSessionKeyRef: MutableRefObject<string>;
  historyAutoScrollRef: MutableRefObject<boolean>;
  setShowScrollToBottomButton: Dispatch<SetStateAction<boolean>>;
  gatewayUrl: string;
  gatewayUrlRef: MutableRefObject<string>;
  gatewayContextConnectDiagnostic: GatewayConnectDiagnostic | null;
  setGatewayConnectDiagnostic: Dispatch<
    SetStateAction<GatewayConnectDiagnostic | null>
  >;
  connectionState: ConnectionState;
  connectionStateRef: MutableRefObject<ConnectionState>;
  outboxQueue: OutboxQueueItem[];
  outboxQueueRef: MutableRefObject<OutboxQueueItem[]>;
  gatewaySessions: SessionEntry[];
  setSessions: Dispatch<SetStateAction<SessionEntry[]>>;
  gatewaySessionsError: string | null;
  setSessionsError: Dispatch<SetStateAction<string | null>>;
  gatewayEventState: string;
  gatewayEventStateRef: MutableRefObject<string>;
  isSending: boolean;
  setIsBottomCompletePulse: Dispatch<SetStateAction<boolean>>;
  clearBottomCompletePulseTimer: () => void;
  bottomCompletePulseTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  setGatewayEventState: (value: string) => void;
  sessionTurnsRef: MutableRefObject<Map<string, ChatTurn[]>>;
  scrollHistoryToBottom: (animated?: boolean) => void;
  isOnboardingCompleted: boolean;
  isOnboardingWaitingForResponse: boolean;
  setIsOnboardingCompleted: (next: boolean) => void;
  setIsOnboardingWaitingForResponse: Dispatch<SetStateAction<boolean>>;
  isGatewayConnected: boolean;
  setIsSessionPanelOpen: Dispatch<SetStateAction<boolean>>;
};

export function useRuntimeUiEffects(input: UseRuntimeUiEffectsInput) {
  useEffect(() => {
    if (!input.shouldShowSettingsScreen) {
      input.forceMaskAuthToken();
    }
  }, [input.forceMaskAuthToken, input.shouldShowSettingsScreen]);

  useEffect(() => {
    const notice = input.missingResponseNotice;
    if (!notice || notice.sessionKey !== input.activeSessionKey) return;
    const targetTurn = input.chatTurns.find((turn) => turn.id === notice.turnId);
    if (!targetTurn) {
      if (input.chatTurns.length > 0) {
        input.clearMissingResponseRecoveryState(notice.sessionKey);
      }
      return;
    }
    const stillIncomplete =
      input.isTurnWaitingState(targetTurn.state) ||
      shouldAttemptFinalRecovery(targetTurn.assistantText, targetTurn.assistantText);
    if (!stillIncomplete) {
      input.clearMissingResponseRecoveryState(notice.sessionKey);
    }
  }, [
    input.activeSessionKey,
    input.chatTurns,
    input.clearMissingResponseRecoveryState,
    input.isTurnWaitingState,
    input.missingResponseNotice,
  ]);

  useEffect(() => {
    input.transcriptRef.current = input.transcript;
  }, [input.transcript, input.transcriptRef]);

  useEffect(() => {
    input.interimTranscriptRef.current = input.interimTranscript;
  }, [input.interimTranscript, input.interimTranscriptRef]);

  useEffect(() => {
    input.activeSessionKeyRef.current = input.activeSessionKey;
  }, [input.activeSessionKey, input.activeSessionKeyRef]);

  useEffect(() => {
    input.historyAutoScrollRef.current = true;
    input.setShowScrollToBottomButton(false);
  }, [input.activeSessionKey, input.historyAutoScrollRef, input.setShowScrollToBottomButton]);

  useEffect(() => {
    input.gatewayUrlRef.current = input.gatewayUrl;
  }, [input.gatewayUrl, input.gatewayUrlRef]);

  useEffect(() => {
    if (input.gatewayContextConnectDiagnostic) {
      input.setGatewayConnectDiagnostic(input.gatewayContextConnectDiagnostic);
    }
  }, [input.gatewayContextConnectDiagnostic, input.setGatewayConnectDiagnostic]);

  useEffect(() => {
    input.connectionStateRef.current = input.connectionState;
  }, [input.connectionState, input.connectionStateRef]);

  useEffect(() => {
    input.outboxQueueRef.current = input.outboxQueue;
  }, [input.outboxQueue, input.outboxQueueRef]);

  useEffect(() => {
    if (input.connectionState !== 'connected') {
      input.setSessions([]);
      return;
    }
    const fetched = Array.isArray(input.gatewaySessions)
      ? input.gatewaySessions.filter(
          (session): session is SessionEntry =>
            typeof session?.key === 'string' && session.key.trim().length > 0,
        )
      : [];
    const activeKey = input.activeSessionKeyRef.current;
    const merged = [...fetched];
    if (!merged.some((session) => session.key === activeKey)) {
      merged.unshift({ key: activeKey, displayName: activeKey });
    }
    merged.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
    input.setSessions(merged);
  }, [
    input.connectionState,
    input.gatewaySessions,
    input.activeSessionKeyRef,
    input.setSessions,
  ]);

  useEffect(() => {
    if (!input.gatewaySessionsError) return;
    input.setSessionsError(
      (previous) => previous ?? `Sessions unavailable: ${input.gatewaySessionsError}`,
    );
  }, [input.gatewaySessionsError, input.setSessionsError]);

  useEffect(() => {
    input.gatewayEventStateRef.current = input.gatewayEventState;
  }, [input.gatewayEventState, input.gatewayEventStateRef]);

  useEffect(() => {
    const shouldHoldComplete =
      input.connectionState === 'connected' &&
      !input.isSending &&
      input.gatewayEventState === 'complete';

    if (!shouldHoldComplete) {
      input.setIsBottomCompletePulse(false);
      input.clearBottomCompletePulseTimer();
      return;
    }

    input.setIsBottomCompletePulse(true);
    input.clearBottomCompletePulseTimer();
    input.bottomCompletePulseTimerRef.current = setTimeout(() => {
      input.bottomCompletePulseTimerRef.current = null;
      input.setIsBottomCompletePulse(false);
      if (input.gatewayEventStateRef.current === 'complete') {
        input.setGatewayEventState('ready');
      }
    }, BOTTOM_STATUS_COMPLETE_HOLD_MS);

    return () => {
      input.clearBottomCompletePulseTimer();
    };
  }, [
    input.clearBottomCompletePulseTimer,
    input.connectionState,
    input.gatewayEventState,
    input.gatewayEventStateRef,
    input.isSending,
    input.setGatewayEventState,
    input.setIsBottomCompletePulse,
    input.bottomCompletePulseTimerRef,
  ]);

  useEffect(() => {
    input.sessionTurnsRef.current.set(input.activeSessionKey, input.chatTurns);
  }, [input.activeSessionKey, input.chatTurns, input.sessionTurnsRef]);

  useEffect(() => {
    if (input.chatTurns.length === 0 || !input.historyAutoScrollRef.current) return;
    input.scrollHistoryToBottom(true);
  }, [input.chatTurns.length, input.historyAutoScrollRef, input.scrollHistoryToBottom]);

  useEffect(() => {
    if (input.chatTurns.length > 0) return;
    input.historyAutoScrollRef.current = true;
    input.setShowScrollToBottomButton(false);
  }, [input.chatTurns.length, input.historyAutoScrollRef, input.setShowScrollToBottomButton]);

  useEffect(() => {
    if (input.isOnboardingCompleted || !input.isOnboardingWaitingForResponse) return;
    const hasFirstResponse = input.chatTurns.some(
      (turn) =>
        turn.state === 'complete' &&
        !isIncompleteAssistantContent(turn.assistantText),
    );
    if (!hasFirstResponse) return;
    input.setIsOnboardingCompleted(true);
    input.setIsOnboardingWaitingForResponse(false);
  }, [
    input.chatTurns,
    input.isOnboardingCompleted,
    input.isOnboardingWaitingForResponse,
    input.setIsOnboardingCompleted,
    input.setIsOnboardingWaitingForResponse,
  ]);

  useEffect(() => {
    if (!input.isGatewayConnected) {
      input.setIsSessionPanelOpen(false);
    }
  }, [input.isGatewayConnected, input.setIsSessionPanelOpen]);
}

type AsyncKvStore = {
  getItemAsync: (key: string) => Promise<string | null>;
  setItemAsync: (key: string, value: string) => Promise<void>;
  deleteItemAsync: (key: string) => Promise<void>;
};

type UseRuntimePersistenceEffectsInput = {
  settingsReady: boolean;
  persistRuntimeSetting: (task: () => Promise<void>) => void;
  activeSessionKey: string;
  sessionPreferences: SessionPreferences;
  outboxQueue: OutboxQueueItem[];
  kvStore: AsyncKvStore;
  sessionKeyStorageKey: string;
  sessionPrefsStorageKey: string;
  outboxQueueStorageKey: string;
  identityStorageKey: string;
  openClawIdentityMemory: Map<string, string>;
  parseSessionPreferences: (raw: string | null) => SessionPreferences;
  parseOutboxQueue: (raw: string | null) => OutboxQueueItem[];
  defaultSessionKey: string;
  activeSessionKeyRef: MutableRefObject<string>;
  sessionTurnsRef: MutableRefObject<Map<string, ChatTurn[]>>;
  setActiveSessionKey: Dispatch<SetStateAction<string>>;
  setSessionPreferences: Dispatch<SetStateAction<SessionPreferences>>;
  setOutboxQueue: Dispatch<SetStateAction<OutboxQueueItem[]>>;
  setGatewayEventState: (value: string) => void;
  setChatTurns: Dispatch<SetStateAction<ChatTurn[]>>;
  setLocalStateReady: Dispatch<SetStateAction<boolean>>;
};

export function useRuntimePersistenceEffects(input: UseRuntimePersistenceEffectsInput) {
  useEffect(() => {
    let alive = true;

    const loadLocalState = async () => {
      try {
        const [savedIdentity, savedSessionKey, savedSessionPrefs, savedOutboxQueue] =
          await Promise.all([
            input.kvStore.getItemAsync(input.identityStorageKey),
            input.kvStore.getItemAsync(input.sessionKeyStorageKey),
            input.kvStore.getItemAsync(input.sessionPrefsStorageKey),
            input.kvStore.getItemAsync(input.outboxQueueStorageKey),
          ]);
        if (!alive) return;

        if (savedSessionKey?.trim()) {
          input.setActiveSessionKey(savedSessionKey.trim());
        }
        input.setSessionPreferences(input.parseSessionPreferences(savedSessionPrefs));
        const restoredOutbox = input.parseOutboxQueue(savedOutboxQueue);
        if (restoredOutbox.length > 0) {
          input.setOutboxQueue(restoredOutbox);
          input.setGatewayEventState('queued');

          const turnsBySession = new Map<string, ChatTurn[]>();
          restoredOutbox.forEach((item) => {
            const turns = turnsBySession.get(item.sessionKey) ?? [];
            turns.push({
              id: item.turnId,
              userText: item.message,
              assistantText: item.lastError
                ? `Retrying automatically... (${item.lastError})`
                : 'Waiting for connection...',
              state: 'queued',
              createdAt: item.createdAt,
            });
            turnsBySession.set(item.sessionKey, turns);
          });

          turnsBySession.forEach((turns, sessionKey) => {
            const ordered = [...turns].sort((a, b) => a.createdAt - b.createdAt);
            input.sessionTurnsRef.current.set(sessionKey, ordered);
          });

          const restoredActiveSessionKey =
            (savedSessionKey?.trim() || input.activeSessionKeyRef.current).trim() ||
            input.defaultSessionKey;
          const restoredActiveTurns = turnsBySession.get(restoredActiveSessionKey);
          if (restoredActiveTurns?.length) {
            input.setChatTurns(
              [...restoredActiveTurns].sort((a, b) => a.createdAt - b.createdAt),
            );
          }
        }
        if (savedIdentity) {
          input.openClawIdentityMemory.set(input.identityStorageKey, savedIdentity);
        }
      } catch {
        // ignore load errors
      } finally {
        if (alive) {
          input.setLocalStateReady(true);
        }
      }
    };

    void loadLocalState();
    return () => {
      alive = false;
    };
  }, [
    input.activeSessionKeyRef,
    input.defaultSessionKey,
    input.identityStorageKey,
    input.kvStore,
    input.openClawIdentityMemory,
    input.outboxQueueStorageKey,
    input.parseOutboxQueue,
    input.parseSessionPreferences,
    input.sessionKeyStorageKey,
    input.sessionPrefsStorageKey,
    input.sessionTurnsRef,
    input.setActiveSessionKey,
    input.setChatTurns,
    input.setGatewayEventState,
    input.setLocalStateReady,
    input.setOutboxQueue,
    input.setSessionPreferences,
  ]);

  useEffect(() => {
    if (!input.settingsReady) return;
    const sessionKey = input.activeSessionKey.trim();
    input.persistRuntimeSetting(async () => {
      if (sessionKey) {
        await input.kvStore.setItemAsync(input.sessionKeyStorageKey, sessionKey);
      } else {
        await input.kvStore.deleteItemAsync(input.sessionKeyStorageKey);
      }
    });
  }, [
    input.activeSessionKey,
    input.kvStore,
    input.persistRuntimeSetting,
    input.sessionKeyStorageKey,
    input.settingsReady,
  ]);

  useEffect(() => {
    if (!input.settingsReady) return;
    input.persistRuntimeSetting(async () => {
      const entries = Object.entries(input.sessionPreferences);
      if (entries.length === 0) {
        await input.kvStore.deleteItemAsync(input.sessionPrefsStorageKey);
        return;
      }
      await input.kvStore.setItemAsync(
        input.sessionPrefsStorageKey,
        JSON.stringify(input.sessionPreferences),
      );
    });
  }, [
    input.kvStore,
    input.persistRuntimeSetting,
    input.sessionPreferences,
    input.sessionPrefsStorageKey,
    input.settingsReady,
  ]);

  useEffect(() => {
    if (!input.settingsReady) return;
    input.persistRuntimeSetting(async () => {
      if (input.outboxQueue.length === 0) {
        await input.kvStore.deleteItemAsync(input.outboxQueueStorageKey);
        return;
      }
      await input.kvStore.setItemAsync(
        input.outboxQueueStorageKey,
        JSON.stringify(input.outboxQueue),
      );
    });
  }, [
    input.kvStore,
    input.outboxQueue,
    input.outboxQueueStorageKey,
    input.persistRuntimeSetting,
    input.settingsReady,
  ]);
}
