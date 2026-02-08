import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import Markdown from 'react-native-markdown-display';
import {
  ActivityIndicator,
  Animated,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  LogBox,
  NativeScrollEvent,
  NativeSyntheticEvent,
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
  type Storage as OpenClawStorage,
} from './src/openclaw';

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
type FocusField = 'gateway-url' | 'auth-token' | 'transcript' | null;
const DEFAULT_GATEWAY_URL = (process.env.EXPO_PUBLIC_DEFAULT_GATEWAY_URL ?? '').trim();
const DEFAULT_THEME: AppTheme =
  process.env.EXPO_PUBLIC_DEFAULT_THEME === 'dark' ? 'dark' : 'light';
const DEFAULT_SPEECH_LANG: SpeechLang = 'ja-JP';
const MAX_TEXT_SCALE = 1.35;
const MAX_TEXT_SCALE_TIGHT = 1.15;
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

function toTextContent(message?: ChatMessage): string {
  if (!message) return '';

  const { content } = message;
  if (typeof content === 'string') return content.trim();
  if (!Array.isArray(content)) return '';

  const lines = content
    .map((block) => {
      const pieces: string[] = [];
      collectText(pieceOrUndefined(block?.text), pieces);
      collectText(pieceOrUndefined(block?.thinking), pieces);
      collectText(pieceOrUndefined(block?.content), pieces);
      return dedupeLines(pieces).join('\n').trim();
    })
    .filter(Boolean);

  return lines.join('\n');
}

function pieceOrUndefined(value: unknown): unknown {
  return value === null ? undefined : value;
}

function collectText(value: unknown, out: string[], depth = 0): void {
  if (value == null || depth > 6) return;

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed) out.push(trimmed);
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((entry) => collectText(entry, out, depth + 1));
    return;
  }

  if (typeof value !== 'object') return;

  const record = value as Record<string, unknown>;
  collectText(record.text, out, depth + 1);
  collectText(record.thinking, out, depth + 1);
  collectText(record.content, out, depth + 1);
  collectText(record.value, out, depth + 1);
  collectText(record.message, out, depth + 1);
  collectText(record.output, out, depth + 1);
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

