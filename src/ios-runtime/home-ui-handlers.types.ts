import type {
  Dispatch,
  MutableRefObject,
  SetStateAction,
} from 'react';
import type { FocusField, HistoryRefreshNotice, MissingResponseRecoveryNotice } from '../types';

export type ScheduleMissingResponseRecoveryOptions = {
  attempt?: number;
  delayMs?: number;
};

export type UseHomeUiHandlersInput = {
  onButtonPressHaptic: () => void;

  canReconnectFromError: boolean;
  canRetryFromError: boolean;
  latestRetryText: string;
  connectGateway: () => Promise<unknown>;
  sendToGateway: (text: string) => Promise<void>;
  setFocusedField: Dispatch<SetStateAction<FocusField>>;

  activeMissingResponseNotice: MissingResponseRecoveryNotice | null;
  isMissingResponseRecoveryInFlight: boolean;
  isGatewayConnected: boolean;
  setGatewayError: Dispatch<SetStateAction<string | null>>;
  scheduleMissingResponseRecovery: (
    sessionKey: string,
    turnId: string,
    options?: ScheduleMissingResponseRecoveryOptions,
  ) => void;
  topBannerKind: 'gateway' | 'recovery' | 'history' | 'speech' | null;
  setMissingResponseNotice: Dispatch<SetStateAction<MissingResponseRecoveryNotice | null>>;
  setHistoryRefreshNotice: Dispatch<SetStateAction<HistoryRefreshNotice | null>>;
  setSpeechError: Dispatch<SetStateAction<string | null>>;

  setIsOnboardingWaitingForResponse: Dispatch<SetStateAction<boolean>>;
  setIsOnboardingCompleted: (next: boolean) => void;
  canRunOnboardingConnectTest: boolean;
  canRunOnboardingSampleSend: boolean;
  onboardingSampleMessage: string;

  forceMaskAuthToken: () => void;
  isSessionPanelOpen: boolean;
  refreshSessions: () => Promise<unknown>;
  setIsSettingsPanelOpen: Dispatch<SetStateAction<boolean>>;
  setIsSessionPanelOpen: Dispatch<SetStateAction<boolean>>;
  setIsSessionRenameOpen: Dispatch<SetStateAction<boolean>>;
  setSessionRenameTargetKey: Dispatch<SetStateAction<string | null>>;
  setSessionRenameDraft: Dispatch<SetStateAction<string>>;
  canToggleSettingsPanel: boolean;
  canDismissSettingsScreen: boolean;

  canClearFromKeyboardBar: boolean;
  clearTranscriptDraft: () => void;
  canSendFromKeyboardBar: boolean;
  transcript: string;
  interimTranscript: string;
  setTranscript: Dispatch<SetStateAction<string>>;
  setInterimTranscript: Dispatch<SetStateAction<string>>;

  isSessionHistoryLoading: boolean;
  clearHistoryNoticeTimer: () => void;
  activeSessionKeyRef: MutableRefObject<string>;
  loadSessionHistory: (
    sessionKey: string,
    options?: {
      silentError?: boolean;
    },
  ) => Promise<boolean>;
  setHistoryLastSyncedAt: Dispatch<SetStateAction<number | null>>;
  showHistoryRefreshNotice: (
    kind: HistoryRefreshNotice['kind'],
    message: string,
  ) => void;
  formatClockLabel: (timestamp: number) => string;

  scrollHistoryToBottom: (animated: boolean) => void;
  historyAutoScrollRef: MutableRefObject<boolean>;
  setShowScrollToBottomButton: Dispatch<SetStateAction<boolean>>;
  chatTurnsLength: number;
  historyBottomThresholdPx: number;

  speechRecognitionSupported: boolean;
  isRecognizing: boolean;
  isSending: boolean;
  holdActivatedRef: MutableRefObject<boolean>;
  holdStartTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  startRecognition: () => Promise<void>;
  stopRecognition: () => void;
  composerHeight: number;
  setComposerHeight: Dispatch<SetStateAction<number>>;
};
