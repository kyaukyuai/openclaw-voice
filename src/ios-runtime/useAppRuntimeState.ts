import { useRef, useState } from 'react';
import type { FlatList } from 'react-native';
import type { ConnectionState, SessionEntry } from '../openclaw';
import type {
  ChatTurn,
  FocusField,
  HistoryListItem,
  HistoryRefreshNotice,
  MissingResponseRecoveryNotice,
  OutboxQueueItem,
  QuickTextButtonSide,
  SessionPreferences,
} from '../types';

type UseAppRuntimeStateInput = {
  defaultSessionKey: string;
  initialGatewayEventState: string;
  initialGatewayUrl: string;
  initialConnectionState: ConnectionState;
};

export function useAppRuntimeState(input: UseAppRuntimeStateInput) {
  const [isAuthTokenMasked, setIsAuthTokenMasked] = useState(true);
  const [isSettingsPanelOpen, setIsSettingsPanelOpen] = useState(false);
  const [isSessionPanelOpen, setIsSessionPanelOpen] = useState(false);

  const [gatewayError, setGatewayError] = useState<string | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [chatTurns, setChatTurns] = useState<ChatTurn[]>([]);
  const [activeSessionKey, setActiveSessionKey] = useState(input.defaultSessionKey);
  const [sessions, setSessions] = useState<SessionEntry[]>([]);
  const [sessionPreferences, setSessionPreferences] = useState<SessionPreferences>({});
  const [isSessionOperationPending, setIsSessionOperationPending] = useState(false);
  const [isSessionRenameOpen, setIsSessionRenameOpen] = useState(false);
  const [sessionRenameTargetKey, setSessionRenameTargetKey] = useState<string | null>(
    null,
  );
  const [sessionRenameDraft, setSessionRenameDraft] = useState('');
  const [isStartupAutoConnecting, setIsStartupAutoConnecting] = useState(false);
  const [isOnboardingWaitingForResponse, setIsOnboardingWaitingForResponse] =
    useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [historyLastSyncedAt, setHistoryLastSyncedAt] = useState<number | null>(
    null,
  );
  const [historyRefreshNotice, setHistoryRefreshNotice] =
    useState<HistoryRefreshNotice | null>(null);
  const [missingResponseNotice, setMissingResponseNotice] =
    useState<MissingResponseRecoveryNotice | null>(null);
  const [showScrollToBottomButton, setShowScrollToBottomButton] = useState(false);
  const [outboxQueue, setOutboxQueue] = useState<OutboxQueueItem[]>([]);
  const [quickTextTooltipSide, setQuickTextTooltipSide] =
    useState<QuickTextButtonSide | null>(null);
  const [focusedField, setFocusedField] = useState<FocusField>(null);
  const [isKeyboardBarMounted, setIsKeyboardBarMounted] = useState(false);
  const [isBottomCompletePulse, setIsBottomCompletePulse] = useState(false);

  const [isRecognizing, setIsRecognizing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [localStateReady, setLocalStateReady] = useState(false);

  const activeSessionKeyRef = useRef(input.defaultSessionKey);
  const activeRunIdRef = useRef<string | null>(null);
  const pendingTurnIdRef = useRef<string | null>(null);
  const runIdToTurnIdRef = useRef<Map<string, string>>(new Map());
  const sessionTurnsRef = useRef<Map<string, ChatTurn[]>>(new Map());
  const subscriptionsRef = useRef<Array<() => void>>([]);
  const transcriptRef = useRef('');
  const interimTranscriptRef = useRef('');
  const historyScrollRef = useRef<FlatList<HistoryListItem> | null>(null);
  const historyAutoScrollRef = useRef(true);
  const historySyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const historySyncRequestRef = useRef<{
    sessionKey: string;
    attempt: number;
  } | null>(null);
  const missingResponseRecoveryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const missingResponseRecoveryRequestRef = useRef<{
    sessionKey: string;
    turnId: string;
    attempt: number;
  } | null>(null);
  const historyNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bottomCompletePulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const authTokenMaskTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const outboxRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const outboxProcessingRef = useRef(false);
  const outboxQueueRef = useRef<OutboxQueueItem[]>([]);
  const gatewayEventStateRef = useRef(input.initialGatewayEventState);
  const gatewayUrlRef = useRef(input.initialGatewayUrl);
  const connectionStateRef = useRef<ConnectionState>(input.initialConnectionState);
  const startupAutoConnectRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const startupAutoConnectAttemptRef = useRef(0);
  const finalResponseRecoveryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const sendFingerprintRef = useRef<{
    sessionKey: string;
    message: string;
    sentAt: number;
    idempotencyKey: string;
  } | null>(null);
  const holdStartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdActivatedRef = useRef(false);
  const expectedSpeechStopRef = useRef(false);
  const isUnmountingRef = useRef(false);
  const startupAutoConnectAttemptedRef = useRef(false);

  return {
    isAuthTokenMasked,
    setIsAuthTokenMasked,
    isSettingsPanelOpen,
    setIsSettingsPanelOpen,
    isSessionPanelOpen,
    setIsSessionPanelOpen,
    gatewayError,
    setGatewayError,
    activeRunId,
    setActiveRunId,
    chatTurns,
    setChatTurns,
    activeSessionKey,
    setActiveSessionKey,
    sessions,
    setSessions,
    sessionPreferences,
    setSessionPreferences,
    isSessionOperationPending,
    setIsSessionOperationPending,
    isSessionRenameOpen,
    setIsSessionRenameOpen,
    sessionRenameTargetKey,
    setSessionRenameTargetKey,
    sessionRenameDraft,
    setSessionRenameDraft,
    isStartupAutoConnecting,
    setIsStartupAutoConnecting,
    isOnboardingWaitingForResponse,
    setIsOnboardingWaitingForResponse,
    sessionsError,
    setSessionsError,
    historyLastSyncedAt,
    setHistoryLastSyncedAt,
    historyRefreshNotice,
    setHistoryRefreshNotice,
    missingResponseNotice,
    setMissingResponseNotice,
    showScrollToBottomButton,
    setShowScrollToBottomButton,
    outboxQueue,
    setOutboxQueue,
    quickTextTooltipSide,
    setQuickTextTooltipSide,
    focusedField,
    setFocusedField,
    isKeyboardBarMounted,
    setIsKeyboardBarMounted,
    isBottomCompletePulse,
    setIsBottomCompletePulse,
    isRecognizing,
    setIsRecognizing,
    transcript,
    setTranscript,
    interimTranscript,
    setInterimTranscript,
    speechError,
    setSpeechError,
    localStateReady,
    setLocalStateReady,
    activeSessionKeyRef,
    activeRunIdRef,
    pendingTurnIdRef,
    runIdToTurnIdRef,
    sessionTurnsRef,
    subscriptionsRef,
    transcriptRef,
    interimTranscriptRef,
    historyScrollRef,
    historyAutoScrollRef,
    historySyncTimerRef,
    historySyncRequestRef,
    missingResponseRecoveryTimerRef,
    missingResponseRecoveryRequestRef,
    historyNoticeTimerRef,
    bottomCompletePulseTimerRef,
    authTokenMaskTimerRef,
    outboxRetryTimerRef,
    outboxProcessingRef,
    outboxQueueRef,
    gatewayEventStateRef,
    gatewayUrlRef,
    connectionStateRef,
    startupAutoConnectRetryTimerRef,
    startupAutoConnectAttemptRef,
    finalResponseRecoveryTimerRef,
    sendFingerprintRef,
    holdStartTimerRef,
    holdActivatedRef,
    expectedSpeechStopRef,
    isUnmountingRef,
    startupAutoConnectAttemptedRef,
  };
}