export default function App() {
  const [gatewayUrl, setGatewayUrl] = useState(DEFAULT_GATEWAY_URL);
  const [authToken, setAuthToken] = useState('');
  const [speechLang, setSpeechLang] = useState<SpeechLang>(DEFAULT_SPEECH_LANG);
  const [isSettingsPanelOpen, setIsSettingsPanelOpen] = useState(false);
  const [settingsReady, setSettingsReady] = useState(false);
  const [connectionState, setConnectionState] =
    useState<ConnectionState>('disconnected');
  const [gatewayError, setGatewayError] = useState<string | null>(null);
  const [gatewayEventState, setGatewayEventState] = useState('idle');
  const [isSending, setIsSending] = useState(false);
  const [chatTurns, setChatTurns] = useState<ChatTurn[]>([]);
  const [theme, setTheme] = useState<AppTheme>(DEFAULT_THEME);
  const [focusedField, setFocusedField] = useState<FocusField>(null);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [isKeyboardBarMounted, setIsKeyboardBarMounted] = useState(false);

  const [isRecognizing, setIsRecognizing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [speechError, setSpeechError] = useState<string | null>(null);

  const clientRef = useRef<GatewayClient | null>(null);
  const sessionKeyRef = useRef(`mobile-openclaw-${Date.now().toString(36)}`);
  const activeRunIdRef = useRef<string | null>(null);
  const pendingTurnIdRef = useRef<string | null>(null);
  const runIdToTurnIdRef = useRef<Map<string, string>>(new Map());
  const subscriptionsRef = useRef<Array<() => void>>([]);
  const transcriptRef = useRef('');
  const interimTranscriptRef = useRef('');
  const historyScrollRef = useRef<ScrollView | null>(null);
  const historyAutoScrollRef = useRef(true);
  const holdStartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdActivatedRef = useRef(false);
  const keyboardBarAnim = useRef(new Animated.Value(0)).current;
  const expectedSpeechStopRef = useRef(false);
  const isUnmountingRef = useRef(false);

  const isGatewayConnected = connectionState === 'connected';
  const isGatewayConnecting =
    connectionState === 'connecting' || connectionState === 'reconnecting';
  const shouldShowGatewayPanel = !isGatewayConnected || isSettingsPanelOpen;
  const isDarkTheme = theme === 'dark';

  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  useEffect(() => {
    interimTranscriptRef.current = interimTranscript;
  }, [interimTranscript]);

  useEffect(() => {
    if (chatTurns.length === 0 || !historyAutoScrollRef.current) return;
    const timer = setTimeout(() => {
      historyScrollRef.current?.scrollToEnd({ animated: true });
    }, 30);
    return () => clearTimeout(timer);
  }, [chatTurns.length]);

  useEffect(() => {
    let alive = true;

    const loadSettings = async () => {
      try {
        const [savedUrl, savedToken, savedIdentity, savedTheme, savedSpeechLang] = await Promise.all([
          kvStore.getItemAsync(STORAGE_KEYS.gatewayUrl),
          kvStore.getItemAsync(STORAGE_KEYS.authToken),
          kvStore.getItemAsync(OPENCLAW_IDENTITY_STORAGE_KEY),
          kvStore.getItemAsync(STORAGE_KEYS.theme),
          kvStore.getItemAsync(STORAGE_KEYS.speechLang),
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

    const persist = async () => {
      try {
        if (value) {
          await kvStore.setItemAsync(STORAGE_KEYS.gatewayUrl, value);
        } else {
          await kvStore.deleteItemAsync(STORAGE_KEYS.gatewayUrl);
        }
      } catch {
        // ignore persistence errors
      }
    };

    void persist();
  }, [gatewayUrl, settingsReady]);

  useEffect(() => {
    if (!settingsReady) return;
    const value = authToken.trim();

    const persist = async () => {
      try {
        if (value) {
          await kvStore.setItemAsync(STORAGE_KEYS.authToken, value);
        } else {
          await kvStore.deleteItemAsync(STORAGE_KEYS.authToken);
        }
      } catch {
        // ignore persistence errors
      }
    };

    void persist();
  }, [authToken, settingsReady]);

  useEffect(() => {
    if (!settingsReady) return;

    const persist = async () => {
      try {
        await kvStore.setItemAsync(STORAGE_KEYS.theme, theme);
      } catch {
        // ignore persistence errors
      }
    };

    void persist();
  }, [theme, settingsReady]);

  useEffect(() => {
    if (!settingsReady) return;

    const persist = async () => {
      try {
        await kvStore.setItemAsync(STORAGE_KEYS.speechLang, speechLang);
      } catch {
        // ignore persistence errors
      }
    };

    void persist();
  }, [settingsReady, speechLang]);

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
    const code = String(event.error ?? '').toLowerCase();
    const isAbortedLike =
      code.includes('aborted') || code.includes('cancelled') || code.includes('canceled');
    const shouldIgnore = isUnmountingRef.current || (expectedSpeechStopRef.current && isAbortedLike);

    expectedSpeechStopRef.current = false;
    setIsRecognizing(false);
    if (shouldIgnore) return;
    void triggerHaptic('send-error');
    setSpeechError(`Speech recognition error: ${event.error}`);
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
    if (clientRef.current) {
      clientRef.current.disconnect();
      clientRef.current = null;
    }
    activeRunIdRef.current = null;
    pendingTurnIdRef.current = null;
    runIdToTurnIdRef.current.clear();
    setIsSending(false);
    setConnectionState('disconnected');
    setGatewayEventState('idle');
  };

  const updateChatTurn = useCallback(
    (turnId: string, updater: (turn: ChatTurn) => ChatTurn) => {
      setChatTurns((previous) =>
        previous.map((turn) => (turn.id === turnId ? updater(turn) : turn)),
      );
    },
    [],
  );

  const sendToGateway = useCallback(
    async (overrideText?: string) => {
      const client = clientRef.current;
      if (!client || connectionState !== 'connected') {
        setGatewayError('Please connect to the Gateway first.');
        return;
      }

      if (isSending) return;

      const message =
        (overrideText ?? transcriptRef.current ?? '').trim() ||
        (interimTranscriptRef.current ?? '').trim();
      if (!message) {
        setGatewayError('No text to send. Please record your voice first.');
        return;
      }

      setGatewayError(null);
      setGatewayEventState('sending');
      setIsSending(true);

      const turnId = createTurnId();
      pendingTurnIdRef.current = turnId;
      setChatTurns((previous) => [
        ...previous,
        {
          id: turnId,
          userText: message,
          assistantText: '',
          state: 'sending',
          createdAt: Date.now(),
        },
      ]);

      try {
        const result = await client.chatSend(sessionKeyRef.current, message, {
          timeoutMs: 30_000,
        });
        transcriptRef.current = '';
        interimTranscriptRef.current = '';
        setTranscript('');
        setInterimTranscript('');
        void triggerHaptic('send-success');
        activeRunIdRef.current = result.runId;
        runIdToTurnIdRef.current.set(result.runId, turnId);
        pendingTurnIdRef.current = null;

        updateChatTurn(turnId, (turn) => ({
          ...turn,
          runId: result.runId,
          state: 'queued',
        }));
      } catch (err) {
        const messageText = errorMessage(err);
        void triggerHaptic('send-error');
        setIsSending(false);
        pendingTurnIdRef.current = null;
        setGatewayError(`Send failed: ${messageText}`);
        updateChatTurn(turnId, (turn) => ({
          ...turn,
          state: 'error',
          assistantText: `Send failed: ${messageText}`,
        }));
      }
    },
    [connectionState, isSending, updateChatTurn],
  );

  const handleChatEvent = (payload: ChatEventPayload) => {
    if (payload.sessionKey !== sessionKeyRef.current) return;

    const text = toTextContent(payload.message);
    const state = payload.state ?? 'unknown';
    setGatewayEventState(state);
    let turnId = runIdToTurnIdRef.current.get(payload.runId);

    if (!turnId && pendingTurnIdRef.current) {
      turnId = pendingTurnIdRef.current;
      pendingTurnIdRef.current = null;
      runIdToTurnIdRef.current.set(payload.runId, turnId);
      updateChatTurn(turnId, (turn) => ({
        ...turn,
        runId: payload.runId,
      }));
    }

    if (!turnId) return;

    if (state === 'delta' || state === 'streaming') {
      activeRunIdRef.current = payload.runId;
      setIsSending(true);
      updateChatTurn(turnId, (turn) => ({
        ...turn,
        runId: payload.runId,
        state,
        assistantText: text || turn.assistantText || 'Responding...',
      }));
      return;
    }

    if (state === 'complete' || state === 'done' || state === 'final') {
      setIsSending(false);
      activeRunIdRef.current = null;
      runIdToTurnIdRef.current.delete(payload.runId);
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
      return;
    }

    if (state === 'error') {
      const message = payload.errorMessage ?? 'An error occurred on the Gateway.';
      void triggerHaptic('send-error');
      setGatewayError(`Gateway error: ${message}`);
      setIsSending(false);
      activeRunIdRef.current = null;
      runIdToTurnIdRef.current.delete(payload.runId);
      updateChatTurn(turnId, (turn) => ({
        ...turn,
        runId: payload.runId,
        state: 'error',
        assistantText: text || message,
      }));
      return;
    }

    if (state === 'aborted') {
      void triggerHaptic('send-error');
      setGatewayError('The Gateway response was aborted.');
      setIsSending(false);
      activeRunIdRef.current = null;
      runIdToTurnIdRef.current.delete(payload.runId);
      updateChatTurn(turnId, (turn) => ({
        ...turn,
        runId: payload.runId,
        state: 'aborted',
        assistantText: turn.assistantText || 'Response was aborted.',
      }));
      return;
    }

    if (text) {
      updateChatTurn(turnId, (turn) => ({
        ...turn,
        runId: payload.runId,
        state,
        assistantText: text,
      }));
    }
  };

  const connectGateway = async () => {
    if (!settingsReady) {
      setGatewayError('Initializing. Please wait a few seconds and try again.');
      return;
    }

    if (!gatewayUrl.trim()) {
      setGatewayError('Please enter a Gateway URL.');
      return;
    }

    const connectOnce = async (clientId: string) => {
      disconnectGateway();
      setGatewayError(null);
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
    } catch (err) {
      disconnectGateway();
      setGatewayError(`Gateway connection failed: ${errorMessage(err)}`);
    }
  };

  useEffect(() => {
    return () => {
      isUnmountingRef.current = true;
      expectedSpeechStopRef.current = true;
      if (holdStartTimerRef.current) {
        clearTimeout(holdStartTimerRef.current);
        holdStartTimerRef.current = null;
      }
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

  const formatTurnTime = (createdAt: number): string =>
    new Date(createdAt).toLocaleTimeString('ja-JP', {
      hour: '2-digit',
      minute: '2-digit',
    });

  const draftText = transcript.trim() || interimTranscript.trim();
  const hasDraft = Boolean(draftText);
  const canSendDraft = hasDraft && !isRecognizing;
  const isTranscriptFocused = focusedField === 'transcript';
  const isGatewayFieldFocused =
    focusedField === 'gateway-url' || focusedField === 'auth-token';
  const showKeyboardActionBar =
    isKeyboardVisible && (isTranscriptFocused || isGatewayFieldFocused);
  const showDoneOnlyAction = showKeyboardActionBar && isGatewayFieldFocused;
  const canSendFromKeyboardBar =
    hasDraft && !isRecognizing && isGatewayConnected && !isSending;
  const isTranscriptEditingWithKeyboard = isKeyboardVisible && isTranscriptFocused;
  const sendDisabledReason = !hasDraft
    ? 'No text to send.'
    : !isGatewayConnected
      ? 'Not connected.'
      : isRecognizing
        ? 'Stop recording to send.'
        : isSending
          ? 'Sending in progress...'
          : null;
  const bottomHintText = isRecognizing
    ? 'Release when finished speaking.'
    : canSendDraft
      ? sendDisabledReason ?? 'Ready to send'
      : isGatewayConnected
        ? 'Hold to record'
        : 'Please connect';
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
    Boolean(latestRetryText) && !isSending && isGatewayConnected;

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
      historyAutoScrollRef.current = distanceFromBottom < 72;
    },
    [],
  );

  const styles = useMemo(() => createStyles(isDarkTheme), [isDarkTheme]);
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
      paragraph: {
        color: isDarkTheme ? '#f8fbff' : '#1A1A1A',
        marginTop: 0,
        marginBottom: 0,
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
      paragraph: {
        ...(markdownStyles.paragraph ?? {}),
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
                isSettingsPanelOpen && styles.iconButtonActive,
                !isGatewayConnected && styles.iconButtonDisabled,
              ]}
              hitSlop={7}
              accessibilityRole="button"
              accessibilityLabel={
                isSettingsPanelOpen
                  ? 'Hide settings panel'
                  : 'Show settings panel'
              }
              onPress={() => {
                if (!isGatewayConnected) return;
                Keyboard.dismiss();
                setFocusedField(null);
                setIsSettingsPanelOpen((current) => !current);
              }}
              disabled={!isGatewayConnected}
            >
              <Ionicons
                name="settings-outline"
                size={18}
                color={isDarkTheme ? '#bccae2' : '#707070'}
              />
            </Pressable>
            <Pressable
              style={styles.iconButton}
              hitSlop={7}
              accessibilityRole="button"
              accessibilityLabel={isDarkTheme ? 'Switch to light theme' : 'Switch to dark theme'}
              onPress={() => {
                setTheme((current) => (current === 'dark' ? 'light' : 'dark'));
              }}
            >
              <Ionicons
                name={isDarkTheme ? 'sunny-outline' : 'moon-outline'}
                size={18}
                color={isDarkTheme ? '#bccae2' : '#999999'}
              />
            </Pressable>
          </View>
        </View>

        {shouldShowGatewayPanel ? (
          <View style={styles.gatewayPanel}>
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
              Token / Password (Optional)
            </Text>
            <TextInput
              style={[
                styles.input,
                focusedField === 'auth-token' && styles.inputFocused,
              ]}
              maxFontSizeMultiplier={MAX_TEXT_SCALE}
              value={authToken}
              onChangeText={setAuthToken}
              placeholder="gateway token or password"
              placeholderTextColor={placeholderColor}
              autoCapitalize="none"
              autoCorrect={false}
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

            <Text
              style={[styles.label, styles.labelSpacing]}
              maxFontSizeMultiplier={MAX_TEXT_SCALE_TIGHT}
            >
              Speech Language
            </Text>
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

            <View style={styles.connectionRow}>
              <Pressable
                style={[
                  styles.smallButton,
                  styles.connectButton,
                  (isGatewayConnecting || !settingsReady) && styles.smallButtonDisabled,
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
          </View>
        ) : null}
        <View style={styles.main}>
          {!isTranscriptEditingWithKeyboard ? (
            <View style={[styles.card, styles.historyCard, styles.historyCardFlat]}>
              <Text style={styles.historyTitle} maxFontSizeMultiplier={MAX_TEXT_SCALE_TIGHT}>
                History
              </Text>
              {isSending ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator
                    size="small"
                    color={isDarkTheme ? '#9ec0ff' : '#2563EB'}
                  />
                  <Text
                    style={styles.loadingText}
                    maxFontSizeMultiplier={MAX_TEXT_SCALE}
                  >
                    Responding... ({gatewayEventState})
                  </Text>
                </View>
              ) : null}
              <ScrollView
                ref={historyScrollRef}
                contentContainerStyle={styles.chatList}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                onScroll={handleHistoryScroll}
                scrollEventThrottle={16}
                onContentSizeChange={() => {
                  if (historyAutoScrollRef.current) {
                    historyScrollRef.current?.scrollToEnd({ animated: true });
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
                              style={error ? markdownErrorStyles : markdownStyles}
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
            </View>
          ) : null}
          <View
            style={[
              styles.card,
              isRecognizing && styles.recordingCard,
              isTranscriptEditingWithKeyboard && styles.transcriptCardExpanded,
            ]}
          >
            <View
              style={[
                styles.transcriptEditor,
                isTranscriptEditingWithKeyboard && styles.transcriptEditorExpanded,
              ]}
            >
              <TextInput
                style={[
                  styles.transcriptInput,
                  focusedField === 'transcript' && styles.inputFocused,
                  isRecognizing && styles.transcriptInputDisabled,
                  isTranscriptEditingWithKeyboard && styles.transcriptInputExpanded,
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

        {speechError || gatewayError ? (
          <View style={styles.errorStack}>
            {speechError ? (
              <View
                style={styles.errorBox}
                accessibilityRole="alert"
                accessibilityLiveRegion="polite"
              >
                <Text style={styles.errorText} maxFontSizeMultiplier={MAX_TEXT_SCALE}>
                  {speechError}
                </Text>
              </View>
            ) : null}
            {gatewayError ? (
              <View
                style={styles.errorBox}
                accessibilityRole="alert"
                accessibilityLiveRegion="polite"
              >
                <Text style={styles.errorText} maxFontSizeMultiplier={MAX_TEXT_SCALE}>
                  {gatewayError}
                </Text>
                <View style={styles.errorActionRow}>
                  <Pressable
                    style={[
                      styles.errorActionButton,
                      styles.errorActionButtonSecondary,
                      !canReconnectFromError && styles.errorActionButtonDisabled,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Reconnect to Gateway"
                    onPress={handleReconnectFromError}
                    disabled={!canReconnectFromError}
                  >
                    <Text
                      style={[
                        styles.errorActionButtonText,
                        styles.errorActionButtonTextSecondary,
                      ]}
                      maxFontSizeMultiplier={MAX_TEXT_SCALE_TIGHT}
                    >
                      Reconnect
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.errorActionButton,
                      styles.errorActionButtonPrimary,
                      !canRetryFromError && styles.errorActionButtonDisabled,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Retry sending the latest message"
                    onPress={handleRetryFromError}
                    disabled={!canRetryFromError}
                  >
                    <Text
                      style={[
                        styles.errorActionButtonText,
                        styles.errorActionButtonTextPrimary,
                      ]}
                      maxFontSizeMultiplier={MAX_TEXT_SCALE_TIGHT}
                    >
                      Retry Send
                    </Text>
                  </Pressable>
                </View>
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
          ) : canSendDraft ? (
            <Pressable
              style={[
                styles.roundButton,
                styles.sendRoundButton,
                (!isGatewayConnected || isSending) && styles.roundButtonDisabled,
              ]}
              accessibilityRole="button"
              accessibilityLabel={
                !isGatewayConnected
                  ? 'Send disabled: not connected'
                  : isSending
                    ? 'Sending in progress'
                    : 'Send transcript'
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
              disabled={!isGatewayConnected || isSending}
            >
              <Ionicons
                name={isSending ? 'time-outline' : 'send'}
                size={26}
                color="#ffffff"
              />
            </Pressable>
          ) : (
            <Pressable
              style={[
                styles.roundButton,
                styles.micRoundButton,
                isRecognizing && styles.recordingRoundButton,
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
        roundBorder: 'transparent',
        micRound: '#2563EB',
        recordingRound: '#DC2626',
        sendRound: '#059669',
        roundDisabled: '#243a63',
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
        roundBorder: 'transparent',
        micRound: '#2563EB',
        recordingRound: '#DC2626',
        sendRound: '#059669',
        roundDisabled: '#C4C4C0',
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

  const surfaceShadowMd = {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 4,
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

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.page,
    },
    keyboardWrap: {
      flex: 1,
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 10,
      gap: 10,
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
    gatewayPanel: {
      borderRadius: 20,
      backgroundColor: colors.panelBg,
      padding: 14,
      borderWidth: 1.5,
      borderColor: colors.panelBorder,
      ...surfaceShadow,
    },
    label: {
      fontSize: 12,
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
      paddingVertical: 10,
      color: colors.inputText,
      backgroundColor: colors.inputBg,
      fontSize: 14,
    },
    inputFocused: {
      borderColor: colors.inputBorderFocused,
    },
    languagePickerRow: {
      flexDirection: 'row',
      gap: 8,
    },
    languageOptionButton: {
      flex: 1,
      borderWidth: 1.5,
      borderColor: colors.inputBorder,
      borderRadius: 10,
      backgroundColor: colors.inputBg,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 56,
      paddingVertical: 6,
      paddingHorizontal: 10,
      gap: 2,
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
      fontSize: 11,
      color: colors.label,
    },
    languageOptionCodeSelected: {
      color: colors.inputBorderFocused,
      fontWeight: '600',
    },
    connectionRow: {
      marginTop: 10,
      flexDirection: 'row',
      gap: 8,
      alignItems: 'stretch',
      width: '100%',
    },
    smallButton: {
      borderRadius: 10,
      minHeight: 44,
      paddingHorizontal: 14,
      paddingVertical: 9,
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
      fontSize: 13,
    },
    smallButtonDisabled: {
      backgroundColor: colors.smallBtnDisabled,
    },
    main: {
      flex: 1,
      gap: 12,
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
      paddingBottom: 0,
      shadowOpacity: 0,
      shadowRadius: 0,
      elevation: 0,
    },
    historyTitle: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.historyDateText,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginBottom: 6,
      paddingHorizontal: 2,
    },
    transcriptCardExpanded: {
      flex: 1,
      minHeight: 0,
    },
    transcriptEditor: {
      minHeight: 120,
      gap: 8,
    },
    transcriptEditorExpanded: {
      flex: 1,
      minHeight: 0,
    },
    transcriptInput: {
      minHeight: 100,
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
      marginBottom: 10,
    },
    loadingText: {
      fontSize: 12,
      color: colors.loading,
    },
    chatList: {
      paddingBottom: 10,
      gap: 0,
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
    errorStack: {
      gap: 8,
    },
    errorBox: {
      borderRadius: 14,
      padding: 10,
      backgroundColor: colors.errorBg,
      borderWidth: 1.5,
      borderColor: colors.errorBorder,
      ...surfaceShadowMd,
    },
    errorText: {
      color: colors.errorText,
      fontSize: 13,
      lineHeight: 18,
    },
    errorActionRow: {
      marginTop: 10,
      flexDirection: 'row',
      gap: 8,
    },
    errorActionButton: {
      flex: 1,
      minHeight: 44,
      borderRadius: 12,
      borderWidth: 1.5,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    errorActionButtonPrimary: {
      backgroundColor: colors.errorActionPrimaryBg,
      borderColor: 'transparent',
    },
    errorActionButtonSecondary: {
      backgroundColor: colors.errorActionSecondaryBg,
      borderColor: colors.errorActionSecondaryBorder,
    },
    errorActionButtonDisabled: {
      opacity: 0.56,
    },
    errorActionButtonText: {
      fontSize: 13,
      fontWeight: '700',
    },
    errorActionButtonTextPrimary: {
      color: colors.errorActionPrimaryText,
    },
    errorActionButtonTextSecondary: {
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
      borderWidth: 0,
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
    bottomHint: {
      fontSize: 12,
      color: colors.bottomHint,
    },
  });
}
