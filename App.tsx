import { StatusBar } from 'expo-status-bar';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
} from 'react';
import { Ionicons } from '@expo/vector-icons';
import Markdown, { MarkdownIt } from 'react-native-markdown-display';
import {
  ActivityIndicator,
  Animated,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  LogBox,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  findNodeHandle,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  Vibration,
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
import DebugInfoPanel from './src/ui/DebugInfoPanel';
import {
  buildHistoryRefreshNotice,
  computeAutoConnectRetryPlan,
  normalizeMessageForDedupe,
  resolveSendDispatch,
  shouldAttemptFinalRecovery,
  shouldStartStartupAutoConnect,
  isIncompleteAssistantContent,
} from './src/ui/runtime-logic';

const CONNECTION_LABELS: Record<ConnectionState, string> = {
  disconnected: 'Disconnected',
  connecting: 'Connecting...',
  connected: 'Connected',
  reconnecting: 'Reconnecting...',
};
const REQUESTED_GATEWAY_CLIENT_ID =
  (process.env.EXPO_PUBLIC_GATEWAY_CLIENT_ID ?? 'openclaw-ios').trim() ||
  'openclaw-ios';
const GATEWAY_DISPLAY_NAME =
  (process.env.EXPO_PUBLIC_GATEWAY_DISPLAY_NAME ?? 'OpenClawVoice').trim() ||
  'OpenClawVoice';
const ENABLE_DEBUG_WARNINGS = /^(1|true|yes|on)$/i.test(
  (process.env.EXPO_PUBLIC_DEBUG_MODE ?? '').trim(),
);

if (__DEV__ && !ENABLE_DEBUG_WARNINGS) {
  LogBox.ignoreAllLogs(true);
}

const STORAGE_KEYS = {
  gatewayUrl: 'mobile-openclaw.gateway-url',
  authToken: 'mobile-openclaw.auth-token',
  theme: 'mobile-openclaw.theme',
  speechLang: 'mobile-openclaw.speech-lang',
  quickTextLeft: 'mobile-openclaw.quick-text-left',
  quickTextRight: 'mobile-openclaw.quick-text-right',
  quickTextLeftIcon: 'mobile-openclaw.quick-text-left-icon',
  quickTextRightIcon: 'mobile-openclaw.quick-text-right-icon',
  sessionKey: 'mobile-openclaw.session-key',
  sessionPrefs: 'mobile-openclaw.session-prefs',
  outboxQueue: 'mobile-openclaw.outbox-queue',
};

const OPENCLAW_IDENTITY_STORAGE_KEY = 'openclaw_device_identity';

type KeyValueStore = {
  getItemAsync: (key: string) => Promise<string | null>;
  setItemAsync: (key: string, value: string) => Promise<void>;
  deleteItemAsync: (key: string) => Promise<void>;
};

const memoryStore = new Map<string, string>();

const fallbackStore: KeyValueStore = {
  async getItemAsync(key) {
    return memoryStore.get(key) ?? null;
  },
  async setItemAsync(key, value) {
    memoryStore.set(key, value);
  },
  async deleteItemAsync(key) {
    memoryStore.delete(key);
  },
};

function resolveKeyValueStore(): KeyValueStore {
  try {
    const secureStore = require('expo-secure-store') as KeyValueStore;
    return secureStore;
  } catch {
    return fallbackStore;
  }
}

const kvStore = resolveKeyValueStore();
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

type ChatTurn = {
  id: string;
  userText: string;
  assistantText: string;
  state: string;
  runId?: string;
  createdAt: number;
};

type HistoryListItem =
  | {
      kind: 'date';
      id: string;
      label: string;
    }
  | {
      kind: 'turn';
      id: string;
      turn: ChatTurn;
      isLast: boolean;
    };

type AppTheme = 'dark' | 'light';
type SpeechLang = 'ja-JP' | 'en-US';
type QuickTextButtonSide = 'left' | 'right';
type QuickTextFocusField = 'quick-text-left' | 'quick-text-right';
type QuickTextIcon = ComponentProps<typeof Ionicons>['name'];
type FocusField =
  | 'gateway-url'
  | 'auth-token'
  | 'quick-text-left'
  | 'quick-text-right'
  | 'transcript'
  | null;
type SessionPreference = {
  alias?: string;
  pinned?: boolean;
};
type SessionPreferences = Record<string, SessionPreference>;
type HistoryRefreshNotice = {
  kind: 'success' | 'error';
  message: string;
};
type GatewayHealthState = 'unknown' | 'checking' | 'ok' | 'degraded';
type OutboxQueueItem = {
  id: string;
  sessionKey: string;
  message: string;
  turnId: string;
  idempotencyKey: string;
  createdAt: number;
  retryCount: number;
  nextRetryAt: number;
  lastError: string | null;
};

const DEFAULT_GATEWAY_URL = (process.env.EXPO_PUBLIC_DEFAULT_GATEWAY_URL ?? '').trim();
const DEFAULT_THEME: AppTheme =
  process.env.EXPO_PUBLIC_DEFAULT_THEME === 'dark' ? 'dark' : 'light';
const DEFAULT_SPEECH_LANG: SpeechLang = 'ja-JP';
const DEFAULT_QUICK_TEXT_LEFT = 'ありがとう';
const DEFAULT_QUICK_TEXT_RIGHT = 'お願いします';
const DEFAULT_QUICK_TEXT_LEFT_ICON: QuickTextIcon = 'chatbubble-ellipses-outline';
const DEFAULT_QUICK_TEXT_RIGHT_ICON: QuickTextIcon = 'chatbubble-ellipses-outline';
const QUICK_TEXT_ICON_OPTIONS: Array<{
  value: QuickTextIcon;
  label: string;
}> = [
  { value: 'chatbubble-ellipses-outline', label: 'Chat' },
  { value: 'flash-outline', label: 'Flash' },
  { value: 'checkmark-done-outline', label: 'Done' },
  { value: 'bookmark-outline', label: 'Bookmark' },
  { value: 'heart-outline', label: 'Heart' },
  { value: 'star-outline', label: 'Star' },
];
const QUICK_TEXT_ICON_SET = new Set<QuickTextIcon>(
  QUICK_TEXT_ICON_OPTIONS.map((option) => option.value),
);
const QUICK_TEXT_TOOLTIP_HIDE_MS = 1600;
const HISTORY_NOTICE_HIDE_MS = 2200;
const AUTH_TOKEN_AUTO_MASK_MS = 12000;
const DUPLICATE_SEND_BLOCK_MS = 1400;
const IDEMPOTENCY_REUSE_WINDOW_MS = 60_000;
const SEND_TIMEOUT_MS = 30_000;
const OUTBOX_RETRY_BASE_MS = 1800;
const OUTBOX_RETRY_MAX_MS = 20_000;
const GATEWAY_HEALTH_CHECK_TIMEOUT_MS = 4000;
const GATEWAY_HEALTH_CHECK_INTERVAL_MS = 18_000;
const STARTUP_AUTO_CONNECT_MAX_ATTEMPTS = 3;
const STARTUP_AUTO_CONNECT_RETRY_BASE_MS = 1400;
const FINAL_RESPONSE_RECOVERY_BASE_DELAY_MS = 1300;
const FINAL_RESPONSE_RECOVERY_MAX_ATTEMPTS = 2;
const DEFAULT_SESSION_KEY =
  (process.env.EXPO_PUBLIC_DEFAULT_SESSION_KEY ?? 'main').trim() || 'main';
const MAX_TEXT_SCALE = 1.35;
const MAX_TEXT_SCALE_TIGHT = 1.15;
const HISTORY_BOTTOM_THRESHOLD_PX = 72;
const SPEECH_LANG_OPTIONS: Array<{ value: SpeechLang; label: string }> = [
  { value: 'ja-JP', label: '日本語' },
  { value: 'en-US', label: 'English' },
];

type HapticsModule = {
  impactAsync?: (style: unknown) => Promise<void>;
  notificationAsync?: (type: unknown) => Promise<void>;
  ImpactFeedbackStyle?: {
    Light?: unknown;
    Medium?: unknown;
  };
  NotificationFeedbackType?: {
    Success?: unknown;
    Error?: unknown;
  };
};

let hapticsModuleCache: HapticsModule | null | undefined;

function getHapticsModule(): HapticsModule | null {
  if (hapticsModuleCache !== undefined) return hapticsModuleCache;
  try {
    hapticsModuleCache = require('expo-haptics') as HapticsModule;
  } catch {
    hapticsModuleCache = null;
  }
  return hapticsModuleCache;
}

async function triggerHaptic(
  type:
    | 'button-press'
    | 'record-start'
    | 'record-stop'
    | 'send-success'
    | 'send-error',
): Promise<void> {
  const haptics = getHapticsModule();
  if (haptics) {
    try {
      if (type === 'button-press') {
        await haptics.impactAsync?.(haptics.ImpactFeedbackStyle?.Medium);
        return;
      }
      if (type === 'send-success') {
        await haptics.notificationAsync?.(
          haptics.NotificationFeedbackType?.Success,
        );
        return;
      }
      if (type === 'send-error') {
        await haptics.notificationAsync?.(
          haptics.NotificationFeedbackType?.Error,
        );
        return;
      }
      await haptics.impactAsync?.(
        type === 'record-start'
          ? haptics.ImpactFeedbackStyle?.Light
          : haptics.ImpactFeedbackStyle?.Medium,
      );
      return;
    } catch {
      // fallback below
    }
  }
  Vibration.vibrate(type === 'send-error' ? 20 : type === 'button-press' ? 6 : 10);
}

function normalizeSpeechErrorCode(error: unknown): string {
  return String(error ?? '').trim().toLowerCase();
}

function isSpeechAbortLikeError(code: string): boolean {
  return (
    code.includes('aborted') ||
    code.includes('cancelled') ||
    code.includes('canceled') ||
    code.includes('interrupted')
  );
}

type TextContentOptions = {
  trim?: boolean;
  dedupe?: boolean;
};

function toTextContent(message?: ChatMessage, options?: TextContentOptions): string {
  if (!message) return '';
  const trim = options?.trim ?? true;
  const dedupe = options?.dedupe ?? true;

  const { content } = message;
  if (typeof content === 'string') return trim ? content.trim() : content;
  if (!Array.isArray(content)) return '';

  const lines = content
    .map((block) => {
      const pieces: string[] = [];
      collectText(pieceOrUndefined(block?.text), pieces, 0, trim);
      collectText(pieceOrUndefined(block?.thinking), pieces, 0, trim);
      collectText(pieceOrUndefined(block?.content), pieces, 0, trim);
      const normalized = dedupe ? dedupeLines(pieces) : pieces;
      const joined = normalized.join('\n');
      return trim ? joined.trim() : joined;
    })
    .filter(Boolean);

  const joined = lines.join('\n');
  return trim ? joined.trim() : joined;
}

function pieceOrUndefined(value: unknown): unknown {
  return value === null ? undefined : value;
}

function collectText(value: unknown, out: string[], depth = 0, trim = true): void {
  if (value == null || depth > 6) return;

  if (typeof value === 'string') {
    const text = trim ? value.trim() : value;
    if (text) out.push(text);
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((entry) => collectText(entry, out, depth + 1, trim));
    return;
  }

  if (typeof value !== 'object') return;

  const record = value as Record<string, unknown>;
  collectText(record.text, out, depth + 1, trim);
  collectText(record.thinking, out, depth + 1, trim);
  collectText(record.content, out, depth + 1, trim);
  collectText(record.value, out, depth + 1, trim);
  collectText(record.message, out, depth + 1, trim);
  collectText(record.output, out, depth + 1, trim);
}

function dedupeLines(lines: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  lines.forEach((line) => {
    if (!seen.has(line)) {
      seen.add(line);
      result.push(line);
    }
  });
  return result;
}

function errorMessage(err: unknown): string {
  if (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    typeof (err as { code?: unknown }).code === 'string'
  ) {
    const code = String((err as { code: string }).code);
    const message = err instanceof Error ? err.message : String(err);
    return `${code}: ${message}`;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

function createTurnId(): string {
  return `turn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function createSessionKey(): string {
  return `mobile-openclaw-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

function createOutboxItemId(): string {
  return `outbox-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

function getOutboxRetryDelayMs(retryCount: number): number {
  const safeRetryCount = Math.max(1, retryCount);
  const delay = OUTBOX_RETRY_BASE_MS * 2 ** (safeRetryCount - 1);
  return Math.min(OUTBOX_RETRY_MAX_MS, delay);
}

function sessionDisplayName(session: SessionEntry): string {
  const preferred =
    session.displayName ??
    session.label ??
    session.subject ??
    session.room ??
    session.key;
  return (preferred ?? session.key).trim() || session.key;
}

function extractTimestampFromUnknown(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const asNumber = Number(value);
    if (Number.isFinite(asNumber)) return asNumber;
    const asDate = Date.parse(value);
    if (Number.isFinite(asDate)) return asDate;
  }
  return fallback;
}

function textFromUnknown(value: unknown): string {
  const pieces: string[] = [];
  collectText(value, pieces);
  return dedupeLines(pieces).join('\n').trim();
}

function normalizeChatEventState(state: string | undefined): string {
  const normalized = (state ?? 'unknown').trim().toLowerCase();
  if (normalized === 'done' || normalized === 'final') return 'complete';
  return normalized || 'unknown';
}

function getTextOverlapSize(base: string, incoming: string): number {
  const max = Math.min(base.length, incoming.length);
  for (let size = max; size > 0; size -= 1) {
    if (base.slice(-size) === incoming.slice(0, size)) return size;
  }
  return 0;
}

function mergeAssistantStreamText(previousRaw: string, incomingRaw: string): string {
  const previous = previousRaw === 'Responding...' ? '' : previousRaw;
  const incoming = incomingRaw;

  if (!incoming) return previous || 'Responding...';
  if (!previous) return incoming;
  if (incoming === previous) return previous;
  if (incoming.startsWith(previous)) return incoming;
  if (previous.startsWith(incoming)) return previous;

  const overlap = getTextOverlapSize(previous, incoming);
  return `${previous}${incoming.slice(overlap)}`;
}

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

export default function App() {
  const [gatewayUrl, setGatewayUrl] = useState(DEFAULT_GATEWAY_URL);
  const [authToken, setAuthToken] = useState('');
  const [isAuthTokenMasked, setIsAuthTokenMasked] = useState(true);
  const [speechLang, setSpeechLang] = useState<SpeechLang>(DEFAULT_SPEECH_LANG);
  const [quickTextLeft, setQuickTextLeft] = useState(DEFAULT_QUICK_TEXT_LEFT);
  const [quickTextRight, setQuickTextRight] = useState(DEFAULT_QUICK_TEXT_RIGHT);
  const [quickTextLeftIcon, setQuickTextLeftIcon] = useState<QuickTextIcon>(
    DEFAULT_QUICK_TEXT_LEFT_ICON,
  );
  const [quickTextRightIcon, setQuickTextRightIcon] = useState<QuickTextIcon>(
    DEFAULT_QUICK_TEXT_RIGHT_ICON,
  );
  const [isSettingsPanelOpen, setIsSettingsPanelOpen] = useState(false);
  const [isSessionPanelOpen, setIsSessionPanelOpen] = useState(false);
  const [settingsReady, setSettingsReady] = useState(false);
  const [connectionState, setConnectionState] =
    useState<ConnectionState>('disconnected');
  const [gatewayError, setGatewayError] = useState<string | null>(null);
  const [gatewayEventState, setGatewayEventState] = useState('idle');
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [chatTurns, setChatTurns] = useState<ChatTurn[]>([]);
  const [activeSessionKey, setActiveSessionKey] = useState(DEFAULT_SESSION_KEY);
  const [sessions, setSessions] = useState<SessionEntry[]>([]);
  const [sessionPreferences, setSessionPreferences] = useState<SessionPreferences>({});
  const [isSessionsLoading, setIsSessionsLoading] = useState(false);
  const [isSessionHistoryLoading, setIsSessionHistoryLoading] = useState(false);
  const [isSessionOperationPending, setIsSessionOperationPending] = useState(false);
  const [isSessionRenameOpen, setIsSessionRenameOpen] = useState(false);
  const [sessionRenameTargetKey, setSessionRenameTargetKey] = useState<string | null>(null);
  const [sessionRenameDraft, setSessionRenameDraft] = useState('');
  const [isStartupAutoConnecting, setIsStartupAutoConnecting] = useState(false);
  const [settingsSavePendingCount, setSettingsSavePendingCount] = useState(0);
  const [settingsSaveError, setSettingsSaveError] = useState<string | null>(null);
  const [settingsSavedAt, setSettingsSavedAt] = useState<number | null>(null);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [historyLastSyncedAt, setHistoryLastSyncedAt] = useState<number | null>(null);
  const [historyRefreshNotice, setHistoryRefreshNotice] =
    useState<HistoryRefreshNotice | null>(null);
  const [showScrollToBottomButton, setShowScrollToBottomButton] = useState(false);
  const [gatewayHealthState, setGatewayHealthState] =
    useState<GatewayHealthState>('unknown');
  const [gatewayHealthCheckedAt, setGatewayHealthCheckedAt] =
    useState<number | null>(null);
  const [outboxQueue, setOutboxQueue] = useState<OutboxQueueItem[]>([]);
  const [theme, setTheme] = useState<AppTheme>(DEFAULT_THEME);
  const [quickTextTooltipSide, setQuickTextTooltipSide] =
    useState<QuickTextButtonSide | null>(null);
  const [focusedField, setFocusedField] = useState<FocusField>(null);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [isKeyboardBarMounted, setIsKeyboardBarMounted] = useState(false);

  const [isRecognizing, setIsRecognizing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [speechError, setSpeechError] = useState<string | null>(null);

  const clientRef = useRef<GatewayClient | null>(null);
  const activeSessionKeyRef = useRef(DEFAULT_SESSION_KEY);
  const activeRunIdRef = useRef<string | null>(null);
  const pendingTurnIdRef = useRef<string | null>(null);
  const runIdToTurnIdRef = useRef<Map<string, string>>(new Map());
  const sessionTurnsRef = useRef<Map<string, ChatTurn[]>>(new Map());
  const subscriptionsRef = useRef<Array<() => void>>([]);
  const transcriptRef = useRef('');
  const interimTranscriptRef = useRef('');
  const historyScrollRef = useRef<ScrollView | null>(null);
  const settingsScrollRef = useRef<ScrollView | null>(null);
  const historyAutoScrollRef = useRef(true);
  const historySyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const historyNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const authTokenMaskTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const outboxRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const healthCheckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const healthCheckInFlightRef = useRef(false);
  const outboxProcessingRef = useRef(false);
  const outboxQueueRef = useRef<OutboxQueueItem[]>([]);
  const gatewayHealthStateRef = useRef<GatewayHealthState>('unknown');
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
  const shouldShowSettingsScreen = !isGatewayConnected || isSettingsPanelOpen;
  const isDarkTheme = theme === 'dark';

  const persistSetting = useCallback((task: () => Promise<void>) => {
    setSettingsSavePendingCount((current) => current + 1);
    setSettingsSaveError(null);
    void task()
      .then(() => {
        setSettingsSavedAt(Date.now());
      })
      .catch(() => {
        setSettingsSaveError('Local save failed');
      })
      .finally(() => {
        setSettingsSavePendingCount((current) => Math.max(0, current - 1));
      });
  }, []);

  const clearHistoryNoticeTimer = useCallback(() => {
    if (historyNoticeTimerRef.current) {
      clearTimeout(historyNoticeTimerRef.current);
      historyNoticeTimerRef.current = null;
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

  const clearHealthCheckInterval = useCallback(() => {
    if (healthCheckIntervalRef.current) {
      clearInterval(healthCheckIntervalRef.current);
      healthCheckIntervalRef.current = null;
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

  const runGatewayHealthCheck = useCallback(
    async (options?: { silent?: boolean; timeoutMs?: number }): Promise<boolean> => {
      const client = clientRef.current;
      if (!client || connectionStateRef.current !== 'connected') {
        setGatewayHealthState('unknown');
        return false;
      }
      if (healthCheckInFlightRef.current) {
        return gatewayHealthStateRef.current !== 'degraded';
      }

      healthCheckInFlightRef.current = true;
      if (!options?.silent) {
        setGatewayHealthState('checking');
      }
      try {
        const ok = await client.health(
          options?.timeoutMs ?? GATEWAY_HEALTH_CHECK_TIMEOUT_MS,
        );
        if (connectionStateRef.current !== 'connected') return false;
        setGatewayHealthState(ok ? 'ok' : 'degraded');
        setGatewayHealthCheckedAt(Date.now());
        return ok;
      } catch {
        if (connectionStateRef.current === 'connected') {
          setGatewayHealthState('degraded');
          setGatewayHealthCheckedAt(Date.now());
        }
        return false;
      } finally {
        healthCheckInFlightRef.current = false;
      }
    },
    [],
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
    connectionStateRef.current = connectionState;
  }, [connectionState]);

  useEffect(() => {
    outboxQueueRef.current = outboxQueue;
  }, [outboxQueue]);

  useEffect(() => {
    gatewayHealthStateRef.current = gatewayHealthState;
  }, [gatewayHealthState]);

  useEffect(() => {
    sessionTurnsRef.current.set(activeSessionKey, chatTurns);
  }, [activeSessionKey, chatTurns]);

  useEffect(() => {
    if (chatTurns.length === 0 || !historyAutoScrollRef.current) return;
    const timer = setTimeout(() => {
      historyScrollRef.current?.scrollToEnd({ animated: true });
    }, 30);
    return () => clearTimeout(timer);
  }, [chatTurns.length]);

  useEffect(() => {
    if (chatTurns.length > 0) return;
    historyAutoScrollRef.current = true;
    setShowScrollToBottomButton(false);
  }, [chatTurns.length]);

  useEffect(() => {
    let alive = true;

    const loadSettings = async () => {
      try {
        const [
          savedUrl,
          savedToken,
          savedIdentity,
          savedTheme,
          savedSpeechLang,
          savedQuickTextLeft,
          savedQuickTextRight,
          savedQuickTextLeftIcon,
          savedQuickTextRightIcon,
          savedSessionKey,
          savedSessionPrefs,
          savedOutboxQueue,
        ] = await Promise.all([
          kvStore.getItemAsync(STORAGE_KEYS.gatewayUrl),
          kvStore.getItemAsync(STORAGE_KEYS.authToken),
          kvStore.getItemAsync(OPENCLAW_IDENTITY_STORAGE_KEY),
          kvStore.getItemAsync(STORAGE_KEYS.theme),
          kvStore.getItemAsync(STORAGE_KEYS.speechLang),
          kvStore.getItemAsync(STORAGE_KEYS.quickTextLeft),
          kvStore.getItemAsync(STORAGE_KEYS.quickTextRight),
          kvStore.getItemAsync(STORAGE_KEYS.quickTextLeftIcon),
          kvStore.getItemAsync(STORAGE_KEYS.quickTextRightIcon),
          kvStore.getItemAsync(STORAGE_KEYS.sessionKey),
          kvStore.getItemAsync(STORAGE_KEYS.sessionPrefs),
          kvStore.getItemAsync(STORAGE_KEYS.outboxQueue),
        ]);
        if (!alive) return;

        if (savedUrl) setGatewayUrl(savedUrl);
        if (savedToken) setAuthToken(savedToken);
        if (savedTheme === 'dark' || savedTheme === 'light') {
          setTheme(savedTheme);
        }
        if (savedSpeechLang === 'ja-JP' || savedSpeechLang === 'en-US') {
          setSpeechLang(savedSpeechLang);
        }
        if (savedQuickTextLeft != null) {
          setQuickTextLeft(savedQuickTextLeft);
        }
        if (savedQuickTextRight != null) {
          setQuickTextRight(savedQuickTextRight);
        }
        if (savedQuickTextLeftIcon != null) {
          setQuickTextLeftIcon(
            normalizeQuickTextIcon(savedQuickTextLeftIcon, DEFAULT_QUICK_TEXT_LEFT_ICON),
          );
        }
        if (savedQuickTextRightIcon != null) {
          setQuickTextRightIcon(
            normalizeQuickTextIcon(savedQuickTextRightIcon, DEFAULT_QUICK_TEXT_RIGHT_ICON),
          );
        }
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
      } finally {
        if (alive) setSettingsReady(true);
      }
    };

    void loadSettings();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!settingsReady) return;
    const value = gatewayUrl.trim();
    persistSetting(async () => {
      if (value) {
        await kvStore.setItemAsync(STORAGE_KEYS.gatewayUrl, value);
      } else {
        await kvStore.deleteItemAsync(STORAGE_KEYS.gatewayUrl);
      }
    });
  }, [gatewayUrl, persistSetting, settingsReady]);

  useEffect(() => {
    if (!settingsReady) return;
    const value = authToken.trim();
    persistSetting(async () => {
      if (value) {
        await kvStore.setItemAsync(STORAGE_KEYS.authToken, value);
      } else {
        await kvStore.deleteItemAsync(STORAGE_KEYS.authToken);
      }
    });
  }, [authToken, persistSetting, settingsReady]);

  useEffect(() => {
    if (!settingsReady) return;
    persistSetting(async () => {
      await kvStore.setItemAsync(STORAGE_KEYS.theme, theme);
    });
  }, [persistSetting, settingsReady, theme]);

  useEffect(() => {
    if (!settingsReady) return;
    persistSetting(async () => {
      await kvStore.setItemAsync(STORAGE_KEYS.speechLang, speechLang);
    });
  }, [persistSetting, settingsReady, speechLang]);

  useEffect(() => {
    if (!settingsReady) return;
    const value = quickTextLeft.trim();
    persistSetting(async () => {
      if (value) {
        await kvStore.setItemAsync(STORAGE_KEYS.quickTextLeft, value);
      } else {
        await kvStore.deleteItemAsync(STORAGE_KEYS.quickTextLeft);
      }
    });
  }, [persistSetting, quickTextLeft, settingsReady]);

  useEffect(() => {
    if (!settingsReady) return;
    const value = quickTextRight.trim();
    persistSetting(async () => {
      if (value) {
        await kvStore.setItemAsync(STORAGE_KEYS.quickTextRight, value);
      } else {
        await kvStore.deleteItemAsync(STORAGE_KEYS.quickTextRight);
      }
    });
  }, [persistSetting, quickTextRight, settingsReady]);

  useEffect(() => {
    if (!settingsReady) return;
    persistSetting(async () => {
      await kvStore.setItemAsync(STORAGE_KEYS.quickTextLeftIcon, quickTextLeftIcon);
    });
  }, [persistSetting, quickTextLeftIcon, settingsReady]);

  useEffect(() => {
    if (!settingsReady) return;
    persistSetting(async () => {
      await kvStore.setItemAsync(STORAGE_KEYS.quickTextRightIcon, quickTextRightIcon);
    });
  }, [persistSetting, quickTextRightIcon, settingsReady]);

  useEffect(() => {
    if (!settingsReady) return;
    const sessionKey = activeSessionKey.trim();
    persistSetting(async () => {
      if (sessionKey) {
        await kvStore.setItemAsync(STORAGE_KEYS.sessionKey, sessionKey);
      } else {
        await kvStore.deleteItemAsync(STORAGE_KEYS.sessionKey);
      }
    });
  }, [activeSessionKey, persistSetting, settingsReady]);

  useEffect(() => {
    if (!settingsReady) return;
    persistSetting(async () => {
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
  }, [persistSetting, sessionPreferences, settingsReady]);

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

    const showSub = Keyboard.addListener(showEvent, () => {
      setIsKeyboardVisible(true);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setIsKeyboardVisible(false);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

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
    clearSubscriptions();
    clearFinalResponseRecoveryTimer();
    clearStartupAutoConnectRetryTimer();
    clearOutboxRetryTimer();
    clearHealthCheckInterval();
    outboxProcessingRef.current = false;
    healthCheckInFlightRef.current = false;
    if (clientRef.current) {
      clientRef.current.disconnect();
      clientRef.current = null;
    }
    activeRunIdRef.current = null;
    setActiveRunId(null);
    pendingTurnIdRef.current = null;
    runIdToTurnIdRef.current.clear();
    setIsSending(false);
    setIsSessionsLoading(false);
    setIsSessionHistoryLoading(false);
    setIsSessionOperationPending(false);
    setConnectionState('disconnected');
    setGatewayEventState('idle');
    setGatewayHealthState('unknown');
    setGatewayHealthCheckedAt(null);
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
    const client = clientRef.current;
    if (!client || connectionState !== 'connected') {
      setSessions([]);
      setSessionsError(null);
      return;
    }

    setIsSessionsLoading(true);
    setSessionsError(null);
    try {
      const response = await client.sessionsList({ limit: 40, includeGlobal: true });
      const fetched = Array.isArray(response.sessions)
        ? response.sessions.filter(
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
    } catch (err) {
      setSessionsError(`Sessions unavailable: ${errorMessage(err)}`);
    } finally {
      setIsSessionsLoading(false);
    }
  }, [connectionState]);

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

      setIsSessionHistoryLoading(true);
      try {
        const response = await client.chatHistory(sessionKey, { limit: 80 });
        const turns = buildTurnsFromHistory(response.messages, sessionKey);
        const localTurns = sessionTurnsRef.current.get(sessionKey) ?? [];
        const queuedTurnIds = new Set(
          outboxQueueRef.current
            .filter((item) => item.sessionKey === sessionKey)
            .map((item) => item.turnId),
        );
        const pendingLocalTurns = localTurns.filter((turn) =>
          queuedTurnIds.has(turn.id) || isTurnWaitingState(turn.state),
        );
        const mergedTurns = [...turns];
        pendingLocalTurns.forEach((turn) => {
          if (!mergedTurns.some((existing) => existing.id === turn.id)) {
            mergedTurns.push(turn);
          }
        });
        mergedTurns.sort((a, b) => a.createdAt - b.createdAt);
        applySessionTurns(sessionKey, mergedTurns);
        if (activeSessionKeyRef.current === sessionKey) {
          setHistoryLastSyncedAt(Date.now());
        }
        return true;
      } catch (err) {
        if (!options?.silentError) {
          setGatewayError(`Failed to load session history: ${errorMessage(err)}`);
        }
        applySessionTurns(sessionKey, sessionTurnsRef.current.get(sessionKey) ?? []);
        return false;
      } finally {
        if (activeSessionKeyRef.current === sessionKey) {
          setIsSessionHistoryLoading(false);
        }
      }
    },
    [applySessionTurns, connectionState],
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

      await loadSessionHistory(nextKey);
      void refreshSessions();
    },
    [isSending, isSessionOperationPending, loadSessionHistory, refreshSessions],
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

  useEffect(() => {
    if (connectionState !== 'connected') {
      clearHealthCheckInterval();
      healthCheckInFlightRef.current = false;
      setGatewayHealthState('unknown');
      setGatewayHealthCheckedAt(null);
      return;
    }

    void runGatewayHealthCheck({ silent: true });
    clearHealthCheckInterval();
    healthCheckIntervalRef.current = setInterval(() => {
      void runGatewayHealthCheck({ silent: true });
    }, GATEWAY_HEALTH_CHECK_INTERVAL_MS);

    return () => {
      clearHealthCheckInterval();
    };
  }, [clearHealthCheckInterval, connectionState, runGatewayHealthCheck]);

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
    setGatewayEventState('sending');
    setIsSending(true);
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
      setIsSending(false);
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
    [connectionState, isSending, processOutboxQueue],
  );

  const handleChatEvent = (payload: ChatEventPayload) => {
    const activeSessionKey = activeSessionKeyRef.current;
    const hasMatchingSession = payload.sessionKey === activeSessionKey;
    const text = toTextContent(payload.message, { trim: false, dedupe: false });
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
      if (
        text ||
        state === 'complete' ||
        state === 'error' ||
        state === 'aborted'
      ) {
        if (
          state === 'complete' ||
          state === 'error' ||
          state === 'aborted'
        ) {
          setIsSending(false);
          activeRunIdRef.current = null;
          setActiveRunId(null);
          if (state === 'complete' && shouldAttemptFinalRecovery(text)) {
            scheduleFinalResponseRecovery(activeSessionKeyRef.current);
          }
        }
        scheduleActiveHistorySync();
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
        assistantText: mergeAssistantStreamText(turn.assistantText, text),
      }));
      return;
    }

    if (state === 'complete') {
      setIsSending(false);
      activeRunIdRef.current = null;
      setActiveRunId(null);
      runIdToTurnIdRef.current.delete(payload.runId);
      clearFinalResponseRecoveryTimer();
      const fallbackText =
        payload.stopReason === 'max_tokens'
          ? 'Response was truncated (max tokens reached).'
          : 'Gateway returned no text content for this response.';
      updateChatTurn(turnId, (turn) => ({
        ...turn,
        runId: payload.runId,
        state: 'complete',
        assistantText: text || turn.assistantText || fallbackText,
      }));
      scheduleActiveHistorySync();
      if (shouldAttemptFinalRecovery(text)) {
        scheduleFinalResponseRecovery(activeSessionKeyRef.current);
      }
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
        assistantText: text || message,
      }));
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
      void refreshSessions();
      return;
    }

    if (text) {
      updateChatTurn(turnId, (turn) => ({
        ...turn,
        runId: payload.runId,
        state,
        assistantText: mergeAssistantStreamText(turn.assistantText, text),
      }));
    }
  };

  const connectGateway = async (options?: { auto?: boolean; autoAttempt?: number }) => {
    const isAutoConnect = options?.auto === true;
    const autoAttempt = options?.autoAttempt ?? 1;
    if (!isAutoConnect) {
      clearStartupAutoConnectRetryTimer();
      setIsStartupAutoConnecting(false);
    }

    if (!settingsReady) {
      setGatewayError('Initializing. Please wait a few seconds and try again.');
      if (isAutoConnect) setIsStartupAutoConnecting(false);
      return;
    }

    if (!gatewayUrl.trim()) {
      setGatewayError('Please enter a Gateway URL.');
      if (isAutoConnect) setIsStartupAutoConnecting(false);
      return;
    }

    if (isAutoConnect) {
      setIsStartupAutoConnecting(true);
      startupAutoConnectAttemptRef.current = autoAttempt;
    }

    const connectOnce = async (clientId: string) => {
      disconnectGateway();
      setGatewayError(null);
      setSessionsError(null);
      setConnectionState('connecting');

      const client = new GatewayClient(gatewayUrl.trim(), {
        token: authToken.trim() || undefined,
        autoReconnect: true,
        platform: 'ios',
        clientId,
        displayName: GATEWAY_DISPLAY_NAME,
        scopes: ['operator.read', 'operator.write'],
        caps: ['talk'],
      });

      const pairingListener = () => {
        setGatewayError(
          'Pairing approval required. Please allow this device on OpenClaw.',
        );
        setGatewayEventState('pairing-required');
      };

      const onConnectionStateChange = client.onConnectionStateChange((state) => {
        setConnectionState(state);
      });
      const onChatEvent = client.onChatEvent(handleChatEvent);
      client.on('pairing.required', pairingListener);

      subscriptionsRef.current = [
        onConnectionStateChange,
        onChatEvent,
        () => client.off('pairing.required', pairingListener),
      ];

      clientRef.current = client;

      await Promise.race([
        client.connect(),
        new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error('Connection timeout: check URL / certificate / token.'));
          }, 15000);
        }),
      ]);
    };

    try {
      await connectOnce(REQUESTED_GATEWAY_CLIENT_ID);
      setGatewayError(null);
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
      if (isAutoConnect) {
        const retryPlan = computeAutoConnectRetryPlan({
          attempt: autoAttempt,
          maxAttempts: STARTUP_AUTO_CONNECT_MAX_ATTEMPTS,
          baseDelayMs: STARTUP_AUTO_CONNECT_RETRY_BASE_MS,
          errorText,
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
        setGatewayError(`Gateway connection failed: ${errorText}`);
      }
    } finally {
      if (isAutoConnect) {
        setIsStartupAutoConnecting(false);
      }
    }
  };

  useEffect(() => {
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
  }, [connectionState, gatewayUrl, settingsReady]);

  useEffect(() => {
    return () => {
      isUnmountingRef.current = true;
      expectedSpeechStopRef.current = true;
      if (holdStartTimerRef.current) {
        clearTimeout(holdStartTimerRef.current);
        holdStartTimerRef.current = null;
      }
      if (historySyncTimerRef.current) {
        clearTimeout(historySyncTimerRef.current);
        historySyncTimerRef.current = null;
      }
      if (historyNoticeTimerRef.current) {
        clearTimeout(historyNoticeTimerRef.current);
        historyNoticeTimerRef.current = null;
      }
      if (authTokenMaskTimerRef.current) {
        clearTimeout(authTokenMaskTimerRef.current);
        authTokenMaskTimerRef.current = null;
      }
      if (outboxRetryTimerRef.current) {
        clearTimeout(outboxRetryTimerRef.current);
        outboxRetryTimerRef.current = null;
      }
      if (healthCheckIntervalRef.current) {
        clearInterval(healthCheckIntervalRef.current);
        healthCheckIntervalRef.current = null;
      }
      if (startupAutoConnectRetryTimerRef.current) {
        clearTimeout(startupAutoConnectRetryTimerRef.current);
        startupAutoConnectRetryTimerRef.current = null;
      }
      if (finalResponseRecoveryTimerRef.current) {
        clearTimeout(finalResponseRecoveryTimerRef.current);
        finalResponseRecoveryTimerRef.current = null;
      }
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
      ExpoSpeechRecognitionModule.abort();
    };
  }, []);

  const startRecognition = async () => {
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

  const scheduleActiveHistorySync = useCallback(() => {
    if (historySyncTimerRef.current) return;
    historySyncTimerRef.current = setTimeout(() => {
      historySyncTimerRef.current = null;
      const sessionKey = activeSessionKeyRef.current;
      void loadSessionHistory(sessionKey);
      void refreshSessions();
    }, 280);
  }, [loadSessionHistory, refreshSessions]);

  const scheduleFinalResponseRecovery = useCallback(
    (sessionKey: string, attempt = 1) => {
      if (attempt > FINAL_RESPONSE_RECOVERY_MAX_ATTEMPTS) return;
      clearFinalResponseRecoveryTimer();
      finalResponseRecoveryTimerRef.current = setTimeout(() => {
        finalResponseRecoveryTimerRef.current = null;
        void (async () => {
          if (activeSessionKeyRef.current !== sessionKey) return;
          const synced = await loadSessionHistory(sessionKey, { silentError: true });
          if (!synced || activeSessionKeyRef.current !== sessionKey) return;
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

  const formatTurnTime = (createdAt: number): string =>
    new Date(createdAt).toLocaleTimeString('ja-JP', {
      hour: '2-digit',
      minute: '2-digit',
    });

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
  const canUseQuickText = !isRecognizing && settingsReady;
  const canUseQuickTextLeft = canUseQuickText && quickTextLeftLabel.length > 0;
  const canUseQuickTextRight = canUseQuickText && quickTextRightLabel.length > 0;
  const showQuickTextLeftTooltip = quickTextTooltipSide === 'left' && canUseQuickTextLeft;
  const showQuickTextRightTooltip =
    quickTextTooltipSide === 'right' && canUseQuickTextRight;
  const isTranscriptEditingWithKeyboard = isKeyboardVisible && isTranscriptFocused;
  const isTranscriptExpanded = isTranscriptFocused || isRecognizing;
  const sendDisabledReason = !hasDraft
    ? 'No text to send.'
    : isRecognizing
        ? 'Stop recording to send.'
        : isSending
          ? 'Sending in progress...'
          : !isGatewayConnected
            ? 'Will send after reconnect.'
            : null;
  const bottomHintText = isRecognizing
    ? 'Release when finished speaking.'
    : canSendDraft
      ? sendDisabledReason ?? 'Ready to send'
      : isGatewayConnected
        ? 'Hold to record'
        : 'Please connect';
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
    : settingsSavePendingCount > 0
      ? 'Syncing...'
      : settingsSaveError
        ? settingsSaveError
        : settingsSavedAt
          ? `Saved ${formatClockLabel(settingsSavedAt)}`
          : 'Saved';
  const isSettingsStatusError = Boolean(settingsSaveError);
  const isSettingsStatusPending = settingsSavePendingCount > 0;
  const sectionIconColor = isDarkTheme ? '#9eb1d2' : '#70706A';
  const actionIconColor = isDarkTheme ? '#b8c9e6' : '#5C5C5C';
  const currentBadgeIconColor = isDarkTheme ? '#9ec0ff' : '#1D4ED8';
  const pinnedBadgeIconColor = isDarkTheme ? '#dbe7ff' : '#4B5563';
  const optionIconColor = isDarkTheme ? '#b8c9e6' : '#5C5C5C';
  const outboxPendingCount = outboxQueue.length;
  const gatewayHealthLabel =
    gatewayHealthState === 'checking'
      ? 'Health checking...'
      : gatewayHealthState === 'degraded'
        ? 'Health check failed'
        : gatewayHealthState === 'ok'
          ? 'Health OK'
          : null;
  const historyStatusText = isSessionHistoryLoading
    ? 'Loading session...'
    : isSending
      ? `Responding... (${gatewayEventState})`
      : outboxPendingCount > 0
        ? `Queued messages: ${outboxPendingCount}`
        : gatewayHealthState === 'degraded'
          ? 'Connection is unstable.'
          : null;
  const historyLastSyncedLabel = historyLastSyncedAt
    ? `Updated ${formatClockLabel(historyLastSyncedAt)}`
    : null;
  const historyHealthCheckedLabel = gatewayHealthCheckedAt
    ? `Checked ${formatClockLabel(gatewayHealthCheckedAt)}`
    : null;
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
  const errorBannerMessage = gatewayError ?? speechError;
  const isGatewayErrorBanner = Boolean(gatewayError);
  const errorBannerIconName = isGatewayErrorBanner
    ? 'cloud-offline-outline'
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
    historyAutoScrollRef.current = true;
    setShowScrollToBottomButton(false);
    historyScrollRef.current?.scrollToEnd({ animated: true });
    void triggerHaptic('button-press');
  }, [triggerHaptic]);

  const handleHoldToTalkPressIn = () => {
    if (isRecognizing || isSending) return;
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

  const styles = useMemo(() => createStyles(isDarkTheme), [isDarkTheme]);
  const markdownParser = useMemo(() => new MarkdownIt({ linkify: true }), []);
  const placeholderColor = isDarkTheme ? '#95a8ca' : '#C4C4C0';
  const markdownStyles = useMemo(
    () => ({
      body: {
        color: isDarkTheme ? '#f8fbff' : '#1A1A1A',
        fontSize: 14,
        lineHeight: 20,
        marginTop: 0,
        marginBottom: 0,
      },
      text: {
        color: isDarkTheme ? '#f8fbff' : '#1A1A1A',
        fontSize: 14,
        lineHeight: 20,
      },
      paragraph: {
        color: isDarkTheme ? '#f8fbff' : '#1A1A1A',
        marginTop: 0,
        marginBottom: 0,
      },
      heading1: {
        color: isDarkTheme ? '#ffffff' : '#111827',
        fontSize: 24,
        lineHeight: 30,
        fontWeight: '800' as const,
        marginTop: 8,
        marginBottom: 8,
      },
      heading2: {
        color: isDarkTheme ? '#f5f8ff' : '#111827',
        fontSize: 20,
        lineHeight: 26,
        fontWeight: '700' as const,
        marginTop: 8,
        marginBottom: 6,
      },
      heading3: {
        color: isDarkTheme ? '#ecf2ff' : '#1f2937',
        fontSize: 17,
        lineHeight: 23,
        fontWeight: '700' as const,
        marginTop: 6,
        marginBottom: 4,
      },
      heading4: {
        color: isDarkTheme ? '#e6efff' : '#1f2937',
        fontSize: 16,
        lineHeight: 22,
        fontWeight: '700' as const,
        marginTop: 4,
        marginBottom: 2,
      },
      strong: {
        color: isDarkTheme ? '#ffffff' : '#111827',
        fontWeight: '700' as const,
      },
      em: {
        color: isDarkTheme ? '#e6f0ff' : '#374151',
        fontStyle: 'italic' as const,
      },
      link: {
        color: '#2563EB',
        textDecorationLine: 'underline' as const,
      },
      code_inline: {
        color: isDarkTheme ? '#e6f0ff' : '#111827',
        backgroundColor: isDarkTheme ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
        borderRadius: 4,
        paddingHorizontal: 4,
        paddingVertical: 2,
      },
      code_block: {
        color: isDarkTheme ? '#e6f0ff' : '#111827',
        backgroundColor: isDarkTheme ? '#0f1c3f' : '#f3f4f6',
        borderRadius: 8,
        padding: 10,
        marginTop: 6,
        marginBottom: 6,
      },
      fence: {
        marginTop: 6,
        marginBottom: 6,
      },
      blockquote: {
        borderLeftWidth: 2,
        borderLeftColor: isDarkTheme ? 'rgba(255,255,255,0.24)' : 'rgba(0,0,0,0.18)',
        paddingLeft: 8,
        marginTop: 4,
        marginBottom: 4,
      },
      bullet_list: {
        marginTop: 4,
        marginBottom: 4,
      },
      ordered_list: {
        marginTop: 4,
        marginBottom: 4,
      },
      list_item: {
        marginTop: 0,
        marginBottom: 0,
      },
      hr: {
        backgroundColor: isDarkTheme ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)',
        height: 1,
        marginTop: 8,
        marginBottom: 8,
      },
    }),
    [isDarkTheme],
  );
  const markdownErrorStyles = useMemo(
    () => ({
      ...markdownStyles,
      body: {
        ...(markdownStyles.body ?? {}),
        color: isDarkTheme ? '#ffb0b0' : '#DC2626',
      },
      text: {
        ...(markdownStyles.text ?? {}),
        color: isDarkTheme ? '#ffb0b0' : '#DC2626',
      },
      paragraph: {
        ...(markdownStyles.paragraph ?? {}),
        color: isDarkTheme ? '#ffb0b0' : '#DC2626',
      },
      heading1: {
        ...(markdownStyles.heading1 ?? {}),
        color: isDarkTheme ? '#ffb0b0' : '#DC2626',
      },
      heading2: {
        ...(markdownStyles.heading2 ?? {}),
        color: isDarkTheme ? '#ffb0b0' : '#DC2626',
      },
      heading3: {
        ...(markdownStyles.heading3 ?? {}),
        color: isDarkTheme ? '#ffb0b0' : '#DC2626',
      },
      heading4: {
        ...(markdownStyles.heading4 ?? {}),
        color: isDarkTheme ? '#ffb0b0' : '#DC2626',
      },
      link: {
        ...(markdownStyles.link ?? {}),
        color: isDarkTheme ? '#ffb0b0' : '#DC2626',
      },
      code_inline: {
        ...(markdownStyles.code_inline ?? {}),
        color: isDarkTheme ? '#ffb0b0' : '#DC2626',
      },
      code_block: {
        ...(markdownStyles.code_block ?? {}),
        color: isDarkTheme ? '#ffb0b0' : '#DC2626',
      },
    }),
    [isDarkTheme, markdownStyles],
  );

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
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <View style={styles.logoBadge}>
              <Image
                source={require('./assets/logo-badge.png')}
                style={styles.logoBadgeImage}
              />
            </View>
            <Text style={styles.headerTitle} maxFontSizeMultiplier={MAX_TEXT_SCALE_TIGHT}>
              OpenClawVoice
            </Text>
          </View>
          <View style={styles.headerRight}>
            <View
              style={[
                styles.statusChip,
                isGatewayConnected
                  ? styles.statusChipConnected
                  : isGatewayConnecting
                    ? styles.statusChipConnecting
                    : styles.statusChipDisconnected,
              ]}
            >
              <View
                style={[
                  styles.statusDot,
                  isGatewayConnected
                    ? styles.statusDotConnected
                    : isGatewayConnecting
                      ? styles.statusDotConnecting
                      : styles.statusDotDisconnected,
                ]}
              />
              <Text
                style={[
                  styles.statusChipText,
                  isGatewayConnected
                    ? styles.statusChipTextConnected
                    : isGatewayConnecting
                      ? styles.statusChipTextConnecting
                      : styles.statusChipTextDisconnected,
                ]}
                maxFontSizeMultiplier={MAX_TEXT_SCALE_TIGHT}
              >
                {CONNECTION_LABELS[connectionState]}
              </Text>
            </View>
            <Pressable
              style={[
                styles.iconButton,
                isSessionPanelOpen && styles.iconButtonActive,
                !isGatewayConnected && styles.iconButtonDisabled,
              ]}
              hitSlop={7}
              accessibilityRole="button"
              accessibilityLabel={
                isSessionPanelOpen ? 'Hide sessions screen' : 'Show sessions screen'
              }
              onPress={() => {
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
              }}
              disabled={!isGatewayConnected}
            >
              <Ionicons
                name="albums-outline"
                size={18}
                color={isDarkTheme ? '#bccae2' : '#707070'}
              />
            </Pressable>
            <Pressable
              style={[
                styles.iconButton,
                isSettingsPanelOpen && styles.iconButtonActive,
                !isGatewayConnected && styles.iconButtonDisabled,
              ]}
              hitSlop={7}
              accessibilityRole="button"
              accessibilityLabel={
                isSettingsPanelOpen
                  ? 'Hide settings screen'
                  : 'Show settings screen'
              }
              onPress={() => {
                if (!isGatewayConnected) return;
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
              }}
              disabled={!isGatewayConnected}
            >
              <Ionicons
                name="settings-outline"
                size={18}
                color={isDarkTheme ? '#bccae2' : '#707070'}
              />
            </Pressable>
          </View>
        </View>

        <Modal
          visible={shouldShowSettingsScreen}
          animationType="slide"
          presentationStyle="fullScreen"
          onRequestClose={() => {
            if (!isGatewayConnected) return;
            forceMaskAuthToken();
            setIsSettingsPanelOpen(false);
            setFocusedField(null);
            Keyboard.dismiss();
          }}
        >
          <SafeAreaView style={styles.settingsScreenContainer}>
            <View style={styles.settingsScreenHeader}>
              <Text
                style={styles.settingsScreenTitle}
                maxFontSizeMultiplier={MAX_TEXT_SCALE_TIGHT}
              >
                Settings
              </Text>
              <View style={styles.settingsScreenHeaderRight}>
                <View
                  style={[
                    styles.settingsStatusChip,
                    isSettingsStatusPending && styles.settingsStatusChipPending,
                    isSettingsStatusError && styles.settingsStatusChipError,
                  ]}
                >
                  <Ionicons
                    name={
                      isSettingsStatusError
                        ? 'alert-circle-outline'
                        : isSettingsStatusPending
                          ? 'sync-outline'
                          : 'checkmark-circle-outline'
                    }
                    size={12}
                    color={
                      isSettingsStatusError
                        ? isDarkTheme
                          ? '#ffb0b0'
                          : '#DC2626'
                        : isDarkTheme
                          ? '#9ec0ff'
                          : '#1D4ED8'
                    }
                  />
                  <Text
                    style={[
                      styles.settingsStatusChipText,
                      isSettingsStatusError && styles.settingsStatusChipTextError,
                    ]}
                    maxFontSizeMultiplier={MAX_TEXT_SCALE_TIGHT}
                    numberOfLines={1}
                  >
                    {settingsStatusText}
                  </Text>
                </View>
              <Pressable
                style={[
                  styles.iconButton,
                  !isGatewayConnected && styles.iconButtonDisabled,
                ]}
                hitSlop={7}
                accessibilityRole="button"
                accessibilityLabel="Close settings screen"
                onPress={() => {
                  if (!isGatewayConnected) return;
                  forceMaskAuthToken();
                  setIsSettingsPanelOpen(false);
                  setFocusedField(null);
                  Keyboard.dismiss();
                }}
                disabled={!isGatewayConnected}
              >
                <Ionicons
                  name="close"
                  size={18}
                  color={isDarkTheme ? '#bccae2' : '#707070'}
                />
              </Pressable>
              </View>
            </View>
            <KeyboardAvoidingView
              style={styles.settingsScreenKeyboardWrap}
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
              <ScrollView
                ref={settingsScrollRef}
                style={styles.settingsScreenScroll}
                contentContainerStyle={[
                  styles.settingsScreenScrollContent,
                  isKeyboardVisible && styles.settingsScreenScrollContentKeyboardOpen,
                ]}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
              >
                <View style={styles.gatewayPanel}>
                  {!isQuickTextSettingsEditMode ? (
                    <View style={styles.settingsSection}>
                    <View style={styles.sectionTitleRow}>
                      <Ionicons name="link-outline" size={14} color={sectionIconColor} />
                      <Text
                        style={styles.settingsSectionTitle}
                        maxFontSizeMultiplier={MAX_TEXT_SCALE_TIGHT}
                      >
                        Gateway
                      </Text>
                    </View>
                    <Text style={styles.label} maxFontSizeMultiplier={MAX_TEXT_SCALE_TIGHT}>
                      Gateway URL
                    </Text>
                    <TextInput
                      style={[
                        styles.input,
                        focusedField === 'gateway-url' && styles.inputFocused,
                      ]}
                      maxFontSizeMultiplier={MAX_TEXT_SCALE}
                      value={gatewayUrl}
                      onChangeText={setGatewayUrl}
                      placeholder="wss://your-openclaw-gateway.example.com"
                      placeholderTextColor={placeholderColor}
                      autoCapitalize="none"
                      autoCorrect={false}
                      returnKeyType="done"
                      blurOnSubmit
                      onSubmitEditing={() => Keyboard.dismiss()}
                      onFocus={() => setFocusedField('gateway-url')}
                      onBlur={() =>
                        setFocusedField((current) =>
                          current === 'gateway-url' ? null : current,
                        )
                      }
                    />

                    <Text
                      style={[styles.label, styles.labelSpacing]}
                      maxFontSizeMultiplier={MAX_TEXT_SCALE_TIGHT}
                    >
                      Token (optional)
                    </Text>
                    <View
                      style={[
                        styles.tokenInputRow,
                        styles.input,
                        focusedField === 'auth-token' && styles.inputFocused,
                      ]}
                    >
                      <TextInput
                        style={styles.tokenInputField}
                        maxFontSizeMultiplier={MAX_TEXT_SCALE}
                        value={authToken}
                        onChangeText={setAuthToken}
                        placeholder="gateway token or password"
                        placeholderTextColor={placeholderColor}
                        autoCapitalize="none"
                        autoCorrect={false}
                        autoComplete="off"
                        textContentType={isAuthTokenMasked ? 'password' : 'none'}
                        secureTextEntry={isAuthTokenMasked}
                        returnKeyType="done"
                        blurOnSubmit
                        onSubmitEditing={() => Keyboard.dismiss()}
                        onFocus={() => setFocusedField('auth-token')}
                        onBlur={() =>
                          setFocusedField((current) =>
                            current === 'auth-token' ? null : current,
                          )
                        }
                      />
                      <Pressable
                        style={styles.tokenVisibilityButton}
                        accessibilityRole="button"
                        accessibilityLabel={
                          isAuthTokenMasked ? 'Show token' : 'Hide token'
                        }
                        accessibilityHint={
                          isAuthTokenMasked
                            ? 'Temporarily reveals token.'
                            : 'Hide token value.'
                        }
                        onPress={toggleAuthTokenVisibility}
                      >
                        <Ionicons
                          name={isAuthTokenMasked ? 'eye-outline' : 'eye-off-outline'}
                          size={16}
                          color={optionIconColor}
                        />
                      </Pressable>
                    </View>
                    <View style={styles.connectionRow}>
                      <Pressable
                        style={[
                          styles.smallButton,
                          styles.connectButton,
                          (isGatewayConnecting || !settingsReady) &&
                            styles.smallButtonDisabled,
                        ]}
                        onPress={() => {
                          Keyboard.dismiss();
                          setFocusedField(null);
                          void connectGateway();
                        }}
                        disabled={isGatewayConnecting || !settingsReady}
                      >
                        <Text
                          style={styles.smallButtonText}
                          maxFontSizeMultiplier={MAX_TEXT_SCALE_TIGHT}
                        >
                          {!settingsReady
                            ? 'Initializing...'
                            : isGatewayConnecting
                              ? 'Connecting...'
                              : 'Connect'}
                        </Text>
                      </Pressable>
                    </View>
                    {isStartupAutoConnecting ? (
                      <View style={styles.autoConnectLoadingRow}>
                        <ActivityIndicator
                          size="small"
                          color={isDarkTheme ? '#9ec0ff' : '#2563EB'}
                        />
                        <Text
                          style={styles.autoConnectLoadingText}
                          maxFontSizeMultiplier={MAX_TEXT_SCALE_TIGHT}
                        >
                          Connecting to saved Gateway...
                        </Text>
                      </View>
                    ) : null}
                    </View>
                  ) : null}

                  {!isQuickTextSettingsEditMode ? (
                    <View style={[styles.settingsSection, styles.settingsSectionSpaced]}>
                    <View style={styles.sectionTitleRow}>
                      <Ionicons
                        name="color-palette-outline"
                        size={14}
                        color={sectionIconColor}
                      />
                      <Text
                        style={styles.settingsSectionTitle}
                        maxFontSizeMultiplier={MAX_TEXT_SCALE_TIGHT}
                      >
                        Theme
                      </Text>
                    </View>
                    <View style={styles.settingsOptionRow}>
                      <Pressable
                        style={[
                          styles.settingsOptionButton,
                          theme === 'light' && styles.settingsOptionButtonSelected,
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel="Set theme to light"
                        onPress={() => {
                          setTheme('light');
                        }}
                      >
                        <Ionicons
                          name="sunny-outline"
                          size={14}
                          color={theme === 'light' ? currentBadgeIconColor : optionIconColor}
                        />
                        <Text
                          style={[
                            styles.settingsOptionLabel,
                            theme === 'light' && styles.settingsOptionLabelSelected,
                          ]}
                          maxFontSizeMultiplier={MAX_TEXT_SCALE}
                        >
                          Light
                        </Text>
                      </Pressable>
                      <Pressable
                        style={[
                          styles.settingsOptionButton,
                          theme === 'dark' && styles.settingsOptionButtonSelected,
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel="Set theme to dark"
                        onPress={() => {
                          setTheme('dark');
                        }}
                      >
                        <Ionicons
                          name="moon-outline"
                          size={14}
                          color={theme === 'dark' ? currentBadgeIconColor : optionIconColor}
                        />
                        <Text
                          style={[
                            styles.settingsOptionLabel,
                            theme === 'dark' && styles.settingsOptionLabelSelected,
                          ]}
                          maxFontSizeMultiplier={MAX_TEXT_SCALE}
                        >
                          Dark
                        </Text>
                      </Pressable>
                    </View>

                    </View>
                  ) : null}

                  {!isQuickTextSettingsEditMode ? (
                    <View style={[styles.settingsSection, styles.settingsSectionSpaced]}>
                    <View style={styles.sectionTitleRow}>
                      <Ionicons name="mic-outline" size={14} color={sectionIconColor} />
                      <Text
                        style={styles.settingsSectionTitle}
                        maxFontSizeMultiplier={MAX_TEXT_SCALE_TIGHT}
                      >
                        Language
                      </Text>
                    </View>
                    <View style={styles.languagePickerRow}>
                      {SPEECH_LANG_OPTIONS.map((option) => {
                        const selected = speechLang === option.value;
                        return (
                          <Pressable
                            key={option.value}
                            style={[
                              styles.languageOptionButton,
                              selected && styles.languageOptionButtonSelected,
                            ]}
                            accessibilityRole="button"
                            accessibilityLabel={`Set speech language to ${option.label} (${option.value})`}
                            onPress={() => {
                              Keyboard.dismiss();
                              setFocusedField(null);
                              setSpeechLang(option.value);
                            }}
                          >
                            <Text
                              style={[
                                styles.languageOptionLabel,
                                selected && styles.languageOptionLabelSelected,
                              ]}
                              maxFontSizeMultiplier={MAX_TEXT_SCALE}
                            >
                              {option.label}
                            </Text>
                            <Text
                              style={[
                                styles.languageOptionCode,
                                selected && styles.languageOptionCodeSelected,
                              ]}
                              maxFontSizeMultiplier={MAX_TEXT_SCALE_TIGHT}
                            >
                              {option.value}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    </View>
                  ) : null}

                  <View
                    style={[
                      styles.settingsSection,
                      !isQuickTextSettingsEditMode && styles.settingsSectionSpaced,
                      isQuickTextSettingsEditMode && styles.settingsSectionFocused,
                    ]}
                  >
                    <View style={styles.quickTextSectionHeaderRow}>
                      <View style={styles.sectionTitleRow}>
                        <Ionicons
                          name="chatbubble-ellipses-outline"
                          size={14}
                          color={sectionIconColor}
                        />
                        <Text
                          style={styles.settingsSectionTitle}
                          maxFontSizeMultiplier={MAX_TEXT_SCALE_TIGHT}
                        >
                          Quick Text
                        </Text>
                      </View>
                      {isQuickTextSettingsEditMode ? (
                        <Pressable
                          style={styles.quickTextDoneButton}
                          accessibilityRole="button"
                          accessibilityLabel="Done editing quick text"
                          onPress={() => {
                            Keyboard.dismiss();
                            setFocusedField(null);
                          }}
                        >
                          <Ionicons
                            name="checkmark-outline"
                            size={12}
                            color={actionIconColor}
                          />
                          <Text
                            style={styles.quickTextDoneButtonText}
                            maxFontSizeMultiplier={MAX_TEXT_SCALE_TIGHT}
                          >
                            Done
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                    <View style={styles.quickTextConfigRow}>
                      <View style={styles.quickTextConfigItem}>
                        <Text style={styles.label} maxFontSizeMultiplier={MAX_TEXT_SCALE_TIGHT}>
                          Left
                        </Text>
                        <TextInput
                          ref={(node) => {
                            quickTextInputRefs.current['quick-text-left'] = node;
                          }}
                          style={[
                            styles.input,
                            styles.quickTextConfigInput,
                            focusedField === 'quick-text-left' && styles.inputFocused,
                          ]}
                          maxFontSizeMultiplier={MAX_TEXT_SCALE}
                          value={quickTextLeft}
                          onChangeText={setQuickTextLeft}
                          placeholder="e.g. ありがとう"
                          placeholderTextColor={placeholderColor}
                          autoCapitalize="none"
                          autoCorrect={false}
                          maxLength={120}
                          multiline
                          textAlignVertical="top"
                          returnKeyType="done"
                          blurOnSubmit
                          onSubmitEditing={() => Keyboard.dismiss()}
                          onFocus={() => {
                            setFocusedField('quick-text-left');
                            ensureSettingsFieldVisible('quick-text-left');
                          }}
                          onBlur={() =>
                            setFocusedField((current) =>
                              current === 'quick-text-left' ? null : current,
                            )
                          }
                        />
                        <Text
                          style={[styles.label, styles.quickTextIconLabel]}
                          maxFontSizeMultiplier={MAX_TEXT_SCALE_TIGHT}
                        >
                          Icon
                        </Text>
                        <View style={styles.quickTextIconPickerRow}>
                          {QUICK_TEXT_ICON_OPTIONS.map((option) => {
                            const selected = quickTextLeftIcon === option.value;
                            return (
                              <Pressable
                                key={`left-${option.value}`}
                                style={[
                                  styles.quickTextIconOptionButton,
                                  selected && styles.quickTextIconOptionButtonSelected,
                                ]}
                                accessibilityRole="button"
                                accessibilityLabel={`Set left quick text icon to ${option.label}`}
                                onPress={() => {
                                  Keyboard.dismiss();
                                  setFocusedField(null);
                                  setQuickTextLeftIcon(option.value);
                                }}
                              >
                                <Ionicons
                                  name={option.value}
                                  size={16}
                                  color={selected ? currentBadgeIconColor : optionIconColor}
                                />
                              </Pressable>
                            );
                          })}
                        </View>
                      </View>
                      <View style={styles.quickTextConfigItem}>
                        <Text style={styles.label} maxFontSizeMultiplier={MAX_TEXT_SCALE_TIGHT}>
                          Right
                        </Text>
                        <TextInput
                          ref={(node) => {
                            quickTextInputRefs.current['quick-text-right'] = node;
                          }}
                          style={[
                            styles.input,
                            styles.quickTextConfigInput,
                            focusedField === 'quick-text-right' && styles.inputFocused,
                          ]}
                          maxFontSizeMultiplier={MAX_TEXT_SCALE}
                          value={quickTextRight}
                          onChangeText={setQuickTextRight}
                          placeholder="e.g. お願いします"
                          placeholderTextColor={placeholderColor}
                          autoCapitalize="none"
                          autoCorrect={false}
                          maxLength={120}
                          multiline
                          textAlignVertical="top"
                          returnKeyType="done"
                          blurOnSubmit
                          onSubmitEditing={() => Keyboard.dismiss()}
                          onFocus={() => {
                            setFocusedField('quick-text-right');
                            ensureSettingsFieldVisible('quick-text-right');
                          }}
                          onBlur={() =>
                            setFocusedField((current) =>
                              current === 'quick-text-right' ? null : current,
                            )
                          }
                        />
                        <Text
                          style={[styles.label, styles.quickTextIconLabel]}
                          maxFontSizeMultiplier={MAX_TEXT_SCALE_TIGHT}
                        >
                          Icon
                        </Text>
                        <View style={styles.quickTextIconPickerRow}>
                          {QUICK_TEXT_ICON_OPTIONS.map((option) => {
                            const selected = quickTextRightIcon === option.value;
                            return (
                              <Pressable
                                key={`right-${option.value}`}
                                style={[
                                  styles.quickTextIconOptionButton,
                                  selected && styles.quickTextIconOptionButtonSelected,
                                ]}
                                accessibilityRole="button"
                                accessibilityLabel={`Set right quick text icon to ${option.label}`}
                                onPress={() => {
                                  Keyboard.dismiss();
                                  setFocusedField(null);
                                  setQuickTextRightIcon(option.value);
                                }}
                              >
                                <Ionicons
                                  name={option.value}
                                  size={16}
                                  color={selected ? currentBadgeIconColor : optionIconColor}
                                />
                              </Pressable>
                            );
                          })}
                        </View>
                      </View>
                    </View>
                  </View>
                  {ENABLE_DEBUG_WARNINGS && !isQuickTextSettingsEditMode ? (
                    <DebugInfoPanel
                      isDarkTheme={isDarkTheme}
                      connectionState={connectionState}
                      gatewayEventState={gatewayEventState}
                      activeSessionKey={activeSessionKey}
                      activeRunId={activeRunId}
                      historyLastSyncedAt={historyLastSyncedAt}
                      isStartupAutoConnecting={isStartupAutoConnecting}
                      startupAutoConnectAttempt={startupAutoConnectAttemptRef.current}
                    />
                  ) : null}
                </View>
              </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
      <Modal
        visible={isGatewayConnected && isSessionPanelOpen}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => {
          setIsSessionPanelOpen(false);
          setIsSessionRenameOpen(false);
          setSessionRenameTargetKey(null);
          setSessionRenameDraft('');
          Keyboard.dismiss();
        }}
      >
        <SafeAreaView style={styles.settingsScreenContainer}>
          <View style={styles.settingsScreenHeader}>
            <Text
              style={styles.settingsScreenTitle}
              maxFontSizeMultiplier={MAX_TEXT_SCALE_TIGHT}
            >
              Sessions
            </Text>
            <View style={styles.settingsScreenHeaderRight}>
              <View
                style={[
                  styles.settingsStatusChip,
                  isSessionsLoading && styles.settingsStatusChipPending,
                  Boolean(sessionsError) && styles.settingsStatusChipError,
                ]}
              >
                <Ionicons
                  name={
                    sessionsError
                      ? 'alert-circle-outline'
                      : isSessionsLoading
                        ? 'sync-outline'
                        : 'albums-outline'
                  }
                  size={12}
                  color={
                    sessionsError
                      ? isDarkTheme
                        ? '#ffb0b0'
                        : '#DC2626'
                      : isDarkTheme
                        ? '#9ec0ff'
                        : '#1D4ED8'
                  }
                />
                <Text
                  style={[
                    styles.settingsStatusChipText,
                    Boolean(sessionsError) && styles.settingsStatusChipTextError,
                  ]}
                  maxFontSizeMultiplier={MAX_TEXT_SCALE_TIGHT}
                  numberOfLines={1}
                >
                  {sessionPanelStatusText}
                </Text>
              </View>
              <Pressable
                style={styles.iconButton}
                hitSlop={7}
                accessibilityRole="button"
                accessibilityLabel="Close sessions screen"
                onPress={() => {
                  setIsSessionPanelOpen(false);
                  setIsSessionRenameOpen(false);
                  setSessionRenameTargetKey(null);
                  setSessionRenameDraft('');
                  Keyboard.dismiss();
                }}
              >
                <Ionicons
                  name="close"
                  size={18}
                  color={isDarkTheme ? '#bccae2' : '#707070'}
                />
              </Pressable>
            </View>
          </View>
          <KeyboardAvoidingView
            style={styles.settingsScreenKeyboardWrap}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <ScrollView
              style={styles.settingsScreenScroll}
              contentContainerStyle={styles.settingsScreenScrollContent}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
            >
              <View style={styles.gatewayPanel}>
                <View style={styles.settingsSection}>
                  <View style={styles.sectionTitleRow}>
                    <Ionicons name="albums-outline" size={14} color={sectionIconColor} />
                    <Text
                      style={styles.settingsSectionTitle}
                      maxFontSizeMultiplier={MAX_TEXT_SCALE_TIGHT}
                    >
                      Sessions
                    </Text>
                  </View>
                  <View style={styles.sessionActionRow}>
                    <Pressable
                      style={[
                        styles.sessionActionButton,
                        styles.sessionActionButtonWide,
                        !canRefreshSessions && styles.sessionActionButtonDisabled,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel="Refresh sessions list"
                      onPress={() => {
                        void refreshSessions();
                      }}
                      disabled={!canRefreshSessions}
                    >
                      <View style={styles.sessionButtonContent}>
                        <Ionicons
                          name="refresh-outline"
                          size={12}
                          color={actionIconColor}
                        />
                        <Text
                          style={styles.sessionActionButtonText}
                          maxFontSizeMultiplier={MAX_TEXT_SCALE_TIGHT}
                        >
                          Refresh
                        </Text>
                      </View>
                    </Pressable>
                    <Pressable
                      style={[
                        styles.sessionActionButton,
                        styles.sessionActionButtonWide,
                        !canCreateSession && styles.sessionActionButtonDisabled,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel="Create new session"
                      onPress={() => {
                        void createAndSwitchSession();
                      }}
                      disabled={!canCreateSession}
                    >
                      <View style={styles.sessionButtonContent}>
                        <Ionicons name="add" size={12} color={actionIconColor} />
                        <Text
                          style={styles.sessionActionButtonText}
                          maxFontSizeMultiplier={MAX_TEXT_SCALE_TIGHT}
                        >
                          New
                        </Text>
                      </View>
                    </Pressable>
                  </View>
                  {isGatewayConnected ? (
                    <View style={styles.sessionListColumn}>
                      {visibleSessions.map((session) => {
                        const selected = session.key === activeSessionKey;
                        const pinned = isSessionPinned(session.key);
                        const updatedLabel = formatSessionUpdatedAt(session.updatedAt);
                        const renameTarget = sessionRenameTargetKey === session.key;
                        return (
                          <View
                            key={session.key}
                            style={[
                              styles.sessionChip,
                              selected && styles.sessionChipActive,
                              !canSwitchSession && styles.sessionChipDisabled,
                            ]}
                          >
                            <Pressable
                              style={styles.sessionChipPrimary}
                              accessibilityRole="button"
                              accessibilityLabel={`Switch to session ${getSessionTitle(session)}`}
                              onPress={() => {
                                void switchSession(session.key);
                              }}
                              disabled={!canSwitchSession}
                            >
                              <View style={styles.sessionChipTopRow}>
                                <Text
                                  style={[
                                    styles.sessionChipTitle,
                                    selected && styles.sessionChipTitleActive,
                                  ]}
                                  numberOfLines={1}
                                  maxFontSizeMultiplier={MAX_TEXT_SCALE_TIGHT}
                                >
                                  {getSessionTitle(session)}
                                </Text>
                                <View style={styles.sessionChipBadgeRow}>
                                  {selected ? (
                                    <View
                                      style={[
                                        styles.sessionChipBadge,
                                        styles.sessionChipBadgeCurrent,
                                      ]}
                                    >
                                      <Ionicons
                                        name="checkmark-circle"
                                        size={10}
                                        color={currentBadgeIconColor}
                                      />
                                    </View>
                                  ) : null}
                                  {pinned ? (
                                    <View
                                      style={[
                                        styles.sessionChipBadge,
                                        styles.sessionChipBadgePinned,
                                      ]}
                                    >
                                      <Ionicons
                                        name="star"
                                        size={10}
                                        color={pinnedBadgeIconColor}
                                      />
                                    </View>
                                  ) : null}
                                </View>
                              </View>
                              <Text
                                style={[
                                  styles.sessionChipMeta,
                                  selected && styles.sessionChipMetaActive,
                                ]}
                                maxFontSizeMultiplier={MAX_TEXT_SCALE_TIGHT}
                              >
                                {updatedLabel
                                  ? `Updated ${updatedLabel} · ${session.key}`
                                  : session.key}
                              </Text>
                            </Pressable>
                            <View style={styles.sessionChipActionRow}>
                              <Pressable
                                style={[
                                  styles.sessionChipActionButton,
                                  !canRenameSession && styles.sessionChipActionButtonDisabled,
                                ]}
                                accessibilityRole="button"
                                accessibilityLabel={`Rename session ${getSessionTitle(session)}`}
                                onPress={() => {
                                  startSessionRename(session.key);
                                }}
                                disabled={!canRenameSession}
                              >
                                <Ionicons
                                  name="create-outline"
                                  size={13}
                                  color={actionIconColor}
                                />
                              </Pressable>
                              <Pressable
                                style={[
                                  styles.sessionChipActionButton,
                                  !canPinSession && styles.sessionChipActionButtonDisabled,
                                ]}
                                accessibilityRole="button"
                                accessibilityLabel={
                                  isSessionPinned(session.key)
                                    ? `Unpin session ${getSessionTitle(session)}`
                                    : `Pin session ${getSessionTitle(session)}`
                                }
                                onPress={() => {
                                  toggleSessionPinned(session.key);
                                }}
                                disabled={!canPinSession}
                              >
                                <Ionicons
                                  name={
                                    isSessionPinned(session.key)
                                      ? 'bookmark'
                                      : 'bookmark-outline'
                                  }
                                  size={13}
                                  color={actionIconColor}
                                />
                              </Pressable>
                            </View>
                            {isSessionRenameOpen && renameTarget ? (
                              <View style={[styles.sessionRenameRow, styles.sessionRenameRowInline]}>
                                <TextInput
                                  style={[styles.input, styles.sessionRenameInput]}
                                  maxFontSizeMultiplier={MAX_TEXT_SCALE}
                                  value={sessionRenameDraft}
                                  onChangeText={setSessionRenameDraft}
                                  placeholder="Session name"
                                  placeholderTextColor={placeholderColor}
                                  autoCapitalize="none"
                                  autoCorrect={false}
                                  returnKeyType="done"
                                  blurOnSubmit
                                  onSubmitEditing={() => {
                                    void submitSessionRename();
                                  }}
                                />
                                <Pressable
                                  style={[
                                    styles.sessionRenameActionButton,
                                    isSessionOperationPending &&
                                      styles.sessionRenameActionButtonDisabled,
                                  ]}
                                  accessibilityRole="button"
                                  accessibilityLabel="Save session name"
                                  onPress={() => {
                                    void submitSessionRename();
                                  }}
                                  disabled={isSessionOperationPending}
                                >
                                  <View style={styles.sessionButtonContent}>
                                    <Ionicons
                                      name="checkmark-outline"
                                      size={12}
                                      color={actionIconColor}
                                    />
                                    <Text
                                      style={styles.sessionRenameActionButtonText}
                                      maxFontSizeMultiplier={MAX_TEXT_SCALE_TIGHT}
                                    >
                                      Save
                                    </Text>
                                  </View>
                                </Pressable>
                                <Pressable
                                  style={styles.sessionRenameActionButton}
                                  accessibilityRole="button"
                                  accessibilityLabel="Cancel session rename"
                                  onPress={() => {
                                    setIsSessionRenameOpen(false);
                                    setSessionRenameTargetKey(null);
                                    setSessionRenameDraft('');
                                  }}
                                >
                                  <View style={styles.sessionButtonContent}>
                                    <Ionicons
                                      name="close-outline"
                                      size={12}
                                      color={actionIconColor}
                                    />
                                    <Text
                                      style={styles.sessionRenameActionButtonText}
                                      maxFontSizeMultiplier={MAX_TEXT_SCALE_TIGHT}
                                    >
                                      Cancel
                                    </Text>
                                  </View>
                                </Pressable>
                              </View>
                            ) : null}
                          </View>
                        );
                      })}
                    </View>
                  ) : (
                    <Text
                      style={styles.sessionHintText}
                      maxFontSizeMultiplier={MAX_TEXT_SCALE}
                    >
                      Connect to load available sessions.
                    </Text>
                  )}
                  {isGatewayConnected && sessionListHintText ? (
                    <Text
                      style={[
                        styles.sessionHintText,
                        sessionsError && styles.sessionHintTextWarning,
                      ]}
                      maxFontSizeMultiplier={MAX_TEXT_SCALE}
                    >
                      {sessionListHintText}
                    </Text>
                  ) : null}
                </View>

              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
        <View style={styles.headerBoundary} pointerEvents="none" />
        <View style={styles.main}>
          {!isTranscriptEditingWithKeyboard ? (
            <View style={[styles.card, styles.historyCard, styles.historyCardFlat]}>
              <Pressable
                style={[
                  styles.iconButton,
                  styles.historyRefreshButtonFloating,
                  (!isGatewayConnected || isSessionHistoryLoading) &&
                    styles.iconButtonDisabled,
                ]}
                hitSlop={7}
                accessibilityRole="button"
                accessibilityLabel="Refresh current session history"
                onPress={handleRefreshHistory}
                disabled={!isGatewayConnected || isSessionHistoryLoading}
              >
                <Ionicons
                  name="refresh-outline"
                  size={15}
                  color={isDarkTheme ? '#bccae2' : '#707070'}
                />
              </Pressable>
              {historyStatusText ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator
                    size="small"
                    color={isDarkTheme ? '#9ec0ff' : '#2563EB'}
                  />
                  <Text
                    style={styles.loadingText}
                    maxFontSizeMultiplier={MAX_TEXT_SCALE}
                  >
                    {historyStatusText}
                  </Text>
                </View>
              ) : null}
              {historyLastSyncedLabel ||
              historyRefreshNotice ||
              outboxPendingCount > 0 ||
              gatewayHealthLabel ? (
                <View style={styles.historyInfoRow}>
                  <Text
                    style={styles.historyLastSyncedText}
                    maxFontSizeMultiplier={MAX_TEXT_SCALE_TIGHT}
                  >
                    {historyLastSyncedLabel ??
                      historyHealthCheckedLabel ??
                      ''}
                  </Text>
                  {historyRefreshNotice ? (
                    <Text
                      style={[
                        styles.historyRefreshNoticeText,
                        historyRefreshNotice.kind === 'error' &&
                          styles.historyRefreshNoticeTextError,
                      ]}
                      maxFontSizeMultiplier={MAX_TEXT_SCALE_TIGHT}
                    >
                      {historyRefreshNotice.message}
                    </Text>
                  ) : outboxPendingCount > 0 ? (
                    <Text
                      style={[
                        styles.historyQueueStatusText,
                        gatewayHealthState === 'degraded' &&
                          styles.historyQueueStatusTextWarning,
                      ]}
                      maxFontSizeMultiplier={MAX_TEXT_SCALE_TIGHT}
                    >
                      Pending {outboxPendingCount}
                    </Text>
                  ) : gatewayHealthLabel ? (
                    <Text
                      style={[
                        styles.historyQueueStatusText,
                        gatewayHealthState === 'degraded' &&
                          styles.historyQueueStatusTextWarning,
                      ]}
                      maxFontSizeMultiplier={MAX_TEXT_SCALE_TIGHT}
                    >
                      {gatewayHealthLabel}
                    </Text>
                  ) : null}
                </View>
              ) : null}
              <ScrollView
                ref={historyScrollRef}
                contentContainerStyle={[
                  styles.chatList,
                  showScrollToBottomButton && styles.chatListWithScrollButton,
                ]}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                onScroll={handleHistoryScroll}
                scrollEventThrottle={16}
                onContentSizeChange={() => {
                  if (historyAutoScrollRef.current) {
                    historyScrollRef.current?.scrollToEnd({ animated: true });
                    setShowScrollToBottomButton(false);
                  }
                }}
              >
                {chatTurns.length === 0 ? (
                  <Text
                    style={styles.placeholder}
                    maxFontSizeMultiplier={MAX_TEXT_SCALE}
                  >
                    Conversation history appears here.
                  </Text>
                ) : (
                  historyItems.map((item) => {
                    if (item.kind === 'date') {
                      return (
                        <View key={item.id} style={styles.historyDateRow}>
                          <View style={styles.historyDateLine} />
                          <Text
                            style={styles.historyDateText}
                            maxFontSizeMultiplier={MAX_TEXT_SCALE_TIGHT}
                          >
                            {item.label}
                          </Text>
                          <View style={styles.historyDateLine} />
                        </View>
                      );
                    }

                    const turn = item.turn;
                    const waiting = isTurnWaitingState(turn.state);
                    const error = isTurnErrorState(turn.state);
                    const assistantText =
                      turn.assistantText ||
                      (waiting ? 'Responding...' : 'No response');

                    return (
                      <View
                        key={item.id}
                        style={[
                          styles.historyTurnGroup,
                          item.isLast && styles.historyTurnGroupLast,
                        ]}
                      >
                        <View style={styles.historyUserRow}>
                          <View style={styles.turnUserBubble}>
                            <Text
                              style={styles.turnUser}
                              maxFontSizeMultiplier={MAX_TEXT_SCALE}
                            >
                              {turn.userText}
                            </Text>
                          </View>
                        </View>
                        <View style={styles.historyAssistantRow}>
                          <View style={styles.assistantAvatar}>
                            <Ionicons
                              name="flash"
                              size={11}
                              color={isDarkTheme ? '#ffffff' : '#1d4ed8'}
                            />
                          </View>
                          <View
                            style={[
                              styles.turnAssistantBubble,
                              error && styles.turnAssistantBubbleError,
                            ]}
                          >
                            <Markdown
                              markdownit={markdownParser}
                              style={error ? markdownErrorStyles : markdownStyles}
                              onLinkPress={(url) => {
                                void Linking.openURL(url).catch(() => {});
                                return false;
                              }}
                            >
                              {assistantText}
                            </Markdown>
                          </View>
                        </View>
                        <View style={styles.historyMetaRow}>
                          <View
                            style={[
                              styles.historyMetaDot,
                              waiting
                                ? styles.historyMetaDotWaiting
                                : error
                                  ? styles.historyMetaDotError
                                  : styles.historyMetaDotOk,
                            ]}
                          />
                          <Text
                            style={styles.historyMetaText}
                            maxFontSizeMultiplier={MAX_TEXT_SCALE_TIGHT}
                          >
                            {formatTurnTime(turn.createdAt)}
                          </Text>
                        </View>
                      </View>
                    );
                  })
                )}
              </ScrollView>
              {showScrollToBottomButton ? (
                <Pressable
                  style={[styles.iconButton, styles.historyScrollToBottomButtonFloating]}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Scroll history to the latest message"
                  onPress={handleScrollHistoryToBottom}
                >
                  <Ionicons
                    name="chevron-down-outline"
                    size={17}
                    color={isDarkTheme ? '#bccae2' : '#707070'}
                  />
                </Pressable>
              ) : null}
            </View>
          ) : null}
          <View
            style={[
              styles.card,
              isRecognizing && styles.recordingCard,
              isTranscriptEditingWithKeyboard && styles.transcriptCardExpanded,
              !isTranscriptExpanded && styles.transcriptCardCompact,
            ]}
          >
            <View
              style={[
                styles.transcriptEditor,
                isTranscriptEditingWithKeyboard && styles.transcriptEditorExpanded,
                !isTranscriptExpanded && styles.transcriptEditorCompact,
              ]}
            >
              <TextInput
                style={[
                  styles.transcriptInput,
                  focusedField === 'transcript' && styles.inputFocused,
                  isRecognizing && styles.transcriptInputDisabled,
                  isTranscriptEditingWithKeyboard && styles.transcriptInputExpanded,
                  !isTranscriptExpanded && styles.transcriptInputCompact,
                ]}
                maxFontSizeMultiplier={MAX_TEXT_SCALE}
                value={transcript}
                onChangeText={(value) => {
                  setTranscript(value);
                  setInterimTranscript('');
                }}
                placeholder="Long-press the round button below to start voice input."
                placeholderTextColor={placeholderColor}
                multiline
                textAlignVertical="top"
                editable={!isRecognizing}
                onFocus={() => setFocusedField('transcript')}
                onBlur={() =>
                  setFocusedField((current) =>
                    current === 'transcript' ? null : current,
                  )
                }
              />
              {interimTranscript ? (
                <Text style={styles.interimText} maxFontSizeMultiplier={MAX_TEXT_SCALE}>
                  Live: {interimTranscript}
                </Text>
              ) : null}
            </View>
          </View>
        </View>

        {errorBannerMessage ? (
          <View
            style={[
              styles.errorBanner,
              isGatewayErrorBanner
                ? styles.errorBannerGateway
                : styles.errorBannerSpeech,
            ]}
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
          >
            <Ionicons
              name={errorBannerIconName}
              size={14}
              style={styles.errorBannerIcon}
            />
            <Text
              style={styles.errorBannerText}
              maxFontSizeMultiplier={MAX_TEXT_SCALE}
              numberOfLines={2}
            >
              {errorBannerMessage}
            </Text>
            {isGatewayErrorBanner ? (
              <View style={styles.errorBannerActionRow}>
                <Pressable
                  style={[
                    styles.errorBannerActionButton,
                    !canReconnectFromError && styles.errorBannerActionButtonDisabled,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Reconnect to Gateway"
                  onPress={handleReconnectFromError}
                  disabled={!canReconnectFromError}
                >
                  <Ionicons
                    name="refresh-outline"
                    size={15}
                    style={styles.errorBannerActionIcon}
                  />
                </Pressable>
                <Pressable
                  style={[
                    styles.errorBannerActionButton,
                    !canRetryFromError && styles.errorBannerActionButtonDisabled,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Retry sending the latest message"
                  onPress={handleRetryFromError}
                  disabled={!canRetryFromError}
                >
                  <Ionicons
                    name="arrow-redo-outline"
                    size={15}
                    style={styles.errorBannerActionIcon}
                  />
                </Pressable>
              </View>
            ) : null}
          </View>
        ) : null}

        <View
          style={[
            styles.bottomDock,
            isTranscriptFocused && styles.bottomDockKeyboardOpen,
            isKeyboardVisible && styles.bottomDockKeyboardCompact,
          ]}
        >
          {isKeyboardBarMounted ? (
            <Animated.View
              style={[
                styles.keyboardActionRow,
                {
                  opacity: keyboardBarAnim,
                  transform: [
                    {
                      translateY: keyboardBarAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [8, 0],
                      }),
                    },
                  ],
                },
              ]}
            >
              <Pressable
                style={[
                  styles.keyboardActionButton,
                  showDoneOnlyAction
                    ? styles.keyboardActionButtonSingle
                    : styles.keyboardActionButtonWide,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Done editing"
                onPress={() => {
                  Keyboard.dismiss();
                  setFocusedField(null);
                }}
              >
                <Text
                  style={styles.keyboardActionButtonText}
                  maxFontSizeMultiplier={MAX_TEXT_SCALE_TIGHT}
                >
                  Done
                </Text>
              </Pressable>
              {showClearInKeyboardBar ? (
                <Pressable
                  style={[
                    styles.keyboardActionButton,
                    styles.keyboardActionButtonWide,
                    !canClearFromKeyboardBar && styles.keyboardActionButtonDisabled,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Clear transcript"
                  onPress={() => {
                    if (!canClearFromKeyboardBar) return;
                    clearTranscriptDraft();
                  }}
                  disabled={!canClearFromKeyboardBar}
                >
                  <Text
                    style={[
                      styles.keyboardActionButtonText,
                      styles.keyboardClearActionButtonText,
                    ]}
                    maxFontSizeMultiplier={MAX_TEXT_SCALE_TIGHT}
                  >
                    Clear
                  </Text>
                </Pressable>
              ) : null}
              {!showDoneOnlyAction ? (
                <Pressable
                  style={[
                    styles.keyboardActionButton,
                    styles.keyboardActionButtonWide,
                    styles.keyboardSendActionButton,
                    !canSendFromKeyboardBar && styles.keyboardActionButtonDisabled,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Send transcript"
                  onPress={() => {
                    if (!canSendFromKeyboardBar) return;
                    const text = transcript.trim() || interimTranscript.trim();
                    if (!text) return;
                    Keyboard.dismiss();
                    setFocusedField(null);
                    void sendToGateway(text);
                  }}
                  disabled={!canSendFromKeyboardBar}
                >
                  <Text
                    style={[
                      styles.keyboardActionButtonText,
                      styles.keyboardSendActionButtonText,
                    ]}
                    maxFontSizeMultiplier={MAX_TEXT_SCALE_TIGHT}
                  >
                    Send
                  </Text>
                </Pressable>
              ) : null}
            </Animated.View>
          ) : (
            <View style={styles.bottomActionRow}>
              <View style={styles.quickTextButtonSlot}>
                {showQuickTextLeftTooltip ? (
                  <View style={styles.quickTextTooltip} pointerEvents="none">
                    <Text
                      style={styles.quickTextTooltipText}
                      numberOfLines={3}
                      maxFontSizeMultiplier={MAX_TEXT_SCALE_TIGHT}
                    >
                      {quickTextLeftLabel}
                    </Text>
                  </View>
                ) : null}
                <Pressable
                  style={({ pressed }) => [
                    styles.quickTextButton,
                    pressed && canUseQuickTextLeft && styles.bottomActionButtonPressed,
                    !canUseQuickTextLeft && styles.quickTextButtonDisabled,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={
                    canUseQuickTextLeft
                      ? `Insert quick text ${quickTextLeftLabel}`
                      : 'Left quick text is empty'
                  }
                  accessibilityHint="Tap to insert. Long press to preview."
                  onPress={() => {
                    handleQuickTextPress('left', quickTextLeftLabel);
                  }}
                  onLongPress={() => {
                    handleQuickTextLongPress('left', quickTextLeftLabel);
                  }}
                  onPressOut={() => {
                    handleQuickTextPressOut('left');
                  }}
                  delayLongPress={280}
                  disabled={!canUseQuickTextLeft}
                >
                  <Ionicons
                    name={quickTextLeftIcon}
                    size={20}
                    style={styles.quickTextButtonIcon}
                  />
                </Pressable>
              </View>
              {canSendDraft ? (
                <Pressable
                  style={({ pressed }) => [
                    styles.roundButton,
                    styles.sendRoundButton,
                    pressed && !isSending && styles.bottomActionButtonPressed,
                    isSending && styles.roundButtonDisabled,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={
                    isSending
                      ? 'Sending in progress'
                      : isGatewayConnected
                        ? 'Send transcript'
                        : 'Queue transcript and send after reconnect'
                  }
                  onPress={() => {
                    const text = transcript.trim() || interimTranscript.trim();
                    if (!text) return;
                    Keyboard.dismiss();
                    setFocusedField(null);
                    void sendToGateway(text);
                  }}
                  onPressIn={() => {
                    void triggerHaptic('button-press');
                  }}
                  disabled={isSending}
                >
                  <Ionicons
                    name={isSending ? 'time-outline' : 'send'}
                    size={26}
                    color="#ffffff"
                  />
                </Pressable>
              ) : (
                <Pressable
                  style={({ pressed }) => [
                    styles.roundButton,
                    styles.micRoundButton,
                    isRecognizing && styles.recordingRoundButton,
                    pressed &&
                      !isSending &&
                      settingsReady &&
                      styles.bottomActionButtonPressed,
                    (isSending || !settingsReady) && styles.roundButtonDisabled,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={
                    isRecognizing
                      ? 'Stop voice recording'
                      : isSending
                        ? 'Recording disabled while sending'
                        : 'Hold to record voice'
                  }
                  onPressIn={handleHoldToTalkPressIn}
                  onPressOut={handleHoldToTalkPressOut}
                  disabled={isSending || !settingsReady}
                >
                  <Ionicons
                    name={isRecognizing ? 'stop' : 'mic'}
                    size={26}
                    color="#ffffff"
                  />
                </Pressable>
              )}
              <View style={styles.quickTextButtonSlot}>
                {showQuickTextRightTooltip ? (
                  <View style={styles.quickTextTooltip} pointerEvents="none">
                    <Text
                      style={styles.quickTextTooltipText}
                      numberOfLines={3}
                      maxFontSizeMultiplier={MAX_TEXT_SCALE_TIGHT}
                    >
                      {quickTextRightLabel}
                    </Text>
                  </View>
                ) : null}
                <Pressable
                  style={({ pressed }) => [
                    styles.quickTextButton,
                    pressed && canUseQuickTextRight && styles.bottomActionButtonPressed,
                    !canUseQuickTextRight && styles.quickTextButtonDisabled,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={
                    canUseQuickTextRight
                      ? `Insert quick text ${quickTextRightLabel}`
                      : 'Right quick text is empty'
                  }
                  accessibilityHint="Tap to insert. Long press to preview."
                  onPress={() => {
                    handleQuickTextPress('right', quickTextRightLabel);
                  }}
                  onLongPress={() => {
                    handleQuickTextLongPress('right', quickTextRightLabel);
                  }}
                  onPressOut={() => {
                    handleQuickTextPressOut('right');
                  }}
                  delayLongPress={280}
                  disabled={!canUseQuickTextRight}
                >
                  <Ionicons
                    name={quickTextRightIcon}
                    size={20}
                    style={styles.quickTextButtonIcon}
                  />
                </Pressable>
              </View>
            </View>
          )}
          {isKeyboardBarMounted ? null : (
            <Text style={styles.bottomHint} maxFontSizeMultiplier={MAX_TEXT_SCALE}>
              {bottomHintText}
            </Text>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
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
        errorActionPrimaryBg: '#2563EB',
        errorActionPrimaryText: '#ffffff',
        errorActionSecondaryBg: 'rgba(255,255,255,0.10)',
        errorActionSecondaryBorder: 'rgba(255,255,255,0.22)',
        errorActionSecondaryText: '#dbe7ff',
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
        bottomHint: '#b8c9e6',
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
        errorActionPrimaryBg: '#2563EB',
        errorActionPrimaryText: '#ffffff',
        errorActionSecondaryBg: '#F2F6FF',
        errorActionSecondaryBorder: 'rgba(37,99,235,0.32)',
        errorActionSecondaryText: '#1D4ED8',
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
        bottomHint: '#5C5C5C',
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
      paddingTop: 10,
      paddingBottom: 10,
    },
    transcriptEditor: {
      minHeight: 96,
      gap: 6,
    },
    transcriptEditorCompact: {
      minHeight: 56,
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
      minHeight: 44,
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
    loadingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      minHeight: 24,
      marginBottom: 4,
      paddingRight: 36,
    },
    loadingText: {
      fontSize: 12,
      color: colors.loading,
    },
    historyInfoRow: {
      minHeight: 20,
      marginBottom: 4,
      paddingRight: 36,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    historyLastSyncedText: {
      flexShrink: 1,
      fontSize: 10,
      color: colors.label,
    },
    historyRefreshNoticeText: {
      flexShrink: 0,
      fontSize: 10,
      color: isDarkTheme ? '#9ec0ff' : '#1D4ED8',
      fontWeight: '600',
    },
    historyRefreshNoticeTextError: {
      color: colors.errorText,
    },
    historyQueueStatusText: {
      flexShrink: 0,
      fontSize: 10,
      color: isDarkTheme ? '#9ec0ff' : '#1D4ED8',
      fontWeight: '600',
    },
    historyQueueStatusTextWarning: {
      color: colors.errorText,
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
      paddingBottom: 44,
    },
    historyDateRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingTop: 12,
      paddingBottom: 8,
    },
    historyDateLine: {
      flex: 1,
      height: 1,
      backgroundColor: colors.historyDateLine,
    },
    historyDateText: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.historyDateText,
    },
    historyTurnGroup: {
      marginBottom: 12,
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
    errorBanner: {
      width: '100%',
      minHeight: 36,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.errorBorder,
      backgroundColor: colors.errorBg,
      paddingHorizontal: 10,
      paddingVertical: 7,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      ...surfaceShadow,
    },
    errorBannerGateway: {
      borderColor: colors.errorBorder,
      backgroundColor: colors.errorBg,
    },
    errorBannerSpeech: {
      borderColor: isDarkTheme ? 'rgba(217,119,6,0.46)' : 'rgba(217,119,6,0.28)',
      backgroundColor: isDarkTheme ? 'rgba(217,119,6,0.16)' : 'rgba(217,119,6,0.08)',
    },
    errorBannerIcon: {
      color: colors.errorText,
    },
    errorBannerText: {
      flex: 1,
      color: colors.errorText,
      fontSize: 12,
      lineHeight: 16,
    },
    errorBannerActionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    errorBannerActionButton: {
      width: 28,
      height: 28,
      borderRadius: 9,
      borderWidth: 1.5,
      backgroundColor: colors.errorActionSecondaryBg,
      borderColor: colors.errorActionSecondaryBorder,
      alignItems: 'center',
      justifyContent: 'center',
    },
    errorBannerActionButtonDisabled: {
      opacity: 0.55,
    },
    errorBannerActionIcon: {
      color: colors.errorActionSecondaryText,
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
    bottomHint: {
      fontSize: 12,
      color: colors.bottomHint,
    },
  });
}
