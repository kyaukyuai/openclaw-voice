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
  ENABLE_DEBUG_WARNINGS,
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
import { useGatewayConnectionFlow } from './src/ios-runtime/useGatewayConnectionFlow';
import { useOutboxRuntime } from './src/ios-runtime/useOutboxRuntime';
import { useSessionHistoryRuntime } from './src/ios-runtime/useSessionHistoryRuntime';
import { useSpeechRuntime } from './src/ios-runtime/useSpeechRuntime';
import { useAppLifecycleRuntime } from './src/ios-runtime/useAppLifecycleRuntime';
import {
  useRuntimePersistenceEffects,
  useRuntimeUiEffects,
} from './src/ios-runtime/useAppRuntimeEffects';
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
    chatHistory: gatewayChatHistory,
    chatSend: gatewayChatSend,
    patchSession: gatewayPatchSession,
    subscribeChatEvent: gatewaySubscribeChatEvent,
    subscribeEvent: gatewaySubscribeEvent,
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

  const scrollHistoryToBottom = useCallback((animated = true) => {
    scheduleHistoryScrollToEnd(() => {
      historyScrollRef.current?.scrollToEnd({ animated });
      setShowScrollToBottomButton(false);
      historyAutoScrollRef.current = true;
    });
  }, []);

  useRuntimeUiEffects({
    shouldShowSettingsScreen,
    forceMaskAuthToken,
    missingResponseNotice,
    activeSessionKey,
    chatTurns,
    clearMissingResponseRecoveryState,
    isTurnWaitingState,
    transcript,
    transcriptRef,
    interimTranscript,
    interimTranscriptRef,
    activeSessionKeyRef,
    historyAutoScrollRef,
    setShowScrollToBottomButton,
    gatewayUrl,
    gatewayUrlRef,
    gatewayContextConnectDiagnostic,
    setGatewayConnectDiagnostic,
    connectionState,
    connectionStateRef,
    outboxQueue,
    outboxQueueRef,
    gatewaySessions,
    setSessions,
    gatewaySessionsError,
    setSessionsError,
    gatewayEventState,
    gatewayEventStateRef,
    isSending,
    setIsBottomCompletePulse,
    clearBottomCompletePulseTimer,
    bottomCompletePulseTimerRef,
    setGatewayEventState,
    sessionTurnsRef,
    scrollHistoryToBottom,
    isOnboardingCompleted,
    isOnboardingWaitingForResponse,
    setIsOnboardingCompleted,
    setIsOnboardingWaitingForResponse,
    isGatewayConnected,
    setIsSessionPanelOpen,
  });

  useRuntimePersistenceEffects({
    settingsReady,
    persistRuntimeSetting,
    activeSessionKey,
    sessionPreferences,
    outboxQueue,
    kvStore,
    sessionKeyStorageKey: STORAGE_KEYS.sessionKey,
    sessionPrefsStorageKey: STORAGE_KEYS.sessionPrefs,
    outboxQueueStorageKey: STORAGE_KEYS.outboxQueue,
    identityStorageKey: OPENCLAW_IDENTITY_STORAGE_KEY,
    openClawIdentityMemory,
    parseSessionPreferences,
    parseOutboxQueue,
    defaultSessionKey: DEFAULT_SESSION_KEY,
    activeSessionKeyRef,
    sessionTurnsRef,
    setActiveSessionKey,
    setSessionPreferences,
    setOutboxQueue,
    setGatewayEventState,
    setChatTurns,
    setLocalStateReady,
  });

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

  const updateChatTurn = useCallback(
    (turnId: string, updater: (turn: ChatTurn) => ChatTurn) => {
      setChatTurns((previous) =>
        previous.map((turn) => (turn.id === turnId ? updater(turn) : turn)),
      );
    },
    [],
  );

  const {
    refreshSessions,
    loadSessionHistory,
    switchSession,
    createAndSwitchSession,
  } = useSessionHistoryRuntime({
    connectionState,
    connectionStateRef,
    isSending,
    isSessionOperationPending,
    activeSessionKeyRef,
    activeRunIdRef,
    pendingTurnIdRef,
    runIdToTurnIdRef,
    sessionTurnsRef,
    outboxQueueRef,
    gatewayRefreshSessions,
    gatewayChatHistory,
    runHistoryRefresh,
    runGatewayRuntimeAction,
    invalidateRefreshEpoch,
    buildTurnsFromHistory,
    setSessions,
    setSessionsError,
    setGatewayError,
    setChatTurns,
    setActiveSessionKey,
    setFocusedField,
    setIsSessionRenameOpen,
    setSessionRenameTargetKey,
    setSessionRenameDraft,
    setIsSending,
    setGatewayEventState,
    setHistoryLastSyncedAt,
    setActiveRunId,
  });

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
    connectionState,
    gatewayPatchSession,
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

  const { disconnectGateway, connectGateway } = useGatewayConnectionFlow({
    gatewayUrl,
    authToken,
    settingsReady,
    gatewayContextConnectDiagnostic,
    gatewayConnect,
    gatewayDisconnect,
    gatewaySubscribeChatEvent,
    gatewaySubscribeEvent,
    gatewayUrlRef,
    connectionStateRef,
    isUnmountingRef,
    subscriptionsRef,
    historySyncTimerRef,
    historySyncRequestRef,
    outboxProcessingRef,
    startupAutoConnectAttemptRef,
    startupAutoConnectRetryTimerRef,
    activeRunIdRef,
    pendingTurnIdRef,
    runIdToTurnIdRef,
    setActiveRunId,
    setGatewayError,
    setGatewayConnectDiagnostic,
    setSessionsError,
    setGatewayEventState,
    setIsSettingsPanelOpen,
    setIsStartupAutoConnecting,
    setIsSessionOperationPending,
    setIsBottomCompletePulse,
    clearFinalResponseRecoveryTimer,
    clearMissingResponseRecoveryState,
    clearStartupAutoConnectRetryTimer,
    clearBottomCompletePulseTimer,
    clearOutboxRetryTimer,
    invalidateRefreshEpoch,
    forceMaskAuthToken,
    runGatewayRuntimeAction,
    handleChatEvent,
  });

  const { sendToGateway } = useOutboxRuntime({
    isSending,
    connectionState,
    outboxQueue,
    outboxQueueRef,
    outboxProcessingRef,
    outboxRetryTimerRef,
    connectionStateRef,
    activeSessionKeyRef,
    transcriptRef,
    interimTranscriptRef,
    sendFingerprintRef,
    pendingTurnIdRef,
    activeRunIdRef,
    runIdToTurnIdRef,
    gatewaySendChat: gatewayChatSend,
    runGatewayHealthCheck,
    runGatewayRuntimeAction,
    updateChatTurn,
    refreshSessions,
    clearOutboxRetryTimer,
    clearMissingResponseRecoveryState,
    setGatewayError,
    setGatewayEventState,
    setOutboxQueue,
    setChatTurns,
    setTranscript,
    setInterimTranscript,
    setActiveRunId,
  });

  const abortSpeechRecognitionIfSupported = useCallback(() => {
    if (!supportsSpeechRecognitionOnCurrentPlatform()) return;
    ExpoSpeechRecognitionModule.abort();
  }, []);

  useAppLifecycleRuntime({
    localStateReady,
    settingsReady,
    gatewayUrl,
    connectionState,
    startupAutoConnectAttemptedRef,
    startupAutoConnectAttemptRef,
    connectGateway,
    isUnmountingRef,
    invalidateRefreshEpoch,
    expectedSpeechStopRef,
    holdStartTimerRef,
    historySyncTimerRef,
    historySyncRequestRef,
    historyNoticeTimerRef,
    bottomCompletePulseTimerRef,
    authTokenMaskTimerRef,
    outboxRetryTimerRef,
    startupAutoConnectRetryTimerRef,
    finalResponseRecoveryTimerRef,
    missingResponseRecoveryTimerRef,
    missingResponseRecoveryRequestRef,
    settingsFocusScrollTimerRef,
    quickTextTooltipTimerRef,
    quickTextLongPressResetTimerRef,
    quickTextLongPressSideRef,
    disconnectGateway,
    abortSpeechRecognitionIfSupported,
  });

  const { startRecognition, stopRecognition } = useSpeechRuntime({
    speechLang,
    isRecognizing,
    expectedSpeechStopRef,
    isUnmountingRef,
    setIsRecognizing,
    setSpeechError,
    setTranscript,
    setInterimTranscript,
  });

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
