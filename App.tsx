import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  LogBox,
  findNodeHandle,
  Platform,
  SafeAreaView,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import {
  setStorage,
  type ChatEventPayload,
  type ChatMessage,
  type ConnectionState,
  type SessionEntry,
  type Storage as OpenClawStorage,
} from './src/openclaw';
import {
  computeAutoConnectRetryPlan,
  mergeHistoryTurnsWithPendingLocal,
  normalizeMessageForDedupe,
  resolveSendDispatch,
  shouldAttemptFinalRecovery,
  shouldStartStartupAutoConnect,
  isIncompleteAssistantContent,
} from './src/ui/runtime-logic';

// Import extracted types
import type {
  AppTheme,
  FocusField,
  GatewayConnectDiagnostic,
  QuickTextButtonSide,
  QuickTextFocusField,
  QuickTextIcon,
  SpeechLang,
} from './src/types';
import type {
  ChatTurn,
  HistoryListItem,
  HistoryRefreshNotice,
  MissingResponseRecoveryNotice,
  OutboxQueueItem,
} from './src/types';
import type { SessionPreference, SessionPreferences } from './src/types';
import {
  STORAGE_KEYS,
  OPENCLAW_IDENTITY_STORAGE_KEY,
} from './src/types';

// Import extracted constants
import {
  REQUESTED_GATEWAY_CLIENT_ID,
  GATEWAY_DISPLAY_NAME,
  ENABLE_DEBUG_WARNINGS,
  GATEWAY_PLATFORM,
  DEFAULTS,
  TIMINGS,
  UI,
  QUICK_TEXT_ICON_SET,
  MESSAGES,
  // Legacy exports for backward compatibility
  DEFAULT_GATEWAY_URL,
  DEFAULT_THEME,
  DEFAULT_SPEECH_LANG,
  DEFAULT_SESSION_KEY,
  DEFAULT_QUICK_TEXT_LEFT,
  DEFAULT_QUICK_TEXT_RIGHT,
  DEFAULT_QUICK_TEXT_LEFT_ICON,
  DEFAULT_QUICK_TEXT_RIGHT_ICON,
  QUICK_TEXT_TOOLTIP_HIDE_MS,
  HISTORY_NOTICE_HIDE_MS,
  AUTH_TOKEN_AUTO_MASK_MS,
  BOTTOM_STATUS_COMPLETE_HOLD_MS,
  DUPLICATE_SEND_BLOCK_MS,
  IDEMPOTENCY_REUSE_WINDOW_MS,
  SEND_TIMEOUT_MS,
  OUTBOX_RETRY_BASE_MS,
  OUTBOX_RETRY_MAX_MS,
  STARTUP_AUTO_CONNECT_MAX_ATTEMPTS,
  STARTUP_AUTO_CONNECT_RETRY_BASE_MS,
  HISTORY_REFRESH_TIMEOUT_MS,
  getKvStore,
  MAX_TEXT_SCALE,
  MAX_TEXT_SCALE_TIGHT,
  HISTORY_BOTTOM_THRESHOLD_PX,
  ONBOARDING_SAMPLE_MESSAGE,
} from './src/utils';

// Import extracted helpers
import {
  triggerHaptic,
  textFromUnknown,
  dedupeLines,
  errorMessage,
  classifyGatewayConnectFailure,
  normalizeSpeechErrorCode,
  isSpeechAbortLikeError,
  createTurnId,
  createSessionKey,
  createOutboxItemId,
  getOutboxRetryDelayMs,
  sessionDisplayName,
  extractTimestampFromUnknown,
  normalizeChatEventState,
  getTextOverlapSize,
  isMacDesktopRuntime,
  supportsSpeechRecognitionOnCurrentPlatform,
} from './src/utils';
import { useGatewayRuntime } from './src/ios-runtime/useGatewayRuntime';
import { useHistoryRuntime } from './src/ios-runtime/useHistoryRuntime';
import { useComposerRuntime } from './src/ios-runtime/useComposerRuntime';
import { useHomeUiHandlers } from './src/ios-runtime/useHomeUiHandlers';
import { useHomeUiState } from './src/ios-runtime/useHomeUiState';
import { useGatewayEventBridge } from './src/ios-runtime/useGatewayEventBridge';
import { useSessionRuntime } from './src/ios-runtime/useSessionRuntime';
import { scheduleHistoryScrollToEnd } from './src/ui/history-layout';
import ConnectionHeader from './src/ui/ios/ConnectionHeader';
import SettingsScreenModal from './src/ui/ios/SettingsScreenModal';
import SessionsScreenModal from './src/ui/ios/SessionsScreenModal';
import SettingsPanelContent from './src/ui/ios/SettingsPanelContent';
import SessionsPanelContent from './src/ui/ios/SessionsPanelContent';
import HomeMainLayout from './src/ui/ios/HomeMainLayout';
import { createStyles } from './src/ui/ios/styles';

// Import contexts
import {
  ThemeProvider,
  useTheme,
  SettingsProvider,
  useSettings,
  GatewayProvider,
  useGateway,
} from './src/contexts';

if (__DEV__ && !ENABLE_DEBUG_WARNINGS) {
  LogBox.ignoreAllLogs(true);
}

const kvStore = getKvStore();
const openClawIdentityMemory = new Map<string, string>();

const openClawStorage: OpenClawStorage = {
  getString(key) {
    return openClawIdentityMemory.get(key);
  },
  set(key, value) {
    openClawIdentityMemory.set(key, value);
    void kvStore.setItemAsync(key, value).catch(() => {
      // ignore persistence errors
    });
  },
};

setStorage(openClawStorage);

function buildTurnsFromHistory(
  messages: unknown[] | undefined,
  sessionKey: string,
): ChatTurn[] {
  if (!Array.isArray(messages) || messages.length === 0) return [];

  const turns: ChatTurn[] = [];
  let pendingTurn: ChatTurn | null = null;
  const finalizePendingTurn = () => {
    if (pendingTurn) turns.push(pendingTurn);
    pendingTurn = null;
  };

  messages.forEach((entry, index) => {
    if (typeof entry !== 'object' || entry === null) return;
    const record = entry as Record<string, unknown>;
    const role = typeof record.role === 'string' ? record.role.toLowerCase() : '';
    if (!role) return;

    const createdAt = extractTimestampFromUnknown(
      record.timestamp ?? record.ts ?? record.createdAt,
      Date.now() + index,
    );
    const text = textFromUnknown(
      record.content ?? record.text ?? record.message ?? record,
    );

    if (role === 'user') {
      finalizePendingTurn();
      pendingTurn = {
        id: `hist-${sessionKey}-${index}`,
        userText: text || '(empty)',
        assistantText: '',
        state: 'complete',
        createdAt,
      };
      return;
    }

    const assistantLikeRole =
      role === 'assistant' || role === 'agent' || role === 'model' || role === 'system';
    if (!assistantLikeRole || !pendingTurn) return;

    const status =
      typeof record.state === 'string'
        ? record.state
        : typeof record.status === 'string'
          ? record.status
          : record.errorMessage || record.error
            ? 'error'
            : 'complete';
    const normalizedStatus = normalizeChatEventState(status);
    const nextState = isTurnErrorState(normalizedStatus)
      ? 'error'
      : isTurnWaitingState(normalizedStatus)
        ? normalizedStatus
        : 'complete';

    pendingTurn = {
      ...pendingTurn,
      assistantText: text || pendingTurn.assistantText,
      state: nextState,
    };
  });

  finalizePendingTurn();
  return turns;
}

const WAITING_TURN_STATES = new Set(['sending', 'queued', 'delta', 'streaming']);

function isTurnWaitingState(state: string): boolean {
  return WAITING_TURN_STATES.has(state);
}

function isTurnErrorState(state: string): boolean {
  return state === 'error' || state === 'aborted';
}

