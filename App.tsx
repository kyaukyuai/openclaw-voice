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
  NativeScrollEvent,
  NativeSyntheticEvent,
  findNodeHandle,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import {
  GatewayClient,
  setStorage,
  type ChatEventPayload,
  type ChatMessage,
  type ConnectionState,
  type SessionEntry,
  type Storage as OpenClawStorage,
} from './src/openclaw';
import {
  buildHistoryRefreshNotice,
  computeHistorySyncRetryPlan,
  computeAutoConnectRetryPlan,
  mergeHistoryTurnsWithPendingLocal,
  normalizeMessageForDedupe,
  resolveCompletedAssistantText,
  resolveSendDispatch,
  shouldAttemptFinalRecovery,
  shouldStartStartupAutoConnect,
  isIncompleteAssistantContent,
} from './src/ui/runtime-logic';

// Import extracted types
import type {
  AppTheme,
  BottomActionStatus,
  ComponentProps,
  FocusField,
  GatewayConnectDiagnostic,
  HomeDisplayMode,
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
  CONNECTION_LABELS,
  REQUESTED_GATEWAY_CLIENT_ID,
  GATEWAY_DISPLAY_NAME,
  ENABLE_DEBUG_WARNINGS,
  GATEWAY_PLATFORM,
  DEFAULTS,
  TIMINGS,
  UI,
  BOTTOM_ACTION_STATUS_LABELS,
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
  FINAL_RESPONSE_RECOVERY_BASE_DELAY_MS,
  FINAL_RESPONSE_RECOVERY_MAX_ATTEMPTS,
  MISSING_RESPONSE_RECOVERY_INITIAL_DELAY_MS,
  MISSING_RESPONSE_RECOVERY_RETRY_BASE_MS,
  MISSING_RESPONSE_RECOVERY_MAX_ATTEMPTS,
  HISTORY_SYNC_INITIAL_DELAY_MS,
  HISTORY_SYNC_RETRY_BASE_MS,
  HISTORY_SYNC_MAX_ATTEMPTS,
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
  toTextContent,
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
  mergeAssistantStreamText,
  isMacDesktopRuntime,
  supportsSpeechRecognitionOnCurrentPlatform,
} from './src/utils';
import { useGatewayRuntime } from './src/ios-runtime/useGatewayRuntime';
import { useHistoryRuntime } from './src/ios-runtime/useHistoryRuntime';
import { useComposerRuntime } from './src/ios-runtime/useComposerRuntime';
import { scheduleHistoryScrollToEnd } from './src/ui/history-layout';
import ConnectionHeader from './src/ui/ios/ConnectionHeader';
import SettingsScreenModal from './src/ui/ios/SettingsScreenModal';
import SessionsScreenModal from './src/ui/ios/SessionsScreenModal';
import SettingsPanelContent from './src/ui/ios/SettingsPanelContent';
import SessionsPanelContent from './src/ui/ios/SessionsPanelContent';
import HomeMainLayout from './src/ui/ios/HomeMainLayout';

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
    setConnectionState,
    setGatewayEventState,
    setIsSending,
    setIsSessionHistoryLoading,
    setIsMissingResponseRecoveryInFlight,
  } = useGatewayRuntime();
  const connectionState = gatewayRuntime.connectionState;
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

  const clientRef = useRef<GatewayClient | null>(null);
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
    setConnectionState(gatewayConnectionState);
  }, [gatewayConnectionState, setConnectionState]);

  useEffect(() => {
    clientRef.current = gatewayGetClient();
  }, [gatewayConnectionState, gatewayGetClient]);

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
    clientRef.current = null;
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
      const client = clientRef.current;
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
    [applySessionTurns, connectionState, runGatewayRuntimeAction, runHistoryRefresh],
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
      const client = clientRef.current;
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

    const client = clientRef.current;
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

  const handleChatEvent = (payload: ChatEventPayload) => {
    const activeSessionKey = activeSessionKeyRef.current;
    const hasMatchingSession = payload.sessionKey === activeSessionKey;
    const eventSessionKey = (payload.sessionKey ?? '').trim() || activeSessionKey;
    const streamText = toTextContent(payload.message, { trim: false, dedupe: false });
    const finalEventText = extractFinalChatEventText(payload);
    const state = normalizeChatEventState(payload.state);
    setGatewayEventState(state);
    let turnId = runIdToTurnIdRef.current.get(payload.runId);
    const canBindPendingTurn =
      Boolean(pendingTurnIdRef.current) &&
      (hasMatchingSession || payload.runId === activeRunIdRef.current);

    if (!hasMatchingSession && !turnId && !canBindPendingTurn) {
      return;
    }

    if (!turnId && pendingTurnIdRef.current && canBindPendingTurn) {
      turnId = pendingTurnIdRef.current;
      pendingTurnIdRef.current = null;
      runIdToTurnIdRef.current.set(payload.runId, turnId);
      updateChatTurn(turnId, (turn) => ({
        ...turn,
        runId: payload.runId,
      }));
    }

    if (!turnId) {
      if (finalEventText || state === 'complete' || state === 'error' || state === 'aborted') {
        if (
          state === 'complete' ||
          state === 'error' ||
          state === 'aborted'
        ) {
          setIsSending(false);
          activeRunIdRef.current = null;
          setActiveRunId(null);
          if (
            state === 'complete' &&
            isOnboardingWaitingForResponse &&
            !isIncompleteAssistantContent(finalEventText)
          ) {
            setIsOnboardingWaitingForResponse(false);
            setIsOnboardingCompleted(true);
          }
          if (
            (state === 'error' || state === 'aborted') &&
            isOnboardingWaitingForResponse
          ) {
            setIsOnboardingWaitingForResponse(false);
          }
          if (state === 'complete' && shouldAttemptFinalRecovery(finalEventText)) {
            scheduleFinalResponseRecovery(eventSessionKey);
            const latestTurns = sessionTurnsRef.current.get(eventSessionKey) ?? [];
            const latestTurn = latestTurns[latestTurns.length - 1];
            if (latestTurn?.id) {
              scheduleMissingResponseRecovery(eventSessionKey, latestTurn.id);
            }
          }
        }
        scheduleSessionHistorySync(eventSessionKey);
      }
      return;
    }

    if (state === 'delta' || state === 'streaming') {
      activeRunIdRef.current = payload.runId;
      setActiveRunId(payload.runId);
      setIsSending(true);
      updateChatTurn(turnId, (turn) => ({
        ...turn,
        runId: payload.runId,
        state,
        assistantText: mergeAssistantStreamText(turn.assistantText, streamText),
      }));
      return;
    }

    if (state === 'complete') {
      setIsSending(false);
      activeRunIdRef.current = null;
      setActiveRunId(null);
      runIdToTurnIdRef.current.delete(payload.runId);
      clearFinalResponseRecoveryTimer();
      let finalAssistantText = '';
      updateChatTurn(turnId, (turn) => {
        finalAssistantText = resolveCompletedAssistantText({
          finalText: finalEventText,
          streamedText: turn.assistantText,
          stopReason: payload.stopReason,
        });
        return {
          ...turn,
          runId: payload.runId,
          state: 'complete',
          assistantText: finalAssistantText,
        };
      });
      if (
        isOnboardingWaitingForResponse &&
        !isIncompleteAssistantContent(finalAssistantText)
      ) {
        setIsOnboardingWaitingForResponse(false);
        setIsOnboardingCompleted(true);
      }
      if (shouldAttemptFinalRecovery(finalEventText, finalAssistantText || undefined)) {
        scheduleFinalResponseRecovery(eventSessionKey);
        scheduleMissingResponseRecovery(eventSessionKey, turnId);
      } else {
        clearMissingResponseRecoveryState(eventSessionKey);
      }
      scheduleSessionHistorySync(eventSessionKey);
      void refreshSessions();
      return;
    }

    if (state === 'error') {
      clearFinalResponseRecoveryTimer();
      const message = payload.errorMessage ?? 'An error occurred on the Gateway.';
      void triggerHaptic('send-error');
      setGatewayError(`Gateway error: ${message}`);
      setIsSending(false);
      activeRunIdRef.current = null;
      setActiveRunId(null);
      runIdToTurnIdRef.current.delete(payload.runId);
      updateChatTurn(turnId, (turn) => ({
        ...turn,
        runId: payload.runId,
        state: 'error',
        assistantText: finalEventText || message,
      }));
      if (isOnboardingWaitingForResponse) {
        setIsOnboardingWaitingForResponse(false);
      }
      clearMissingResponseRecoveryState(eventSessionKey);
      scheduleSessionHistorySync(eventSessionKey);
      void refreshSessions();
      return;
    }

    if (state === 'aborted') {
      clearFinalResponseRecoveryTimer();
      void triggerHaptic('send-error');
      setGatewayError('The Gateway response was aborted.');
      setIsSending(false);
      activeRunIdRef.current = null;
      setActiveRunId(null);
      runIdToTurnIdRef.current.delete(payload.runId);
      updateChatTurn(turnId, (turn) => ({
        ...turn,
        runId: payload.runId,
        state: 'aborted',
        assistantText: turn.assistantText || 'Response was aborted.',
      }));
      if (isOnboardingWaitingForResponse) {
        setIsOnboardingWaitingForResponse(false);
      }
      clearMissingResponseRecoveryState(eventSessionKey);
      scheduleSessionHistorySync(eventSessionKey);
      void refreshSessions();
      return;
    }

    if (streamText) {
      updateChatTurn(turnId, (turn) => ({
        ...turn,
        runId: payload.runId,
        state,
        assistantText: mergeAssistantStreamText(turn.assistantText, streamText),
      }));
    }
  };

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
      runGatewayRuntimeAction({ type: 'CONNECT_REQUEST' });
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
      clientRef.current = client;
    };

    try {
      await connectOnce(REQUESTED_GATEWAY_CLIENT_ID);
      runGatewayRuntimeAction({ type: 'CONNECT_SUCCESS' });
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
      runGatewayRuntimeAction({ type: 'CONNECT_FAILED' });
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

  const handleQuickTextLongPress = useCallback(
    (side: QuickTextButtonSide, rawText: string) => {
      if (!rawText.trim()) return;
      quickTextLongPressSideRef.current = side;
      clearQuickTextLongPressResetTimer();
      setQuickTextTooltipSide(side);
      void triggerHaptic('button-press');
      scheduleQuickTextTooltipHide();
    },
    [clearQuickTextLongPressResetTimer, scheduleQuickTextTooltipHide],
  );

  const handleQuickTextPress = useCallback(
    (side: QuickTextButtonSide, rawText: string) => {
      if (quickTextLongPressSideRef.current === side) {
        quickTextLongPressSideRef.current = null;
        return;
      }
      hideQuickTextTooltip();
      insertQuickText(rawText);
    },
    [hideQuickTextTooltip, insertQuickText],
  );

  const handleQuickTextPressOut = useCallback(
    (side: QuickTextButtonSide) => {
      if (quickTextLongPressSideRef.current !== side) {
        hideQuickTextTooltip();
        return;
      }
      clearQuickTextLongPressResetTimer();
      quickTextLongPressResetTimerRef.current = setTimeout(() => {
        quickTextLongPressResetTimerRef.current = null;
        quickTextLongPressSideRef.current = null;
      }, 260);
    },
    [clearQuickTextLongPressResetTimer, hideQuickTextTooltip],
  );

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

  const scheduleSessionHistorySync = useCallback(
    (
      sessionKey: string,
      options?: {
        attempt?: number;
        delayMs?: number;
      },
    ) => {
      const targetSessionKey = sessionKey.trim();
      if (!targetSessionKey) return;
      const attempt = Math.max(1, options?.attempt ?? 1);
      const delayMs = Math.max(
        0,
        options?.delayMs ??
          (attempt === 1
            ? HISTORY_SYNC_INITIAL_DELAY_MS
            : HISTORY_SYNC_RETRY_BASE_MS),
      );

      historySyncRequestRef.current = {
        sessionKey: targetSessionKey,
        attempt,
      };

      if (historySyncTimerRef.current) {
        clearTimeout(historySyncTimerRef.current);
        historySyncTimerRef.current = null;
      }

      historySyncTimerRef.current = setTimeout(() => {
        historySyncTimerRef.current = null;
        const request = historySyncRequestRef.current;
        if (
          !request ||
          request.sessionKey !== targetSessionKey ||
          request.attempt !== attempt
        ) {
          return;
        }

        void (async () => {
          const synced = await loadSessionHistory(targetSessionKey, {
            silentError: attempt > 1,
          });
          if (synced) {
            const currentRequest = historySyncRequestRef.current;
            if (
              currentRequest &&
              currentRequest.sessionKey === targetSessionKey &&
              currentRequest.attempt === attempt
            ) {
              historySyncRequestRef.current = null;
            }
            void refreshSessions();
            return;
          }

          const retryPlan = computeHistorySyncRetryPlan({
            attempt,
            maxAttempts: HISTORY_SYNC_MAX_ATTEMPTS,
            baseDelayMs: HISTORY_SYNC_RETRY_BASE_MS,
          });
          if (!retryPlan.shouldRetry || connectionStateRef.current !== 'connected') {
            const currentRequest = historySyncRequestRef.current;
            if (
              currentRequest &&
              currentRequest.sessionKey === targetSessionKey &&
              currentRequest.attempt === attempt
            ) {
              historySyncRequestRef.current = null;
            }
            return;
          }

          scheduleSessionHistorySync(targetSessionKey, {
            attempt: retryPlan.nextAttempt,
            delayMs: retryPlan.delayMs,
          });
        })();
      }, delayMs);
    },
    [loadSessionHistory, refreshSessions],
  );

  const scheduleMissingResponseRecovery = useCallback(
    (
      sessionKey: string,
      turnId: string,
      options?: {
        attempt?: number;
        delayMs?: number;
      },
    ) => {
      const targetSessionKey = sessionKey.trim();
      const targetTurnId = turnId.trim();
      if (!targetSessionKey || !targetTurnId) return;

      const attempt = Math.max(1, options?.attempt ?? 1);
      const delayMs = Math.max(
        0,
        options?.delayMs ??
          (attempt === 1
            ? MISSING_RESPONSE_RECOVERY_INITIAL_DELAY_MS
            : MISSING_RESPONSE_RECOVERY_RETRY_BASE_MS * 2 ** (attempt - 1)),
      );

      missingResponseRecoveryRequestRef.current = {
        sessionKey: targetSessionKey,
        turnId: targetTurnId,
        attempt,
      };

      clearMissingResponseRecoveryTimer();
      missingResponseRecoveryTimerRef.current = setTimeout(() => {
        missingResponseRecoveryTimerRef.current = null;
        const request = missingResponseRecoveryRequestRef.current;
        if (
          !request ||
          request.sessionKey !== targetSessionKey ||
          request.turnId !== targetTurnId ||
          request.attempt !== attempt
        ) {
          return;
        }

        if (connectionStateRef.current !== 'connected') {
          setMissingResponseNotice({
            sessionKey: targetSessionKey,
            turnId: targetTurnId,
            attempt,
            message: 'Final response may be stale. Reconnect and tap retry fetch.',
          });
          missingResponseRecoveryRequestRef.current = null;
          return;
        }

        void (async () => {
          setIsMissingResponseRecoveryInFlight(true);
          const synced = await loadSessionHistory(targetSessionKey, { silentError: true });
          setIsMissingResponseRecoveryInFlight(false);

          const currentRequest = missingResponseRecoveryRequestRef.current;
          if (
            !currentRequest ||
            currentRequest.sessionKey !== targetSessionKey ||
            currentRequest.turnId !== targetTurnId ||
            currentRequest.attempt !== attempt
          ) {
            return;
          }

          if (synced) {
            void refreshSessions();
          }

          const turns = sessionTurnsRef.current.get(targetSessionKey) ?? [];
          const targetTurn = turns.find((turn) => turn.id === targetTurnId);
          const latestTurn = turns[turns.length - 1];
          const turnForCheck = targetTurn ?? latestTurn;
          const stillIncomplete = !synced
            ? true
            : !turnForCheck
              ? true
              : turnForCheck.id !== targetTurnId
                ? false
                : isTurnWaitingState(turnForCheck.state) ||
                  shouldAttemptFinalRecovery(
                    turnForCheck.assistantText,
                    turnForCheck.assistantText,
                  );

          if (!stillIncomplete) {
            missingResponseRecoveryRequestRef.current = null;
            setMissingResponseNotice((previous) => {
              if (
                !previous ||
                previous.sessionKey !== targetSessionKey ||
                previous.turnId !== targetTurnId
              ) {
                return previous;
              }
              return null;
            });
            return;
          }

          if (attempt >= MISSING_RESPONSE_RECOVERY_MAX_ATTEMPTS) {
            missingResponseRecoveryRequestRef.current = null;
            setMissingResponseNotice({
              sessionKey: targetSessionKey,
              turnId: targetTurnId,
              attempt,
              message: 'Final response not synced yet. Tap retry fetch.',
            });
            return;
          }

          setMissingResponseNotice({
            sessionKey: targetSessionKey,
            turnId: targetTurnId,
            attempt,
            message: `Final response delayed. Auto retrying (${attempt}/${MISSING_RESPONSE_RECOVERY_MAX_ATTEMPTS})...`,
          });
          scheduleMissingResponseRecovery(targetSessionKey, targetTurnId, {
            attempt: attempt + 1,
          });
        })();
      }, delayMs);
    },
    [clearMissingResponseRecoveryTimer, loadSessionHistory, refreshSessions],
  );

  const scheduleFinalResponseRecovery = useCallback(
    (sessionKey: string, attempt = 1) => {
      if (attempt > FINAL_RESPONSE_RECOVERY_MAX_ATTEMPTS) return;
      clearFinalResponseRecoveryTimer();
      finalResponseRecoveryTimerRef.current = setTimeout(() => {
        finalResponseRecoveryTimerRef.current = null;
        void (async () => {
          const synced = await loadSessionHistory(sessionKey, { silentError: true });
          if (!synced) {
            if (connectionStateRef.current !== 'connected') return;
            scheduleFinalResponseRecovery(sessionKey, attempt + 1);
            return;
          }
          void refreshSessions();

          const turns = sessionTurnsRef.current.get(sessionKey) ?? [];
          const latestTurn = turns[turns.length - 1];
          const stillIncomplete =
            !latestTurn ||
            isTurnWaitingState(latestTurn.state) ||
            shouldAttemptFinalRecovery(
              latestTurn.assistantText,
              latestTurn.assistantText,
            );

          if (stillIncomplete) {
            scheduleFinalResponseRecovery(sessionKey, attempt + 1);
          }
        })();
      }, FINAL_RESPONSE_RECOVERY_BASE_DELAY_MS * attempt);
    },
    [clearFinalResponseRecoveryTimer, loadSessionHistory, refreshSessions],
  );

  const draftText = transcript.trim() || interimTranscript.trim();
  const hasDraft = Boolean(draftText);
  const canSendDraft = hasDraft && !isRecognizing;
  const quickTextLeftLabel = quickTextLeft.trim();
  const quickTextRightLabel = quickTextRight.trim();
  const isTranscriptFocused = focusedField === 'transcript';
  const isQuickTextFieldFocused =
    focusedField === 'quick-text-left' || focusedField === 'quick-text-right';
  const isQuickTextSettingsEditMode =
    shouldShowSettingsScreen && isQuickTextFieldFocused;
  const isGatewayFieldFocused =
    focusedField === 'gateway-url' ||
    focusedField === 'auth-token' ||
    isQuickTextFieldFocused;
  const showKeyboardActionBar =
    isKeyboardVisible && (isTranscriptFocused || isGatewayFieldFocused);
  const showDoneOnlyAction = showKeyboardActionBar && isGatewayFieldFocused;
  const showClearInKeyboardBar = showKeyboardActionBar && isTranscriptFocused;
  const canSendFromKeyboardBar =
    hasDraft && !isRecognizing && !isSending;
  const canClearFromKeyboardBar =
    transcript.length > 0 || interimTranscript.length > 0;
  const speechRecognitionSupported = supportsSpeechRecognitionOnCurrentPlatform();
  const speechUnsupportedMessage = isMacDesktopRuntime()
    ? 'macOSでは音声入力未対応です。'
    : 'Webでは音声入力未対応です。';
  const canUseQuickText = !isRecognizing && settingsReady;
  const canUseQuickTextLeft = canUseQuickText && quickTextLeftLabel.length > 0;
  const canUseQuickTextRight = canUseQuickText && quickTextRightLabel.length > 0;
  const showQuickTextLeftTooltip = quickTextTooltipSide === 'left' && canUseQuickTextLeft;
  const showQuickTextRightTooltip =
    quickTextTooltipSide === 'right' && canUseQuickTextRight;
  const isTranscriptEditingWithKeyboard = isKeyboardVisible && isTranscriptFocused;
  const isTranscriptExpanded = isTranscriptFocused || isRecognizing;
  const homeDisplayMode: HomeDisplayMode = isSending
    ? 'sending'
    : isTranscriptFocused || isRecognizing
      ? 'composing'
      : 'idle';
  const isHomeIdleMode = homeDisplayMode === 'idle';
  const isHomeComposingMode = homeDisplayMode === 'composing';
  const showHistorySecondaryUi = !isHomeComposingMode;
  const showHistoryCard = !isTranscriptEditingWithKeyboard;
  const showHistoryRefreshButton =
    showHistoryCard &&
    showHistorySecondaryUi &&
    !isSending;
  const transcriptPlaceholder = isTranscriptFocused
    ? 'Type your message.'
    : 'Tap to type or hold mic.';
  const shouldUseCompactTranscriptCard =
    isHomeIdleMode && !hasDraft && !isTranscriptExpanded;
  const canSwitchSession = !isSending && !isSessionOperationPending;
  const canRefreshSessions =
    isGatewayConnected && !isSessionsLoading && !isSessionOperationPending;
  const canCreateSession = canSwitchSession;
  const canRenameSession = canSwitchSession;
  const canPinSession = !isSessionOperationPending;
  const hasGatewaySessions = sessions.length > 0;
  const visibleSessions = useMemo(() => {
    const active = activeSessionKey;
    const merged = [...sessions];
    if (!merged.some((session) => session.key === active)) {
      merged.unshift({ key: active, displayName: active });
    }
    merged.sort((a, b) => {
      if (a.key === active && b.key !== active) return -1;
      if (b.key === active && a.key !== active) return 1;

      const aPinned = sessionPreferences[a.key]?.pinned === true;
      const bPinned = sessionPreferences[b.key]?.pinned === true;
      if (aPinned !== bPinned) return aPinned ? -1 : 1;

      const byUpdatedAt = (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
      if (byUpdatedAt !== 0) return byUpdatedAt;
      return a.key.localeCompare(b.key);
    });
    return merged.slice(0, 20);
  }, [activeSessionKey, sessionPreferences, sessions]);
  const sessionPanelStatusText = sessionsError
    ? 'Error'
    : isSessionsLoading
      ? 'Loading sessions...'
      : hasGatewaySessions
        ? `${visibleSessions.length} sessions`
        : 'Local session only';
  const sessionListHintText = sessionsError
    ? 'Sync failed. Tap Refresh.'
    : !hasGatewaySessions
      ? 'No sessions yet. Tap New.'
    : isSending || isSessionOperationPending
        ? 'Busy now. Try again in a moment.'
        : null;
  const settingsStatusText = !settingsReady
    ? 'Loading settings...'
    : isSettingsSaving || settingsPendingSaveCount > 0
      ? 'Syncing...'
    : settingsSaveError
      ? settingsSaveError
      : settingsLastSavedAt
        ? `Saved ${formatClockLabel(settingsLastSavedAt)}`
        : 'Saved';
  const isSettingsStatusError = Boolean(settingsSaveError);
  const isSettingsStatusPending = isSettingsSaving || settingsPendingSaveCount > 0;
  const sectionIconColor = isDarkTheme ? '#9eb1d2' : '#70706A';
  const actionIconColor = isDarkTheme ? '#b8c9e6' : '#5C5C5C';
  const currentBadgeIconColor = isDarkTheme ? '#9ec0ff' : '#1D4ED8';
  const pinnedBadgeIconColor = isDarkTheme ? '#dbe7ff' : '#4B5563';
  const optionIconColor = isDarkTheme ? '#b8c9e6' : '#5C5C5C';
  const showOnboardingGuide = settingsReady && !isOnboardingCompleted;
  const isOnboardingGatewayConfigured = gatewayUrl.trim().length > 0;
  const isOnboardingConnectDone = isGatewayConnected;
  const isOnboardingResponseDone = chatTurns.some(
    (turn) =>
      turn.state === 'complete' && !isIncompleteAssistantContent(turn.assistantText),
  );
  const canRunOnboardingConnectTest = settingsReady && !isGatewayConnecting;
  const canRunOnboardingSampleSend =
    isGatewayConnected && !isSending && !isOnboardingWaitingForResponse;
  const onboardingSampleButtonLabel = isOnboardingWaitingForResponse
    ? 'Waiting reply...'
    : 'Send Sample';
  const showGatewayDiagnostic =
    !isGatewayConnected && gatewayConnectDiagnostic != null;
  const gatewayDiagnosticIconName: ComponentProps<typeof Ionicons>['name'] =
    gatewayConnectDiagnostic?.kind === 'tls'
      ? 'shield-checkmark-outline'
      : gatewayConnectDiagnostic?.kind === 'auth'
        ? 'key-outline'
        : gatewayConnectDiagnostic?.kind === 'timeout'
          ? 'time-outline'
          : gatewayConnectDiagnostic?.kind === 'dns'
            ? 'globe-outline'
            : gatewayConnectDiagnostic?.kind === 'network'
              ? 'cloud-offline-outline'
              : gatewayConnectDiagnostic?.kind === 'server'
                ? 'server-outline'
                : gatewayConnectDiagnostic?.kind === 'pairing'
                  ? 'people-outline'
                  : gatewayConnectDiagnostic?.kind === 'invalid-url'
                    ? 'link-outline'
                    : 'alert-circle-outline';
  const outboxPendingCount = outboxQueue.length;
  const activeMissingResponseNotice =
    missingResponseNotice?.sessionKey === activeSessionKey
      ? missingResponseNotice
      : null;
  const canRetryMissingResponse =
    Boolean(activeMissingResponseNotice) &&
    isGatewayConnected &&
    !isMissingResponseRecoveryInFlight;
  const historyRefreshErrorMessage =
    historyRefreshNotice?.kind === 'error' ? historyRefreshNotice.message : null;
  const historyUpdatedLabel =
    historyLastSyncedAt != null
      ? `Updated ${formatClockLabel(historyLastSyncedAt)}`
      : null;
  const showHistoryUpdatedMeta =
    showHistoryCard &&
    showHistorySecondaryUi &&
    Boolean(historyUpdatedLabel);
  const historyListBottomPadding = Math.max(
    12,
    historyBottomInset + (showScrollToBottomButton ? 28 : 0),
  );
  const hasRetryingState =
    Boolean(activeMissingResponseNotice) ||
    (outboxPendingCount > 0 && connectionState === 'connected');
  const hasErrorState =
    Boolean(gatewayError) ||
    Boolean(speechError) ||
    Boolean(historyRefreshErrorMessage);
  const isStreamingGatewayEvent =
    gatewayEventState === 'delta' || gatewayEventState === 'streaming';
  const bottomActionStatus: BottomActionStatus = isRecognizing
    ? 'recording'
    : isSending
      ? 'sending'
      : hasRetryingState
        ? 'retrying'
        : hasErrorState
          ? 'error'
          : !isGatewayConnected
            ? isGatewayConnecting || isStartupAutoConnecting
              ? 'connecting'
              : 'disconnected'
            : isBottomCompletePulse
              ? 'complete'
              : 'ready';
  const bottomActionDetailText =
    bottomActionStatus === 'recording'
      ? 'Release to stop'
      : bottomActionStatus === 'sending'
        ? isStreamingGatewayEvent
          ? 'Streaming response'
          : 'Waiting response'
        : bottomActionStatus === 'retrying'
          ? activeMissingResponseNotice
            ? isMissingResponseRecoveryInFlight
              ? 'Fetching final output'
              : 'Retry available'
            : `Queued ${outboxPendingCount}`
          : bottomActionStatus === 'complete'
            ? 'Sent successfully'
            : bottomActionStatus === 'connecting'
              ? outboxPendingCount > 0
                ? `Queued ${outboxPendingCount}`
                : 'Please wait'
              : bottomActionStatus === 'disconnected'
                ? outboxPendingCount > 0
                  ? `Queued ${outboxPendingCount}`
                  : 'Connect Gateway'
                : bottomActionStatus === 'error'
                  ? 'Check top banner'
                    : canSendDraft
                      ? 'Tap send'
                      : speechRecognitionSupported
                        ? 'Hold to record'
                        : speechUnsupportedMessage;
  const showBottomStatus = !isKeyboardBarMounted && !isHomeComposingMode;
  const bottomActionStatusLabel = BOTTOM_ACTION_STATUS_LABELS[bottomActionStatus];
  const connectionStatusLabel = CONNECTION_LABELS[connectionState];
  const showHistoryDateDivider = showHistorySecondaryUi;
  const showHistoryScrollButton =
    showScrollToBottomButton &&
    !isHomeComposingMode;
  const historyItems = useMemo<HistoryListItem[]>(() => {
    if (chatTurns.length === 0) return [];

    const items: HistoryListItem[] = [];
    let previousDayKey: string | null = null;

    chatTurns.forEach((turn, index) => {
      const dayKey = getHistoryDayKey(turn.createdAt);
      if (dayKey !== previousDayKey) {
        items.push({
          kind: 'date',
          id: `date-${dayKey}`,
          label: getHistoryDayLabel(turn.createdAt),
        });
        previousDayKey = dayKey;
      }

      items.push({
        kind: 'turn',
        id: turn.id,
        turn,
        isLast: index === chatTurns.length - 1,
      });
    });

    return items;
  }, [chatTurns]);
  const latestRetryText = useMemo(() => {
    const currentDraft = (transcript.trim() || interimTranscript.trim()).trim();
    if (currentDraft) return currentDraft;

    for (let index = chatTurns.length - 1; index >= 0; index -= 1) {
      const turn = chatTurns[index];
      if (
        (turn.state === 'error' || turn.state === 'aborted') &&
        turn.userText.trim()
      ) {
        return turn.userText.trim();
      }
    }
    return '';
  }, [chatTurns, interimTranscript, transcript]);
  const canReconnectFromError = settingsReady && !isGatewayConnecting;
  const canRetryFromError =
    Boolean(latestRetryText) && !isSending;
  const topBannerKind:
    | 'gateway'
    | 'recovery'
    | 'history'
    | 'speech'
    | null = gatewayError
    ? 'gateway'
    : activeMissingResponseNotice
      ? 'recovery'
      : historyRefreshErrorMessage
        ? 'history'
        : speechError
          ? 'speech'
          : null;
  const topBannerMessage =
    gatewayError ??
    activeMissingResponseNotice?.message ??
    historyRefreshErrorMessage ??
    speechError;
  const topBannerIconName = topBannerKind === 'gateway'
    ? 'cloud-offline-outline'
    : topBannerKind === 'recovery'
      ? 'time-outline'
      : topBannerKind === 'history'
        ? 'refresh-outline'
        : 'mic-off-outline';

  const handleReconnectFromError = () => {
    if (!canReconnectFromError) return;
    Keyboard.dismiss();
    setFocusedField(null);
    void connectGateway();
  };

  const handleRetryFromError = () => {
    if (!canRetryFromError) return;
    Keyboard.dismiss();
    setFocusedField(null);
    void sendToGateway(latestRetryText);
  };

  const handleRetryMissingResponse = () => {
    const notice = activeMissingResponseNotice;
    if (!notice || isMissingResponseRecoveryInFlight) return;
    if (!isGatewayConnected) {
      setGatewayError('Reconnect to retry fetching final response.');
      return;
    }
    Keyboard.dismiss();
    setFocusedField(null);
    scheduleMissingResponseRecovery(notice.sessionKey, notice.turnId, {
      attempt: 1,
      delayMs: 0,
    });
  };

  const handleDismissTopBanner = () => {
    if (topBannerKind === 'gateway') {
      setGatewayError(null);
      return;
    }
    if (topBannerKind === 'recovery') {
      setMissingResponseNotice(null);
      return;
    }
    if (topBannerKind === 'history') {
      setHistoryRefreshNotice(null);
      return;
    }
    if (topBannerKind === 'speech') {
      setSpeechError(null);
    }
  };

  const handleCompleteOnboarding = () => {
    Keyboard.dismiss();
    setFocusedField(null);
    setIsOnboardingWaitingForResponse(false);
    setIsOnboardingCompleted(true);
  };

  const handleOnboardingConnectTest = () => {
    if (!canRunOnboardingConnectTest) return;
    Keyboard.dismiss();
    setFocusedField(null);
    void connectGateway();
  };

  const handleOnboardingSendSample = () => {
    if (!canRunOnboardingSampleSend) return;
    Keyboard.dismiss();
    setFocusedField(null);
    setIsOnboardingWaitingForResponse(true);
    void sendToGateway(ONBOARDING_SAMPLE_MESSAGE);
  };

  const handleToggleSessionPanel = useCallback(() => {
    if (!isGatewayConnected) return;
    Keyboard.dismiss();
    setFocusedField(null);
    setIsSettingsPanelOpen(false);
    forceMaskAuthToken();
    const next = !isSessionPanelOpen;
    setIsSessionPanelOpen(next);
    if (next) {
      void refreshSessions();
    } else {
      setIsSessionRenameOpen(false);
      setSessionRenameTargetKey(null);
      setSessionRenameDraft('');
    }
  }, [
    forceMaskAuthToken,
    isGatewayConnected,
    isSessionPanelOpen,
    refreshSessions,
  ]);

  const handleToggleSettingsPanel = useCallback(() => {
    if (!canToggleSettingsPanel) return;
    Keyboard.dismiss();
    setFocusedField(null);
    setIsSessionPanelOpen(false);
    setIsSettingsPanelOpen((current) => {
      const next = !current;
      if (!next) {
        forceMaskAuthToken();
      }
      return next;
    });
  }, [canToggleSettingsPanel, forceMaskAuthToken]);

  const handleCloseSettingsPanel = useCallback(() => {
    if (!canDismissSettingsScreen) return;
    forceMaskAuthToken();
    setIsSettingsPanelOpen(false);
    setFocusedField(null);
    Keyboard.dismiss();
  }, [canDismissSettingsScreen, forceMaskAuthToken]);

  const handleCloseSessionPanel = useCallback(() => {
    setIsSessionPanelOpen(false);
    setIsSessionRenameOpen(false);
    setSessionRenameTargetKey(null);
    setSessionRenameDraft('');
    Keyboard.dismiss();
  }, []);

  const handleDoneKeyboardAction = useCallback(() => {
    Keyboard.dismiss();
    setFocusedField(null);
  }, []);

  const handleClearKeyboardAction = useCallback(() => {
    if (!canClearFromKeyboardBar) return;
    clearTranscriptDraft();
  }, [canClearFromKeyboardBar, clearTranscriptDraft]);

  const handleSendKeyboardAction = useCallback(() => {
    if (!canSendFromKeyboardBar) return;
    const text = transcript.trim() || interimTranscript.trim();
    if (!text) return;
    Keyboard.dismiss();
    setFocusedField(null);
    void sendToGateway(text);
  }, [canSendFromKeyboardBar, interimTranscript, sendToGateway, transcript]);

  const handleSendDraftAction = useCallback(() => {
    const text = transcript.trim() || interimTranscript.trim();
    if (!text) return;
    Keyboard.dismiss();
    setFocusedField(null);
    void sendToGateway(text);
  }, [interimTranscript, sendToGateway, transcript]);

  const handleTranscriptChange = useCallback((value: string) => {
    setTranscript(value);
    setInterimTranscript('');
  }, []);

  const handleTranscriptFocus = useCallback(() => {
    setFocusedField('transcript');
  }, []);

  const handleTranscriptBlur = useCallback(() => {
    setFocusedField((current) => (current === 'transcript' ? null : current));
  }, []);

  const handleRefreshHistory = useCallback(() => {
    if (!isGatewayConnected || isSessionHistoryLoading) return;
    Keyboard.dismiss();
    setFocusedField(null);
    clearHistoryNoticeTimer();
    setHistoryRefreshNotice(null);
    const sessionKey = activeSessionKeyRef.current;
    void (async () => {
      const synced = await loadSessionHistory(sessionKey, { silentError: true });
      void refreshSessions();
      if (synced) {
        const now = Date.now();
        setHistoryLastSyncedAt(now);
        const notice = buildHistoryRefreshNotice(true, formatClockLabel(now));
        showHistoryRefreshNotice(notice.kind, notice.message);
        return;
      }
      const notice = buildHistoryRefreshNotice(false);
      showHistoryRefreshNotice(notice.kind, notice.message);
    })();
  }, [
    clearHistoryNoticeTimer,
    isGatewayConnected,
    isSessionHistoryLoading,
    loadSessionHistory,
    refreshSessions,
    showHistoryRefreshNotice,
  ]);

  const handleScrollHistoryToBottom = useCallback(() => {
    scrollHistoryToBottom(true);
    void triggerHaptic('button-press');
  }, [scrollHistoryToBottom, triggerHaptic]);

  const handleHoldToTalkPressIn = () => {
    if (!speechRecognitionSupported || isRecognizing || isSending) return;
    void triggerHaptic('button-press');
    Keyboard.dismiss();
    setFocusedField(null);
    holdActivatedRef.current = false;
    if (holdStartTimerRef.current) {
      clearTimeout(holdStartTimerRef.current);
    }
    holdStartTimerRef.current = setTimeout(() => {
      holdStartTimerRef.current = null;
      holdActivatedRef.current = true;
      void startRecognition();
    }, 120);
  };

  const handleHoldToTalkPressOut = () => {
    if (holdStartTimerRef.current) {
      clearTimeout(holdStartTimerRef.current);
      holdStartTimerRef.current = null;
    }
    if (!holdActivatedRef.current) return;
    holdActivatedRef.current = false;
    if (!isRecognizing) return;
    stopRecognition();
  };

  const handleHistoryScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
      const distanceFromBottom =
        contentSize.height - (contentOffset.y + layoutMeasurement.height);
      const isNearBottom = distanceFromBottom < HISTORY_BOTTOM_THRESHOLD_PX;
      historyAutoScrollRef.current = isNearBottom;
      setShowScrollToBottomButton(chatTurns.length > 0 && !isNearBottom);
    },
    [chatTurns.length],
  );
  const handleHistoryAutoScroll = useCallback(() => {
    if (historyAutoScrollRef.current) {
      scrollHistoryToBottom(false);
    }
  }, [scrollHistoryToBottom]);
  const handleHistoryLayoutAutoScroll = useCallback(() => {
    if (historyAutoScrollRef.current) {
      scrollHistoryToBottom(false);
    }
  }, [scrollHistoryToBottom]);
  const handleBottomDockHeightChange = useCallback(
    (nextHeight: number) => {
      if (composerHeight !== nextHeight) {
        setComposerHeight(nextHeight);
      }
    },
    [composerHeight],
  );
  const handleBottomDockActionPressHaptic = useCallback(() => {
    void triggerHaptic('button-press');
  }, []);

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

