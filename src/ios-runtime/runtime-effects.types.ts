import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { ConnectionState, SessionEntry } from '../openclaw';
import type {
  ChatTurn,
  MissingResponseRecoveryNotice,
  OutboxQueueItem,
  SessionPreferences,
} from '../types';

export type UseRuntimeUiEffectsInput = {
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

export type AsyncKvStore = {
  getItemAsync: (key: string) => Promise<string | null>;
  setItemAsync: (key: string, value: string) => Promise<void>;
  deleteItemAsync: (key: string) => Promise<void>;
};

export type UseRuntimePersistenceEffectsInput = {
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