function getHistoryDayKey(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getHistoryDayLabel(timestamp: number): string {
  const targetDate = new Date(timestamp);
  targetDate.setHours(0, 0, 0, 0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (targetDate.getTime() === today.getTime()) return 'Today';
  if (targetDate.getTime() === yesterday.getTime()) return 'Yesterday';

  const withYear = targetDate.getFullYear() !== today.getFullYear();
  return new Date(timestamp).toLocaleDateString(undefined, {
    year: withYear ? 'numeric' : undefined,
    month: 'short',
    day: 'numeric',
  });
}

function formatSessionUpdatedAt(updatedAt?: number): string {
  if (!updatedAt) return '';
  const target = new Date(updatedAt);
  const now = new Date();
  const withYear = target.getFullYear() !== now.getFullYear();
  const dateLabel = target.toLocaleDateString(undefined, {
    year: withYear ? 'numeric' : undefined,
    month: 'short',
    day: 'numeric',
  });
  const timeLabel = target.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${dateLabel} ${timeLabel}`;
}

function formatClockLabel(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function extractFinalChatEventText(payload: ChatEventPayload): string {
  const record = payload as unknown as Record<string, unknown>;
  return textFromUnknown([
    payload.message,
    record.finalMessage,
    record.finalText,
    record.outputText,
    record.text,
    record.output,
    record.response,
    record.result,
    record.data,
  ]);
}

function normalizeQuickTextIcon(
  value: string | null | undefined,
  fallback: QuickTextIcon,
): QuickTextIcon {
  const candidate = (value ?? '').trim() as QuickTextIcon;
  if (QUICK_TEXT_ICON_SET.has(candidate)) {
    return candidate;
  }
  return fallback;
}

function parseSessionPreferences(raw: string | null): SessionPreferences {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    const next: SessionPreferences = {};
    Object.entries(parsed as Record<string, unknown>).forEach(([sessionKey, value]) => {
      if (!sessionKey || !value || typeof value !== 'object' || Array.isArray(value)) {
        return;
      }

      const record = value as Record<string, unknown>;
      const alias = typeof record.alias === 'string' ? record.alias.trim() : '';
      const pinned = record.pinned === true;

      if (alias || pinned) {
        next[sessionKey] = {
          ...(alias ? { alias } : {}),
          ...(pinned ? { pinned: true } : {}),
        };
      }
    });
    return next;
  } catch {
    return {};
  }
}

function parseOutboxQueue(raw: string | null): OutboxQueueItem[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    const next: OutboxQueueItem[] = [];
    parsed.forEach((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return;
      const record = entry as Record<string, unknown>;

      const id = typeof record.id === 'string' ? record.id.trim() : '';
      const sessionKey =
        typeof record.sessionKey === 'string' ? record.sessionKey.trim() : '';
      const message = typeof record.message === 'string' ? record.message.trim() : '';
      const turnId = typeof record.turnId === 'string' ? record.turnId.trim() : '';
      const idempotencyKey =
        typeof record.idempotencyKey === 'string'
          ? record.idempotencyKey.trim()
          : '';
      if (!id || !sessionKey || !message || !turnId || !idempotencyKey) return;

      const now = Date.now();
      const createdAt =
        typeof record.createdAt === 'number' && Number.isFinite(record.createdAt)
          ? Math.max(0, record.createdAt)
          : now;
      const retryCountRaw =
        typeof record.retryCount === 'number' && Number.isFinite(record.retryCount)
          ? record.retryCount
          : 0;
      const retryCount = Math.max(0, Math.floor(retryCountRaw));
      const nextRetryAtRaw =
        typeof record.nextRetryAt === 'number' && Number.isFinite(record.nextRetryAt)
          ? record.nextRetryAt
          : createdAt;
      const nextRetryAt = Math.max(createdAt, nextRetryAtRaw);
      const lastError =
        typeof record.lastError === 'string' && record.lastError.trim()
          ? record.lastError.trim()
          : null;

      next.push({
        id,
        sessionKey,
        message,
        turnId,
        idempotencyKey,
        createdAt,
        retryCount,
        nextRetryAt,
        lastError,
      });
    });

    next.sort((a, b) => a.createdAt - b.createdAt);
    return next;
  } catch {
    return [];
  }
}

function AppContent() {
  // Settings are now managed by SettingsContext
  const {
    gatewayUrl,
    setGatewayUrl,
    authToken,
    setAuthToken,
    speechLang,
    setSpeechLang,
    quickTextLeft,
    setQuickTextLeft,
    quickTextRight,
    setQuickTextRight,
    quickTextLeftIcon,
    setQuickTextLeftIcon,
    quickTextRightIcon,
    setQuickTextRightIcon,
    isOnboardingCompleted,
    setOnboardingCompleted: setIsOnboardingCompleted,
    isReady: settingsReady,
    isSaving: isSettingsSaving,
    pendingSaveCount: settingsPendingSaveCount,
    lastSavedAt: settingsLastSavedAt,
    saveError: settingsSaveError,
  } = useSettings();
  const {
    connect: gatewayConnect,
    disconnect: gatewayDisconnect,
    checkHealth: gatewayCheckHealth,
    refreshSessions: gatewayRefreshSessions,
    getClient: gatewayGetClient,
    connectionState: gatewayConnectionState,
    connectDiagnostic: gatewayContextConnectDiagnostic,
    sessions: gatewaySessions,
    isSessionsLoading: gatewaySessionsLoading,
    sessionsError: gatewaySessionsError,
  } = useGateway();

  const [isAuthTokenMasked, setIsAuthTokenMasked] = useState(true);
  const [isSettingsPanelOpen, setIsSettingsPanelOpen] = useState(false);
  const [isSessionPanelOpen, setIsSessionPanelOpen] = useState(false);
  const {
    state: gatewayRuntime,
    runAction: runGatewayRuntimeAction,
    setGatewayEventState,
    setIsSending,
    setIsSessionHistoryLoading,
    setIsMissingResponseRecoveryInFlight,
  } = useGatewayRuntime();
  const connectionState = gatewayConnectionState;
  const gatewayEventState = gatewayRuntime.gatewayEventState;
  const isSending = gatewayRuntime.isSending;
  const isSessionHistoryLoading = gatewayRuntime.isSessionHistoryLoading;
  const isMissingResponseRecoveryInFlight =
    gatewayRuntime.isMissingResponseRecoveryInFlight;
  const {
    composerHeight,
    setComposerHeight,
    setKeyboardState,
    isKeyboardVisible,
    historyBottomInset,
  } = useComposerRuntime();
  const { runHistoryRefresh, invalidateRefreshEpoch } = useHistoryRuntime();
  const [gatewayError, setGatewayError] = useState<string | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [chatTurns, setChatTurns] = useState<ChatTurn[]>([]);
  const [activeSessionKey, setActiveSessionKey] = useState(DEFAULT_SESSION_KEY);
  const [sessions, setSessions] = useState<SessionEntry[]>([]);
  const [sessionPreferences, setSessionPreferences] = useState<SessionPreferences>({});
  const [isSessionOperationPending, setIsSessionOperationPending] = useState(false);
  const [isSessionRenameOpen, setIsSessionRenameOpen] = useState(false);
  const [sessionRenameTargetKey, setSessionRenameTargetKey] = useState<string | null>(null);
  const [sessionRenameDraft, setSessionRenameDraft] = useState('');
  const [isStartupAutoConnecting, setIsStartupAutoConnecting] = useState(false);
  // isOnboardingCompleted is now managed by SettingsContext
  const [isOnboardingWaitingForResponse, setIsOnboardingWaitingForResponse] =
    useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [historyLastSyncedAt, setHistoryLastSyncedAt] = useState<number | null>(null);
  const [historyRefreshNotice, setHistoryRefreshNotice] =
    useState<HistoryRefreshNotice | null>(null);
  const [missingResponseNotice, setMissingResponseNotice] =
    useState<MissingResponseRecoveryNotice | null>(null);
  const [showScrollToBottomButton, setShowScrollToBottomButton] = useState(false);
  const [gatewayConnectDiagnostic, setGatewayConnectDiagnostic] =
    useState<GatewayConnectDiagnostic | null>(null);
  const [outboxQueue, setOutboxQueue] = useState<OutboxQueueItem[]>([]);
  // Theme is now managed by ThemeContext
  const { theme, setTheme, isDark: isDarkTheme } = useTheme();
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

  const activeSessionKeyRef = useRef(DEFAULT_SESSION_KEY);
  const activeRunIdRef = useRef<string | null>(null);
  const pendingTurnIdRef = useRef<string | null>(null);
  const runIdToTurnIdRef = useRef<Map<string, string>>(new Map());
  const sessionTurnsRef = useRef<Map<string, ChatTurn[]>>(new Map());
  const subscriptionsRef = useRef<Array<() => void>>([]);
  const transcriptRef = useRef('');
  const interimTranscriptRef = useRef('');
  const historyScrollRef = useRef<FlatList<HistoryListItem> | null>(null);
  const settingsScrollRef = useRef<ScrollView | null>(null);
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
  const gatewayEventStateRef = useRef(gatewayEventState);
  const gatewayUrlRef = useRef(gatewayUrl);
  const connectionStateRef = useRef<ConnectionState>(connectionState);
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
  const settingsFocusScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const quickTextTooltipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const quickTextLongPressResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const quickTextInputRefs = useRef<Record<QuickTextFocusField, TextInput | null>>({
    'quick-text-left': null,
    'quick-text-right': null,
  });
  const quickTextLongPressSideRef = useRef<QuickTextButtonSide | null>(null);
  const holdActivatedRef = useRef(false);
  const keyboardBarAnim = useRef(new Animated.Value(0)).current;
  const expectedSpeechStopRef = useRef(false);
  const isUnmountingRef = useRef(false);
  const startupAutoConnectAttemptedRef = useRef(false);

  const isGatewayConnected = connectionState === 'connected';
  const isGatewayConnecting =
    connectionState === 'connecting' || connectionState === 'reconnecting';
  const isMacRuntime = isMacDesktopRuntime();
  const shouldForceSettingsScreen = !isGatewayConnected && !isMacRuntime;
  const shouldShowSettingsScreen = shouldForceSettingsScreen || isSettingsPanelOpen;
  const canToggleSettingsPanel = isGatewayConnected || isMacRuntime;
  const canDismissSettingsScreen = isGatewayConnected || isMacRuntime;
  const isSessionsLoading = gatewaySessionsLoading;
  // isDarkTheme is now provided by useTheme()

  const persistRuntimeSetting = useCallback((task: () => Promise<void>) => {
    void task().catch(() => {
      // ignore runtime persistence errors
    });
  }, []);

  const clearHistoryNoticeTimer = useCallback(() => {
    if (historyNoticeTimerRef.current) {
      clearTimeout(historyNoticeTimerRef.current);
      historyNoticeTimerRef.current = null;
    }
  }, []);

  const clearBottomCompletePulseTimer = useCallback(() => {
    if (bottomCompletePulseTimerRef.current) {
      clearTimeout(bottomCompletePulseTimerRef.current);
      bottomCompletePulseTimerRef.current = null;
    }
  }, []);

  const clearAuthTokenMaskTimer = useCallback(() => {
    if (authTokenMaskTimerRef.current) {
      clearTimeout(authTokenMaskTimerRef.current);
      authTokenMaskTimerRef.current = null;
    }
  }, []);

  const forceMaskAuthToken = useCallback(() => {
    clearAuthTokenMaskTimer();
    setIsAuthTokenMasked(true);
  }, [clearAuthTokenMaskTimer]);

  const toggleAuthTokenVisibility = useCallback(() => {
    setIsAuthTokenMasked((current) => {
      const next = !current;
      clearAuthTokenMaskTimer();
      if (!next) {
        authTokenMaskTimerRef.current = setTimeout(() => {
          authTokenMaskTimerRef.current = null;
          setIsAuthTokenMasked(true);
        }, AUTH_TOKEN_AUTO_MASK_MS);
      }
      return next;
    });
  }, [clearAuthTokenMaskTimer]);

  useEffect(() => {
    if (!shouldShowSettingsScreen) {
      forceMaskAuthToken();
    }
  }, [forceMaskAuthToken, shouldShowSettingsScreen]);

  const clearOutboxRetryTimer = useCallback(() => {
    if (outboxRetryTimerRef.current) {
      clearTimeout(outboxRetryTimerRef.current);
      outboxRetryTimerRef.current = null;
    }
  }, []);

  const showHistoryRefreshNotice = useCallback(
    (kind: HistoryRefreshNotice['kind'], message: string) => {
      clearHistoryNoticeTimer();
      setHistoryRefreshNotice({ kind, message });
      historyNoticeTimerRef.current = setTimeout(() => {
        historyNoticeTimerRef.current = null;
        setHistoryRefreshNotice(null);
      }, HISTORY_NOTICE_HIDE_MS);
    },
    [clearHistoryNoticeTimer],
  );

  const clearStartupAutoConnectRetryTimer = useCallback(() => {
    if (startupAutoConnectRetryTimerRef.current) {
      clearTimeout(startupAutoConnectRetryTimerRef.current);
      startupAutoConnectRetryTimerRef.current = null;
    }
  }, []);

  const clearFinalResponseRecoveryTimer = useCallback(() => {
    if (finalResponseRecoveryTimerRef.current) {
      clearTimeout(finalResponseRecoveryTimerRef.current);
      finalResponseRecoveryTimerRef.current = null;
    }
  }, []);

  const clearMissingResponseRecoveryTimer = useCallback(() => {
    if (missingResponseRecoveryTimerRef.current) {
      clearTimeout(missingResponseRecoveryTimerRef.current);
      missingResponseRecoveryTimerRef.current = null;
    }
  }, []);

  const clearMissingResponseRecoveryState = useCallback(
    (sessionKey?: string) => {
      const targetSessionKey = sessionKey?.trim();
      const request = missingResponseRecoveryRequestRef.current;
      if (!targetSessionKey || request?.sessionKey === targetSessionKey) {
        clearMissingResponseRecoveryTimer();
        missingResponseRecoveryRequestRef.current = null;
        setIsMissingResponseRecoveryInFlight(false);
      }
      setMissingResponseNotice((previous) => {
        if (!previous) return previous;
        if (targetSessionKey && previous.sessionKey !== targetSessionKey) {
          return previous;
        }
        return null;
      });
    },
    [clearMissingResponseRecoveryTimer],
  );

  useEffect(() => {
    const notice = missingResponseNotice;
    if (!notice || notice.sessionKey !== activeSessionKey) return;
    const targetTurn = chatTurns.find((turn) => turn.id === notice.turnId);
    if (!targetTurn) {
      if (chatTurns.length > 0) {
        clearMissingResponseRecoveryState(notice.sessionKey);
      }
      return;
    }
    const stillIncomplete =
      isTurnWaitingState(targetTurn.state) ||
      shouldAttemptFinalRecovery(targetTurn.assistantText, targetTurn.assistantText);
    if (!stillIncomplete) {
      clearMissingResponseRecoveryState(notice.sessionKey);
    }
  }, [
    activeSessionKey,
    chatTurns,
    clearMissingResponseRecoveryState,
    missingResponseNotice,
  ]);

  const runGatewayHealthCheck = useCallback(
    async (options?: { silent?: boolean; timeoutMs?: number }): Promise<boolean> => {
      if (connectionStateRef.current !== 'connected') {
        return false;
      }
      try {
        return await gatewayCheckHealth(options);
      } catch {
        return false;
      }
    },
    [gatewayCheckHealth],
  );

  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  useEffect(() => {
    interimTranscriptRef.current = interimTranscript;
  }, [interimTranscript]);

  useEffect(() => {
    activeSessionKeyRef.current = activeSessionKey;
  }, [activeSessionKey]);

  useEffect(() => {
    historyAutoScrollRef.current = true;
    setShowScrollToBottomButton(false);
  }, [activeSessionKey]);

  useEffect(() => {
    gatewayUrlRef.current = gatewayUrl;
  }, [gatewayUrl]);

  useEffect(() => {
    if (gatewayContextConnectDiagnostic) {
      setGatewayConnectDiagnostic(gatewayContextConnectDiagnostic);
    }
  }, [gatewayContextConnectDiagnostic]);

  useEffect(() => {
    connectionStateRef.current = connectionState;
  }, [connectionState]);

  useEffect(() => {
    outboxQueueRef.current = outboxQueue;
  }, [outboxQueue]);

  useEffect(() => {
    if (connectionState !== 'connected') {
      setSessions([]);
      return;
    }
    const fetched = Array.isArray(gatewaySessions)
      ? gatewaySessions.filter(
          (session): session is SessionEntry =>
            typeof session?.key === 'string' && session.key.trim().length > 0,
        )
      : [];
    const activeKey = activeSessionKeyRef.current;
    const merged = [...fetched];
    if (!merged.some((session) => session.key === activeKey)) {
      merged.unshift({ key: activeKey, displayName: activeKey });
    }
    merged.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
    setSessions(merged);
  }, [connectionState, gatewaySessions]);

  useEffect(() => {
    if (!gatewaySessionsError) return;
    setSessionsError((previous) => previous ?? `Sessions unavailable: ${gatewaySessionsError}`);
  }, [gatewaySessionsError]);

  useEffect(() => {
    gatewayEventStateRef.current = gatewayEventState;
  }, [gatewayEventState]);

  useEffect(() => {
    const shouldHoldComplete =
      connectionState === 'connected' &&
      !isSending &&
      gatewayEventState === 'complete';

    if (!shouldHoldComplete) {
      setIsBottomCompletePulse(false);
      clearBottomCompletePulseTimer();
      return;
    }

    setIsBottomCompletePulse(true);
    clearBottomCompletePulseTimer();
    bottomCompletePulseTimerRef.current = setTimeout(() => {
      bottomCompletePulseTimerRef.current = null;
      setIsBottomCompletePulse(false);
      if (gatewayEventStateRef.current === 'complete') {
        setGatewayEventState('ready');
      }
    }, BOTTOM_STATUS_COMPLETE_HOLD_MS);

    return () => {
      clearBottomCompletePulseTimer();
    };
  }, [
    clearBottomCompletePulseTimer,
    connectionState,
    gatewayEventState,
    isSending,
  ]);

  useEffect(() => {
    sessionTurnsRef.current.set(activeSessionKey, chatTurns);
  }, [activeSessionKey, chatTurns]);

  const scrollHistoryToBottom = useCallback((animated = true) => {
    scheduleHistoryScrollToEnd(() => {
      historyScrollRef.current?.scrollToEnd({ animated });
      setShowScrollToBottomButton(false);
      historyAutoScrollRef.current = true;
    });
  }, []);

  useEffect(() => {
    if (chatTurns.length === 0 || !historyAutoScrollRef.current) return;
    scrollHistoryToBottom(true);
  }, [chatTurns.length, scrollHistoryToBottom]);

  useEffect(() => {
    if (chatTurns.length > 0) return;
    historyAutoScrollRef.current = true;
    setShowScrollToBottomButton(false);
  }, [chatTurns.length]);

  useEffect(() => {
    if (isOnboardingCompleted || !isOnboardingWaitingForResponse) return;
    const hasFirstResponse = chatTurns.some(
      (turn) =>
        turn.state === 'complete' &&
        !isIncompleteAssistantContent(turn.assistantText),
    );
    if (!hasFirstResponse) return;
    setIsOnboardingCompleted(true);
    setIsOnboardingWaitingForResponse(false);
  }, [chatTurns, isOnboardingCompleted, isOnboardingWaitingForResponse]);

  // Load non-settings state (session, outbox, identity)
  // Settings (gatewayUrl, authToken, speechLang, quickText*, onboarding) are managed by SettingsContext
  useEffect(() => {
    let alive = true;

    const loadLocalState = async () => {
      try {
        const [
          savedIdentity,
          savedSessionKey,
          savedSessionPrefs,
          savedOutboxQueue,
        ] = await Promise.all([
          kvStore.getItemAsync(OPENCLAW_IDENTITY_STORAGE_KEY),
          kvStore.getItemAsync(STORAGE_KEYS.sessionKey),
          kvStore.getItemAsync(STORAGE_KEYS.sessionPrefs),
          kvStore.getItemAsync(STORAGE_KEYS.outboxQueue),
        ]);
        if (!alive) return;

        if (savedSessionKey?.trim()) {
          setActiveSessionKey(savedSessionKey.trim());
        }
        setSessionPreferences(parseSessionPreferences(savedSessionPrefs));
        const restoredOutbox = parseOutboxQueue(savedOutboxQueue);
        if (restoredOutbox.length > 0) {
          setOutboxQueue(restoredOutbox);
          setGatewayEventState('queued');

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
            sessionTurnsRef.current.set(sessionKey, ordered);
          });

          const restoredActiveSessionKey =
            (savedSessionKey?.trim() || activeSessionKeyRef.current).trim() ||
            DEFAULT_SESSION_KEY;
          const restoredActiveTurns = turnsBySession.get(restoredActiveSessionKey);
          if (restoredActiveTurns?.length) {
            setChatTurns([...restoredActiveTurns].sort((a, b) => a.createdAt - b.createdAt));
          }
        }
        if (savedIdentity) {
          openClawIdentityMemory.set(
            OPENCLAW_IDENTITY_STORAGE_KEY,
            savedIdentity,
          );
        }
      } catch {
        // Ignore errors
      } finally {
        if (alive) {
          setLocalStateReady(true);
        }
      }
    };

    void loadLocalState();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!settingsReady) return;
    const sessionKey = activeSessionKey.trim();
    persistRuntimeSetting(async () => {
      if (sessionKey) {
        await kvStore.setItemAsync(STORAGE_KEYS.sessionKey, sessionKey);
      } else {
        await kvStore.deleteItemAsync(STORAGE_KEYS.sessionKey);
      }
    });
  }, [activeSessionKey, persistRuntimeSetting, settingsReady]);

  useEffect(() => {
    if (!settingsReady) return;
    persistRuntimeSetting(async () => {
      const entries = Object.entries(sessionPreferences);
      if (entries.length === 0) {
        await kvStore.deleteItemAsync(STORAGE_KEYS.sessionPrefs);
        return;
      }
      await kvStore.setItemAsync(
        STORAGE_KEYS.sessionPrefs,
        JSON.stringify(sessionPreferences),
      );
    });
  }, [persistRuntimeSetting, sessionPreferences, settingsReady]);

  useEffect(() => {
    if (!settingsReady) return;
    void (async () => {
      try {
        if (outboxQueue.length === 0) {
          await kvStore.deleteItemAsync(STORAGE_KEYS.outboxQueue);
          return;
        }
        await kvStore.setItemAsync(
          STORAGE_KEYS.outboxQueue,
          JSON.stringify(outboxQueue),
        );
      } catch {
        // ignore outbox persistence errors
      }
    })();
  }, [outboxQueue, settingsReady]);

  useEffect(() => {
    if (!isGatewayConnected) {
      setIsSessionPanelOpen(false);
    }
  }, [isGatewayConnected]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (event) => {
      const height = event.endCoordinates?.height ?? 0;
      setKeyboardState(true, height);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardState(false, 0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [setKeyboardState]);

  useSpeechRecognitionEvent('start', () => {
    expectedSpeechStopRef.current = false;
    setIsRecognizing(true);
    setSpeechError(null);
    void triggerHaptic('record-start');
  });

  useSpeechRecognitionEvent('end', () => {
    expectedSpeechStopRef.current = false;
    setIsRecognizing(false);
    void triggerHaptic('record-stop');
  });

  useSpeechRecognitionEvent('result', (event) => {
    const text = event.results[0]?.transcript?.trim() ?? '';
    if (!text) return;

    if (event.isFinal) {
      setTranscript((prev) => (prev ? `${prev}\n${text}` : text));
      setInterimTranscript('');
      return;
    }

    setInterimTranscript(text);
  });

  useSpeechRecognitionEvent('error', (event) => {
    const code = normalizeSpeechErrorCode(event.error);
    const isAbortedLike = isSpeechAbortLikeError(code);
    const shouldIgnore =
      isUnmountingRef.current ||
      isAbortedLike ||
      (expectedSpeechStopRef.current && code.length > 0);

    expectedSpeechStopRef.current = false;
    setIsRecognizing(false);
    if (shouldIgnore) {
      setSpeechError(null);
      return;
    }
    void triggerHaptic('send-error');
    setSpeechError(`Speech recognition error: ${errorMessage(event.error)}`);
  });

  const clearSubscriptions = () => {
    subscriptionsRef.current.forEach((unsubscribe) => {
      try {
        unsubscribe();
      } catch {
        // ignore
      }
    });
    subscriptionsRef.current = [];
  };

  const disconnectGateway = () => {
    invalidateRefreshEpoch();
    clearSubscriptions();
    clearFinalResponseRecoveryTimer();
    clearMissingResponseRecoveryState();
    clearStartupAutoConnectRetryTimer();
    clearBottomCompletePulseTimer();
    clearOutboxRetryTimer();
    if (historySyncTimerRef.current) {
      clearTimeout(historySyncTimerRef.current);
      historySyncTimerRef.current = null;
    }
    historySyncRequestRef.current = null;
    outboxProcessingRef.current = false;
    gatewayDisconnect();
    activeRunIdRef.current = null;
    setActiveRunId(null);
    pendingTurnIdRef.current = null;
    runIdToTurnIdRef.current.clear();
    setIsSessionOperationPending(false);
    runGatewayRuntimeAction({ type: 'RESET_RUNTIME' });
    setGatewayConnectDiagnostic(null);
    setIsBottomCompletePulse(false);
  };

  const updateChatTurn = useCallback(
    (turnId: string, updater: (turn: ChatTurn) => ChatTurn) => {
      setChatTurns((previous) =>
        previous.map((turn) => (turn.id === turnId ? updater(turn) : turn)),
      );
    },
    [],
  );

  const applySessionTurns = useCallback((sessionKey: string, turns: ChatTurn[]) => {
    sessionTurnsRef.current.set(sessionKey, turns);
    if (activeSessionKeyRef.current === sessionKey) {
      setChatTurns(turns);
    }
  }, []);

  const refreshSessions = useCallback(async () => {
    if (connectionState !== 'connected') {
      setSessions([]);
      setSessionsError(null);
      return;
    }

    setSessionsError(null);
    try {
      await gatewayRefreshSessions({ limit: 40, includeGlobal: true });
    } catch (err) {
      setSessionsError(`Sessions unavailable: ${errorMessage(err)}`);
    }
  }, [connectionState, gatewayRefreshSessions]);

  const loadSessionHistory = useCallback(
    async (
      sessionKey: string,
      options?: {
        silentError?: boolean;
      },
    ): Promise<boolean> => {
      const client = gatewayGetClient();
      if (!client || connectionState !== 'connected') {
        applySessionTurns(sessionKey, sessionTurnsRef.current.get(sessionKey) ?? []);
        return false;
      }

      const synced = await runHistoryRefresh({
        sessionKey,
        timeoutMs: HISTORY_REFRESH_TIMEOUT_MS,
        onStart: () => {
          runGatewayRuntimeAction({ type: 'SYNC_REQUEST' });
        },
        onError: (err) => {
          if (!options?.silentError) {
            setGatewayError(`Failed to load session history: ${errorMessage(err)}`);
          }
        },
        onFinish: (ok) => {
          runGatewayRuntimeAction({
            type: ok ? 'SYNC_SUCCESS' : 'SYNC_ERROR',
          });
        },
        run: async () => {
          const response = await client.chatHistory(sessionKey, { limit: 80 });
          const turns = buildTurnsFromHistory(response.messages, sessionKey);
          const localTurns = sessionTurnsRef.current.get(sessionKey) ?? [];
          const queuedTurnIds = new Set(
            outboxQueueRef.current
              .filter((item) => item.sessionKey === sessionKey)
              .map((item) => item.turnId),
          );
          const mergedTurns = mergeHistoryTurnsWithPendingLocal(
            turns,
            localTurns,
            queuedTurnIds,
          );
          applySessionTurns(sessionKey, mergedTurns);
          if (activeSessionKeyRef.current === sessionKey) {
            setHistoryLastSyncedAt(Date.now());
          }
          return true;
        },
      });

      if (!synced) {
        applySessionTurns(sessionKey, sessionTurnsRef.current.get(sessionKey) ?? []);
        if (!options?.silentError && connectionStateRef.current === 'connected') {
          setGatewayError((previous) =>
            previous || 'Refresh failed: request timed out. Please retry.',
          );
        }
      }
      return synced;
    },
    [
      applySessionTurns,
      connectionState,
      gatewayGetClient,
      runGatewayRuntimeAction,
      runHistoryRefresh,
    ],
  );

  const switchSession = useCallback(
    async (sessionKey: string) => {
      const nextKey = sessionKey.trim();
      if (!nextKey || nextKey === activeSessionKeyRef.current) return;
      if (isSending || isSessionOperationPending) return;

      Keyboard.dismiss();
      setFocusedField(null);
      setGatewayError(null);
      setSessionsError(null);
      setIsSessionRenameOpen(false);
      setSessionRenameTargetKey(null);
      setSessionRenameDraft('');
      setIsSending(false);
      setGatewayEventState('idle');
      activeRunIdRef.current = null;
      setActiveRunId(null);
      pendingTurnIdRef.current = null;
      runIdToTurnIdRef.current.clear();

      const cached = sessionTurnsRef.current.get(nextKey) ?? [];
      setChatTurns(cached);
      setActiveSessionKey(nextKey);
      activeSessionKeyRef.current = nextKey;

      invalidateRefreshEpoch();
      await loadSessionHistory(nextKey);
      void refreshSessions();
    },
    [
      invalidateRefreshEpoch,
      isSending,
      isSessionOperationPending,
      loadSessionHistory,
      refreshSessions,
    ],
  );

  const createAndSwitchSession = useCallback(async () => {
    if (isSending || isSessionOperationPending) return;
    const nextKey = createSessionKey();
    sessionTurnsRef.current.set(nextKey, []);
    setSessions((previous) => [{ key: nextKey, displayName: nextKey }, ...previous]);
    await switchSession(nextKey);
  }, [isSending, isSessionOperationPending, switchSession]);

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
    [sessionPreferences, sessions],
  );

  const submitSessionRename = useCallback(async () => {
    const sessionKey = (sessionRenameTargetKey ?? '').trim();
    if (!sessionKey || isSessionOperationPending) return;

    const alias = sessionRenameDraft.trim();
    setSessionsError(null);
    setIsSessionOperationPending(true);
    try {
      const client = gatewayGetClient();
      if (client && connectionState === 'connected') {
        try {
          await client.sessionsPatch(sessionKey, {
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
    connectionState,
    gatewayGetClient,
    isSessionOperationPending,
    refreshSessions,
    sessionRenameDraft,
    sessionRenameTargetKey,
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
    [isSessionOperationPending],
  );

  useEffect(() => {
    if (!isGatewayConnected) return;
    void refreshSessions();
    void loadSessionHistory(activeSessionKeyRef.current);
  }, [isGatewayConnected, loadSessionHistory, refreshSessions]);

  const processOutboxQueue = useCallback(async () => {
    if (outboxProcessingRef.current) return;
    if (connectionStateRef.current !== 'connected') return;
    if (isSending) return;

    const client = gatewayGetClient();
    if (!client) return;

    const head = outboxQueueRef.current[0];
    if (!head) {
      clearOutboxRetryTimer();
      return;
    }

    const now = Date.now();
    if (head.nextRetryAt > now) {
      const waitMs = head.nextRetryAt - now;
      clearOutboxRetryTimer();
      outboxRetryTimerRef.current = setTimeout(() => {
        outboxRetryTimerRef.current = null;
        void processOutboxQueue();
      }, waitMs);
      return;
    }

    outboxProcessingRef.current = true;
    clearOutboxRetryTimer();

    const healthy = await runGatewayHealthCheck({ silent: true });
    if (connectionStateRef.current !== 'connected') {
      outboxProcessingRef.current = false;
      return;
    }
    if (!healthy) {
      setOutboxQueue((previous) => {
        if (previous.length === 0 || previous[0].id !== head.id) return previous;
        const retryCount = previous[0].retryCount + 1;
        const nextRetryAt = Date.now() + getOutboxRetryDelayMs(retryCount);
        return [
          {
            ...previous[0],
            retryCount,
            nextRetryAt,
            lastError: 'health check failed',
          },
          ...previous.slice(1),
        ];
      });
      setGatewayError('Gateway health check failed. Retrying queued message...');
      outboxProcessingRef.current = false;
      return;
    }

    setGatewayError(null);
    runGatewayRuntimeAction({ type: 'SEND_REQUEST' });
    pendingTurnIdRef.current = head.turnId;
    updateChatTurn(head.turnId, (turn) => ({
      ...turn,
      state: 'sending',
      assistantText:
        turn.assistantText === 'Waiting for connection...'
          ? ''
          : turn.assistantText,
    }));

    try {
      const result = await client.chatSend(head.sessionKey, head.message, {
        timeoutMs: SEND_TIMEOUT_MS,
        idempotencyKey: head.idempotencyKey,
      });
      void triggerHaptic('send-success');
      activeRunIdRef.current = result.runId;
      setActiveRunId(result.runId);
      runIdToTurnIdRef.current.set(result.runId, head.turnId);
      pendingTurnIdRef.current = null;
      setOutboxQueue((previous) => previous.filter((item) => item.id !== head.id));
      updateChatTurn(head.turnId, (turn) => ({
        ...turn,
        runId: result.runId,
        state: 'queued',
      }));
      void refreshSessions();
    } catch (err) {
      const messageText = errorMessage(err);
      void triggerHaptic('send-error');
      pendingTurnIdRef.current = null;
      runGatewayRuntimeAction({ type: 'SEND_ERROR' });
      setOutboxQueue((previous) => {
        const index = previous.findIndex((item) => item.id === head.id);
        if (index < 0) return previous;
        const current = previous[index];
        const retryCount = current.retryCount + 1;
        const nextRetryAt = Date.now() + getOutboxRetryDelayMs(retryCount);
        const nextQueue = [...previous];
        nextQueue[index] = {
          ...current,
          retryCount,
          nextRetryAt,
          lastError: messageText,
        };
        return nextQueue;
      });
      setGatewayError(`Send delayed: ${messageText}. Auto retrying...`);
      updateChatTurn(head.turnId, (turn) => ({
        ...turn,
        state: 'queued',
        assistantText: `Retrying automatically... (${messageText})`,
      }));
    } finally {
      outboxProcessingRef.current = false;
    }
  }, [
    clearOutboxRetryTimer,
    isSending,
    refreshSessions,
    gatewayGetClient,
    runGatewayHealthCheck,
    runGatewayRuntimeAction,
    updateChatTurn,
  ]);

  useEffect(() => {
    if (outboxQueue.length === 0) {
      clearOutboxRetryTimer();
      return;
    }
    if (connectionState !== 'connected') {
      clearOutboxRetryTimer();
      return;
    }
    if (isSending) return;

    const head = outboxQueue[0];
    const waitMs = Math.max(0, head.nextRetryAt - Date.now());
    clearOutboxRetryTimer();
    if (waitMs > 0) {
      outboxRetryTimerRef.current = setTimeout(() => {
        outboxRetryTimerRef.current = null;
        void processOutboxQueue();
      }, waitMs);
      return;
    }

    void processOutboxQueue();
  }, [
    clearOutboxRetryTimer,
    connectionState,
    isSending,
    outboxQueue,
    processOutboxQueue,
  ]);

  const sendToGateway = useCallback(
    async (overrideText?: string) => {
      if (isSending) return;

      const sessionKey = activeSessionKeyRef.current;
      clearMissingResponseRecoveryState(sessionKey);
      const message =
        (overrideText ?? transcriptRef.current ?? '').trim() ||
        (interimTranscriptRef.current ?? '').trim();
      if (!message) {
        setGatewayError('No text to send. Please record your voice first.');
        return;
      }
      const dispatch = resolveSendDispatch(
        sendFingerprintRef.current,
        {
          sessionKey,
          message,
          now: Date.now(),
        },
        {
          duplicateBlockMs: DUPLICATE_SEND_BLOCK_MS,
          reuseWindowMs: IDEMPOTENCY_REUSE_WINDOW_MS,
        },
      );
      if (dispatch.blocked) {
        setGatewayError('This message was already sent. Please wait a moment.');
        return;
      }
      const { idempotencyKey } = dispatch;
      sendFingerprintRef.current = dispatch.nextFingerprint;

      const turnId = createTurnId();
      const createdAt = Date.now();
      const outboxItem: OutboxQueueItem = {
        id: createOutboxItemId(),
        sessionKey,
        message,
        turnId,
        idempotencyKey,
        createdAt,
        retryCount: 0,
        nextRetryAt: createdAt,
        lastError: null,
      };

      setChatTurns((previous) => [
        ...previous,
        {
          id: turnId,
          userText: message,
          assistantText:
            connectionState === 'connected'
              ? ''
              : 'Waiting for connection...',
          state: 'queued',
          createdAt,
        },
      ]);
      setOutboxQueue((previous) => [...previous, outboxItem]);

      transcriptRef.current = '';
      interimTranscriptRef.current = '';
      setTranscript('');
      setInterimTranscript('');

      if (connectionState === 'connected') {
        setGatewayError(null);
        void processOutboxQueue();
      } else {
        setGatewayEventState('queued');
        setGatewayError('Message queued. Connect to send automatically.');
      }
    },
    [clearMissingResponseRecoveryState, connectionState, isSending, processOutboxQueue],
  );

  const { handleChatEvent } = useGatewayEventBridge({
    activeSessionKeyRef,
    activeRunIdRef,
    pendingTurnIdRef,
    runIdToTurnIdRef,
    sessionTurnsRef,
    updateChatTurn,
    setGatewayEventState,
    setIsSending,
    setActiveRunId,
    isOnboardingWaitingForResponse,
    isIncompleteAssistantContent,
    setIsOnboardingWaitingForResponse,
    setIsOnboardingCompleted,
    scheduleFinalResponseRecovery: (sessionKey, attempt) => {
      scheduleFinalResponseRecovery(sessionKey, attempt);
    },
    scheduleMissingResponseRecovery: (sessionKey, turnId, options) => {
      scheduleMissingResponseRecovery(sessionKey, turnId, options);
    },
    scheduleSessionHistorySync: (sessionKey, options) => {
      scheduleSessionHistorySync(sessionKey, options);
    },
    clearFinalResponseRecoveryTimer,
    clearMissingResponseRecoveryState,
    refreshSessions,
    setGatewayError,
    extractFinalChatEventText,
  });

  const connectGateway = async (options?: { auto?: boolean; autoAttempt?: number }) => {
    const isAutoConnect = options?.auto === true;
    const autoAttempt = options?.autoAttempt ?? 1;
    const trimmedGatewayUrl = gatewayUrl.trim();
    const hasToken = authToken.trim().length > 0;
    if (!isAutoConnect) {
      clearStartupAutoConnectRetryTimer();
      setIsStartupAutoConnecting(false);
    }

    if (!settingsReady) {
      setGatewayError('Initializing. Please wait a few seconds and try again.');
      if (isAutoConnect) setIsStartupAutoConnecting(false);
      return;
    }

    if (!trimmedGatewayUrl) {
      setGatewayError('Please enter a Gateway URL.');
      if (isAutoConnect) setIsStartupAutoConnecting(false);
      return;
    }

    let parsedGatewayUrl: URL;
    try {
      parsedGatewayUrl = new URL(trimmedGatewayUrl);
    } catch {
      const invalidUrlDiagnostic: GatewayConnectDiagnostic = {
        kind: 'invalid-url',
        summary: 'Gateway URL is invalid.',
        guidance: 'Use ws:// or wss:// with a valid host.',
      };
      setGatewayConnectDiagnostic(invalidUrlDiagnostic);
      setGatewayError(
        `${invalidUrlDiagnostic.summary} ${invalidUrlDiagnostic.guidance}`,
      );
      if (isAutoConnect) setIsStartupAutoConnecting(false);
      return;
    }

    if (!/^wss?:$/i.test(parsedGatewayUrl.protocol)) {
      const invalidSchemeDiagnostic: GatewayConnectDiagnostic = {
        kind: 'invalid-url',
        summary: 'Gateway URL must start with ws:// or wss://.',
        guidance: `Current protocol is ${parsedGatewayUrl.protocol}`,
      };
      setGatewayConnectDiagnostic(invalidSchemeDiagnostic);
      setGatewayError(
        `${invalidSchemeDiagnostic.summary} ${invalidSchemeDiagnostic.guidance}`,
      );
      if (isAutoConnect) setIsStartupAutoConnecting(false);
      return;
    }

    if (isAutoConnect) {
      setIsStartupAutoConnecting(true);
      startupAutoConnectAttemptRef.current = autoAttempt;
    }

    const connectOnce = async (clientId: string) => {
      invalidateRefreshEpoch();
      disconnectGateway();
      setGatewayError(null);
      setGatewayConnectDiagnostic(null);
      setSessionsError(null);
      await gatewayConnect(trimmedGatewayUrl, {
        token: authToken.trim() || undefined,
        autoReconnect: true,
        platform: GATEWAY_PLATFORM,
        clientId,
        displayName: GATEWAY_DISPLAY_NAME,
        scopes: ['operator.read', 'operator.write'],
        caps: ['talk'],
      });

      const client = gatewayGetClient();
      if (!client) {
        throw new Error('Connection established but Gateway client is unavailable.');
      }

      const pairingListener = () => {
        setGatewayError(
          'Pairing approval required. Please allow this device on OpenClaw.',
        );
        setGatewayConnectDiagnostic({
          kind: 'pairing',
          summary: 'Pairing approval required.',
          guidance: 'Approve this device from OpenClaw pairing screen.',
        });
        setGatewayEventState('pairing-required');
      };

      const onChatEvent = client.onChatEvent(handleChatEvent);
      client.on('pairing.required', pairingListener);

      subscriptionsRef.current = [
        onChatEvent,
        () => client.off('pairing.required', pairingListener),
      ];
    };

    try {
      await connectOnce(REQUESTED_GATEWAY_CLIENT_ID);
      setGatewayError(null);
      setGatewayConnectDiagnostic(null);
      setGatewayEventState('ready');
      setIsSettingsPanelOpen(false);
      forceMaskAuthToken();
      if (isAutoConnect) {
        clearStartupAutoConnectRetryTimer();
        startupAutoConnectAttemptRef.current = 0;
      }
    } catch (err) {
      disconnectGateway();
      const errorText = errorMessage(err);
      const diagnostic =
        gatewayContextConnectDiagnostic ??
        classifyGatewayConnectFailure({
          error: err,
          hasToken,
        });
      setGatewayConnectDiagnostic(diagnostic);
      if (isAutoConnect) {
        const retryPlan = computeAutoConnectRetryPlan({
          attempt: autoAttempt,
          maxAttempts: STARTUP_AUTO_CONNECT_MAX_ATTEMPTS,
          baseDelayMs: STARTUP_AUTO_CONNECT_RETRY_BASE_MS,
          errorText: `${diagnostic.summary} ${errorText}`,
        });
        if (retryPlan.shouldRetry) {
          clearStartupAutoConnectRetryTimer();
          startupAutoConnectRetryTimerRef.current = setTimeout(() => {
            startupAutoConnectRetryTimerRef.current = null;
            if (isUnmountingRef.current) return;
            if (!gatewayUrlRef.current.trim()) return;
            if (connectionStateRef.current !== 'disconnected') return;
            void connectGateway({ auto: true, autoAttempt: retryPlan.nextAttempt });
          }, retryPlan.delayMs);
          setGatewayError(retryPlan.message);
        } else {
          setGatewayError(retryPlan.message);
        }
      } else {
        setGatewayError(`${diagnostic.summary} ${diagnostic.guidance}`);
      }
    } finally {
      if (isAutoConnect) {
        setIsStartupAutoConnecting(false);
      }
    }
  };

  useEffect(() => {
    if (!localStateReady) {
      return;
    }
    if (
      !shouldStartStartupAutoConnect({
        settingsReady,
        alreadyAttempted: startupAutoConnectAttemptedRef.current,
        gatewayUrl,
        connectionState,
      })
    ) {
      return;
    }
    startupAutoConnectAttemptedRef.current = true;
    startupAutoConnectAttemptRef.current = 1;
    void connectGateway({ auto: true, autoAttempt: 1 });
  }, [connectionState, gatewayUrl, localStateReady, settingsReady]);

  useEffect(() => {
    return () => {
      isUnmountingRef.current = true;
      invalidateRefreshEpoch();
      expectedSpeechStopRef.current = true;
      if (holdStartTimerRef.current) {
        clearTimeout(holdStartTimerRef.current);
        holdStartTimerRef.current = null;
      }
      if (historySyncTimerRef.current) {
        clearTimeout(historySyncTimerRef.current);
        historySyncTimerRef.current = null;
      }
      historySyncRequestRef.current = null;
      if (historyNoticeTimerRef.current) {
        clearTimeout(historyNoticeTimerRef.current);
        historyNoticeTimerRef.current = null;
      }
      if (bottomCompletePulseTimerRef.current) {
        clearTimeout(bottomCompletePulseTimerRef.current);
        bottomCompletePulseTimerRef.current = null;
      }
      if (authTokenMaskTimerRef.current) {
        clearTimeout(authTokenMaskTimerRef.current);
        authTokenMaskTimerRef.current = null;
      }
      if (outboxRetryTimerRef.current) {
        clearTimeout(outboxRetryTimerRef.current);
        outboxRetryTimerRef.current = null;
      }
      if (startupAutoConnectRetryTimerRef.current) {
        clearTimeout(startupAutoConnectRetryTimerRef.current);
        startupAutoConnectRetryTimerRef.current = null;
      }
      if (finalResponseRecoveryTimerRef.current) {
        clearTimeout(finalResponseRecoveryTimerRef.current);
        finalResponseRecoveryTimerRef.current = null;
      }
      if (missingResponseRecoveryTimerRef.current) {
        clearTimeout(missingResponseRecoveryTimerRef.current);
        missingResponseRecoveryTimerRef.current = null;
      }
      missingResponseRecoveryRequestRef.current = null;
      if (settingsFocusScrollTimerRef.current) {
        clearTimeout(settingsFocusScrollTimerRef.current);
        settingsFocusScrollTimerRef.current = null;
      }
      if (quickTextTooltipTimerRef.current) {
        clearTimeout(quickTextTooltipTimerRef.current);
        quickTextTooltipTimerRef.current = null;
      }
      if (quickTextLongPressResetTimerRef.current) {
        clearTimeout(quickTextLongPressResetTimerRef.current);
        quickTextLongPressResetTimerRef.current = null;
      }
      quickTextLongPressSideRef.current = null;
      disconnectGateway();
      clearSubscriptions();
      if (supportsSpeechRecognitionOnCurrentPlatform()) {
        ExpoSpeechRecognitionModule.abort();
      }
    };
  }, []);

  const startRecognition = async () => {
    if (!supportsSpeechRecognitionOnCurrentPlatform()) {
      setSpeechError(
        isMacDesktopRuntime()
          ? 'macOSでは音声入力未対応です。'
          : 'Webでは音声入力未対応です。',
      );
      return;
    }
    if (isRecognizing) return;

    expectedSpeechStopRef.current = false;
    setSpeechError(null);
    setTranscript('');
    setInterimTranscript('');

    const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permission.granted) {
      setSpeechError('Microphone or speech recognition permission is not granted.');
      return;
    }

    if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
      setSpeechError('Speech recognition is not available on this device.');
      return;
    }

    ExpoSpeechRecognitionModule.start({
      lang: speechLang,
      interimResults: true,
      maxAlternatives: 1,
      continuous: false,
    });
  };

  const stopRecognition = () => {
    if (!supportsSpeechRecognitionOnCurrentPlatform()) return;
    expectedSpeechStopRef.current = true;
    ExpoSpeechRecognitionModule.stop();
  };

  const clearTranscriptDraft = useCallback(() => {
    transcriptRef.current = '';
    interimTranscriptRef.current = '';
    setTranscript('');
    setInterimTranscript('');
    setSpeechError(null);
    void triggerHaptic('button-press');
  }, []);

  const insertQuickText = useCallback(
    (rawText: string) => {
      const nextText = rawText.trim();
      if (!nextText || isRecognizing) return;
      setTranscript((previous) => {
        const current = previous.trimEnd();
        if (!current) return nextText;
        return `${current}\n${nextText}`;
      });
      setInterimTranscript('');
      void triggerHaptic('button-press');
    },
    [isRecognizing],
  );

  const clearQuickTextTooltipTimer = useCallback(() => {
    if (quickTextTooltipTimerRef.current) {
      clearTimeout(quickTextTooltipTimerRef.current);
      quickTextTooltipTimerRef.current = null;
    }
  }, []);

  const clearQuickTextLongPressResetTimer = useCallback(() => {
    if (quickTextLongPressResetTimerRef.current) {
      clearTimeout(quickTextLongPressResetTimerRef.current);
      quickTextLongPressResetTimerRef.current = null;
    }
  }, []);

  const hideQuickTextTooltip = useCallback(() => {
    clearQuickTextTooltipTimer();
    setQuickTextTooltipSide(null);
  }, [clearQuickTextTooltipTimer]);

  const scheduleQuickTextTooltipHide = useCallback(() => {
    clearQuickTextTooltipTimer();
    quickTextTooltipTimerRef.current = setTimeout(() => {
      quickTextTooltipTimerRef.current = null;
      setQuickTextTooltipSide(null);
    }, QUICK_TEXT_TOOLTIP_HIDE_MS);
  }, [clearQuickTextTooltipTimer]);

  const ensureSettingsFieldVisible = useCallback((field: QuickTextFocusField) => {
    if (settingsFocusScrollTimerRef.current) {
      clearTimeout(settingsFocusScrollTimerRef.current);
    }
    settingsFocusScrollTimerRef.current = setTimeout(() => {
      settingsFocusScrollTimerRef.current = null;
      const scrollView = settingsScrollRef.current;
      const input = quickTextInputRefs.current[field];
      if (!scrollView || !input) {
        return;
      }
      const inputHandle = findNodeHandle(input);
      if (!inputHandle) return;

      const responder = (scrollView as unknown as {
        getScrollResponder?: () => unknown;
      }).getScrollResponder?.() as
        | {
            scrollResponderScrollNativeHandleToKeyboard?: (
              nodeHandle: number,
              additionalOffset?: number,
              preventNegativeScrollOffset?: boolean,
            ) => void;
          }
        | undefined;

      if (responder?.scrollResponderScrollNativeHandleToKeyboard) {
        responder.scrollResponderScrollNativeHandleToKeyboard(
          inputHandle,
          Platform.OS === 'ios' ? 28 : 16,
          true,
        );
        return;
      }

      scrollView.scrollToEnd({ animated: true });
    }, Platform.OS === 'ios' ? 240 : 120);
  }, []);

  const {
    scheduleSessionHistorySync,
    scheduleMissingResponseRecovery,
    scheduleFinalResponseRecovery,
  } = useSessionRuntime({
    historySyncTimerRef,
    historySyncRequestRef,
    missingResponseRecoveryTimerRef,
    missingResponseRecoveryRequestRef,
    finalResponseRecoveryTimerRef,
    connectionStateRef,
    sessionTurnsRef,
    clearMissingResponseRecoveryTimer,
    clearFinalResponseRecoveryTimer,
    loadSessionHistory,
    refreshSessions,
    setIsMissingResponseRecoveryInFlight,
    setMissingResponseNotice,
    isTurnWaitingState,
  });

  const {
    canSendDraft,
    quickTextLeftLabel,
    quickTextRightLabel,
    isTranscriptFocused,
    isQuickTextSettingsEditMode,
    showKeyboardActionBar,
    showDoneOnlyAction,
    showClearInKeyboardBar,
    canSendFromKeyboardBar,
    canClearFromKeyboardBar,
    speechRecognitionSupported,
    canUseQuickTextLeft,
    canUseQuickTextRight,
    showQuickTextLeftTooltip,
    showQuickTextRightTooltip,
    isTranscriptEditingWithKeyboard,
    isHomeComposingMode,
    showHistoryCard,
    showHistoryRefreshButton,
    transcriptPlaceholder,
    shouldUseCompactTranscriptCard,
    canSwitchSession,
    canRefreshSessions,
    canCreateSession,
    canRenameSession,
    canPinSession,
    visibleSessions,
    sessionPanelStatusText,
    sessionListHintText,
    settingsStatusText,
    isSettingsStatusError,
    isSettingsStatusPending,
    sectionIconColor,
    actionIconColor,
    currentBadgeIconColor,
    pinnedBadgeIconColor,
    optionIconColor,
    showOnboardingGuide,
    isOnboardingGatewayConfigured,
    isOnboardingConnectDone,
    isOnboardingResponseDone,
    canRunOnboardingConnectTest,
    canRunOnboardingSampleSend,
    onboardingSampleButtonLabel,
    showGatewayDiagnostic,
    gatewayDiagnosticIconName,
    activeMissingResponseNotice,
    canRetryMissingResponse,
    historyUpdatedLabel,
    showHistoryUpdatedMeta,
    historyListBottomPadding,
    bottomActionStatus,
    bottomActionDetailText,
    showBottomStatus,
    bottomActionStatusLabel,
    connectionStatusLabel,
    showHistoryDateDivider,
    showHistoryScrollButton,
    historyItems,
    latestRetryText,
    canReconnectFromError,
    canRetryFromError,
    topBannerKind,
    topBannerMessage,
    topBannerIconName,
  } = useHomeUiState({
    transcript,
    interimTranscript,
    isRecognizing,
    quickTextLeft,
    quickTextRight,
    focusedField,
    shouldShowSettingsScreen,
    isKeyboardVisible,
    isSending,
    settingsReady,
    isSessionOperationPending,
    isGatewayConnected,
    isSessionsLoading,
    sessions,
    sessionPreferences,
    sessionsError,
    isSettingsSaving,
    settingsPendingSaveCount,
    settingsSaveError,
    settingsLastSavedAt,
    isDarkTheme,
    isOnboardingCompleted,
    gatewayUrl,
    chatTurns,
    isGatewayConnecting,
    isOnboardingWaitingForResponse,
    gatewayConnectDiagnostic,
    outboxQueueLength: outboxQueue.length,
    missingResponseNotice,
    activeSessionKey,
    isMissingResponseRecoveryInFlight,
    historyRefreshNotice,
    historyLastSyncedAt,
    historyBottomInset,
    showScrollToBottomButton,
    gatewayError,
    speechError,
    gatewayEventState,
    connectionState,
    isStartupAutoConnecting,
    isBottomCompletePulse,
    isKeyboardBarMounted,
    formatClockLabel,
    getHistoryDayKey,
    getHistoryDayLabel,
    quickTextTooltipSide,
  });
  const handleButtonPressHaptic = useCallback(() => {
    void triggerHaptic('button-press');
  }, []);

  const {
    handleQuickTextLongPress,
    handleQuickTextPress,
    handleQuickTextPressOut,
    handleReconnectFromError,
    handleRetryFromError,
    handleRetryMissingResponse,
    handleDismissTopBanner,
    handleCompleteOnboarding,
    handleOnboardingConnectTest,
    handleOnboardingSendSample,
    handleToggleSessionPanel,
    handleToggleSettingsPanel,
    handleCloseSettingsPanel,
    handleCloseSessionPanel,
    handleDoneKeyboardAction,
    handleClearKeyboardAction,
    handleSendKeyboardAction,
    handleSendDraftAction,
    handleTranscriptChange,
    handleTranscriptFocus,
    handleTranscriptBlur,
    handleRefreshHistory,
    handleScrollHistoryToBottom,
    handleHoldToTalkPressIn,
    handleHoldToTalkPressOut,
    handleHistoryScroll,
    handleHistoryAutoScroll,
    handleHistoryLayoutAutoScroll,
    handleBottomDockHeightChange,
    handleBottomDockActionPressHaptic,
  } = useHomeUiHandlers({
    clearQuickTextLongPressResetTimer,
    scheduleQuickTextTooltipHide,
    hideQuickTextTooltip,
    insertQuickText,
    setQuickTextTooltipSide,
    quickTextLongPressSideRef,
    quickTextLongPressResetTimerRef,
    onButtonPressHaptic: handleButtonPressHaptic,
    canReconnectFromError,
    canRetryFromError,
    latestRetryText,
    connectGateway,
    sendToGateway,
    setFocusedField,
    activeMissingResponseNotice,
    isMissingResponseRecoveryInFlight,
    isGatewayConnected,
    setGatewayError,
    scheduleMissingResponseRecovery,
    topBannerKind,
    setMissingResponseNotice,
    setHistoryRefreshNotice,
    setSpeechError,
    setIsOnboardingWaitingForResponse,
    setIsOnboardingCompleted,
    canRunOnboardingConnectTest,
    canRunOnboardingSampleSend,
    onboardingSampleMessage: ONBOARDING_SAMPLE_MESSAGE,
    forceMaskAuthToken,
    isSessionPanelOpen,
    refreshSessions,
    setIsSettingsPanelOpen,
    setIsSessionPanelOpen,
    setIsSessionRenameOpen,
    setSessionRenameTargetKey,
    setSessionRenameDraft,
    canToggleSettingsPanel,
    canDismissSettingsScreen,
    canClearFromKeyboardBar,
    clearTranscriptDraft,
    canSendFromKeyboardBar,
    transcript,
    interimTranscript,
    setTranscript,
    setInterimTranscript,
    isSessionHistoryLoading,
    clearHistoryNoticeTimer,
    activeSessionKeyRef,
    loadSessionHistory,
    setHistoryLastSyncedAt,
    showHistoryRefreshNotice,
    formatClockLabel,
    scrollHistoryToBottom,
    historyAutoScrollRef,
    setShowScrollToBottomButton,
    chatTurnsLength: chatTurns.length,
    historyBottomThresholdPx: HISTORY_BOTTOM_THRESHOLD_PX,
    speechRecognitionSupported,
    isRecognizing,
    isSending,
    holdActivatedRef,
    holdStartTimerRef,
    startRecognition,
    stopRecognition,
    composerHeight,
    setComposerHeight,
  });

  const styles = useMemo(() => createStyles(isDarkTheme), [isDarkTheme]);
  const placeholderColor = isDarkTheme ? '#95a8ca' : '#C4C4C0';

  useEffect(() => {
    if (showKeyboardActionBar) {
      setIsKeyboardBarMounted(true);
    }
    keyboardBarAnim.stopAnimation();
    Animated.timing(keyboardBarAnim, {
      toValue: showKeyboardActionBar ? 1 : 0,
      duration: showKeyboardActionBar ? 140 : 120,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !showKeyboardActionBar) {
        setIsKeyboardBarMounted(false);
      }
    });
  }, [keyboardBarAnim, showKeyboardActionBar]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style={isDarkTheme ? 'light' : 'dark'} />
      <KeyboardAvoidingView
        style={styles.keyboardWrap}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ConnectionHeader
          styles={styles}
          isDarkTheme={isDarkTheme}
          connectionLabel={connectionStatusLabel}
          isGatewayConnected={isGatewayConnected}
          isGatewayConnecting={isGatewayConnecting}
          isSessionPanelOpen={isSessionPanelOpen}
          isSettingsPanelOpen={isSettingsPanelOpen}
          canToggleSettingsPanel={canToggleSettingsPanel}
          onToggleSessionPanel={handleToggleSessionPanel}
          onToggleSettingsPanel={handleToggleSettingsPanel}
          maxTextScaleTight={MAX_TEXT_SCALE_TIGHT}
        />

        <SettingsScreenModal
          visible={shouldShowSettingsScreen}
          styles={styles}
          isDarkTheme={isDarkTheme}
          canDismissSettingsScreen={canDismissSettingsScreen}
          isSettingsStatusPending={isSettingsStatusPending}
          isSettingsStatusError={isSettingsStatusError}
          settingsStatusText={settingsStatusText}
          isKeyboardVisible={isKeyboardVisible}
          settingsScrollRef={settingsScrollRef}
          onClose={handleCloseSettingsPanel}
          maxTextScaleTight={MAX_TEXT_SCALE_TIGHT}
        >
          <SettingsPanelContent
            styles={styles}
            maxTextScale={MAX_TEXT_SCALE}
            maxTextScaleTight={MAX_TEXT_SCALE_TIGHT}
            showOnboardingGuide={showOnboardingGuide}
            isQuickTextSettingsEditMode={isQuickTextSettingsEditMode}
            sectionIconColor={sectionIconColor}
            currentBadgeIconColor={currentBadgeIconColor}
            optionIconColor={optionIconColor}
            actionIconColor={actionIconColor}
            isOnboardingGatewayConfigured={isOnboardingGatewayConfigured}
            isOnboardingConnectDone={isOnboardingConnectDone}
            isOnboardingResponseDone={isOnboardingResponseDone}
            isOnboardingWaitingForResponse={isOnboardingWaitingForResponse}
            canRunOnboardingConnectTest={canRunOnboardingConnectTest}
            canRunOnboardingSampleSend={canRunOnboardingSampleSend}
            isGatewayConnecting={isGatewayConnecting}
            onboardingSampleButtonLabel={onboardingSampleButtonLabel}
            onOnboardingConnectTest={handleOnboardingConnectTest}
            onOnboardingSendSample={handleOnboardingSendSample}
            onCompleteOnboarding={handleCompleteOnboarding}
            focusedField={focusedField}
            setFocusedField={setFocusedField}
            gatewayUrl={gatewayUrl}
            setGatewayUrl={setGatewayUrl}
            authToken={authToken}
            setAuthToken={setAuthToken}
            placeholderColor={placeholderColor}
            isAuthTokenMasked={isAuthTokenMasked}
            toggleAuthTokenVisibility={toggleAuthTokenVisibility}
            settingsReady={settingsReady}
            connectGateway={connectGateway}
            isStartupAutoConnecting={isStartupAutoConnecting}
            isDarkTheme={isDarkTheme}
            showGatewayDiagnostic={showGatewayDiagnostic}
            gatewayDiagnosticIconName={gatewayDiagnosticIconName}
            gatewayConnectDiagnostic={gatewayConnectDiagnostic}
            theme={theme}
            setTheme={setTheme}
            speechLang={speechLang}
            setSpeechLang={setSpeechLang}
            quickTextInputRefs={quickTextInputRefs}
            quickTextLeft={quickTextLeft}
            setQuickTextLeft={setQuickTextLeft}
            quickTextRight={quickTextRight}
            setQuickTextRight={setQuickTextRight}
            quickTextLeftIcon={quickTextLeftIcon}
            setQuickTextLeftIcon={setQuickTextLeftIcon}
            quickTextRightIcon={quickTextRightIcon}
            setQuickTextRightIcon={setQuickTextRightIcon}
            ensureSettingsFieldVisible={ensureSettingsFieldVisible}
            enableDebugWarnings={ENABLE_DEBUG_WARNINGS}
            connectionState={connectionState}
            gatewayEventState={gatewayEventState}
            activeSessionKey={activeSessionKey}
            activeRunId={activeRunId}
            historyLastSyncedAt={historyLastSyncedAt}
            startupAutoConnectAttempt={startupAutoConnectAttemptRef.current}
          />
        </SettingsScreenModal>
      <SessionsScreenModal
        visible={isGatewayConnected && isSessionPanelOpen}
        styles={styles}
        isDarkTheme={isDarkTheme}
        isSessionsLoading={isSessionsLoading}
        hasSessionsError={Boolean(sessionsError)}
        sessionPanelStatusText={sessionPanelStatusText}
        onClose={handleCloseSessionPanel}
        maxTextScaleTight={MAX_TEXT_SCALE_TIGHT}
      >
        <SessionsPanelContent
          styles={styles}
          sectionIconColor={sectionIconColor}
          actionIconColor={actionIconColor}
          currentBadgeIconColor={currentBadgeIconColor}
          pinnedBadgeIconColor={pinnedBadgeIconColor}
          isGatewayConnected={isGatewayConnected}
          canRefreshSessions={canRefreshSessions}
          canCreateSession={canCreateSession}
          canSwitchSession={canSwitchSession}
          canRenameSession={canRenameSession}
          canPinSession={canPinSession}
          activeSessionKey={activeSessionKey}
          visibleSessions={visibleSessions}
          sessionRenameTargetKey={sessionRenameTargetKey}
          isSessionRenameOpen={isSessionRenameOpen}
          sessionRenameDraft={sessionRenameDraft}
          setSessionRenameDraft={setSessionRenameDraft}
          placeholderColor={placeholderColor}
          isSessionOperationPending={isSessionOperationPending}
          sessionsError={sessionsError}
          sessionListHintText={sessionListHintText}
          maxTextScale={MAX_TEXT_SCALE}
          maxTextScaleTight={MAX_TEXT_SCALE_TIGHT}
          refreshSessions={refreshSessions}
          createAndSwitchSession={createAndSwitchSession}
          switchSession={switchSession}
          isSessionPinned={isSessionPinned}
          getSessionTitle={getSessionTitle}
          formatSessionUpdatedAt={formatSessionUpdatedAt}
          startSessionRename={startSessionRename}
          toggleSessionPinned={toggleSessionPinned}
          submitSessionRename={submitSessionRename}
          setIsSessionRenameOpen={setIsSessionRenameOpen}
          setSessionRenameTargetKey={setSessionRenameTargetKey}
        />
      </SessionsScreenModal>
        <HomeMainLayout
          styles={styles}
          isDarkTheme={isDarkTheme}
          topBannerKind={topBannerKind}
          topBannerMessage={topBannerMessage ?? null}
          topBannerIconName={topBannerIconName}
          canReconnectFromError={canReconnectFromError}
          canRetryFromError={canRetryFromError}
          canRetryMissingResponse={canRetryMissingResponse}
          isMissingResponseRecoveryInFlight={isMissingResponseRecoveryInFlight}
          isGatewayConnected={isGatewayConnected}
          onReconnectFromError={handleReconnectFromError}
          onRetryFromError={handleRetryFromError}
          onRetryMissingResponse={handleRetryMissingResponse}
          onDismissTopBanner={handleDismissTopBanner}
          showHistoryCard={showHistoryCard}
          showHistoryRefreshButton={showHistoryRefreshButton}
          isSessionHistoryLoading={isSessionHistoryLoading}
          onRefreshHistory={handleRefreshHistory}
          showHistoryUpdatedMeta={showHistoryUpdatedMeta}
          historyUpdatedLabel={historyUpdatedLabel}
          historyScrollRef={historyScrollRef}
          historyItems={historyItems}
          historyListBottomPadding={historyListBottomPadding}
          showScrollToBottomButton={showScrollToBottomButton}
          showHistoryScrollButton={showHistoryScrollButton}
          isHomeComposingMode={isHomeComposingMode}
          showHistoryDateDivider={showHistoryDateDivider}
          onHistoryScroll={handleHistoryScroll}
          onHistoryAutoScroll={handleHistoryAutoScroll}
          onHistoryLayoutAutoScroll={handleHistoryLayoutAutoScroll}
          onScrollHistoryToBottom={handleScrollHistoryToBottom}
          isRecognizing={isRecognizing}
          isTranscriptEditingWithKeyboard={isTranscriptEditingWithKeyboard}
          shouldUseCompactTranscriptCard={shouldUseCompactTranscriptCard}
          focusedField={focusedField}
          transcript={transcript}
          transcriptPlaceholder={transcriptPlaceholder}
          placeholderColor={placeholderColor}
          interimTranscript={interimTranscript}
          onTranscriptChange={handleTranscriptChange}
          onFocusTranscript={handleTranscriptFocus}
          onBlurTranscript={handleTranscriptBlur}
          isTranscriptFocused={isTranscriptFocused}
          isKeyboardVisible={isKeyboardVisible}
          onBottomDockHeightChange={handleBottomDockHeightChange}
          isKeyboardBarMounted={isKeyboardBarMounted}
          keyboardBarAnim={keyboardBarAnim}
          showDoneOnlyAction={showDoneOnlyAction}
          showClearInKeyboardBar={showClearInKeyboardBar}
          canClearFromKeyboardBar={canClearFromKeyboardBar}
          canSendFromKeyboardBar={canSendFromKeyboardBar}
          onDoneKeyboardAction={handleDoneKeyboardAction}
          onClearKeyboardAction={handleClearKeyboardAction}
          onSendKeyboardAction={handleSendKeyboardAction}
          showQuickTextLeftTooltip={showQuickTextLeftTooltip}
          showQuickTextRightTooltip={showQuickTextRightTooltip}
          quickTextLeftLabel={quickTextLeftLabel}
          quickTextRightLabel={quickTextRightLabel}
          quickTextLeftIcon={quickTextLeftIcon}
          quickTextRightIcon={quickTextRightIcon}
          canUseQuickTextLeft={canUseQuickTextLeft}
          canUseQuickTextRight={canUseQuickTextRight}
          onQuickTextPress={handleQuickTextPress}
          onQuickTextLongPress={handleQuickTextLongPress}
          onQuickTextPressOut={handleQuickTextPressOut}
          canSendDraft={canSendDraft}
          isSending={isSending}
          speechRecognitionSupported={speechRecognitionSupported}
          settingsReady={settingsReady}
          onSendDraftAction={handleSendDraftAction}
          onMicPressIn={handleHoldToTalkPressIn}
          onMicPressOut={handleHoldToTalkPressOut}
          onActionPressHaptic={handleBottomDockActionPressHaptic}
          showBottomStatus={showBottomStatus}
          bottomActionStatus={bottomActionStatus}
          bottomActionLabel={bottomActionStatusLabel}
          bottomActionDetailText={bottomActionDetailText}
          maxTextScale={MAX_TEXT_SCALE}
          maxTextScaleTight={MAX_TEXT_SCALE_TIGHT}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/**
 * Root App component with Providers
 */
export default function App() {
  return (
    <ThemeProvider>
      <SettingsProvider>
        <GatewayProvider>
          <AppContent />
        </GatewayProvider>
      </SettingsProvider>
    </ThemeProvider>
  );
}