function createStyles(isDarkTheme: boolean) {
  const colors = isDarkTheme
    ? {
        page: '#081338',
        headerTitle: '#f8fbff',
        iconBorder: 'rgba(255,255,255,0.16)',
        iconBg: 'rgba(255,255,255,0.06)',
        dotConnected: '#059669',
        dotConnecting: '#D97706',
        dotDisconnected: '#C4C4C0',
        chipConnectedBg: 'rgba(5,150,105,0.17)',
        chipConnectedText: '#75e2ba',
        chipConnectingBg: 'rgba(217,119,6,0.17)',
        chipConnectingText: '#f1c58b',
        chipDisconnectedBg: 'rgba(255,255,255,0.09)',
        chipDisconnectedText: '#bccae2',
        panelBg: '#12214a',
        panelBorder: 'rgba(255,255,255,0.12)',
        label: '#9eb1d2',
        inputBorder: 'rgba(255,255,255,0.16)',
        inputBorderFocused: '#2563EB',
        inputBg: '#0f1c3f',
        inputText: '#f8fbff',
        connectBtn: '#2563EB',
        smallBtnDisabled: '#5d6f94',
        cardBg: '#12214a',
        cardBorder: 'rgba(255,255,255,0.12)',
        recordingBorder: 'rgba(220,38,38,0.28)',
        textPrimary: '#ffffff',
        textSecondary: '#b8c9e6',
        placeholder: '#95a8ca',
        loading: '#b8c9e6',
        historyDateLine: 'rgba(255,255,255,0.14)',
        historyDateText: '#95a8ca',
        historyMetaText: '#95a8ca',
        historyWaitingDot: '#2563EB',
        assistantAvatarBg: 'rgba(37,99,235,0.42)',
        assistantAvatarBorder: 'transparent',
        turnUser: '#ffffff',
        turnUserBubbleBg: '#2563EB',
        turnUserBubbleBorder: 'rgba(37,99,235,0.45)',
        turnAssistantBubbleBg: '#16274a',
        turnAssistantBubbleBorder: 'rgba(255,255,255,0.12)',
        turnAssistantErrorBorder: 'rgba(220,38,38,0.4)',
        tagOkBg: 'rgba(5,150,105,0.17)',
        tagOkText: '#75e2ba',
        tagWaitingBg: 'rgba(217,119,6,0.16)',
        tagWaitingText: '#f1c58b',
        tagErrorBg: 'rgba(220,38,38,0.15)',
        tagErrorText: '#ffb0b0',
        errorBg: '#15213f',
        errorBorder: '#DC2626',
        errorText: '#ffb0b0',
        topBannerBg: 'rgba(220,38,38,0.14)',
        topBannerBorder: 'rgba(220,38,38,0.42)',
        topBannerText: '#ffb0b0',
        topBannerSpeechBg: 'rgba(217,119,6,0.16)',
        topBannerSpeechBorder: 'rgba(217,119,6,0.38)',
        topBannerActionBg: 'rgba(255,255,255,0.10)',
        topBannerActionBorder: 'rgba(255,255,255,0.22)',
        topBannerActionIcon: '#dbe7ff',
        roundBorder: 'rgba(255,255,255,0.22)',
        micRound: '#2563EB',
        recordingRound: '#DC2626',
        sendRound: '#059669',
        roundDisabled: '#243a63',
        quickActionBg: '#059669',
        quickActionBorder: 'rgba(255,255,255,0.28)',
        quickActionText: '#ffffff',
        quickTooltipBg: '#1a2f5a',
        quickTooltipBorder: 'rgba(110,231,183,0.34)',
        quickTooltipText: '#e8fff7',
        bottomStateNeutral: '#b8c9e6',
        bottomStateConnecting: '#f1c58b',
        bottomStateDisconnected: '#95a8ca',
        bottomStateRecording: '#ffb0b0',
        bottomStateSending: '#9ec0ff',
        bottomStateRetrying: '#f1c58b',
        bottomStateComplete: '#75e2ba',
        bottomStateError: '#ffb0b0',
        bottomStateDetail: '#95a8ca',
        bottomDockBg: 'transparent',
        bottomDockBorder: 'rgba(255,255,255,0.08)',
      }
    : {
        page: '#F5F5F0',
        headerTitle: '#1A1A1A',
        iconBorder: 'rgba(0,0,0,0.12)',
        iconBg: '#EEEEEA',
        dotConnected: '#059669',
        dotConnecting: '#D97706',
        dotDisconnected: '#C4C4C0',
        chipConnectedBg: 'rgba(5,150,105,0.07)',
        chipConnectedText: '#059669',
        chipConnectingBg: 'rgba(217,119,6,0.07)',
        chipConnectingText: '#D97706',
        chipDisconnectedBg: 'rgba(0,0,0,0.03)',
        chipDisconnectedText: '#5C5C5C',
        panelBg: '#FFFFFF',
        panelBorder: 'rgba(0,0,0,0.05)',
        label: '#70706A',
        inputBorder: 'rgba(0,0,0,0.06)',
        inputBorderFocused: '#2563EB',
        inputBg: '#EEEEEA',
        inputText: '#1A1A1A',
        connectBtn: '#2563EB',
        smallBtnDisabled: '#C4C4C0',
        cardBg: '#FFFFFF',
        cardBorder: 'rgba(0,0,0,0.05)',
        recordingBorder: 'rgba(220,38,38,0.18)',
        textPrimary: '#1A1A1A',
        textSecondary: '#5C5C5C',
        placeholder: '#A1A19B',
        loading: '#5C5C5C',
        historyDateLine: 'rgba(0,0,0,0.06)',
        historyDateText: '#A1A19B',
        historyMetaText: '#999999',
        historyWaitingDot: '#2563EB',
        assistantAvatarBg: 'rgba(37,99,235,0.14)',
        assistantAvatarBorder: 'transparent',
        turnUser: '#FFFFFF',
        turnUserBubbleBg: '#2563EB',
        turnUserBubbleBorder: 'rgba(37,99,235,0.18)',
        turnAssistantBubbleBg: '#FFFFFF',
        turnAssistantBubbleBorder: 'rgba(0,0,0,0.05)',
        turnAssistantErrorBorder: 'rgba(220,38,38,0.15)',
        tagOkBg: 'rgba(5,150,105,0.07)',
        tagOkText: '#059669',
        tagWaitingBg: 'rgba(217,119,6,0.07)',
        tagWaitingText: '#D97706',
        tagErrorBg: 'rgba(220,38,38,0.06)',
        tagErrorText: '#DC2626',
        errorBg: '#FFFFFF',
        errorBorder: '#DC2626',
        errorText: '#DC2626',
        topBannerBg: 'rgba(220,38,38,0.08)',
        topBannerBorder: 'rgba(220,38,38,0.2)',
        topBannerText: '#B91C1C',
        topBannerSpeechBg: 'rgba(217,119,6,0.08)',
        topBannerSpeechBorder: 'rgba(217,119,6,0.2)',
        topBannerActionBg: '#F7F7F4',
        topBannerActionBorder: 'rgba(0,0,0,0.1)',
        topBannerActionIcon: '#7f1d1d',
        roundBorder: 'rgba(255,255,255,0.52)',
        micRound: '#2563EB',
        recordingRound: '#DC2626',
        sendRound: '#059669',
        roundDisabled: '#C4C4C0',
        quickActionBg: '#059669',
        quickActionBorder: 'rgba(255,255,255,0.58)',
        quickActionText: '#ffffff',
        quickTooltipBg: '#ffffff',
        quickTooltipBorder: 'rgba(5,150,105,0.24)',
        quickTooltipText: '#065f46',
        bottomStateNeutral: '#5C5C5C',
        bottomStateConnecting: '#B45309',
        bottomStateDisconnected: '#8A8A84',
        bottomStateRecording: '#B91C1C',
        bottomStateSending: '#1D4ED8',
        bottomStateRetrying: '#B45309',
        bottomStateComplete: '#047857',
        bottomStateError: '#B91C1C',
        bottomStateDetail: '#8A8A84',
        bottomDockBg: 'transparent',
        bottomDockBorder: 'rgba(0,0,0,0.04)',
      };

  const surfaceShadow = {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  } as const;

  const fabShadow = {
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 28,
    elevation: 9,
  } as const;

  const recordingFabShadow = {
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 28,
    elevation: 9,
  } as const;

  const quickFabShadow = {
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.24,
    shadowRadius: 18,
    elevation: 7,
  } as const;

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.page,
    },
    keyboardWrap: {
      flex: 1,
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 8,
      gap: 8,
    },
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 12,
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    logoBadge: {
      width: 26,
      height: 26,
      borderRadius: 7,
      overflow: 'hidden',
    },
    logoBadgeImage: {
      width: '100%',
      height: '100%',
    },
    headerTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.headerTitle,
    },
    headerRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    statusChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderWidth: 0,
      borderColor: colors.iconBorder,
    },
    statusChipConnected: {
      backgroundColor: colors.chipConnectedBg,
    },
    statusChipConnecting: {
      backgroundColor: colors.chipConnectingBg,
    },
    statusChipDisconnected: {
      backgroundColor: colors.chipDisconnectedBg,
    },
    statusDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    statusDotConnected: {
      backgroundColor: colors.dotConnected,
    },
    statusDotConnecting: {
      backgroundColor: colors.dotConnecting,
    },
    statusDotDisconnected: {
      backgroundColor: colors.dotDisconnected,
    },
    iconButton: {
      width: 30,
      height: 30,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 10,
      borderWidth: 1.5,
      borderColor: colors.iconBorder,
      backgroundColor: colors.iconBg,
    },
    iconButtonActive: {
      borderColor: colors.inputBorderFocused,
    },
    iconButtonDisabled: {
      opacity: 0.45,
    },
    statusChipText: {
      fontSize: 11,
      fontWeight: '600',
    },
    statusChipTextConnected: {
      color: colors.chipConnectedText,
    },
    statusChipTextConnecting: {
      color: colors.chipConnectingText,
    },
    statusChipTextDisconnected: {
      color: colors.chipDisconnectedText,
    },
    settingsScreenContainer: {
      flex: 1,
      backgroundColor: colors.page,
    },
    settingsScreenHeader: {
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 10,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    settingsScreenHeaderRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flexShrink: 1,
    },
    settingsScreenTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.headerTitle,
    },
    settingsStatusChip: {
      maxWidth: 184,
      minHeight: 30,
      borderRadius: 999,
      borderWidth: 1.5,
      borderColor: colors.inputBorder,
      backgroundColor: colors.inputBg,
      paddingHorizontal: 9,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    settingsStatusChipPending: {
      borderColor: colors.inputBorderFocused,
    },
    settingsStatusChipError: {
      borderColor: isDarkTheme ? 'rgba(220,38,38,0.44)' : 'rgba(220,38,38,0.24)',
    },
    settingsStatusChipText: {
      flexShrink: 1,
      fontSize: 10,
      color: colors.textSecondary,
      fontWeight: '600',
    },
    settingsStatusChipTextError: {
      color: colors.errorText,
    },
    settingsScreenKeyboardWrap: {
      flex: 1,
    },
    settingsScreenScroll: {
      flex: 1,
    },
    settingsScreenScrollContent: {
      paddingHorizontal: 12,
      paddingTop: 4,
      paddingBottom: 16,
    },
    settingsScreenScrollContentKeyboardOpen: {
      paddingBottom: Platform.OS === 'ios' ? 300 : 220,
    },
    gatewayPanel: {
      borderRadius: 16,
      backgroundColor: colors.panelBg,
      padding: 12,
      borderWidth: 1.5,
      borderColor: colors.panelBorder,
      ...surfaceShadow,
    },
    settingsSection: {
      width: '100%',
    },
    sectionTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      marginBottom: 4,
    },
    settingsSectionSpaced: {
      marginTop: 14,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: colors.panelBorder,
    },
    settingsSectionFocused: {
      marginTop: 0,
      paddingTop: 0,
      borderTopWidth: 0,
    },
    settingsSectionTitle: {
      fontSize: 14,
      color: colors.textPrimary,
      fontWeight: '700',
      marginBottom: 0,
    },
    onboardingSection: {
      borderWidth: 1.5,
      borderColor: colors.inputBorder,
      borderRadius: 12,
      backgroundColor: colors.inputBg,
      paddingHorizontal: 10,
      paddingVertical: 9,
      marginBottom: 12,
    },
    onboardingDescription: {
      marginTop: 2,
      fontSize: 11,
      color: colors.label,
      lineHeight: 15,
    },
    onboardingStepList: {
      marginTop: 7,
      gap: 5,
    },
    onboardingStepRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    onboardingStepText: {
      flex: 1,
      fontSize: 11,
      color: colors.textSecondary,
      lineHeight: 15,
    },
    onboardingStepTextDone: {
      color: colors.textPrimary,
      fontWeight: '600',
    },
    onboardingActionRow: {
      marginTop: 8,
      flexDirection: 'row',
      gap: 6,
      alignItems: 'stretch',
    },
    onboardingSecondaryButton: {
      borderWidth: 1.5,
      borderColor: colors.inputBorder,
      backgroundColor: colors.inputBg,
    },
    onboardingSecondaryButtonDisabled: {
      opacity: 0.55,
    },
    onboardingSecondaryButtonText: {
      color: colors.textSecondary,
      fontWeight: '700',
      fontSize: 12,
    },
    onboardingSkipButton: {
      marginTop: 6,
      alignSelf: 'flex-end',
      paddingHorizontal: 4,
      paddingVertical: 2,
    },
    onboardingSkipButtonText: {
      fontSize: 11,
      color: colors.label,
      fontWeight: '600',
    },
    quickTextSectionHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      marginBottom: 2,
    },
    quickTextDoneButton: {
      minHeight: 28,
      borderRadius: 8,
      borderWidth: 1.5,
      borderColor: colors.inputBorder,
      backgroundColor: colors.inputBg,
      paddingHorizontal: 9,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
    },
    quickTextDoneButtonText: {
      fontSize: 11,
      color: colors.textSecondary,
      fontWeight: '600',
    },
    settingsOptionRow: {
      flexDirection: 'row',
      gap: 6,
      marginTop: 1,
    },
    settingsOptionButton: {
      flex: 1,
      borderWidth: 1.5,
      borderColor: colors.inputBorder,
      borderRadius: 10,
      backgroundColor: colors.inputBg,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 38,
      paddingVertical: 7,
      paddingHorizontal: 10,
      gap: 6,
    },
    settingsOptionButtonSelected: {
      borderColor: colors.inputBorderFocused,
      backgroundColor: isDarkTheme
        ? 'rgba(37,99,235,0.24)'
        : 'rgba(37,99,235,0.10)',
    },
    settingsOptionLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    settingsOptionLabelSelected: {
      color: colors.textPrimary,
    },
    label: {
      fontSize: 11,
      color: colors.label,
      marginBottom: 4,
    },
    labelSpacing: {
      marginTop: 8,
    },
    input: {
      borderWidth: 1.5,
      borderColor: colors.inputBorder,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 9,
      color: colors.inputText,
      backgroundColor: colors.inputBg,
      fontSize: 13,
    },
    tokenInputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 0,
      paddingLeft: 12,
      paddingRight: 6,
    },
    tokenInputField: {
      flex: 1,
      minHeight: 40,
      color: colors.inputText,
      fontSize: 13,
      paddingVertical: 9,
      paddingRight: 8,
    },
    tokenVisibilityButton: {
      width: 30,
      height: 30,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.inputBorder,
      backgroundColor: colors.iconBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    inputFocused: {
      borderColor: colors.inputBorderFocused,
    },
    languagePickerRow: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 1,
    },
    languageOptionButton: {
      flex: 1,
      borderWidth: 1.5,
      borderColor: colors.inputBorder,
      borderRadius: 10,
      backgroundColor: colors.inputBg,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 52,
      paddingVertical: 7,
      paddingHorizontal: 10,
      gap: 3,
    },
    languageOptionButtonSelected: {
      borderColor: colors.inputBorderFocused,
      backgroundColor: isDarkTheme
        ? 'rgba(37,99,235,0.24)'
        : 'rgba(37,99,235,0.10)',
    },
    languageOptionLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    languageOptionLabelSelected: {
      color: colors.textPrimary,
    },
    languageOptionCode: {
      fontSize: 9,
      color: colors.label,
    },
    languageOptionCodeSelected: {
      color: colors.inputBorderFocused,
      fontWeight: '600',
    },
    quickTextConfigRow: {
      flexDirection: 'column',
      gap: 10,
      marginTop: 4,
    },
    quickTextConfigItem: {
      width: '100%',
    },
    quickTextConfigInput: {
      minHeight: 72,
      maxHeight: 120,
      paddingTop: 8,
    },
    quickTextIconLabel: {
      marginTop: 6,
    },
    quickTextIconPickerRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 6,
    },
    quickTextIconOptionButton: {
      width: 34,
      height: 34,
      borderRadius: 8,
      borderWidth: 1.5,
      borderColor: colors.inputBorder,
      backgroundColor: colors.inputBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    quickTextIconOptionButtonSelected: {
      borderColor: colors.inputBorderFocused,
      backgroundColor: isDarkTheme
        ? 'rgba(37,99,235,0.22)'
        : 'rgba(37,99,235,0.10)',
    },
    sessionActionButton: {
      minHeight: 36,
      borderRadius: 10,
      borderWidth: 1.5,
      borderColor: colors.inputBorder,
      backgroundColor: colors.inputBg,
      paddingHorizontal: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sessionActionButtonDisabled: {
      opacity: 0.55,
    },
    sessionActionButtonText: {
      fontSize: 11,
      color: colors.textSecondary,
      fontWeight: '600',
    },
    sessionButtonContent: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    sessionActionRow: {
      marginTop: 8,
      flexDirection: 'row',
      gap: 6,
    },
    sessionActionButtonWide: {
      flex: 1,
    },
    sessionChipPrimary: {
      gap: 4,
    },
    sessionChipActionRow: {
      marginTop: 4,
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 6,
    },
    sessionChipActionButton: {
      width: 30,
      height: 30,
      borderRadius: 8,
      borderWidth: 1.5,
      borderColor: colors.inputBorder,
      backgroundColor: colors.inputBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sessionChipActionButtonDisabled: {
      opacity: 0.55,
    },
    sessionRenameRow: {
      marginTop: 8,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    sessionRenameRowInline: {
      marginTop: 6,
    },
    sessionRenameInput: {
      flex: 1,
      minHeight: 38,
      paddingVertical: 7,
      fontSize: 13,
    },
    sessionRenameActionButton: {
      minHeight: 32,
      borderRadius: 8,
      borderWidth: 1.5,
      borderColor: colors.inputBorder,
      backgroundColor: colors.inputBg,
      paddingHorizontal: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sessionRenameActionButtonDisabled: {
      opacity: 0.55,
    },
    sessionRenameActionButtonText: {
      fontSize: 11,
      color: colors.textSecondary,
      fontWeight: '600',
    },
    sessionHintText: {
      marginTop: 6,
      fontSize: 10,
      color: colors.label,
      lineHeight: 14,
    },
    sessionHintTextWarning: {
      color: colors.errorText,
    },
    sessionListColumn: {
      marginTop: 8,
      paddingVertical: 2,
      gap: 8,
    },
    sessionChip: {
      width: '100%',
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: colors.inputBorder,
      backgroundColor: colors.inputBg,
      paddingHorizontal: 11,
      paddingVertical: 8,
      gap: 6,
    },
    sessionChipActive: {
      borderColor: colors.inputBorderFocused,
      backgroundColor: isDarkTheme
        ? 'rgba(37,99,235,0.24)'
        : 'rgba(37,99,235,0.10)',
    },
    sessionChipDisabled: {
      opacity: 0.65,
    },
    sessionChipTitle: {
      fontSize: 12,
      color: colors.textPrimary,
      fontWeight: '600',
      flexShrink: 1,
    },
    sessionChipTitleActive: {
      color: colors.textPrimary,
    },
    sessionChipTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    sessionChipBadgeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    sessionChipBadge: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.inputBorder,
      backgroundColor: colors.inputBg,
      minWidth: 18,
      minHeight: 18,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 2,
      paddingVertical: 2,
    },
    sessionChipBadgeCurrent: {
      borderColor: colors.inputBorderFocused,
      backgroundColor: isDarkTheme
        ? 'rgba(37,99,235,0.24)'
        : 'rgba(37,99,235,0.12)',
    },
    sessionChipBadgePinned: {
      borderColor: isDarkTheme ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.12)',
    },
    sessionChipMeta: {
      fontSize: 10,
      color: colors.label,
      lineHeight: 14,
    },
    sessionChipMetaActive: {
      color: colors.inputBorderFocused,
    },
    connectionRow: {
      marginTop: 8,
      flexDirection: 'row',
      gap: 8,
      alignItems: 'stretch',
      width: '100%',
    },
    autoConnectLoadingRow: {
      marginTop: 8,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    autoConnectLoadingText: {
      fontSize: 11,
      color: colors.loading,
      fontWeight: '600',
    },
    gatewayDiagnosticBox: {
      marginTop: 8,
      borderRadius: 10,
      borderWidth: 1.5,
      borderColor: colors.inputBorder,
      backgroundColor: colors.inputBg,
      paddingHorizontal: 9,
      paddingVertical: 8,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 7,
    },
    gatewayDiagnosticTextWrap: {
      flex: 1,
      gap: 2,
    },
    gatewayDiagnosticSummary: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.textPrimary,
      lineHeight: 15,
    },
    gatewayDiagnosticHint: {
      fontSize: 10,
      color: colors.textSecondary,
      lineHeight: 14,
    },
    smallButton: {
      borderRadius: 9,
      minHeight: 40,
      paddingHorizontal: 12,
      paddingVertical: 8,
      alignItems: 'center',
      justifyContent: 'center',
      flex: 1,
      borderWidth: 0,
      borderColor: 'transparent',
    },
    connectButton: {
      backgroundColor: colors.connectBtn,
    },
    smallButtonText: {
      color: '#fff',
      fontWeight: '700',
      fontSize: 12,
    },
    smallButtonDisabled: {
      backgroundColor: colors.smallBtnDisabled,
    },
    headerBoundary: {
      height: 1,
      backgroundColor: isDarkTheme
        ? 'rgba(143,167,210,0.26)'
        : 'rgba(108,122,148,0.26)',
      marginTop: 1,
      marginBottom: 3,
      opacity: 0.9,
    },
    topBanner: {
      width: '100%',
      minHeight: 30,
      borderRadius: 9,
      borderWidth: 1,
      borderColor: colors.topBannerBorder,
      backgroundColor: colors.topBannerBg,
      paddingHorizontal: 8,
      paddingVertical: 4,
      marginBottom: 4,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    topBannerSpeech: {
      borderColor: colors.topBannerSpeechBorder,
      backgroundColor: colors.topBannerSpeechBg,
    },
    topBannerIcon: {
      color: colors.topBannerText,
    },
    topBannerText: {
      flex: 1,
      color: colors.topBannerText,
      fontSize: 11,
      lineHeight: 14,
      fontWeight: '600',
    },
    topBannerActionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      flexShrink: 0,
    },
    topBannerActionButton: {
      width: 24,
      height: 24,
      borderRadius: 7,
      borderWidth: 1,
      borderColor: colors.topBannerActionBorder,
      backgroundColor: colors.topBannerActionBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    topBannerActionButtonDisabled: {
      opacity: 0.5,
    },
    topBannerActionIcon: {
      color: colors.topBannerActionIcon,
    },
    main: {
      flex: 1,
      gap: 8,
    },
    card: {
      borderRadius: 20,
      backgroundColor: colors.cardBg,
      borderWidth: 1.5,
      borderColor: colors.cardBorder,
      padding: 14,
      ...surfaceShadow,
    },
    recordingCard: {
      borderColor: colors.recordingBorder,
    },
    historyCard: {
      flex: 1,
      minHeight: 220,
    },
    historyCardFlat: {
      backgroundColor: 'transparent',
      borderWidth: 0,
      borderColor: 'transparent',
      paddingHorizontal: 0,
      paddingTop: 0,
      paddingBottom: 2,
      shadowOpacity: 0,
      shadowRadius: 0,
      elevation: 0,
    },
    transcriptCardExpanded: {
      flex: 1,
      minHeight: 0,
    },
    transcriptCardCompact: {
      paddingTop: 8,
      paddingBottom: 8,
    },
    transcriptEditor: {
      minHeight: 96,
      gap: 6,
    },
    transcriptEditorCompact: {
      minHeight: 48,
      gap: 0,
    },
    transcriptEditorExpanded: {
      flex: 1,
      minHeight: 0,
    },
    transcriptInput: {
      minHeight: 80,
      borderRadius: 0,
      borderWidth: 0,
      borderColor: 'transparent',
      backgroundColor: 'transparent',
      color: colors.textPrimary,
      paddingHorizontal: 2,
      paddingVertical: 0,
      fontSize: 15,
      lineHeight: 22,
    },
    transcriptInputCompact: {
      minHeight: 38,
      lineHeight: 20,
    },
    transcriptInputExpanded: {
      flex: 1,
      minHeight: 0,
    },
    transcriptInputDisabled: {
      opacity: 0.85,
    },
    interimText: {
      fontSize: 13,
      lineHeight: 18,
      color: colors.textSecondary,
      fontStyle: 'italic',
      paddingHorizontal: 2,
    },
    placeholder: {
      fontSize: 14,
      lineHeight: 20,
      color: colors.placeholder,
      textAlign: 'center',
      paddingVertical: 48,
    },
    historyMetaTopRow: {
      minHeight: 20,
      marginBottom: 4,
      paddingRight: 36,
      justifyContent: 'center',
    },
    historyMetaTopText: {
      fontSize: 11,
      color: colors.historyMetaText,
    },
    historyRefreshButtonFloating: {
      width: 26,
      height: 26,
      borderRadius: 9,
      position: 'absolute',
      top: 0,
      right: 0,
      zIndex: 2,
    },
    historyScrollToBottomButtonFloating: {
      width: 32,
      height: 32,
      borderRadius: 10,
      position: 'absolute',
      right: 0,
      bottom: 6,
      zIndex: 3,
    },
    chatList: {
      paddingBottom: 10,
      gap: 0,
    },
    chatListWithScrollButton: {
      paddingBottom: 0,
    },
    historyDateRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingTop: 8,
      paddingBottom: 6,
    },
    historyDateLine: {
      flex: 1,
      height: 1,
      backgroundColor: colors.historyDateLine,
    },
    historyDateText: {
      fontSize: 10,
      fontWeight: '600',
      color: colors.historyDateText,
    },
    historyTurnGroup: {
      marginBottom: 10,
      gap: 0,
    },
    historyTurnGroupLast: {
      marginBottom: 0,
    },
    historyUserRow: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      marginBottom: 4,
    },
    historyAssistantRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 6,
      marginBottom: 2,
    },
    assistantAvatar: {
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.assistantAvatarBg,
      borderWidth: 1,
      borderColor: colors.assistantAvatarBorder,
    },
    historyMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingTop: 0,
    },
    historyMetaDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    historyMetaDotOk: {
      backgroundColor: colors.dotConnected,
    },
    historyMetaDotWaiting: {
      backgroundColor: colors.historyWaitingDot,
    },
    historyMetaDotError: {
      backgroundColor: colors.errorBorder,
    },
    historyMetaText: {
      fontSize: 10,
      color: colors.historyMetaText,
    },
    turnUser: {
      color: colors.turnUser,
      fontSize: 14,
      lineHeight: 20,
      fontWeight: '500',
    },
    turnUserBubble: {
      maxWidth: '78%',
      backgroundColor: colors.turnUserBubbleBg,
      borderWidth: 0,
      borderColor: 'transparent',
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
      borderBottomRightRadius: 4,
      borderBottomLeftRadius: 18,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    turnAssistantBubble: {
      flexShrink: 1,
      maxWidth: '78%',
      backgroundColor: colors.turnAssistantBubbleBg,
      borderWidth: 0,
      borderColor: 'transparent',
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
      borderBottomRightRadius: 18,
      borderBottomLeftRadius: 4,
      paddingHorizontal: 12,
      paddingVertical: 10,
      ...surfaceShadow,
    },
    turnAssistantBubbleError: {
      borderWidth: 1.5,
      borderColor: colors.turnAssistantErrorBorder,
    },
    bottomDock: {
      alignItems: 'center',
      paddingTop: 10,
      paddingBottom: 6,
      gap: 8,
      width: '100%',
      borderTopWidth: 1,
      borderTopColor: colors.bottomDockBorder,
      backgroundColor: colors.bottomDockBg,
      borderTopLeftRadius: 14,
      borderTopRightRadius: 14,
    },
    bottomDockComposing: {
      paddingTop: 8,
      paddingBottom: 4,
      gap: 4,
    },
    bottomDockKeyboardOpen: {
      paddingTop: 12,
      paddingBottom: 12,
    },
    bottomDockKeyboardCompact: {
      paddingTop: 6,
      paddingBottom: 4,
      gap: 4,
    },
    bottomActionRow: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16,
    },
    keyboardActionRow: {
      width: '100%',
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 8,
    },
    keyboardActionButton: {
      minHeight: 44,
      borderRadius: 14,
      borderWidth: 1.5,
      borderColor: colors.inputBorder,
      backgroundColor: colors.inputBg,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 14,
    },
    keyboardActionButtonWide: {
      flex: 1,
    },
    keyboardActionButtonSingle: {
      minWidth: 100,
    },
    keyboardActionButtonText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    keyboardClearActionButtonText: {
      color: isDarkTheme ? '#ffb0b0' : '#DC2626',
      fontWeight: '700',
    },
    keyboardSendActionButton: {
      backgroundColor: colors.sendRound,
      borderColor: 'transparent',
    },
    keyboardSendActionButtonText: {
      color: '#ffffff',
      fontWeight: '700',
    },
    keyboardActionButtonDisabled: {
      backgroundColor: colors.roundDisabled,
      borderColor: 'transparent',
      opacity: 0.72,
    },
    roundButton: {
      width: 60,
      height: 60,
      borderRadius: 30,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1.5,
      borderColor: colors.roundBorder,
      ...fabShadow,
    },
    micRoundButton: {
      backgroundColor: colors.micRound,
    },
    recordingRoundButton: {
      backgroundColor: colors.recordingRound,
      ...recordingFabShadow,
    },
    sendRoundButton: {
      backgroundColor: colors.sendRound,
    },
    roundButtonDisabled: {
      backgroundColor: colors.roundDisabled,
      shadowOpacity: 0,
      elevation: 0,
    },
    bottomActionButtonPressed: {
      transform: [{ scale: 0.95 }],
      opacity: 0.92,
    },
    quickTextButton: {
      width: 52,
      height: 52,
      borderRadius: 26,
      borderWidth: 1.5,
      borderColor: colors.quickActionBorder,
      backgroundColor: colors.quickActionBg,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 6,
      ...quickFabShadow,
    },
    quickTextButtonSlot: {
      width: 52,
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
    },
    quickTextButtonDisabled: {
      opacity: 0.42,
      shadowOpacity: 0,
      elevation: 0,
    },
    quickTextButtonIcon: {
      color: colors.quickActionText,
    },
    quickTextTooltip: {
      position: 'absolute',
      bottom: 60,
      minWidth: 88,
      maxWidth: 180,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.quickTooltipBorder,
      backgroundColor: colors.quickTooltipBg,
      paddingHorizontal: 10,
      paddingVertical: 6,
      zIndex: 3,
      ...surfaceShadow,
    },
    quickTextTooltipText: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.quickTooltipText,
      textAlign: 'center',
    },
    bottomStateRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      minHeight: 18,
      paddingHorizontal: 8,
      width: '100%',
    },
    bottomStateDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.bottomStateNeutral,
      flexShrink: 0,
    },
    bottomStateDotConnecting: {
      backgroundColor: colors.bottomStateConnecting,
    },
    bottomStateDotDisconnected: {
      backgroundColor: colors.bottomStateDisconnected,
    },
    bottomStateDotRecording: {
      backgroundColor: colors.bottomStateRecording,
    },
    bottomStateDotSending: {
      backgroundColor: colors.bottomStateSending,
    },
    bottomStateDotRetrying: {
      backgroundColor: colors.bottomStateRetrying,
    },
    bottomStateDotComplete: {
      backgroundColor: colors.bottomStateComplete,
    },
    bottomStateDotError: {
      backgroundColor: colors.bottomStateError,
    },
    bottomStateLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.bottomStateNeutral,
    },
    bottomStateLabelConnecting: {
      color: colors.bottomStateConnecting,
    },
    bottomStateLabelDisconnected: {
      color: colors.bottomStateDisconnected,
    },
    bottomStateLabelRecording: {
      color: colors.bottomStateRecording,
    },
    bottomStateLabelSending: {
      color: colors.bottomStateSending,
    },
    bottomStateLabelRetrying: {
      color: colors.bottomStateRetrying,
    },
    bottomStateLabelComplete: {
      color: colors.bottomStateComplete,
    },
    bottomStateLabelError: {
      color: colors.bottomStateError,
    },
    bottomStateDetail: {
      fontSize: 12,
      color: colors.bottomStateDetail,
      flexShrink: 1,
    },
  });
}
