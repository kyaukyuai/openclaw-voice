import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  FlatList,
  Image,
  InteractionManager,
  Linking,
  NativeModules,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Clipboard from '@react-native-clipboard/clipboard';
import {
  GatewayChatController,
  formatUpdatedAtLabel,
  groupTurnsByDate,
  insertQuickTextAtSelection,
} from '../../src/shared';
import { setStorage } from '../../src/openclaw/storage';
import MarkdownWebViewBubble from './components/MarkdownWebViewBubble';
import FileAttachmentPickerSheet from './components/FileAttachmentPickerSheet';

const SETTINGS_KEY = 'openclaw-pocket.macos.settings.v2';
const OPENCLAW_IDENTITY_STORAGE_KEY = 'openclaw_device_identity';

const identityCache = new Map();

setStorage({
  getString(key) {
    return identityCache.get(key);
  },
  set(key, value) {
    identityCache.set(key, value);
    AsyncStorage.setItem(key, value).catch(() => {
      // Best-effort persistence.
    });
  },
});

const DEFAULTS = {
  gatewayUrl: '',
  authToken: '',
  sessionKey: 'main',
  quickTextLeft: 'Thank you',
  quickTextRight: 'Please help me with this.',
  theme: 'light',
};

const DEFAULT_GATEWAY_PROFILE = {
  id: 'gateway-main',
  name: 'Gateway 1',
  gatewayUrl: DEFAULTS.gatewayUrl,
  authToken: DEFAULTS.authToken,
  sessionKey: DEFAULTS.sessionKey,
  sessions: [DEFAULTS.sessionKey],
};

const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_ATTACHMENT_COUNT = 5;
const MESSAGE_NOTIFICATION_MAX_LENGTH = 180;
const COMPOSER_LINE_HEIGHT = 20;
const COMPOSER_VERTICAL_PADDING = 18;
const COMPOSER_MIN_LINES = 2;
const COMPOSER_MAX_LINES = 8;
const COMPOSER_MIN_HEIGHT = COMPOSER_MIN_LINES * COMPOSER_LINE_HEIGHT + COMPOSER_VERTICAL_PADDING;
const COMPOSER_MAX_HEIGHT = COMPOSER_MAX_LINES * COMPOSER_LINE_HEIGHT + COMPOSER_VERTICAL_PADDING;
const DEFAULT_NOTIFICATION_SETTINGS = {
  enabled: true,
  muteForeground: true,
  byGatewayId: {},
};

const THEMES = {
  light: {
    bg: '#F7F8FA',
    card: '#FFFFFF',
    input: '#F3F4F6',
    textPrimary: '#111827',
    textSecondary: '#374151',
    textMuted: '#6B7280',
    textDisabled: '#9CA3AF',
    placeholder: '#6B7280',
    inputCaret: '#2563EB',
    inputBorder: 'rgba(17,24,39,0.12)',
    inputBorderFocus: '#2563EB',
    dividerStrong: 'rgba(17,24,39,0.08)',
    sidebar: '#FCFCFD',
    sideActiveBg: 'rgba(37,99,235,0.07)',
    sideActiveInk: '#1D4ED8',
    emptyIconBg: 'rgba(37,99,235,0.07)',
    assistantBubble: '#FFFFFF',
    assistantBubbleBorder: 'rgba(17,24,39,0.08)',
    hintBg: 'rgba(17,24,39,0.05)',
  },
  dark: {
    bg: '#0F1115',
    card: '#171A20',
    input: '#1E232D',
    textPrimary: '#E5E7EB',
    textSecondary: '#C2C8D0',
    textMuted: '#94A0AE',
    textDisabled: '#6B7280',
    placeholder: '#8B97A6',
    inputCaret: '#60A5FA',
    inputBorder: 'rgba(255,255,255,0.14)',
    inputBorderFocus: '#60A5FA',
    dividerStrong: 'rgba(255,255,255,0.10)',
    sidebar: '#11141A',
    sideActiveBg: 'rgba(96,165,250,0.14)',
    sideActiveInk: '#93C5FD',
    emptyIconBg: 'rgba(96,165,250,0.12)',
    assistantBubble: '#1B212B',
    assistantBubbleBorder: 'rgba(255,255,255,0.10)',
    hintBg: 'rgba(255,255,255,0.07)',
  },
};

const SEMANTIC = {
  blue: '#2563EB',
  green: '#059669',
  amber: '#D97706',
  red: '#DC2626',
  blueSoft: 'rgba(37,99,235,0.07)',
  greenSoft: 'rgba(5,150,105,0.07)',
  amberSoft: 'rgba(217,119,6,0.07)',
};

const INITIAL_CONTROLLER_STATE = {
  connectionState: 'disconnected',
  turns: [],
  isSending: false,
  isSyncing: false,
  syncError: null,
  sendError: null,
  banner: null,
  status: {
    key: 'disconnected',
    label: 'Disconnected',
    color: '#6b7280',
    backgroundColor: '#f3f4f6',
  },
  lastUpdatedAt: null,
};

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeNotificationSettings(rawSettings, profiles = []) {
  const source = rawSettings && typeof rawSettings === 'object' ? rawSettings : {};
  const sourceMap =
    source.byGatewayId && typeof source.byGatewayId === 'object' ? source.byGatewayId : {};
  const byGatewayId = {};

  profiles.forEach((profile) => {
    const gatewayId = String(profile?.id ?? '').trim();
    if (!gatewayId) return;
    byGatewayId[gatewayId] =
      typeof sourceMap[gatewayId] === 'boolean' ? sourceMap[gatewayId] : true;
  });

  return {
    enabled: source.enabled !== false,
    muteForeground: source.muteForeground !== false,
    byGatewayId,
  };
}

function isSameNotificationSettings(left, right) {
  if (!left || !right) return false;
  if (left.enabled !== right.enabled) return false;
  if (left.muteForeground !== right.muteForeground) return false;
  const leftMap = left.byGatewayId ?? {};
  const rightMap = right.byGatewayId ?? {};
  const leftKeys = Object.keys(leftMap).sort();
  const rightKeys = Object.keys(rightMap).sort();
  if (!isSameStringArray(leftKeys, rightKeys)) return false;
  return leftKeys.every((key) => leftMap[key] === rightMap[key]);
}

function normalizeUnreadByGatewaySession(rawUnread, profiles = []) {
  const source = rawUnread && typeof rawUnread === 'object' ? rawUnread : {};
  const knownGatewayIds = new Set(profiles.map((profile) => String(profile?.id ?? '').trim()).filter(Boolean));
  const next = {};

  Object.entries(source).forEach(([gatewayId, sessionMap]) => {
    if (!knownGatewayIds.has(gatewayId)) return;
    if (!sessionMap || typeof sessionMap !== 'object') return;
    const nextSessionMap = {};
    Object.entries(sessionMap).forEach(([session, count]) => {
      const normalizedSession = normalizeSessionKey(session);
      const normalizedCount = Math.max(0, Number(count ?? 0) | 0);
      if (!normalizedSession || normalizedCount <= 0) return;
      nextSessionMap[normalizedSession] = normalizedCount;
    });
    if (Object.keys(nextSessionMap).length > 0) {
      next[gatewayId] = nextSessionMap;
    }
  });

  return next;
}

function isSameUnreadByGatewaySession(left, right) {
  const leftMap = left && typeof left === 'object' ? left : {};
  const rightMap = right && typeof right === 'object' ? right : {};
  const leftGatewayIds = Object.keys(leftMap).sort();
  const rightGatewayIds = Object.keys(rightMap).sort();
  if (!isSameStringArray(leftGatewayIds, rightGatewayIds)) return false;

  return leftGatewayIds.every((gatewayId) => {
    const leftSessions = leftMap[gatewayId] ?? {};
    const rightSessions = rightMap[gatewayId] ?? {};
    const leftSessionIds = Object.keys(leftSessions).sort();
    const rightSessionIds = Object.keys(rightSessions).sort();
    if (!isSameStringArray(leftSessionIds, rightSessionIds)) return false;
    return leftSessionIds.every((sessionId) => leftSessions[sessionId] === rightSessions[sessionId]);
  });
}

function notificationSnippet(value) {
  const normalized = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return 'You received a new message.';
  if (normalized.length <= MESSAGE_NOTIFICATION_MAX_LENGTH) return normalized;
  return `${normalized.slice(0, MESSAGE_NOTIFICATION_MAX_LENGTH - 1)}…`;
}

function extractNotificationRoute(payload) {
  if (!payload || typeof payload !== 'object') return null;

  const root = payload;
  const rootUserInfo = root.userInfo && typeof root.userInfo === 'object' ? root.userInfo : null;
  const notificationNode =
    root.notification && typeof root.notification === 'object' ? root.notification : null;
  const nestedUserInfo =
    notificationNode?.userInfo && typeof notificationNode.userInfo === 'object'
      ? notificationNode.userInfo
      : null;
  const candidate = rootUserInfo ?? nestedUserInfo ?? notificationNode ?? root;

  const gatewayId = normalizeText(candidate?.gatewayId ?? root?.gatewayId);
  if (!gatewayId) return null;

  const sessionKey = normalizeSessionKey(candidate?.sessionKey ?? root?.sessionKey);
  const turnId = normalizeText(candidate?.turnId ?? root?.turnId);

  return {
    gatewayId,
    sessionKey,
    turnId,
    signature: `${gatewayId}::${sessionKey}::${turnId || '-'}`,
  };
}

function normalizeSessionKey(value) {
  const normalized = normalizeText(value);
  return normalized || DEFAULTS.sessionKey;
}

function normalizeComposerSelection(selection, text = '') {
  const safeText = String(text ?? '');
  const max = safeText.length;
  const startRaw = Number.isFinite(selection?.start) ? selection.start : max;
  const endRaw = Number.isFinite(selection?.end) ? selection.end : max;
  const start = Math.max(0, Math.min(max, startRaw));
  const end = Math.max(start, Math.min(max, endRaw));
  return { start, end };
}

function clampComposerHeight(nextHeight) {
  if (!Number.isFinite(nextHeight)) return COMPOSER_MIN_HEIGHT;
  return Math.max(COMPOSER_MIN_HEIGHT, Math.min(COMPOSER_MAX_HEIGHT, Math.ceil(nextHeight)));
}

function estimateComposerHeightFromText(text) {
  const safeText = String(text ?? '');
  const lineCount = Math.max(1, safeText.split(/\r?\n/).length);
  return clampComposerHeight(lineCount * COMPOSER_LINE_HEIGHT + COMPOSER_VERTICAL_PADDING);
}

function compactQuickTextLabel(value) {
  const normalized = normalizeText(value);
  if (!normalized) return '(empty)';
  if (normalized.length <= 44) return normalized;
  return `${normalized.slice(0, 44)}...`;
}

function createAttachmentId() {
  return `att-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeAttachmentDraft(input) {
  if (!input || typeof input !== 'object') return null;

  const fileName = String(input.fileName ?? '').trim();
  const mimeType = String(input.mimeType ?? '').trim();
  const content = String(input.content ?? '').trim();
  const rawType = String(input.type ?? '').trim().toLowerCase();
  const type = rawType === 'image' ? 'image' : 'file';
  const size = Number(input.size ?? 0);

  if (!fileName || !mimeType || !content) return null;
  if (Number.isFinite(size) && size > MAX_ATTACHMENT_SIZE_BYTES) return null;

  return {
    id: String(input.id ?? '').trim() || createAttachmentId(),
    type,
    fileName,
    mimeType,
    content,
    size: Number.isFinite(size) && size > 0 ? size : undefined,
  };
}

function attachmentLabel(attachment) {
  const typeLabel = attachment?.type === 'image' ? 'IMG' : 'FILE';
  return `${typeLabel}: ${String(attachment?.fileName ?? '').trim() || 'attachment'}`;
}

function bytesLabel(sizeBytes) {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return '-';
  if (sizeBytes >= 1024 * 1024) return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.ceil(sizeBytes / 1024)} KB`;
}

function decodeFileNameFromUri(uri) {
  const text = String(uri ?? '').trim();
  if (!text) return '';
  const normalized = text.replace(/^file:\/\//i, '');
  const parts = normalized.split(/[\\/]/).filter(Boolean);
  if (parts.length === 0) return '';
  try {
    return decodeURIComponent(parts[parts.length - 1]);
  } catch {
    return parts[parts.length - 1];
  }
}

function normalizeFileUri(uriOrPath) {
  const raw = String(uriOrPath ?? '').trim();
  if (!raw) return '';
  if (raw.startsWith('file://')) return raw;
  if (raw.startsWith('/')) return `file://${raw}`;
  return '';
}

function guessAttachmentType({ mimeType, fileName }) {
  const mime = String(mimeType ?? '').toLowerCase();
  const name = String(fileName ?? '').toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (/\.(png|jpe?g|gif|webp|bmp|heic|heif|svg)$/i.test(name)) return 'image';
  return 'file';
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    if (typeof FileReader === 'undefined') {
      reject(new Error('FileReader unavailable'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => {
      reject(new Error('Failed to read blob.'));
    };
    reader.onload = () => {
      const raw = String(reader.result ?? '');
      const marker = raw.indexOf(',');
      resolve(marker >= 0 ? raw.slice(marker + 1) : raw);
    };
    reader.readAsDataURL(blob);
  });
}

function extractDroppedFileCandidates(nativeEvent) {
  const transfer = nativeEvent?.dataTransfer ?? nativeEvent ?? {};
  const filesLike = transfer?.files;

  if (Array.isArray(filesLike)) {
    return filesLike;
  }

  if (filesLike && typeof filesLike.length === 'number') {
    const next = [];
    for (let index = 0; index < filesLike.length; index += 1) {
      const item = filesLike[index];
      if (item) next.push(item);
    }
    if (next.length > 0) return next;
  }

  const items = Array.isArray(transfer?.items) ? transfer.items : [];
  return items.filter(Boolean);
}

function mergeSessionKeys(...groups) {
  const merged = [];
  const seen = new Set();

  groups.forEach((group) => {
    if (!Array.isArray(group)) return;
    group.forEach((entry) => {
      const normalized = normalizeText(entry);
      if (!normalized || seen.has(normalized)) return;
      seen.add(normalized);
      merged.push(normalized);
    });
  });

  if (merged.length === 0) {
    return [DEFAULTS.sessionKey];
  }

  return merged;
}

function extractSessionKeys(sessionsPayload) {
  if (!Array.isArray(sessionsPayload)) return [];

  const keys = [];
  const seen = new Set();
  sessionsPayload.forEach((entry) => {
    if (!entry || typeof entry !== 'object') return;

    const keyCandidate =
      typeof entry.key === 'string'
        ? entry.key
        : typeof entry.sessionKey === 'string'
          ? entry.sessionKey
          : '';

    const normalized = normalizeText(keyCandidate);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    keys.push(normalized);
  });

  return keys;
}

function createGatewayProfile(overrides = {}, indexHint = 1) {
  const nextId =
    normalizeText(overrides.id) ||
    `gateway-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const nextSessionKey = normalizeSessionKey(overrides.sessionKey);
  const nextSessions = mergeSessionKeys([nextSessionKey], overrides.sessions);

  return {
    id: nextId,
    name: normalizeText(overrides.name) || `Gateway ${indexHint}`,
    gatewayUrl: typeof overrides.gatewayUrl === 'string' ? overrides.gatewayUrl : '',
    authToken: typeof overrides.authToken === 'string' ? overrides.authToken : '',
    sessionKey: nextSessionKey,
    sessions: nextSessions,
  };
}

function isSameStringArray(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function createGatewayRuntime() {
  return {
    controllerState: { ...INITIAL_CONTROLLER_STATE },
    composerText: '',
    composerSelection: { start: 0, end: 0 },
    composerHeight: COMPOSER_MIN_HEIGHT,
    pendingAttachments: [],
    sendingAttachmentCount: 0,
    isComposerFocused: false,
    composerBySession: {
      [DEFAULTS.sessionKey]: {
        text: '',
        selection: { start: 0, end: 0 },
      },
    },
    attachmentsBySession: {
      [DEFAULTS.sessionKey]: [],
    },
  };
}

function buildRuntimeMap(profiles, previous = {}) {
  const next = {};
  profiles.forEach((profile) => {
    const prevRuntime = previous[profile.id];
    const baseRuntime = createGatewayRuntime();
    const composerBySession =
      prevRuntime && typeof prevRuntime.composerBySession === 'object'
        ? prevRuntime.composerBySession
        : baseRuntime.composerBySession;
    const attachmentsBySession =
      prevRuntime && typeof prevRuntime.attachmentsBySession === 'object'
        ? prevRuntime.attachmentsBySession
        : baseRuntime.attachmentsBySession;
    const activeSessionForProfile = normalizeSessionKey(profile?.sessionKey);
    const sessionDraftAttachments = Array.isArray(attachmentsBySession?.[activeSessionForProfile])
      ? attachmentsBySession[activeSessionForProfile]
      : [];

    next[profile.id] = {
      ...baseRuntime,
      ...prevRuntime,
      composerHeight: clampComposerHeight(prevRuntime?.composerHeight ?? baseRuntime.composerHeight),
      composerBySession: {
        ...baseRuntime.composerBySession,
        ...(composerBySession ?? {}),
      },
      attachmentsBySession: {
        ...baseRuntime.attachmentsBySession,
        ...(attachmentsBySession ?? {}),
      },
      pendingAttachments: Array.isArray(prevRuntime?.pendingAttachments)
        ? prevRuntime.pendingAttachments
        : sessionDraftAttachments,
    };
  });
  return next;
}

function timestampLabel(timestampMs) {
  if (!timestampMs) return '';
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(timestampMs);
}

function isPendingTurn(turn) {
  const state = String(turn?.state ?? '').toLowerCase();
  return state === 'sending' || state === 'streaming' || state === 'delta' || state === 'queued';
}

function findLatestCompletedAssistantTurn(controllerState) {
  const turns = Array.isArray(controllerState?.turns) ? controllerState.turns : [];
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const candidate = turns[index];
    const assistantText = normalizeText(candidate?.assistantText);
    if (!assistantText || assistantText === 'Responding...') continue;
    if (isPendingTurn(candidate)) continue;
    if (String(candidate?.state ?? '').toLowerCase() === 'error') continue;
    return candidate;
  }
  return null;
}

function assistantTurnSignature(turn) {
  if (!turn) return '';
  const turnId = String(turn.id ?? turn.runId ?? '').trim();
  const updatedAt = String(turn.updatedAt ?? turn.createdAt ?? '').trim();
  const assistantText = normalizeText(turn.assistantText);
  if (!turnId || !assistantText) return '';
  return `${turnId}:${updatedAt}:${assistantText}`;
}

function gatewayRecoveryHint(profile, controllerState) {
  const connectionState = String(controllerState?.connectionState ?? 'disconnected');
  if (connectionState === 'connected' || connectionState === 'connecting') return '';

  if (connectionState === 'reconnecting') {
    return 'Reconnecting now. Press Reconnect for immediate retry or Disconnect to stop retry loop.';
  }

  const normalizedUrl = normalizeText(profile?.gatewayUrl);
  const normalizedToken = normalizeText(profile?.authToken);
  const normalizedSession = normalizeSessionKey(profile?.sessionKey);

  if (!normalizedUrl) {
    return 'Gateway URL is empty. Open Settings and set a valid wss:// URL.';
  }
  if (!/^wss?:\/\//i.test(normalizedUrl)) {
    return 'Gateway URL should start with wss:// (or ws:// for local development).';
  }
  if (!normalizedToken) {
    return 'Token is empty. If your gateway requires auth, set token then press Connect.';
  }

  return `Disconnected. Verify token/session (${normalizedSession}) and press Reconnect.`;
}

function turnDotColor(turnState) {
  if (turnState === 'complete') return SEMANTIC.green;
  if (turnState === 'error') return SEMANTIC.red;
  return SEMANTIC.blue;
}

function connectionChipFromState(connectionState) {
  if (connectionState === 'connected') {
    return { label: 'Connected', color: SEMANTIC.green, bg: SEMANTIC.greenSoft };
  }
  if (connectionState === 'connecting' || connectionState === 'reconnecting') {
    return { label: 'Connecting', color: SEMANTIC.amber, bg: SEMANTIC.amberSoft };
  }
  return { label: 'Disconnected', color: '#6b7280', bg: 'rgba(107,114,128,0.12)' };
}

function statusRowMeta(controllerState, identityPersistWarning, themeTokens) {
  if (controllerState.banner?.message) {
    return {
      message: controllerState.banner.message,
      tone: {
        bg: 'rgba(220,38,38,0.10)',
        border: 'rgba(220,38,38,0.20)',
        color: SEMANTIC.red,
      },
      spinning: false,
    };
  }

  if (identityPersistWarning) {
    return {
      message: identityPersistWarning,
      tone: {
        bg: SEMANTIC.amberSoft,
        border: 'rgba(217,119,6,0.20)',
        color: SEMANTIC.amber,
      },
      spinning: false,
    };
  }

  if (controllerState.isSending) {
    return {
      message: 'Responding... (sending)',
      tone: {
        bg: SEMANTIC.amberSoft,
        border: 'rgba(217,119,6,0.20)',
        color: SEMANTIC.amber,
      },
      spinning: true,
    };
  }

  if (controllerState.isSyncing) {
    return {
      message: 'Refreshing history...',
      tone: {
        bg: SEMANTIC.amberSoft,
        border: 'rgba(217,119,6,0.20)',
        color: SEMANTIC.amber,
      },
      spinning: true,
    };
  }

  if (controllerState.connectionState === 'reconnecting') {
    return {
      message: 'Reconnecting... You can reconnect manually or disconnect.',
      tone: {
        bg: SEMANTIC.blueSoft,
        border: 'rgba(37,99,235,0.20)',
        color: SEMANTIC.blue,
      },
      spinning: true,
    };
  }

  if (controllerState.connectionState === 'connecting') {
    return {
      message: 'Connecting to Gateway...',
      tone: {
        bg: SEMANTIC.blueSoft,
        border: 'rgba(37,99,235,0.20)',
        color: SEMANTIC.blue,
      },
      spinning: true,
    };
  }

  if (controllerState.connectionState === 'connected') {
    return {
      message: 'Connected and ready',
      tone: {
        bg: SEMANTIC.greenSoft,
        border: 'rgba(5,150,105,0.20)',
        color: SEMANTIC.green,
      },
      spinning: false,
    };
  }

  return {
    message: 'Disconnected: Connect to send messages',
    tone: {
      bg: themeTokens.input,
      border: themeTokens.inputBorder,
      color: themeTokens.textSecondary,
    },
    spinning: false,
  };
}

function EyeIcon({ visible, color }) {
  return (
    <View style={styles.eyeIcon}>
      <View style={[styles.eyeOutline, { borderColor: color }]} />
      <View style={[styles.eyePupil, { backgroundColor: color }]} />
      {!visible ? <View style={[styles.eyeSlash, { backgroundColor: color }]} /> : null}
    </View>
  );
}

function DateRow({ label, themeTokens }) {
  return (
    <View style={styles.dateRow}>
      <View style={[styles.dateLine, { backgroundColor: themeTokens.dividerStrong }]} />
      <Text style={[styles.dateLabel, { color: themeTokens.textMuted }]}>{label}</Text>
      <View style={[styles.dateLine, { backgroundColor: themeTokens.dividerStrong }]} />
    </View>
  );
}

function TurnRow({
  turn,
  themeTokens,
  onOpenExternalLink,
  copyKey,
  copied,
  onCopyMessage,
  onAssistantHeightChange,
  onLayout,
  onTailLayout,
}) {
  const pending = isPendingTurn(turn);
  const userText = String(turn?.userText ?? '').trim();
  const assistantText = String(turn?.assistantText ?? '').trim();
  const isImportedPlaceholder = userText === '(imported)';
  const shouldShowUserBubble = userText.length > 0 && !isImportedPlaceholder;

  return (
    <View style={styles.turnPair} onLayout={onLayout}>
      {shouldShowUserBubble ? (
        <View style={styles.userRow}>
          <Pressable
            style={styles.userBubble}
            onLongPress={() => {
              if (!onCopyMessage) return;
              onCopyMessage(copyKey ? `${copyKey}:user` : '', userText);
            }}
          >
            <Text style={styles.userBubbleText} selectable>
              {userText}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {isImportedPlaceholder ? (
        <View style={styles.importedTagRow}>
          <View style={[styles.importedTag, { backgroundColor: themeTokens.sideActiveBg }]}>
            <Text style={[styles.importedTagText, { color: themeTokens.sideActiveInk }]}>imported</Text>
          </View>
        </View>
      ) : null}

      <View style={styles.assistantRow}>
        <View style={styles.assistantAvatar}>
          <Text style={styles.assistantAvatarText}>OC</Text>
        </View>
        <View
          style={[
            styles.assistantBubble,
            {
              backgroundColor: themeTokens.assistantBubble,
              borderColor: themeTokens.assistantBubbleBorder,
            },
          ]}
        >
          {!pending && assistantText ? (
            <View style={styles.assistantBubbleHeader}>
              <Pressable
                style={[
                  styles.copyChip,
                  {
                    backgroundColor: themeTokens.hintBg,
                    borderColor: themeTokens.inputBorder,
                  },
                ]}
                onPress={() => {
                  if (!onCopyMessage) return;
                  onCopyMessage(copyKey ? `${copyKey}:assistant` : '', assistantText);
                }}
              >
                <Text
                  style={[
                    styles.copyChipText,
                    { color: copied ? SEMANTIC.green : themeTokens.textSecondary },
                  ]}
                >
                  {copied ? 'Copied' : 'Copy'}
                </Text>
              </Pressable>
            </View>
          ) : null}
          {pending && (!assistantText || assistantText === 'Responding...') ? (
            <View style={styles.pendingBubbleRow}>
              <ActivityIndicator size="small" color={themeTokens.textSecondary} />
              <Text style={[styles.pendingBubbleText, { color: themeTokens.textSecondary }]}>Responding...</Text>
            </View>
          ) : (
            <MarkdownWebViewBubble
              markdown={assistantText || 'No response'}
              themeTokens={themeTokens}
              cacheKey={copyKey ?? String(turn?.id ?? '')}
              onOpenExternalLink={onOpenExternalLink}
              onMeasuredHeight={onAssistantHeightChange}
            />
          )}
        </View>
      </View>

      <View style={styles.turnTimeRow} onLayout={onTailLayout}>
        <View style={[styles.turnStateDot, { backgroundColor: turnDotColor(turn.state) }]} />
        <Text style={[styles.turnTimeText, { color: themeTokens.textMuted }]}>
          {timestampLabel(turn.createdAt)}
        </Text>
      </View>
    </View>
  );
}

export default function App() {
  const [booting, setBooting] = useState(true);
  const [identityReady, setIdentityReady] = useState(false);
  const [identityPersistWarning, setIdentityPersistWarning] = useState(null);

  const [gatewayName, setGatewayName] = useState(DEFAULT_GATEWAY_PROFILE.name);
  const [gatewayUrl, setGatewayUrl] = useState(DEFAULT_GATEWAY_PROFILE.gatewayUrl);
  const [authToken, setAuthToken] = useState(DEFAULT_GATEWAY_PROFILE.authToken);
  const [sessionKey, setSessionKey] = useState(DEFAULT_GATEWAY_PROFILE.sessionKey);
  const [gatewayProfiles, setGatewayProfiles] = useState([DEFAULT_GATEWAY_PROFILE]);
  const [activeGatewayId, setActiveGatewayId] = useState(DEFAULT_GATEWAY_PROFILE.id);

  const [quickTextLeft, setQuickTextLeft] = useState(DEFAULTS.quickTextLeft);
  const [quickTextRight, setQuickTextRight] = useState(DEFAULTS.quickTextRight);
  const [theme, setTheme] = useState(DEFAULTS.theme);
  const [notificationSettings, setNotificationSettings] = useState(() =>
    normalizeNotificationSettings(DEFAULT_NOTIFICATION_SETTINGS, [DEFAULT_GATEWAY_PROFILE]),
  );
  const [isAuthTokenVisible, setIsAuthTokenVisible] = useState(false);
  const [activeNav, setActiveNav] = useState('settings');
  const [focusedSettingsInput, setFocusedSettingsInput] = useState(null);
  const [focusedGatewayId, setFocusedGatewayId] = useState(null);
  const [collapsedGatewayIds, setCollapsedGatewayIds] = useState({});
  const [quickMenuOpenByGatewayId, setQuickMenuOpenByGatewayId] = useState({});
  const [attachmentPickerGatewayId, setAttachmentPickerGatewayId] = useState(null);
  const [attachmentNoticeByGatewayId, setAttachmentNoticeByGatewayId] = useState({});
  const [dropActiveByGatewayId, setDropActiveByGatewayId] = useState({});
  const [forcedSelectionByGatewayId, setForcedSelectionByGatewayId] = useState({});
  const [historyBottomInsetByGatewayId, setHistoryBottomInsetByGatewayId] = useState({});
  const [copiedMessageByKey, setCopiedMessageByKey] = useState({});
  const [unreadByGatewaySession, setUnreadByGatewaySession] = useState({});

  const [gatewayRuntimeById, setGatewayRuntimeById] = useState(() => ({
    [DEFAULT_GATEWAY_PROFILE.id]: createGatewayRuntime(),
  }));

  const gatewayRuntimeByIdRef = useRef(gatewayRuntimeById);
  const controllersRef = useRef(new Map());
  const subscriptionsRef = useRef(new Map());
  const historyScrollRefs = useRef(new Map());
  const historyScrollRafByGatewayIdRef = useRef({});
  const historyScrollInteractionByGatewayIdRef = useRef({});
  const historyScrollRetryTimersByGatewayIdRef = useRef({});
  const historyContentHeightByGatewayIdRef = useRef({});
  const historyViewportHeightByGatewayIdRef = useRef({});
  const composerHeightByGatewayIdRef = useRef({});
  const hintHeightByGatewayIdRef = useRef({});
  const composerInputRefs = useRef(new Map());
  const composerFocusTimerRef = useRef(null);
  const isImeComposingByGatewayIdRef = useRef({});
  const skipSubmitEditingByGatewayIdRef = useRef({});
  const forcedSelectionByGatewayIdRef = useRef({});
  const copiedMessageTimerByKeyRef = useRef({});
  const authTokenInputRef = useRef(null);
  const rootRef = useRef(null);
  const lastAutoConnectSignatureByIdRef = useRef({});
  const manualDisconnectByIdRef = useRef({});
  const initialAutoNavigationHandledRef = useRef(false);
  const appStateRef = useRef(AppState.currentState ?? 'active');
  const activeNavRef = useRef(activeNav);
  const activeGatewayIdRef = useRef(activeGatewayId);
  const activeSessionKeyRef = useRef(sessionKey);
  const gatewayProfilesRef = useRef(gatewayProfiles);
  const previousControllerStateByGatewayIdRef = useRef({});
  const lastNotifiedAssistantTurnByGatewayIdRef = useRef({});
  const notificationSettingsRef = useRef(notificationSettings);
  const notificationPermissionRequestedRef = useRef(false);
  const notificationPermissionGrantedRef = useRef(false);
  const pushNotificationModuleRef = useRef(undefined);
  const lastHandledNotificationRouteSignatureRef = useRef('');
  const pendingNotificationRouteRef = useRef(null);
  const pendingTurnFocusByGatewayIdRef = useRef({});
  const turnFocusRetryTimersByGatewayIdRef = useRef({});

  const themeTokens = theme === 'dark' ? THEMES.dark : THEMES.light;
  const getPushNotificationModule = useCallback(() => {
    if (Platform.OS !== 'macos') return null;
    if (pushNotificationModuleRef.current !== undefined) {
      return pushNotificationModuleRef.current;
    }

    const nativePushManager =
      NativeModules?.PushNotificationManager ?? NativeModules?.PushNotificationManagerIOS ?? null;
    const supported =
      nativePushManager &&
      typeof nativePushManager.requestPermissions === 'function' &&
      typeof nativePushManager.presentLocalNotification === 'function';
    pushNotificationModuleRef.current = supported ? nativePushManager : null;

    return pushNotificationModuleRef.current;
  }, []);

  const requestNotificationPermission = useCallback(async () => {
    if (!notificationSettingsRef.current?.enabled) return false;
    const pushNotificationModule = getPushNotificationModule();
    if (!pushNotificationModule) {
      return false;
    }
    if (notificationPermissionGrantedRef.current) return true;
    if (notificationPermissionRequestedRef.current) {
      return notificationPermissionGrantedRef.current;
    }

    notificationPermissionRequestedRef.current = true;

    try {
      const permissions = await pushNotificationModule.requestPermissions({
        alert: true,
        sound: true,
        badge: false,
      });
      const allowed = Boolean(permissions?.alert || permissions?.sound || permissions?.badge);
      notificationPermissionGrantedRef.current = allowed;
      return allowed;
    } catch {
      notificationPermissionGrantedRef.current = false;
      return false;
    }
  }, [getPushNotificationModule]);

  const notifyNewAssistantMessage = useCallback(
    async (gatewayId, assistantTurn, session) => {
      if (Platform.OS !== 'macos') return;
      if (!notificationSettingsRef.current?.enabled) return;
      const gatewayNotificationEnabled =
        notificationSettingsRef.current?.byGatewayId?.[gatewayId];
      if (gatewayNotificationEnabled === false) return;

      const signature = assistantTurnSignature(assistantTurn);
      const turnKey = String(assistantTurn?.id ?? assistantTurn?.runId ?? '');
      if (!turnKey || lastNotifiedAssistantTurnByGatewayIdRef.current[gatewayId] === signature) return;
      lastNotifiedAssistantTurnByGatewayIdRef.current[gatewayId] = signature;

      const granted = await requestNotificationPermission();
      if (!granted) return;

      const profile = gatewayProfilesRef.current.find((entry) => entry.id === gatewayId);
      const titleProfile = normalizeText(profile?.name) || 'OpenClawPocket';
      const normalizedSession = normalizeSessionKey(session || profile?.sessionKey);
      const isForeground = appStateRef.current === 'active';
      const muteForeground = notificationSettingsRef.current?.muteForeground !== false;
      const pushNotificationModule = getPushNotificationModule();

      if (!pushNotificationModule) return;

      const payload = {
        alertTitle: `${titleProfile} • ${normalizedSession}`,
        alertBody: notificationSnippet(assistantTurn?.assistantText),
        alertAction: 'View',
        userInfo: {
          gatewayId,
          sessionKey: normalizedSession,
          turnId: turnKey,
        },
      };
      if (!isForeground || !muteForeground) {
        payload.soundName = 'default';
      }

      pushNotificationModule.presentLocalNotification(payload);
    },
    [getPushNotificationModule, requestNotificationPermission],
  );

  const incrementUnreadForSession = useCallback((gatewayId, session) => {
    const normalizedGatewayId = String(gatewayId ?? '').trim();
    const normalizedSession = normalizeSessionKey(session);
    if (!normalizedGatewayId || !normalizedSession) return;
    setUnreadByGatewaySession((previous) => {
      const gatewayMap = previous[normalizedGatewayId] ?? {};
      const nextCount = Math.max(0, Number(gatewayMap[normalizedSession] ?? 0)) + 1;
      return {
        ...previous,
        [normalizedGatewayId]: {
          ...gatewayMap,
          [normalizedSession]: nextCount,
        },
      };
    });
  }, []);

  const clearUnreadForSession = useCallback((gatewayId, session) => {
    const normalizedGatewayId = String(gatewayId ?? '').trim();
    const normalizedSession = normalizeSessionKey(session);
    if (!normalizedGatewayId || !normalizedSession) return;

    setUnreadByGatewaySession((previous) => {
      const gatewayMap = previous[normalizedGatewayId];
      if (!gatewayMap || !gatewayMap[normalizedSession]) return previous;
      const nextGatewayMap = { ...gatewayMap };
      delete nextGatewayMap[normalizedSession];

      const next = { ...previous };
      if (Object.keys(nextGatewayMap).length === 0) {
        delete next[normalizedGatewayId];
      } else {
        next[normalizedGatewayId] = nextGatewayMap;
      }
      return next;
    });
  }, []);

  const handleAssistantTurnArrival = useCallback(
    (gatewayId, previousState, nextState) => {
      const previousAssistantTurn = findLatestCompletedAssistantTurn(previousState);
      const nextAssistantTurn = findLatestCompletedAssistantTurn(nextState);
      const previousSignature = assistantTurnSignature(previousAssistantTurn);
      const nextSignature = assistantTurnSignature(nextAssistantTurn);

      if (!nextSignature || nextSignature === previousSignature) return;

      const previousTurnCount = Array.isArray(previousState?.turns) ? previousState.turns.length : 0;
      const appearsToBeInitialHistoryLoad = previousTurnCount === 0 && !previousState?.isSending;
      const arrivedDuringHistorySync = Boolean(previousState?.isSyncing);
      if (appearsToBeInitialHistoryLoad || arrivedDuringHistorySync) return;

      const profile = gatewayProfilesRef.current.find((entry) => entry.id === gatewayId);
      const sessionForGateway = normalizeSessionKey(profile?.sessionKey);
      const isViewingSameSession =
        activeNavRef.current === 'chat' &&
        activeGatewayIdRef.current === gatewayId &&
        normalizeSessionKey(activeSessionKeyRef.current) === sessionForGateway;

      if (isViewingSameSession) {
        clearUnreadForSession(gatewayId, sessionForGateway);
      } else {
        incrementUnreadForSession(gatewayId, sessionForGateway);
      }

      notifyNewAssistantMessage(gatewayId, nextAssistantTurn, sessionForGateway).catch(() => {
        // Notification failures must not affect chat flow.
      });
    },
    [clearUnreadForSession, incrementUnreadForSession, notifyNewAssistantMessage],
  );

  const handleOpenExternalLink = useCallback((url) => {
    const normalized = String(url ?? '').trim();
    if (!normalized) return;
    Linking.openURL(normalized).catch(() => {
      // noop
    });
  }, []);
  const handleCopyMessage = useCallback((key, message) => {
    const normalizedKey = String(key ?? '').trim();
    const normalizedMessage = String(message ?? '').trim();
    if (!normalizedKey || !normalizedMessage) return;

    Clipboard.setString(normalizedMessage);

    const existingTimer = copiedMessageTimerByKeyRef.current[normalizedKey];
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    setCopiedMessageByKey((previous) => {
      if (previous[normalizedKey] === true) return previous;
      return { ...previous, [normalizedKey]: true };
    });

    copiedMessageTimerByKeyRef.current[normalizedKey] = setTimeout(() => {
      setCopiedMessageByKey((previous) => {
        if (!previous[normalizedKey]) return previous;
        const next = { ...previous };
        delete next[normalizedKey];
        return next;
      });
      delete copiedMessageTimerByKeyRef.current[normalizedKey];
    }, 1400);
  }, []);

  const activeProfile = useMemo(
    () => gatewayProfiles.find((profile) => profile.id === activeGatewayId) ?? gatewayProfiles[0] ?? null,
    [activeGatewayId, gatewayProfiles],
  );

  const isGatewayNotificationEnabled = useCallback((gatewayId) => {
    const value = notificationSettings?.byGatewayId?.[gatewayId];
    return typeof value === 'boolean' ? value : true;
  }, [notificationSettings]);

  const toggleNotificationsEnabled = useCallback(() => {
    setNotificationSettings((previous) => ({
      ...previous,
      enabled: !previous.enabled,
    }));
  }, []);

  const toggleMuteForegroundNotifications = useCallback(() => {
    setNotificationSettings((previous) => ({
      ...previous,
      muteForeground: !previous.muteForeground,
    }));
  }, []);

  const toggleGatewayNotifications = useCallback((gatewayId) => {
    const normalizedGatewayId = String(gatewayId ?? '').trim();
    if (!normalizedGatewayId) return;
    setNotificationSettings((previous) => {
      const current = previous.byGatewayId?.[normalizedGatewayId];
      const nextValue = typeof current === 'boolean' ? !current : false;
      return {
        ...previous,
        byGatewayId: {
          ...(previous.byGatewayId ?? {}),
          [normalizedGatewayId]: nextValue,
        },
      };
    });
  }, []);

  const updateGatewayRuntime = useCallback((gatewayId, updater) => {
    setGatewayRuntimeById((previous) => {
      const current = previous[gatewayId] ?? createGatewayRuntime();
      const next = typeof updater === 'function' ? updater(current) : { ...current, ...updater };
      if (next === current) return previous;
      return { ...previous, [gatewayId]: next };
    });
  }, []);

  const currentSessionKeyForGateway = useCallback(
    (gatewayId) => {
      if (gatewayId === activeGatewayId) {
        return normalizeSessionKey(sessionKey);
      }
      const profile = gatewayProfiles.find((entry) => entry.id === gatewayId);
      return normalizeSessionKey(profile?.sessionKey);
    },
    [activeGatewayId, gatewayProfiles, sessionKey],
  );

  const setQuickMenuOpenForGateway = useCallback((gatewayId, isOpen) => {
    if (!gatewayId) return;
    setQuickMenuOpenByGatewayId((previous) => {
      if (!isOpen) {
        if (!previous[gatewayId]) return previous;
        const next = { ...previous };
        delete next[gatewayId];
        return next;
      }
      if (previous[gatewayId]) return previous;
      return { ...previous, [gatewayId]: true };
    });
  }, []);

  const closeAllQuickMenus = useCallback(() => {
    setQuickMenuOpenByGatewayId((previous) =>
      Object.keys(previous).length === 0 ? previous : {},
    );
  }, []);

  const setAttachmentNoticeForGateway = useCallback((gatewayId, message, kind = 'info') => {
    if (!gatewayId) return;
    const normalizedMessage = String(message ?? '').trim();
    if (!normalizedMessage) {
      setAttachmentNoticeByGatewayId((previous) => {
        if (!(gatewayId in previous)) return previous;
        const next = { ...previous };
        delete next[gatewayId];
        return next;
      });
      return;
    }

    setAttachmentNoticeByGatewayId((previous) => ({
      ...previous,
      [gatewayId]: {
        message: normalizedMessage,
        kind,
      },
    }));
  }, []);

  const setImeComposingForGateway = useCallback((gatewayId, isComposing) => {
    if (!gatewayId) return;
    if (isComposing) {
      isImeComposingByGatewayIdRef.current[gatewayId] = true;
      return;
    }
    delete isImeComposingByGatewayIdRef.current[gatewayId];
  }, []);

  const setForcedSelectionForGateway = useCallback((gatewayId, selection) => {
    if (!gatewayId) return;

    if (!selection) {
      delete forcedSelectionByGatewayIdRef.current[gatewayId];
      setForcedSelectionByGatewayId((previous) => {
        if (!(gatewayId in previous)) return previous;
        const next = { ...previous };
        delete next[gatewayId];
        return next;
      });
      return;
    }

    const normalized = {
      start: Number.isFinite(selection.start) ? selection.start : 0,
      end: Number.isFinite(selection.end) ? selection.end : Number.isFinite(selection.start) ? selection.start : 0,
    };

    forcedSelectionByGatewayIdRef.current[gatewayId] = normalized;
    setForcedSelectionByGatewayId((previous) => {
      const current = previous[gatewayId];
      if (current && current.start === normalized.start && current.end === normalized.end) {
        return previous;
      }
      return { ...previous, [gatewayId]: normalized };
    });
  }, []);

  const focusComposerForGateway = useCallback((gatewayId) => {
    if (!gatewayId) return;
    if (composerFocusTimerRef.current) {
      clearTimeout(composerFocusTimerRef.current);
    }
    composerFocusTimerRef.current = setTimeout(() => {
      composerFocusTimerRef.current = null;
      const input = composerInputRefs.current.get(gatewayId);
      input?.focus?.();
      setFocusedGatewayId(gatewayId);
    }, 0);
  }, []);

  const setHistoryBottomInsetForGateway = useCallback((gatewayId, inset) => {
    if (!gatewayId || !Number.isFinite(inset)) return;
    const normalized = Math.max(14, Math.min(48, Math.ceil(inset)));
    setHistoryBottomInsetByGatewayId((previous) => {
      if (previous[gatewayId] === normalized) return previous;
      return { ...previous, [gatewayId]: normalized };
    });
  }, []);

  const recomputeHistoryBottomInsetForGateway = useCallback(
    (gatewayId) => {
      if (!gatewayId) return;
      const composerHeight = composerHeightByGatewayIdRef.current[gatewayId] ?? 40;
      const hintHeight = hintHeightByGatewayIdRef.current[gatewayId] ?? 18;
      const nextInset = composerHeight * 0.25 + hintHeight * 0.25 + 8;
      setHistoryBottomInsetForGateway(gatewayId, nextInset);
    },
    [setHistoryBottomInsetForGateway],
  );

  const clearTurnFocusRetries = useCallback((gatewayId) => {
    if (!gatewayId) return;
    const timers = turnFocusRetryTimersByGatewayIdRef.current[gatewayId];
    if (Array.isArray(timers)) {
      timers.forEach((timerId) => clearTimeout(timerId));
    }
    delete turnFocusRetryTimersByGatewayIdRef.current[gatewayId];
  }, []);

  const clearPendingTurnFocus = useCallback(
    (gatewayId) => {
      if (!gatewayId) return;
      clearTurnFocusRetries(gatewayId);
      delete pendingTurnFocusByGatewayIdRef.current[gatewayId];
    },
    [clearTurnFocusRetries],
  );

  const scrollHistoryToBottom = useCallback((gatewayId, animated = false) => {
    if (!gatewayId) return;
    const pending = historyScrollRafByGatewayIdRef.current[gatewayId];
    if (pending?.first) {
      cancelAnimationFrame(pending.first);
    }
    if (pending?.second) {
      cancelAnimationFrame(pending.second);
    }
    const pendingInteraction = historyScrollInteractionByGatewayIdRef.current[gatewayId];
    if (pendingInteraction?.cancel) {
      pendingInteraction.cancel();
    }

    const interactionTask = InteractionManager.runAfterInteractions(() => {
      const first = requestAnimationFrame(() => {
        const second = requestAnimationFrame(() => {
          const scrollNode = historyScrollRefs.current.get(gatewayId);
          const contentHeight = historyContentHeightByGatewayIdRef.current[gatewayId] ?? 0;
          const viewportHeight = historyViewportHeightByGatewayIdRef.current[gatewayId] ?? 0;
          const targetOffset = Math.max(0, contentHeight - viewportHeight);

          if (Number.isFinite(targetOffset) && targetOffset > 0) {
            scrollNode?.scrollToOffset?.({ offset: targetOffset, animated });
          }
          scrollNode?.scrollToEnd?.({ animated });
          delete historyScrollRafByGatewayIdRef.current[gatewayId];
          delete historyScrollInteractionByGatewayIdRef.current[gatewayId];
        });
        historyScrollRafByGatewayIdRef.current[gatewayId] = { second };
      });
      historyScrollRafByGatewayIdRef.current[gatewayId] = { first };
    });
    historyScrollInteractionByGatewayIdRef.current[gatewayId] = interactionTask;
  }, []);

  const scrollHistoryToTurn = useCallback(
    (gatewayId, turnId, expectedSessionKey, animated = true) => {
      const normalizedGatewayId = normalizeText(gatewayId);
      const normalizedTurnId = normalizeText(turnId);
      if (!normalizedGatewayId || !normalizedTurnId) return false;

      const profile = gatewayProfilesRef.current.find((entry) => entry.id === normalizedGatewayId);
      if (!profile) return false;

      const currentSessionKey = normalizeSessionKey(profile.sessionKey);
      if (expectedSessionKey && currentSessionKey !== normalizeSessionKey(expectedSessionKey)) {
        return false;
      }

      const runtime = gatewayRuntimeByIdRef.current[normalizedGatewayId];
      const turns = Array.isArray(runtime?.controllerState?.turns) ? runtime.controllerState.turns : [];
      if (turns.length === 0) return false;

      const grouped = groupTurnsByDate(turns);
      const index = grouped.findIndex(
        (item) => item?.kind === 'turn' && String(item?.id ?? '').trim() === normalizedTurnId,
      );
      if (index < 0) return false;

      const scrollNode = historyScrollRefs.current.get(normalizedGatewayId);
      if (!scrollNode || typeof scrollNode.scrollToIndex !== 'function') return false;

      try {
        scrollNode.scrollToIndex({ index, animated, viewPosition: 1 });
        return true;
      } catch {
        return false;
      }
    },
    [],
  );

  const scheduleHistoryTurnFocus = useCallback(
    (gatewayId, turnId, sessionForTurn) => {
      const normalizedGatewayId = normalizeText(gatewayId);
      const normalizedTurnId = normalizeText(turnId);
      if (!normalizedGatewayId || !normalizedTurnId) return;

      const normalizedSession = normalizeSessionKey(sessionForTurn);
      pendingTurnFocusByGatewayIdRef.current[normalizedGatewayId] = {
        turnId: normalizedTurnId,
        sessionKey: normalizedSession,
      };

      clearTurnFocusRetries(normalizedGatewayId);

      const timers = [];
      [0, 80, 220, 450, 800, 1200, 1800, 2600].forEach((delay) => {
        const timerId = setTimeout(() => {
          const pending = pendingTurnFocusByGatewayIdRef.current[normalizedGatewayId];
          if (!pending) return;
          const focused = scrollHistoryToTurn(
            normalizedGatewayId,
            pending.turnId,
            pending.sessionKey,
            false,
          );
          if (focused) {
            clearPendingTurnFocus(normalizedGatewayId);
          }
        }, delay);
        timers.push(timerId);
      });

      const expiryTimerId = setTimeout(() => {
        const pending = pendingTurnFocusByGatewayIdRef.current[normalizedGatewayId];
        if (!pending) return;
        if (
          pending.turnId === normalizedTurnId &&
          normalizeSessionKey(pending.sessionKey) === normalizedSession
        ) {
          clearPendingTurnFocus(normalizedGatewayId);
          scrollHistoryToBottom(normalizedGatewayId, false);
        }
      }, 3400);
      timers.push(expiryTimerId);

      turnFocusRetryTimersByGatewayIdRef.current[normalizedGatewayId] = timers;
    },
    [clearPendingTurnFocus, clearTurnFocusRetries, scrollHistoryToBottom, scrollHistoryToTurn],
  );

  const scheduleHistoryBottomSync = useCallback(
    (gatewayId) => {
      if (!gatewayId) return;
      const pendingTurnFocus = pendingTurnFocusByGatewayIdRef.current[gatewayId];
      if (pendingTurnFocus) return;
      const existing = historyScrollRetryTimersByGatewayIdRef.current[gatewayId];
      if (Array.isArray(existing)) {
        existing.forEach((timerId) => clearTimeout(timerId));
      }

      const timers = [];
      [0, 120, 320, 700, 1200, 2000].forEach((delay) => {
        const timerId = setTimeout(() => {
          scrollHistoryToBottom(gatewayId, false);
        }, delay);
        timers.push(timerId);
      });
      historyScrollRetryTimersByGatewayIdRef.current[gatewayId] = timers;
    },
    [scrollHistoryToBottom],
  );

  const disconnectAndRemoveController = useCallback((gatewayId) => {
    const pendingScroll = historyScrollRafByGatewayIdRef.current[gatewayId];
    if (pendingScroll?.first) {
      cancelAnimationFrame(pendingScroll.first);
    }
    if (pendingScroll?.second) {
      cancelAnimationFrame(pendingScroll.second);
    }
    delete historyScrollRafByGatewayIdRef.current[gatewayId];

    const pendingRetryTimers = historyScrollRetryTimersByGatewayIdRef.current[gatewayId];
    if (Array.isArray(pendingRetryTimers)) {
      pendingRetryTimers.forEach((timerId) => clearTimeout(timerId));
      delete historyScrollRetryTimersByGatewayIdRef.current[gatewayId];
    }
    const pendingInteraction = historyScrollInteractionByGatewayIdRef.current[gatewayId];
    if (pendingInteraction?.cancel) {
      pendingInteraction.cancel();
      delete historyScrollInteractionByGatewayIdRef.current[gatewayId];
    }

    clearPendingTurnFocus(gatewayId);

    delete historyContentHeightByGatewayIdRef.current[gatewayId];
    delete historyViewportHeightByGatewayIdRef.current[gatewayId];

    const unsubscribe = subscriptionsRef.current.get(gatewayId);
    if (unsubscribe) {
      try {
        unsubscribe();
      } catch {
        // noop
      }
      subscriptionsRef.current.delete(gatewayId);
    }

    const controller = controllersRef.current.get(gatewayId);
    if (controller) {
      try {
        controller.disconnect();
      } catch {
        // noop
      }
      controllersRef.current.delete(gatewayId);
    }

    historyScrollRefs.current.delete(gatewayId);
    composerInputRefs.current.delete(gatewayId);
    delete composerHeightByGatewayIdRef.current[gatewayId];
    delete hintHeightByGatewayIdRef.current[gatewayId];
    delete previousControllerStateByGatewayIdRef.current[gatewayId];
    delete lastNotifiedAssistantTurnByGatewayIdRef.current[gatewayId];
  }, [clearPendingTurnFocus]);

  const createControllerForGateway = useCallback(
    (gatewayId, initialSessionKey = DEFAULTS.sessionKey) => {
      if (controllersRef.current.has(gatewayId)) {
        return controllersRef.current.get(gatewayId);
      }

      const controller = new GatewayChatController({
        sessionKey: normalizeSessionKey(initialSessionKey),
        clientOptions: {
          clientId: 'openclaw-ios',
          displayName: 'OpenClaw Pocket macOS',
          platform: 'macos',
          role: 'operator',
          scopes: ['operator.read', 'operator.write'],
          caps: ['talk'],
        },
      });

      previousControllerStateByGatewayIdRef.current[gatewayId] = controller.getState();

      const unsubscribe = controller.subscribe((nextState) => {
        const previousState =
          previousControllerStateByGatewayIdRef.current[gatewayId] ?? INITIAL_CONTROLLER_STATE;
        previousControllerStateByGatewayIdRef.current[gatewayId] = nextState;
        handleAssistantTurnArrival(gatewayId, previousState, nextState);

        updateGatewayRuntime(gatewayId, (current) => ({
          ...current,
          controllerState: nextState,
          sendingAttachmentCount: nextState.isSending ? current.sendingAttachmentCount ?? 0 : 0,
        }));
      });

      controllersRef.current.set(gatewayId, controller);
      subscriptionsRef.current.set(gatewayId, unsubscribe);
      return controller;
    },
    [handleAssistantTurnArrival, updateGatewayRuntime],
  );

  const getController = useCallback(
    (gatewayId) => {
      const existing = controllersRef.current.get(gatewayId);
      if (existing) return existing;

      const profile = gatewayProfiles.find((entry) => entry.id === gatewayId);
      if (!profile) return null;
      return createControllerForGateway(gatewayId, profile.sessionKey);
    },
    [createControllerForGateway, gatewayProfiles],
  );

  const persistSettings = useCallback(async (next) => {
    try {
      await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    } catch {
      // Keep running with in-memory values.
    }
  }, []);

  const applyGatewayProfileToEditor = useCallback((profile) => {
    if (!profile) return;
    setGatewayName(profile.name);
    setGatewayUrl(profile.gatewayUrl);
    setAuthToken(profile.authToken);
    setSessionKey(normalizeSessionKey(profile.sessionKey));
    setIsAuthTokenVisible(false);
    setFocusedSettingsInput(null);
  }, []);

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const [savedSettingsRaw, savedIdentity] = await Promise.all([
          AsyncStorage.getItem(SETTINGS_KEY),
          AsyncStorage.getItem(OPENCLAW_IDENTITY_STORAGE_KEY),
        ]);

        let nextProfiles = [DEFAULT_GATEWAY_PROFILE];
        let nextActiveId = DEFAULT_GATEWAY_PROFILE.id;
        let nextQuickTextLeft = DEFAULTS.quickTextLeft;
        let nextQuickTextRight = DEFAULTS.quickTextRight;
        let nextTheme = DEFAULTS.theme;
        let nextNotificationSettings = normalizeNotificationSettings(
          DEFAULT_NOTIFICATION_SETTINGS,
          nextProfiles,
        );

        if (savedSettingsRaw) {
          const parsed = JSON.parse(savedSettingsRaw);
          if (parsed && typeof parsed === 'object') {
            const legacySessionKey = normalizeSessionKey(parsed.sessionKey);
            const legacyGatewayUrl =
              typeof parsed.gatewayUrl === 'string' ? parsed.gatewayUrl : DEFAULTS.gatewayUrl;
            const legacyAuthToken =
              typeof parsed.authToken === 'string' ? parsed.authToken : DEFAULTS.authToken;

            const importedProfiles = [];
            const seen = new Set();
            if (Array.isArray(parsed.gateways)) {
              parsed.gateways.forEach((entry, index) => {
                const profile = createGatewayProfile(entry, index + 1);
                if (seen.has(profile.id)) return;
                seen.add(profile.id);
                importedProfiles.push(profile);
              });
            }

            if (importedProfiles.length === 0) {
              importedProfiles.push(
                createGatewayProfile(
                  {
                    id: DEFAULT_GATEWAY_PROFILE.id,
                    name: parsed.gatewayName,
                    gatewayUrl: legacyGatewayUrl,
                    authToken: legacyAuthToken,
                    sessionKey: legacySessionKey,
                    sessions: parsed.sessions,
                  },
                  1,
                ),
              );
            }

            nextProfiles = importedProfiles;
            const requestedActiveId =
              typeof parsed.activeGatewayId === 'string' ? parsed.activeGatewayId : '';
            nextActiveId =
              nextProfiles.find((entry) => entry.id === requestedActiveId)?.id ?? nextProfiles[0].id;

            if (typeof parsed.quickTextLeft === 'string') {
              nextQuickTextLeft = parsed.quickTextLeft;
            }
            if (typeof parsed.quickTextRight === 'string') {
              nextQuickTextRight = parsed.quickTextRight;
            }
            if (parsed.theme === 'light' || parsed.theme === 'dark') {
              nextTheme = parsed.theme;
            }
            nextNotificationSettings = normalizeNotificationSettings(
              parsed.notifications,
              nextProfiles,
            );
          }
        }

        setGatewayProfiles(nextProfiles);
        setActiveGatewayId(nextActiveId);
        setGatewayRuntimeById((previous) => buildRuntimeMap(nextProfiles, previous));
        applyGatewayProfileToEditor(nextProfiles.find((entry) => entry.id === nextActiveId) ?? nextProfiles[0]);
        setQuickTextLeft(nextQuickTextLeft);
        setQuickTextRight(nextQuickTextRight);
        setTheme(nextTheme);
        setNotificationSettings(nextNotificationSettings);

        if (savedIdentity) {
          identityCache.set(OPENCLAW_IDENTITY_STORAGE_KEY, savedIdentity);
        }
      } catch {
        setIdentityPersistWarning('Local identity persistence is limited in this runtime.');
      } finally {
        setIdentityReady(true);
        setBooting(false);
      }
    };

    bootstrap().catch(() => {
      // Ignore bootstrap failures and keep defaults.
    });
  }, [applyGatewayProfileToEditor]);

  useEffect(() => {
    rootRef.current?.focus?.();
  }, []);

  useEffect(() => {
    gatewayProfilesRef.current = gatewayProfiles;
  }, [gatewayProfiles]);

  useEffect(() => {
    gatewayRuntimeByIdRef.current = gatewayRuntimeById;
  }, [gatewayRuntimeById]);

  useEffect(() => {
    activeNavRef.current = activeNav;
  }, [activeNav]);

  useEffect(() => {
    activeGatewayIdRef.current = activeGatewayId;
  }, [activeGatewayId]);

  useEffect(() => {
    activeSessionKeyRef.current = sessionKey;
  }, [sessionKey]);

  useEffect(() => {
    notificationSettingsRef.current = notificationSettings;
  }, [notificationSettings]);

  useEffect(() => {
    setNotificationSettings((previous) => {
      const normalized = normalizeNotificationSettings(previous, gatewayProfiles);
      return isSameNotificationSettings(previous, normalized) ? previous : normalized;
    });
    setUnreadByGatewaySession((previous) => {
      const normalized = normalizeUnreadByGatewaySession(previous, gatewayProfiles);
      return isSameUnreadByGatewaySession(previous, normalized) ? previous : normalized;
    });
  }, [gatewayProfiles]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      appStateRef.current = nextState;
    });
    appStateRef.current = AppState.currentState ?? 'active';

    requestNotificationPermission().catch(() => {
      // Notifications remain optional.
    });

    return () => {
      subscription?.remove?.();
    };
  }, [requestNotificationPermission]);

  useEffect(
    () => () => {
      if (composerFocusTimerRef.current) {
        clearTimeout(composerFocusTimerRef.current);
        composerFocusTimerRef.current = null;
      }
    },
    [],
  );

  useEffect(() => {
    gatewayProfiles.forEach((profile) => {
      createControllerForGateway(profile.id, profile.sessionKey);
    });

    const knownIds = new Set(gatewayProfiles.map((profile) => profile.id));
    Array.from(controllersRef.current.keys()).forEach((gatewayId) => {
      if (!knownIds.has(gatewayId)) {
        disconnectAndRemoveController(gatewayId);
      }
    });

    setGatewayRuntimeById((previous) => {
      const next = buildRuntimeMap(gatewayProfiles, previous);
      const previousKeys = Object.keys(previous);
      const nextKeys = Object.keys(next);
      if (
        previousKeys.length === nextKeys.length &&
        nextKeys.every((key) => previous[key] === next[key])
      ) {
        return previous;
      }
      return next;
    });
  }, [createControllerForGateway, disconnectAndRemoveController, gatewayProfiles]);

  useEffect(
    () => () => {
      Array.from(controllersRef.current.keys()).forEach((gatewayId) => {
        disconnectAndRemoveController(gatewayId);
      });
      controllersRef.current.clear();
      subscriptionsRef.current.clear();
    },
    [disconnectAndRemoveController],
  );

  useEffect(() => {
    if (booting) return;
    persistSettings({
      gatewayName,
      gatewayUrl,
      authToken,
      sessionKey,
      gateways: gatewayProfiles,
      activeGatewayId,
      quickTextLeft,
      quickTextRight,
      theme,
      notifications: notificationSettings,
    }).catch(() => {
      // Keep running even if persistence fails.
    });
  }, [
    activeGatewayId,
    authToken,
    booting,
    gatewayName,
    gatewayProfiles,
    gatewayUrl,
    persistSettings,
    quickTextLeft,
    quickTextRight,
    sessionKey,
    theme,
    notificationSettings,
  ]);

  useEffect(() => {
    if (!activeProfile) return;
    applyGatewayProfileToEditor(activeProfile);
  }, [activeProfile, applyGatewayProfileToEditor]);

  useEffect(() => {
    const normalizedSessionKey = normalizeSessionKey(sessionKey);
    setGatewayProfiles((previous) => {
      let changed = false;
      const next = previous.map((entry, index) => {
        if (entry.id !== activeGatewayId) return entry;

        const nextEntry = {
          ...entry,
          name: normalizeText(gatewayName) || `Gateway ${index + 1}`,
          gatewayUrl,
          authToken,
          sessionKey: normalizedSessionKey,
          sessions: mergeSessionKeys([normalizedSessionKey], entry.sessions),
        };

        if (
          entry.name === nextEntry.name &&
          entry.gatewayUrl === nextEntry.gatewayUrl &&
          entry.authToken === nextEntry.authToken &&
          entry.sessionKey === nextEntry.sessionKey &&
          isSameStringArray(entry.sessions, nextEntry.sessions)
        ) {
          return entry;
        }

        changed = true;
        return nextEntry;
      });

      return changed ? next : previous;
    });
  }, [activeGatewayId, authToken, gatewayName, gatewayUrl, sessionKey]);

  const refreshKnownSessions = useCallback(
    async (gatewayId) => {
      const controller = getController(gatewayId);
      if (!controller?.client || typeof controller.client.sessionsList !== 'function') return;

      try {
        const response = await controller.client.sessionsList({ includeGlobal: true, limit: 200 });
        const discoveredSessions = extractSessionKeys(response?.sessions);
        if (!discoveredSessions.length) return;

        setGatewayProfiles((previous) => {
          let changed = false;
          const next = previous.map((entry) => {
            if (entry.id !== gatewayId) return entry;
            const mergedSessions = mergeSessionKeys([entry.sessionKey], entry.sessions, discoveredSessions);
            if (isSameStringArray(entry.sessions, mergedSessions)) {
              return entry;
            }
            changed = true;
            return {
              ...entry,
              sessions: mergedSessions,
            };
          });
          return changed ? next : previous;
        });
      } catch {
        // Ignore listing failures; chat can continue without session list sync.
      }
    },
    [getController],
  );

  const connectGateway = useCallback(
    async (gatewayId, targetSessionKey) => {
      if (!identityReady) return;
      const profile = gatewayProfiles.find((entry) => entry.id === gatewayId);
      if (!profile) return;

      const controller = getController(gatewayId);
      if (!controller) return;

      const localDraftForActive =
        gatewayId === activeGatewayId
          ? {
              ...profile,
              name: normalizeText(gatewayName) || profile.name,
              gatewayUrl,
              authToken,
              sessionKey: normalizeSessionKey(sessionKey),
              sessions: mergeSessionKeys([normalizeSessionKey(sessionKey)], profile.sessions),
            }
          : profile;

      const nextSessionKey = normalizeSessionKey(targetSessionKey ?? localDraftForActive.sessionKey);

      setGatewayProfiles((previous) =>
        previous.map((entry) => {
          if (entry.id !== gatewayId) return entry;
          return {
            ...entry,
            ...localDraftForActive,
            sessionKey: nextSessionKey,
            sessions: mergeSessionKeys([nextSessionKey], localDraftForActive.sessions),
          };
        }),
      );

      manualDisconnectByIdRef.current[gatewayId] = false;

      await controller.connect({
        url: localDraftForActive.gatewayUrl,
        token: localDraftForActive.authToken,
        sessionKey: nextSessionKey,
      });

      await refreshKnownSessions(gatewayId);
    },
    [
      activeGatewayId,
      authToken,
      gatewayName,
      gatewayProfiles,
      gatewayUrl,
      getController,
      identityReady,
      refreshKnownSessions,
      sessionKey,
    ],
  );

  const disconnectGateway = useCallback(
    (gatewayId, { manual = true } = {}) => {
      const controller = getController(gatewayId);
      if (!controller) return;

      if (manual) {
        manualDisconnectByIdRef.current[gatewayId] = true;
      }

      controller.disconnect();
    },
    [getController],
  );

  const refreshHistory = useCallback(
    async (gatewayId) => {
      const controller = getController(gatewayId);
      if (!controller) return;
      await controller.refreshHistory();
      await refreshKnownSessions(gatewayId);
    },
    [getController, refreshKnownSessions],
  );

  const sendMessage = useCallback(
    async (gatewayId) => {
      const runtime = gatewayRuntimeById[gatewayId];
      if (!runtime) return;
      const controllerState = runtime.controllerState ?? INITIAL_CONTROLLER_STATE;
      const message = normalizeText(runtime.composerText);
      const attachments = Array.isArray(runtime.pendingAttachments)
        ? runtime.pendingAttachments
            .map((entry) => normalizeAttachmentDraft(entry))
            .filter(Boolean)
        : [];
      const hasAttachments = attachments.length > 0;
      const activeSessionKeyForGateway = currentSessionKeyForGateway(gatewayId);
      const imeComposing = isImeComposingByGatewayIdRef.current[gatewayId] === true;
      const outgoingMessage = message;
      const outgoingAttachments = attachments.map((entry) => ({ ...entry }));

      if (
        (!message && !hasAttachments) ||
        imeComposing ||
        controllerState.connectionState !== 'connected' ||
        controllerState.isSending
      ) {
        return;
      }

      if (outgoingAttachments.length > 0) {
        setAttachmentNoticeForGateway(
          gatewayId,
          `Sending ${outgoingAttachments.length} attachment${outgoingAttachments.length > 1 ? 's' : ''}...`,
          'info',
        );
      } else {
        setAttachmentNoticeForGateway(gatewayId, '');
      }

      updateGatewayRuntime(gatewayId, (current) => ({
        ...current,
        composerText: '',
        composerSelection: { start: 0, end: 0 },
        composerHeight: COMPOSER_MIN_HEIGHT,
        pendingAttachments: [],
        sendingAttachmentCount: outgoingAttachments.length,
        composerBySession: {
          ...(current.composerBySession ?? {}),
          [activeSessionKeyForGateway]: {
            text: '',
            selection: { start: 0, end: 0 },
          },
        },
        attachmentsBySession: {
          ...(current.attachmentsBySession ?? {}),
          [activeSessionKeyForGateway]: [],
        },
      }));
      setForcedSelectionForGateway(gatewayId, null);
      setImeComposingForGateway(gatewayId, false);

      const controller = getController(gatewayId);
      if (!controller) return;
      try {
        await controller.sendMessage(outgoingMessage, outgoingAttachments);
        updateGatewayRuntime(gatewayId, (current) => ({
          ...current,
          composerText: '',
          composerSelection: { start: 0, end: 0 },
          composerHeight: COMPOSER_MIN_HEIGHT,
          pendingAttachments: [],
          sendingAttachmentCount: outgoingAttachments.length,
          composerBySession: {
            ...(current.composerBySession ?? {}),
            [activeSessionKeyForGateway]: {
              text: '',
              selection: { start: 0, end: 0 },
            },
          },
          attachmentsBySession: {
            ...(current.attachmentsBySession ?? {}),
            [activeSessionKeyForGateway]: [],
          },
        }));
        setAttachmentNoticeForGateway(gatewayId, '');
        setForcedSelectionForGateway(gatewayId, null);
        focusComposerForGateway(gatewayId);
        scheduleHistoryBottomSync(gatewayId);
      } catch (error) {
        const restoredSelection = {
          start: outgoingMessage.length,
          end: outgoingMessage.length,
        };
        updateGatewayRuntime(gatewayId, (current) => ({
          ...current,
          composerText: outgoingMessage,
          composerSelection: restoredSelection,
          composerHeight: estimateComposerHeightFromText(outgoingMessage),
          pendingAttachments: outgoingAttachments,
          sendingAttachmentCount: 0,
          composerBySession: {
            ...(current.composerBySession ?? {}),
            [activeSessionKeyForGateway]: {
              text: outgoingMessage,
              selection: restoredSelection,
            },
          },
          attachmentsBySession: {
            ...(current.attachmentsBySession ?? {}),
            [activeSessionKeyForGateway]: outgoingAttachments,
          },
        }));
        setAttachmentNoticeForGateway(
          gatewayId,
          `Send failed. Draft restored (${String(error?.message ?? 'unknown error')}).`,
          'error',
        );
        focusComposerForGateway(gatewayId);
        scheduleHistoryBottomSync(gatewayId);
        throw error;
      }
    },
    [
      currentSessionKeyForGateway,
      focusComposerForGateway,
      gatewayRuntimeById,
      getController,
      setAttachmentNoticeForGateway,
      setForcedSelectionForGateway,
      setImeComposingForGateway,
      scheduleHistoryBottomSync,
      updateGatewayRuntime,
    ],
  );

  const setPendingAttachmentsForGateway = useCallback(
    (gatewayId, nextAttachments) => {
      if (!gatewayId) return;
      const normalized = Array.isArray(nextAttachments)
        ? nextAttachments.map((entry) => normalizeAttachmentDraft(entry)).filter(Boolean)
        : [];
      const activeSessionKeyForGateway = currentSessionKeyForGateway(gatewayId);

      updateGatewayRuntime(gatewayId, (current) => ({
        ...current,
        pendingAttachments: normalized,
        attachmentsBySession: {
          ...(current.attachmentsBySession ?? {}),
          [activeSessionKeyForGateway]: normalized,
        },
      }));
    },
    [currentSessionKeyForGateway, updateGatewayRuntime],
  );

  const appendPendingAttachmentForGateway = useCallback(
    (gatewayId, candidate) => {
      if (!gatewayId) return false;
      const size = Number(candidate?.size ?? 0);
      if (Number.isFinite(size) && size > MAX_ATTACHMENT_SIZE_BYTES) {
        setAttachmentNoticeForGateway(
          gatewayId,
          `Attachment exceeds 10MB limit (${bytesLabel(size)}).`,
          'error',
        );
        return false;
      }

      const nextAttachment = normalizeAttachmentDraft(candidate);
      if (!nextAttachment) {
        setAttachmentNoticeForGateway(gatewayId, 'Attachment could not be processed.', 'error');
        return false;
      }

      const runtime = gatewayRuntimeById[gatewayId] ?? createGatewayRuntime();
      const current = Array.isArray(runtime.pendingAttachments) ? runtime.pendingAttachments : [];
      if (current.length >= MAX_ATTACHMENT_COUNT) {
        setAttachmentNoticeForGateway(gatewayId, `You can attach up to ${MAX_ATTACHMENT_COUNT} files.`, 'warn');
        return false;
      }

      const duplicated = current.some(
        (entry) =>
          String(entry?.fileName ?? '') === nextAttachment.fileName &&
          String(entry?.content ?? '') === nextAttachment.content,
      );
      if (duplicated) {
        setAttachmentNoticeForGateway(gatewayId, 'This attachment is already added.', 'info');
        return false;
      }

      setPendingAttachmentsForGateway(gatewayId, [...current, nextAttachment]);
      setAttachmentNoticeForGateway(gatewayId, `Attached: ${nextAttachment.fileName}`, 'success');
      return true;
    },
    [gatewayRuntimeById, setAttachmentNoticeForGateway, setPendingAttachmentsForGateway],
  );

  const removePendingAttachmentForGateway = useCallback(
    (gatewayId, attachmentId) => {
      if (!gatewayId || !attachmentId) return;
      const runtime = gatewayRuntimeById[gatewayId] ?? createGatewayRuntime();
      const existing = Array.isArray(runtime.pendingAttachments) ? runtime.pendingAttachments : [];
      const filtered = existing.filter((entry) => entry?.id !== attachmentId);
      if (filtered.length === existing.length) return;
      setPendingAttachmentsForGateway(gatewayId, filtered);
      if (filtered.length === 0) {
        setAttachmentNoticeForGateway(gatewayId, '');
      }
    },
    [gatewayRuntimeById, setAttachmentNoticeForGateway, setPendingAttachmentsForGateway],
  );

  const clearPendingAttachmentsForGateway = useCallback(
    (gatewayId) => {
      if (!gatewayId) return;
      setPendingAttachmentsForGateway(gatewayId, []);
      setAttachmentNoticeForGateway(gatewayId, '');
    },
    [setAttachmentNoticeForGateway, setPendingAttachmentsForGateway],
  );

  const importAttachmentFromUriForGateway = useCallback(
    async (gatewayId, candidate) => {
      const fileUri = normalizeFileUri(
        candidate?.uri ?? candidate?.url ?? candidate?.path ?? candidate?.filePath,
      );
      if (!fileUri) {
        setAttachmentNoticeForGateway(gatewayId, 'Unsupported dropped content. Use Attach button.', 'warn');
        return false;
      }

      const sizeHint = Number(candidate?.size ?? 0);
      if (Number.isFinite(sizeHint) && sizeHint > MAX_ATTACHMENT_SIZE_BYTES) {
        setAttachmentNoticeForGateway(
          gatewayId,
          `Attachment exceeds 10MB limit (${bytesLabel(sizeHint)}).`,
          'error',
        );
        return false;
      }

      try {
        setAttachmentNoticeForGateway(gatewayId, 'Importing dropped file...', 'info');
        const response = await fetch(fileUri);
        if (!response || !response.ok) {
          throw new Error(`File read failed (${response?.status ?? 'unknown'})`);
        }

        const blob = await response.blob();
        const blobSize = Number(blob?.size ?? sizeHint ?? 0);
        if (Number.isFinite(blobSize) && blobSize > MAX_ATTACHMENT_SIZE_BYTES) {
          setAttachmentNoticeForGateway(
            gatewayId,
            `Attachment exceeds 10MB limit (${bytesLabel(blobSize)}).`,
            'error',
          );
          return false;
        }

        const fileName =
          normalizeText(candidate?.fileName ?? candidate?.name) || decodeFileNameFromUri(fileUri) || 'attachment';
        const mimeType =
          normalizeText(candidate?.mimeType ?? candidate?.type) ||
          normalizeText(blob?.type) ||
          'application/octet-stream';
        const type = guessAttachmentType({ mimeType, fileName });
        const content = await blobToBase64(blob);

        return appendPendingAttachmentForGateway(gatewayId, {
          fileName,
          mimeType,
          content,
          type,
          size: blobSize,
        });
      } catch (error) {
        setAttachmentNoticeForGateway(
          gatewayId,
          `Failed to import dropped file: ${String(error?.message ?? error)}`,
          'error',
        );
        return false;
      }
    },
    [appendPendingAttachmentForGateway, setAttachmentNoticeForGateway],
  );

  const handleDroppedFilesForGateway = useCallback(
    (gatewayId, nativeEvent) => {
      const candidates = extractDroppedFileCandidates(nativeEvent);
      if (!Array.isArray(candidates) || candidates.length === 0) {
        setAttachmentNoticeForGateway(gatewayId, 'No file detected from drop.', 'warn');
        return;
      }

      const limited = candidates.slice(0, MAX_ATTACHMENT_COUNT);
      if (candidates.length > MAX_ATTACHMENT_COUNT) {
        setAttachmentNoticeForGateway(
          gatewayId,
          `Only first ${MAX_ATTACHMENT_COUNT} dropped files were considered.`,
          'warn',
        );
      }

      (async () => {
        for (const entry of limited) {
          if (!entry) continue;

          const directAttachment = normalizeAttachmentDraft(entry);
          if (directAttachment) {
            appendPendingAttachmentForGateway(gatewayId, directAttachment);
            continue;
          }

          await importAttachmentFromUriForGateway(gatewayId, entry);
        }
      })().catch(() => {
        // surfaced via notice
      });
    },
    [appendPendingAttachmentForGateway, importAttachmentFromUriForGateway, setAttachmentNoticeForGateway],
  );

  const tryImportFromClipboardShortcut = useCallback(
    (gatewayId) => {
      Clipboard.getString()
        .then((clipboardText) => {
          const uri = normalizeFileUri(clipboardText);
          if (!uri) return;
          return importAttachmentFromUriForGateway(gatewayId, { uri });
        })
        .catch(() => {
          // ignore clipboard failures
        });
    },
    [importAttachmentFromUriForGateway],
  );

  const handleAttachmentPick = useCallback(
    (payload) => {
      const gatewayId = attachmentPickerGatewayId || focusedGatewayId || activeGatewayId;
      if (!gatewayId) {
        setAttachmentPickerGatewayId(null);
        return;
      }

      appendPendingAttachmentForGateway(gatewayId, payload);
      setAttachmentPickerGatewayId(null);
      focusComposerForGateway(gatewayId);
    },
    [
      activeGatewayId,
      attachmentPickerGatewayId,
      appendPendingAttachmentForGateway,
      focusedGatewayId,
      focusComposerForGateway,
    ],
  );

  const insertQuickText = useCallback(
    (gatewayId, snippet) => {
      if (!gatewayId) return;
      const runtime = gatewayRuntimeById[gatewayId] ?? createGatewayRuntime();
      const baseText = String(runtime.composerText ?? '');
      const baseSelection = normalizeComposerSelection(runtime.composerSelection, baseText);
      const result = insertQuickTextAtSelection({
        sourceText: baseText,
        insertText: snippet,
        selectionStart: baseSelection.start,
        selectionEnd: baseSelection.end,
      });
      const activeSessionKeyForGateway = currentSessionKeyForGateway(gatewayId);
      updateGatewayRuntime(gatewayId, (current) => ({
        ...current,
        composerText: result.nextText,
        composerSelection: result.selection,
        composerHeight: estimateComposerHeightFromText(result.nextText),
        composerBySession: {
          ...(current.composerBySession ?? {}),
          [activeSessionKeyForGateway]: {
            text: result.nextText,
            selection: result.selection,
          },
        },
      }));
      setForcedSelectionForGateway(gatewayId, result.selection);
      setImeComposingForGateway(gatewayId, false);
    },
    [
      currentSessionKeyForGateway,
      gatewayRuntimeById,
      setForcedSelectionForGateway,
      setImeComposingForGateway,
      updateGatewayRuntime,
    ],
  );

  const setComposerTextForGateway = useCallback(
    (gatewayId, text) => {
      const activeSessionKeyForGateway = currentSessionKeyForGateway(gatewayId);
      updateGatewayRuntime(gatewayId, (current) => ({
        ...current,
        composerText: text,
        composerHeight: estimateComposerHeightFromText(text),
        composerBySession: {
          ...(current.composerBySession ?? {}),
          [activeSessionKeyForGateway]: {
            text,
            selection: normalizeComposerSelection(current.composerSelection, text),
          },
        },
      }));
    },
    [currentSessionKeyForGateway, updateGatewayRuntime],
  );

  const setComposerSelectionForGateway = useCallback(
    (gatewayId, selection) => {
      const activeSessionKeyForGateway = currentSessionKeyForGateway(gatewayId);
      updateGatewayRuntime(gatewayId, (current) => ({
        ...current,
        composerSelection: selection,
        composerBySession: {
          ...(current.composerBySession ?? {}),
          [activeSessionKeyForGateway]: {
            text: current.composerText,
            selection,
          },
        },
      }));
    },
    [currentSessionKeyForGateway, updateGatewayRuntime],
  );

  const setComposerFocusedForGateway = useCallback(
    (gatewayId, focused) => {
      updateGatewayRuntime(gatewayId, (current) => ({
        ...current,
        isComposerFocused: focused,
      }));
      if (focused) {
        setFocusedGatewayId(gatewayId);
      }
    },
    [updateGatewayRuntime],
  );

  const handleSelectGatewayProfile = useCallback(
    (gatewayId, nextNav = 'settings') => {
      if (!gatewayId) return;
      const profile = gatewayProfiles.find((entry) => entry.id === gatewayId);
      if (!profile) return;
      setAttachmentPickerGatewayId(null);

      if (gatewayId !== activeGatewayId) {
        setActiveGatewayId(profile.id);
        setCollapsedGatewayIds((previous) => ({
          ...previous,
          [profile.id]: false,
        }));
      }
      setQuickMenuOpenForGateway(profile.id, false);
      applyGatewayProfileToEditor(profile);
      setActiveNav(nextNav);
      if (nextNav === 'chat') {
        clearUnreadForSession(profile.id, normalizeSessionKey(profile.sessionKey));
        focusComposerForGateway(profile.id);
      }
    },
    [
      activeGatewayId,
      applyGatewayProfileToEditor,
      clearUnreadForSession,
      focusComposerForGateway,
      gatewayProfiles,
      setQuickMenuOpenForGateway,
    ],
  );

  const handleCreateGatewayProfile = useCallback(() => {
    const nextProfile = createGatewayProfile(
      {
        name: `Gateway ${gatewayProfiles.length + 1}`,
        sessionKey: DEFAULTS.sessionKey,
        sessions: [DEFAULTS.sessionKey],
      },
      gatewayProfiles.length + 1,
    );

    setGatewayProfiles((previous) => [...previous, nextProfile]);
    setActiveGatewayId(nextProfile.id);
    setCollapsedGatewayIds((previous) => ({
      ...previous,
      [nextProfile.id]: false,
    }));
    applyGatewayProfileToEditor(nextProfile);
    setFocusedGatewayId(nextProfile.id);
    setActiveNav('settings');
  }, [applyGatewayProfileToEditor, gatewayProfiles.length]);

  const handleDeleteActiveGatewayProfile = useCallback(() => {
    if (gatewayProfiles.length <= 1) return;

    const nextProfiles = gatewayProfiles.filter((entry) => entry.id !== activeGatewayId);
    const removedProfile = gatewayProfiles.find((entry) => entry.id === activeGatewayId);
    const nextActiveProfile = nextProfiles[0];

    if (!nextActiveProfile) return;

    if (removedProfile) {
      disconnectGateway(removedProfile.id, { manual: false });
      disconnectAndRemoveController(removedProfile.id);
    }

    setGatewayProfiles(nextProfiles);
    setAttachmentPickerGatewayId(null);
    setGatewayRuntimeById((previous) => buildRuntimeMap(nextProfiles, previous));
    setCollapsedGatewayIds((previous) => {
      const next = { ...previous };
      delete next[activeGatewayId];
      return next;
    });
    setActiveGatewayId(nextActiveProfile.id);
    applyGatewayProfileToEditor(nextActiveProfile);

    if (focusedGatewayId === activeGatewayId) {
      setFocusedGatewayId(nextActiveProfile.id);
    }
  }, [
    activeGatewayId,
    applyGatewayProfileToEditor,
    disconnectAndRemoveController,
    disconnectGateway,
    focusedGatewayId,
    gatewayProfiles,
  ]);

  const handleSelectSession = useCallback(
    (gatewayId, nextSessionKey) => {
      const normalizedSessionKey = normalizeSessionKey(nextSessionKey);
      const profile = gatewayProfiles.find((entry) => entry.id === gatewayId);
      const currentSessionForGateway = normalizeSessionKey(profile?.sessionKey);

      updateGatewayRuntime(gatewayId, (current) => {
        const composerBySession = {
          ...(current.composerBySession ?? {}),
          [currentSessionForGateway]: {
            text: current.composerText,
            selection: normalizeComposerSelection(current.composerSelection, current.composerText),
          },
        };
        const attachmentsBySession = {
          ...(current.attachmentsBySession ?? {}),
          [currentSessionForGateway]: Array.isArray(current.pendingAttachments)
            ? current.pendingAttachments
            : [],
        };
        const nextDraft = composerBySession[normalizedSessionKey] ?? {
          text: '',
          selection: { start: 0, end: 0 },
        };
        const nextAttachments = Array.isArray(attachmentsBySession[normalizedSessionKey])
          ? attachmentsBySession[normalizedSessionKey]
          : [];
        const nextSelection = normalizeComposerSelection(nextDraft.selection, nextDraft.text);

        return {
          ...current,
          composerBySession: {
            ...composerBySession,
            [normalizedSessionKey]: {
              text: nextDraft.text,
              selection: nextSelection,
            },
          },
          attachmentsBySession: {
            ...attachmentsBySession,
            [normalizedSessionKey]: nextAttachments,
          },
          composerText: nextDraft.text,
          composerSelection: nextSelection,
          composerHeight: estimateComposerHeightFromText(nextDraft.text),
          pendingAttachments: nextAttachments,
        };
      });

      setGatewayProfiles((previous) =>
        previous.map((entry) => {
          if (entry.id !== gatewayId) return entry;
          return {
            ...entry,
            sessionKey: normalizedSessionKey,
            sessions: mergeSessionKeys([normalizedSessionKey], entry.sessions),
          };
        }),
      );

      if (gatewayId !== activeGatewayId) {
        setActiveGatewayId(gatewayId);
      }
      setSessionKey(normalizedSessionKey);
      setActiveNav('chat');
      setFocusedGatewayId(gatewayId);
      setAttachmentPickerGatewayId(null);
      setQuickMenuOpenForGateway(gatewayId, false);
      setForcedSelectionForGateway(gatewayId, null);
      setImeComposingForGateway(gatewayId, false);
      clearUnreadForSession(gatewayId, normalizedSessionKey);
      focusComposerForGateway(gatewayId);

      const runtime = gatewayRuntimeById[gatewayId];
      const connectionState = runtime?.controllerState?.connectionState ?? 'disconnected';

      if (
        connectionState === 'connected' ||
        connectionState === 'connecting' ||
        connectionState === 'reconnecting'
      ) {
        connectGateway(gatewayId, normalizedSessionKey).catch(() => {
          // Surface via controller banner state.
        });
      }
    },
    [
      activeGatewayId,
      clearUnreadForSession,
      connectGateway,
      focusComposerForGateway,
      gatewayProfiles,
      gatewayRuntimeById,
      setForcedSelectionForGateway,
      setImeComposingForGateway,
      setQuickMenuOpenForGateway,
      updateGatewayRuntime,
    ],
  );

  const handleCreateSession = useCallback(
    (gatewayId) => {
      const nextSessionKey = `session-${Date.now().toString(36)}`;
      handleSelectSession(gatewayId, nextSessionKey);
    },
    [handleSelectSession],
  );

  const applyNotificationRoute = useCallback(
    (route) => {
      const normalizedGatewayId = normalizeText(route?.gatewayId);
      if (!normalizedGatewayId) return false;

      const profile = gatewayProfilesRef.current.find((entry) => entry.id === normalizedGatewayId);
      if (!profile) return false;

      const normalizedSession = normalizeSessionKey(route?.sessionKey ?? profile.sessionKey);
      const signature = normalizeText(route?.signature) || `${normalizedGatewayId}::${normalizedSession}::-`;
      if (lastHandledNotificationRouteSignatureRef.current === signature) {
        return true;
      }

      lastHandledNotificationRouteSignatureRef.current = signature;
      const normalizedTurnId = normalizeText(route?.turnId);
      if (normalizedTurnId) {
        scheduleHistoryTurnFocus(normalizedGatewayId, normalizedTurnId, normalizedSession);
      }
      handleSelectSession(normalizedGatewayId, normalizedSession);
      refreshHistory(normalizedGatewayId).catch(() => {
        // surfaced via banner
      });
      return true;
    },
    [handleSelectSession, refreshHistory, scheduleHistoryTurnFocus],
  );

  const syncNotificationRouteFromSystem = useCallback(async () => {
    if (Platform.OS !== 'macos') return;
    const pushNotificationModule = getPushNotificationModule();
    if (!pushNotificationModule || typeof pushNotificationModule.getInitialNotification !== 'function') {
      return;
    }

    try {
      const payload = await pushNotificationModule.getInitialNotification();
      const route = extractNotificationRoute(payload);
      if (!route) return;

      if (booting || !identityReady) {
        pendingNotificationRouteRef.current = route;
        return;
      }

      const applied = applyNotificationRoute(route);
      if (applied) {
        pendingNotificationRouteRef.current = null;
      } else {
        pendingNotificationRouteRef.current = route;
      }
    } catch {
      // Keep app stable if notification bridge fails.
    }
  }, [applyNotificationRoute, booting, getPushNotificationModule, identityReady]);

  const toggleGatewayCollapse = useCallback((gatewayId) => {
    if (!gatewayId) return;
    setCollapsedGatewayIds((previous) => ({
      ...previous,
      [gatewayId]: !previous[gatewayId],
    }));
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'macos') return undefined;
    syncNotificationRouteFromSystem().catch(() => {
      // Keep app usable without notification routing.
    });

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        syncNotificationRouteFromSystem().catch(() => {
          // noop
        });
      }
    });

    return () => {
      subscription?.remove?.();
    };
  }, [syncNotificationRouteFromSystem]);

  useEffect(() => {
    if (booting || !identityReady) return;
    const pendingRoute = pendingNotificationRouteRef.current;
    if (!pendingRoute) return;

    if (applyNotificationRoute(pendingRoute)) {
      pendingNotificationRouteRef.current = null;
    }
  }, [applyNotificationRoute, booting, gatewayProfiles, identityReady]);

  useEffect(() => {
    gatewayProfiles.forEach((profile) => {
      const runtime = gatewayRuntimeById[profile.id];
      const state = runtime?.controllerState?.connectionState ?? 'disconnected';
      if (state !== 'connected') return;
      refreshKnownSessions(profile.id).catch(() => {
        // ignore
      });
    });
  }, [gatewayProfiles, gatewayRuntimeById, refreshKnownSessions]);

  useEffect(() => {
    if (booting || !identityReady) return;

    gatewayProfiles.forEach((profile) => {
      const runtime = gatewayRuntimeById[profile.id];
      const state = runtime?.controllerState?.connectionState ?? 'disconnected';
      if (state !== 'disconnected') return;

      if (manualDisconnectByIdRef.current[profile.id]) return;

      const url = normalizeText(profile.gatewayUrl);
      const token = normalizeText(profile.authToken);
      if (!url || !token) return;

      const signature = `${url}::${token}::${normalizeSessionKey(profile.sessionKey)}`;
      if (lastAutoConnectSignatureByIdRef.current[profile.id] === signature) return;

      lastAutoConnectSignatureByIdRef.current[profile.id] = signature;
      connectGateway(profile.id).catch(() => {
        // Keep app usable; errors are surfaced via controller banner.
      });
    });
  }, [booting, connectGateway, gatewayProfiles, gatewayRuntimeById, identityReady]);

  useEffect(() => {
    gatewayProfiles.forEach((profile) => {
      const runtime = gatewayRuntimeById[profile.id];
      if (!runtime) return;
      const state = runtime.controllerState ?? INITIAL_CONTROLLER_STATE;
      if (state.isSending) return;
      if ((runtime.sendingAttachmentCount ?? 0) <= 0) return;

      updateGatewayRuntime(profile.id, (current) => ({
        ...current,
        sendingAttachmentCount: 0,
      }));

      const notice = attachmentNoticeByGatewayId[profile.id];
      if (notice?.kind === 'info' && String(notice?.message ?? '').startsWith('Sending ')) {
        setAttachmentNoticeForGateway(profile.id, '');
      }
    });
  }, [
    attachmentNoticeByGatewayId,
    gatewayProfiles,
    gatewayRuntimeById,
    setAttachmentNoticeForGateway,
    updateGatewayRuntime,
  ]);

  useEffect(() => {
    if (activeNav === 'chat') return;
    setDropActiveByGatewayId((previous) => (Object.keys(previous).length === 0 ? previous : {}));
  }, [activeNav]);

  useEffect(() => {
    if (initialAutoNavigationHandledRef.current) return;
    if (booting || !identityReady) return;

    const hasAutoConnectTarget = gatewayProfiles.some((profile) => {
      const url = normalizeText(profile.gatewayUrl);
      const token = normalizeText(profile.authToken);
      return Boolean(url && token);
    });

    if (!hasAutoConnectTarget) {
      initialAutoNavigationHandledRef.current = true;
      return;
    }

    const connectedProfile =
      gatewayProfiles.find((profile) => {
        const state = gatewayRuntimeById[profile.id]?.controllerState?.connectionState;
        return state === 'connected';
      }) ?? null;

    if (connectedProfile) {
      initialAutoNavigationHandledRef.current = true;
      setActiveGatewayId(connectedProfile.id);
      setActiveNav('chat');
      setFocusedGatewayId(connectedProfile.id);
      setCollapsedGatewayIds((previous) => ({
        ...previous,
        [connectedProfile.id]: false,
      }));
      focusComposerForGateway(connectedProfile.id);
      return;
    }

    // Keep waiting until one auto-connect target becomes connected.
    // This avoids finishing too early during initial "all disconnected" frame.
  }, [
    booting,
    focusComposerForGateway,
    gatewayProfiles,
    gatewayRuntimeById,
    identityReady,
  ]);

  useEffect(() => {
    const hasConnectedGateway = gatewayProfiles.some((profile) => {
      const runtime = gatewayRuntimeById[profile.id];
      return runtime?.controllerState?.connectionState === 'connected';
    });
    const hasConnectingGateway = gatewayProfiles.some((profile) => {
      const connectionState = gatewayRuntimeById[profile.id]?.controllerState?.connectionState;
      return connectionState === 'connecting' || connectionState === 'reconnecting';
    });

    if (!hasConnectedGateway && !hasConnectingGateway && activeNav !== 'settings') {
      setActiveNav('settings');
    }
  }, [activeNav, gatewayProfiles, gatewayRuntimeById]);

  useEffect(() => {
    if (activeNav !== 'chat' || !activeProfile?.id) {
      closeAllQuickMenus();
      return;
    }
    focusComposerForGateway(activeProfile.id);
  }, [
    activeNav,
    activeProfile?.id,
    activeProfile?.sessionKey,
    closeAllQuickMenus,
    focusComposerForGateway,
  ]);

  useEffect(() => {
    if (activeNav !== 'chat' || !activeGatewayId) return;
    clearUnreadForSession(activeGatewayId, normalizeSessionKey(sessionKey));
  }, [activeGatewayId, activeNav, clearUnreadForSession, sessionKey]);

  const activeControllerState = activeProfile?.id
    ? gatewayRuntimeById[activeProfile.id]?.controllerState ?? INITIAL_CONTROLLER_STATE
    : null;
  const activeTurnCount = activeControllerState?.turns?.length ?? 0;
  const activeLastUpdatedAt = activeControllerState?.lastUpdatedAt ?? null;
  const activeIsSending = activeControllerState?.isSending ?? false;
  const activeIsSyncing = activeControllerState?.isSyncing ?? false;
  const activeHistoryBottomInset = activeProfile?.id
    ? historyBottomInsetByGatewayId[activeProfile.id] ?? 0
    : 0;

  useEffect(
    () => () => {
      Object.values(historyScrollRafByGatewayIdRef.current).forEach((pending) => {
        if (pending?.first) {
          cancelAnimationFrame(pending.first);
        }
        if (pending?.second) {
          cancelAnimationFrame(pending.second);
        }
      });
      historyScrollRafByGatewayIdRef.current = {};
      Object.values(historyScrollInteractionByGatewayIdRef.current).forEach((task) => {
        if (task?.cancel) {
          task.cancel();
        }
      });
      historyScrollInteractionByGatewayIdRef.current = {};
      Object.values(historyScrollRetryTimersByGatewayIdRef.current).forEach((timerIds) => {
        if (Array.isArray(timerIds)) {
          timerIds.forEach((timerId) => clearTimeout(timerId));
        }
      });
      historyScrollRetryTimersByGatewayIdRef.current = {};
      Object.values(turnFocusRetryTimersByGatewayIdRef.current).forEach((timerIds) => {
        if (Array.isArray(timerIds)) {
          timerIds.forEach((timerId) => clearTimeout(timerId));
        }
      });
      turnFocusRetryTimersByGatewayIdRef.current = {};
      pendingTurnFocusByGatewayIdRef.current = {};
      Object.values(copiedMessageTimerByKeyRef.current).forEach((timerId) => {
        clearTimeout(timerId);
      });
      copiedMessageTimerByKeyRef.current = {};
      historyContentHeightByGatewayIdRef.current = {};
      historyViewportHeightByGatewayIdRef.current = {};
    },
    [],
  );

  useEffect(() => {
    if (activeNav !== 'chat' || !activeProfile?.id) return;
    recomputeHistoryBottomInsetForGateway(activeProfile.id);
    const pendingTurnFocus = pendingTurnFocusByGatewayIdRef.current[activeProfile.id];
    if (
      pendingTurnFocus &&
      normalizeSessionKey(activeProfile.sessionKey) === normalizeSessionKey(pendingTurnFocus.sessionKey)
    ) {
      scheduleHistoryTurnFocus(
        activeProfile.id,
        pendingTurnFocus.turnId,
        pendingTurnFocus.sessionKey,
      );
      return;
    }
    scheduleHistoryBottomSync(activeProfile.id);
  }, [
    activeNav,
    activeProfile?.id,
    activeProfile?.sessionKey,
    activeTurnCount,
    activeLastUpdatedAt,
    activeIsSending,
    activeIsSyncing,
    activeHistoryBottomInset,
    recomputeHistoryBottomInsetForGateway,
    scheduleHistoryTurnFocus,
    scheduleHistoryBottomSync,
  ]);

  const connectedGatewayIds = useMemo(
    () =>
      gatewayProfiles
        .filter((profile) => {
          const runtime = gatewayRuntimeById[profile.id];
          return runtime?.controllerState?.connectionState === 'connected';
        })
        .map((profile) => profile.id),
    [gatewayProfiles, gatewayRuntimeById],
  );

  const summaryChip = useMemo(() => {
    if (connectedGatewayIds.length > 0) {
      return {
        label: connectedGatewayIds.length === 1 ? '1 Connected' : `${connectedGatewayIds.length} Connected`,
        color: SEMANTIC.green,
        bg: SEMANTIC.greenSoft,
      };
    }

    const hasConnecting = gatewayProfiles.some((profile) => {
      const state = gatewayRuntimeById[profile.id]?.controllerState?.connectionState;
      return state === 'connecting' || state === 'reconnecting';
    });

    if (hasConnecting) {
      return { label: 'Connecting', color: SEMANTIC.amber, bg: SEMANTIC.amberSoft };
    }

    return { label: 'Disconnected', color: '#6b7280', bg: 'rgba(107,114,128,0.12)' };
  }, [connectedGatewayIds.length, gatewayProfiles, gatewayRuntimeById]);

  const handleRootKeyDown = useCallback(
    (event) => {
      const nativeEvent = event?.nativeEvent ?? {};
      const key = String(nativeEvent.key ?? '');
      const hasMeta = Boolean(nativeEvent.metaKey);
      const hasFocusedGateway =
        focusedGatewayId && gatewayProfiles.some((profile) => profile.id === focusedGatewayId);
      const fallbackGatewayId = activeNav === 'chat' ? activeGatewayId : null;
      const focusedTargetGatewayId = hasFocusedGateway ? focusedGatewayId : fallbackGatewayId;

      if (key === 'Escape') {
        if (!focusedTargetGatewayId) return;
        if (quickMenuOpenByGatewayId[focusedTargetGatewayId]) {
          setQuickMenuOpenForGateway(focusedTargetGatewayId, false);
          return;
        }
        const runtime = gatewayRuntimeById[focusedTargetGatewayId];
        const bannerMessage = runtime?.controllerState?.banner?.message;

        if (bannerMessage) {
          const controller = getController(focusedTargetGatewayId);
          controller?.clearBanner();
          return;
        }

        const activeSessionForGateway = currentSessionKeyForGateway(focusedTargetGatewayId);
        updateGatewayRuntime(focusedTargetGatewayId, (current) => ({
          ...current,
          composerText: '',
          composerSelection: { start: 0, end: 0 },
          composerHeight: COMPOSER_MIN_HEIGHT,
          pendingAttachments: [],
          attachmentsBySession: {
            ...(current.attachmentsBySession ?? {}),
            [activeSessionForGateway]: [],
          },
        }));
        return;
      }

      if (hasMeta && key.toLowerCase() === 'r') {
        event?.preventDefault?.();

        if (focusedTargetGatewayId) {
          refreshHistory(focusedTargetGatewayId).catch(() => {
            // surfaced via banner
          });
          return;
        }

        connectedGatewayIds.forEach((gatewayId) => {
          refreshHistory(gatewayId).catch(() => {
            // surfaced via banner
          });
        });
      }
    },
    [
      activeGatewayId,
      activeNav,
      connectedGatewayIds,
      currentSessionKeyForGateway,
      focusedGatewayId,
      gatewayProfiles,
      gatewayRuntimeById,
      getController,
      quickMenuOpenByGatewayId,
      refreshHistory,
      setQuickMenuOpenForGateway,
      updateGatewayRuntime,
    ],
  );

  const renderGatewayCard = useCallback(
    (profile, options = {}) => {
      const runtime = gatewayRuntimeById[profile.id] ?? createGatewayRuntime();
      const controllerState = runtime.controllerState ?? INITIAL_CONTROLLER_STATE;
      const isExpanded = options.expanded === true;

      const isGatewayConnected = controllerState.connectionState === 'connected';
      const isConnecting = controllerState.connectionState === 'connecting';
      const isReconnecting = controllerState.connectionState === 'reconnecting';
      const canDisconnectGateway = controllerState.connectionState !== 'disconnected';
      const statusMeta = statusRowMeta(controllerState, identityPersistWarning, themeTokens);
      const connectionChip = connectionChipFromState(controllerState.connectionState);
      const updatedLabel = formatUpdatedAtLabel(controllerState.lastUpdatedAt);
      const recoveryHint = gatewayRecoveryHint(profile, controllerState);

      const imeComposing = isImeComposingByGatewayIdRef.current[profile.id] === true;
      const forcedSelection = forcedSelectionByGatewayId[profile.id];
      const composerHeight = clampComposerHeight(runtime.composerHeight);
      const composerScrollEnabled = composerHeight >= COMPOSER_MAX_HEIGHT;
      const hasComposerText = normalizeText(runtime.composerText).length > 0;
      const pendingAttachments = Array.isArray(runtime.pendingAttachments)
        ? runtime.pendingAttachments
            .map((entry) => normalizeAttachmentDraft(entry))
            .filter(Boolean)
        : [];
      const hasPendingAttachments = pendingAttachments.length > 0;
      const canSend =
        controllerState.connectionState === 'connected' &&
        !controllerState.isSending &&
        (hasComposerText || hasPendingAttachments) &&
        !imeComposing;
      const isDisconnected = controllerState.connectionState === 'disconnected';
      const quickMenuOpen = quickMenuOpenByGatewayId[profile.id] === true;
      const leftQuickTextValue = normalizeText(quickTextLeft);
      const rightQuickTextValue = normalizeText(quickTextRight);
      const canInsertLeftQuick = leftQuickTextValue.length > 0;
      const canInsertRightQuick = rightQuickTextValue.length > 0;
      const sendDisabledReason =
        controllerState.connectionState !== 'connected'
          ? isReconnecting
            ? 'Reconnecting... You can reconnect manually.'
            : isConnecting
              ? 'Connecting... Please wait before sending.'
              : 'Connect to send messages'
          : imeComposing
          ? 'Finish text composition to send'
          : hasComposerText || hasPendingAttachments
            ? 'Sending is temporarily unavailable'
            : 'Type a message or attach a file';
      const dropActive = dropActiveByGatewayId[profile.id] === true;
      const sendingAttachmentCount = Number(runtime.sendingAttachmentCount ?? 0);
      const attachmentNotice = attachmentNoticeByGatewayId[profile.id] ?? null;
      const attachmentStatusMessage =
        controllerState.isSending && sendingAttachmentCount > 0
          ? `Uploading ${sendingAttachmentCount} attachment${sendingAttachmentCount > 1 ? 's' : ''}...`
          : dropActive
            ? 'Drop file(s) to attach'
            : attachmentNotice?.message ?? '';
      const attachmentStatusColor =
        controllerState.isSending && sendingAttachmentCount > 0
          ? SEMANTIC.blue
          : attachmentNotice?.kind === 'error'
            ? SEMANTIC.red
            : attachmentNotice?.kind === 'warn'
              ? SEMANTIC.amber
              : attachmentNotice?.kind === 'success'
                ? SEMANTIC.green
                : themeTokens.textMuted;
      const composerStatusMessage = attachmentStatusMessage
        ? attachmentStatusMessage
        : controllerState.connectionState !== 'connected'
          ? isReconnecting
            ? 'Reconnecting... You can reconnect manually.'
            : isConnecting
              ? 'Connecting...'
              : 'Connect to send'
          : imeComposing
            ? 'Composing text...'
            : controllerState.isSending
              ? 'Sending...'
              : 'Ready';
      const composerStatusColor = attachmentStatusMessage
        ? attachmentStatusColor
        : isDisconnected
          ? themeTokens.textMuted
          : isConnecting || isReconnecting || imeComposing || controllerState.isSending
            ? SEMANTIC.amber
            : themeTokens.textMuted;

      const historyItems = groupTurnsByDate(controllerState.turns ?? []);
      const previewItems = isExpanded ? historyItems : historyItems.slice(-8);
      let lastTurnId = '';
      for (let index = previewItems.length - 1; index >= 0; index -= 1) {
        if (previewItems[index]?.kind === 'turn') {
          lastTurnId = String(previewItems[index]?.id ?? '');
          break;
        }
      }
      const historyBottomInset = isExpanded ? historyBottomInsetByGatewayId[profile.id] ?? 24 : 0;
      const pendingTurnFocus = pendingTurnFocusByGatewayIdRef.current[profile.id];
      const hasPendingTurnFocus =
        Boolean(pendingTurnFocus?.turnId) &&
        normalizeSessionKey(profile.sessionKey) === normalizeSessionKey(pendingTurnFocus?.sessionKey);
      const triggerHistorySync = () => {
        if (!isExpanded) return;
        if (hasPendingTurnFocus) {
          scheduleHistoryTurnFocus(profile.id, pendingTurnFocus.turnId, pendingTurnFocus.sessionKey);
          return;
        }
        scheduleHistoryBottomSync(profile.id);
      };
      const triggerSendFromComposer = (source = 'manual') => {
        if (source === 'keydown') {
          skipSubmitEditingByGatewayIdRef.current[profile.id] = true;
        }
        setQuickMenuOpenForGateway(profile.id, false);
        sendMessage(profile.id).catch(() => {
          // surfaced via banner
        });
      };
      const handleComposerDragEnter = () => {
        setDropActiveByGatewayId((previous) => ({ ...previous, [profile.id]: true }));
      };
      const handleComposerDragLeave = () => {
        setDropActiveByGatewayId((previous) => {
          if (!previous[profile.id]) return previous;
          const next = { ...previous };
          delete next[profile.id];
          return next;
        });
      };
      const handleComposerDrop = (event) => {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        handleComposerDragLeave();
        handleDroppedFilesForGateway(profile.id, event?.nativeEvent ?? event);
        focusComposerForGateway(profile.id);
      };

      return (
        <View
          key={profile.id}
          style={[
            styles.gatewayCard,
            isExpanded && styles.gatewayCardExpanded,
            {
              backgroundColor: themeTokens.card,
              borderColor: themeTokens.inputBorder,
            },
          ]}
        >
          <View style={styles.gatewayCardHeader}>
            <View style={styles.gatewayCardMeta}>
              <Text style={[styles.gatewayCardName, { color: themeTokens.textPrimary }]}>
                {profile.name || 'Unnamed Gateway'}
              </Text>
            </View>
            <View style={[styles.connectionChip, { backgroundColor: connectionChip.bg }]}>
              <View style={[styles.connectionChipDot, { backgroundColor: connectionChip.color }]} />
              <Text style={[styles.connectionChipText, { color: connectionChip.color }]}> 
                {connectionChip.label}
              </Text>
            </View>
          </View>

          <View style={styles.gatewayCardActions}>
            <Pressable
              style={[
                styles.inlineAction,
                {
                  backgroundColor:
                    controllerState.connectionState === 'connected' && !controllerState.isSyncing
                      ? themeTokens.card
                      : themeTokens.input,
                  borderColor: themeTokens.inputBorder,
                },
              ]}
              disabled={controllerState.connectionState !== 'connected' || controllerState.isSyncing}
              accessibilityRole="button"
              accessibilityLabel="Sync history"
              accessibilityHint="Reloads messages for the current session without reconnecting."
              onPress={() => {
                setQuickMenuOpenForGateway(profile.id, false);
                refreshHistory(profile.id).catch(() => {
                  // surfaced via banner
                });
              }}
            >
              <Text
                numberOfLines={1}
                style={[
                  styles.inlineActionText,
                  {
                    color:
                      controllerState.connectionState === 'connected' && !controllerState.isSyncing
                        ? themeTokens.textSecondary
                        : themeTokens.textDisabled,
                  },
                ]}
              >
                ↻ Sync
              </Text>
            </Pressable>

            <Pressable
              style={[
                styles.inlinePrimary,
                {
                  backgroundColor: SEMANTIC.blue,
                  opacity: !identityReady || isConnecting ? 0.5 : 1,
                },
              ]}
              disabled={!identityReady || isConnecting}
              accessibilityRole="button"
              accessibilityLabel={isGatewayConnected || isReconnecting ? 'Reconnect gateway' : 'Connect gateway'}
              accessibilityHint={
                isGatewayConnected || isReconnecting
                  ? 'Restarts the gateway connection. Use this after changing URL, token, or session.'
                  : 'Starts a gateway connection with the current settings.'
              }
              onPress={() => {
                setQuickMenuOpenForGateway(profile.id, false);
                connectGateway(profile.id).catch(() => {
                  // surfaced via banner
                });
              }}
            >
              <Text style={styles.inlinePrimaryText} numberOfLines={1}>
                {isGatewayConnected || isReconnecting ? '⇄ Reconnect' : '◎ Connect'}
              </Text>
            </Pressable>

            <Pressable
              style={[
                styles.inlineAction,
                {
                  backgroundColor: themeTokens.card,
                  borderColor: themeTokens.inputBorder,
                  opacity: canDisconnectGateway ? 1 : 0.65,
                },
              ]}
              disabled={!canDisconnectGateway}
              accessibilityRole="button"
              accessibilityLabel="Disconnect gateway"
              accessibilityHint="Stops the gateway connection immediately."
              onPress={() => {
                setQuickMenuOpenForGateway(profile.id, false);
                disconnectGateway(profile.id);
              }}
            >
              <Text
                numberOfLines={1}
                style={[
                  styles.inlineActionText,
                  { color: canDisconnectGateway ? themeTokens.textSecondary : themeTokens.textDisabled },
                ]}
              >
                ⏻ Disconnect
              </Text>
            </Pressable>
          </View>
          <Text style={[styles.gatewayActionHint, { color: themeTokens.textMuted }]}>
            Sync reloads history. Reconnect restarts the connection.
          </Text>
          {recoveryHint ? (
            <Text
              style={[
                styles.gatewayRecoveryHint,
                {
                  color:
                    controllerState.connectionState === 'reconnecting'
                      ? SEMANTIC.amber
                      : themeTokens.textSecondary,
                },
              ]}
            >
              {recoveryHint}
            </Text>
          ) : null}

          <View style={styles.gatewayStatusRow}>
            <View
              style={[
                styles.statusRow,
                {
                  backgroundColor: statusMeta.tone.bg,
                  borderColor: statusMeta.tone.border,
                },
              ]}
            >
              {statusMeta.spinning ? (
                <ActivityIndicator size="small" color={statusMeta.tone.color} />
              ) : (
                <View style={[styles.statusStaticDot, { backgroundColor: statusMeta.tone.color }]} />
              )}
              <Text style={[styles.statusRowText, { color: statusMeta.tone.color }]} numberOfLines={1}>
                {statusMeta.message}
              </Text>
            </View>
            <Text style={[styles.updatedText, { color: themeTokens.textMuted }]}>{updatedLabel || '-'}</Text>
          </View>

          <View
            style={[
              styles.gatewayHistoryPreview,
              !isExpanded && styles.gatewayHistoryPreviewCompact,
              isExpanded && styles.gatewayHistoryPreviewExpanded,
              {
                backgroundColor: themeTokens.input,
                borderColor: themeTokens.inputBorder,
              },
            ]}
            onLayout={() => {
              if (!isExpanded) return;
              recomputeHistoryBottomInsetForGateway(profile.id);
              triggerHistorySync();
            }}
          >
            {previewItems.length === 0 ? (
              <View style={styles.emptyWrapCompact}>
                <View style={[styles.emptyIcon, { backgroundColor: themeTokens.emptyIconBg }]}> 
                  <Text style={[styles.emptyIconText, { color: SEMANTIC.blue }]}>OC</Text>
                </View>
                <Text style={[styles.emptyDescription, { color: themeTokens.textMuted }]}>No messages yet.</Text>
              </View>
            ) : (
              <FlatList
                ref={(node) => {
                  if (node) {
                    historyScrollRefs.current.set(profile.id, node);
                    if (isExpanded) {
                      triggerHistorySync();
                    }
                  } else {
                    historyScrollRefs.current.delete(profile.id);
                  }
                }}
                data={previewItems}
                style={styles.gatewayHistoryScroll}
                onLayout={(event) => {
                  if (!isExpanded) return;
                  const height = Math.ceil(event?.nativeEvent?.layout?.height ?? 0);
                  if (!Number.isFinite(height) || height <= 0) return;
                  historyViewportHeightByGatewayIdRef.current[profile.id] = height;
                  triggerHistorySync();
                }}
                keyExtractor={(item) => `${profile.id}:${item.id}`}
                renderItem={({ item }) => {
                  if (item.kind === 'date') {
                    return <DateRow label={item.label} themeTokens={themeTokens} />;
                  }

                  const messageCopyKey = `${profile.id}:${item.id}:assistant`;
                  return (
                    <TurnRow
                      turn={item.turn}
                      themeTokens={themeTokens}
                      onOpenExternalLink={handleOpenExternalLink}
                      copyKey={`${profile.id}:${item.id}`}
                      copied={copiedMessageByKey[messageCopyKey] === true}
                      onCopyMessage={handleCopyMessage}
                      onAssistantHeightChange={
                        isExpanded
                          ? () => {
                              triggerHistorySync();
                            }
                          : undefined
                      }
                      onLayout={
                        isExpanded && String(item.id) === lastTurnId
                          ? () => {
                              triggerHistorySync();
                            }
                          : undefined
                      }
                      onTailLayout={
                        isExpanded && String(item.id) === lastTurnId
                          ? () => {
                              triggerHistorySync();
                            }
                          : undefined
                      }
                    />
                  );
                }}
                contentContainerStyle={[
                  styles.gatewayHistoryScrollContent,
                  isExpanded && styles.gatewayHistoryScrollContentExpanded,
                ]}
                showsVerticalScrollIndicator
                keyboardShouldPersistTaps="handled"
                removeClippedSubviews={false}
                initialNumToRender={isExpanded ? Math.min(24, previewItems.length) : previewItems.length}
                maxToRenderPerBatch={isExpanded ? 24 : previewItems.length}
                windowSize={isExpanded ? 7 : 3}
                onContentSizeChange={(_width, height) => {
                  if (!isExpanded) return;
                  const normalizedHeight = Math.ceil(height ?? 0);
                  if (Number.isFinite(normalizedHeight) && normalizedHeight > 0) {
                    historyContentHeightByGatewayIdRef.current[profile.id] = normalizedHeight;
                  }
                  triggerHistorySync();
                }}
                onScrollToIndexFailed={(info) => {
                  if (!isExpanded) return;
                  const scrollNode = historyScrollRefs.current.get(profile.id);
                  const approxOffset = Math.max(0, (info?.averageItemLength ?? 64) * (info?.index ?? 0));
                  scrollNode?.scrollToOffset?.({ offset: approxOffset, animated: false });
                  if (hasPendingTurnFocus) {
                    scheduleHistoryTurnFocus(profile.id, pendingTurnFocus.turnId, pendingTurnFocus.sessionKey);
                  }
                }}
                ListFooterComponent={isExpanded ? <View style={{ height: historyBottomInset }} /> : null}
              />
            )}
          </View>

          {hasPendingAttachments ? (
            <View style={styles.attachmentSection}>
              <View style={styles.attachmentSectionHeader}>
                <Text style={[styles.attachmentSectionTitle, { color: themeTokens.textMuted }]}>
                  {pendingAttachments.length} attachment{pendingAttachments.length > 1 ? 's' : ''}
                </Text>
                <Pressable
                  style={[styles.attachmentClearButton, { borderColor: themeTokens.inputBorder }]}
                  onPress={() => clearPendingAttachmentsForGateway(profile.id)}
                  accessibilityRole="button"
                  accessibilityLabel="Clear all attachments"
                >
                  <Text style={[styles.attachmentClearButtonText, { color: themeTokens.textSecondary }]}>
                    Clear all
                  </Text>
                </Pressable>
              </View>
              <ScrollView
                horizontal
                style={styles.attachmentList}
                contentContainerStyle={styles.attachmentListContent}
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {pendingAttachments.map((attachment) => (
                  <View
                    key={attachment.id}
                    style={[
                      styles.attachmentChip,
                      {
                        backgroundColor: themeTokens.card,
                        borderColor: themeTokens.inputBorder,
                      },
                    ]}
                  >
                    {attachment.type === 'image' ? (
                      <Image
                        source={{ uri: `data:${attachment.mimeType};base64,${attachment.content}` }}
                        style={styles.attachmentChipPreview}
                      />
                    ) : null}
                    <Text style={[styles.attachmentChipType, { color: themeTokens.textSecondary }]}>
                      {attachment.type === 'image' ? 'IMG' : 'FILE'}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={[styles.attachmentChipName, { color: themeTokens.textSecondary }]}
                    >
                      {attachment.fileName}
                    </Text>
                    <Text style={[styles.attachmentChipSize, { color: themeTokens.textMuted }]}>
                      {bytesLabel(Number(attachment.size ?? 0))}
                    </Text>
                    <Pressable
                      onPress={() => removePendingAttachmentForGateway(profile.id, attachment.id)}
                      style={styles.attachmentChipRemove}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${attachmentLabel(attachment)}`}
                    >
                      <Text style={[styles.attachmentChipRemoveText, { color: themeTokens.textMuted }]}>
                        x
                      </Text>
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            </View>
          ) : null}

          {quickMenuOpen ? (
            <Pressable
              style={styles.quickMenuBackdrop}
              onPress={() => setQuickMenuOpenForGateway(profile.id, false)}
              accessibilityLabel="Close quick text menu"
            />
          ) : null}

          <View
            style={[
              styles.gatewayComposerRow,
              {
                borderColor: themeTokens.inputBorder,
                backgroundColor: themeTokens.input,
              },
              quickMenuOpen && styles.gatewayComposerRowRaised,
              dropActive && [
                styles.gatewayComposerRowDropActive,
                {
                  borderColor: themeTokens.inputBorderFocus,
                  backgroundColor: themeTokens.sideActiveBg,
                },
              ],
            ]}
            onDragEnter={handleComposerDragEnter}
            onDragOver={(event) => {
              event?.preventDefault?.();
              event?.stopPropagation?.();
              handleComposerDragEnter();
            }}
            onDragLeave={handleComposerDragLeave}
            onDrop={handleComposerDrop}
            onLayout={(event) => {
              if (!isExpanded) return;
              const height = Math.ceil(event?.nativeEvent?.layout?.height ?? 0);
              if (!Number.isFinite(height) || height <= 0) return;
              if (composerHeightByGatewayIdRef.current[profile.id] === height) return;
              composerHeightByGatewayIdRef.current[profile.id] = height;
              recomputeHistoryBottomInsetForGateway(profile.id);
              triggerHistorySync();
            }}
          >

            <TextInput
              ref={(node) => {
                if (node) {
                  composerInputRefs.current.set(profile.id, node);
                } else {
                  composerInputRefs.current.delete(profile.id);
                }
              }}
              style={[
                styles.composerField,
                {
                  backgroundColor: themeTokens.card,
                  borderColor: runtime.isComposerFocused
                    ? themeTokens.inputBorderFocus
                    : themeTokens.inputBorder,
                  color: themeTokens.textPrimary,
                  height: composerHeight,
                  fontStyle: 'normal',
                },
              ]}
              value={runtime.composerText}
              onChangeText={(nextText) => {
                if (forcedSelectionByGatewayIdRef.current[profile.id]) {
                  setForcedSelectionForGateway(profile.id, null);
                }
                setComposerTextForGateway(profile.id, nextText);
              }}
              onSelectionChange={(event) => {
                const next = event?.nativeEvent?.selection;
                if (next && typeof next.start === 'number' && typeof next.end === 'number') {
                  const normalized = normalizeComposerSelection(next, runtime.composerText);
                  setComposerSelectionForGateway(profile.id, normalized);
                  if (forcedSelectionByGatewayIdRef.current[profile.id]) {
                    setForcedSelectionForGateway(profile.id, null);
                  }
                }
              }}
              {...(forcedSelection ? { selection: forcedSelection } : {})}
              onFocus={() => {
                setComposerFocusedForGateway(profile.id, true);
                setQuickMenuOpenForGateway(profile.id, false);
              }}
              onBlur={() => {
                setComposerFocusedForGateway(profile.id, false);
                setForcedSelectionForGateway(profile.id, null);
                setImeComposingForGateway(profile.id, false);
                delete skipSubmitEditingByGatewayIdRef.current[profile.id];
              }}
              onKeyDown={(event) => {
                const nativeEvent = event?.nativeEvent ?? {};
                const key = String(nativeEvent.key ?? '');
                const hasMeta = Boolean(nativeEvent.metaKey);
                const hasCtrl = Boolean(nativeEvent.ctrlKey);
                const hasAlt = Boolean(nativeEvent.altKey);
                const hasShift = Boolean(nativeEvent.shiftKey);
                const hasModifier = hasMeta || hasCtrl || hasAlt || hasShift;
                const lowerKey = key.toLowerCase();
                const isEnter = key === 'Enter' || nativeEvent.keyCode === 13;
                const isComposingEvent =
                  nativeEvent.isComposing === true ||
                  nativeEvent.keyCode === 229 ||
                  key === 'Process';
                const isPasteShortcut =
                  (hasMeta || hasCtrl) && !hasAlt && !hasShift && lowerKey === 'v';

                if (isComposingEvent) {
                  setImeComposingForGateway(profile.id, true);
                  return;
                }

                if (isPasteShortcut) {
                  tryImportFromClipboardShortcut(profile.id);
                }

                const imeComposing = isImeComposingByGatewayIdRef.current[profile.id] === true;

                if (!isEnter && imeComposing) {
                  if (!hasShift && key !== 'Shift') {
                    setImeComposingForGateway(profile.id, false);
                  }
                  return;
                }

                if (isEnter && !hasModifier) {
                  if (imeComposing) {
                    setImeComposingForGateway(profile.id, false);
                    return;
                  }
                  event?.preventDefault?.();
                  event?.stopPropagation?.();
                  triggerSendFromComposer('keydown');
                  return;
                }

                if (isEnter && !hasAlt && !hasShift && (hasMeta || hasCtrl)) {
                  if (imeComposing) {
                    setImeComposingForGateway(profile.id, false);
                    return;
                  }
                  event?.preventDefault?.();
                  event?.stopPropagation?.();
                  triggerSendFromComposer('keydown');
                }
              }}
              onPaste={(event) => {
                const dropped = extractDroppedFileCandidates(event?.nativeEvent ?? event);
                if (!Array.isArray(dropped) || dropped.length === 0) return;
                event?.preventDefault?.();
                event?.stopPropagation?.();
                handleDroppedFilesForGateway(profile.id, event?.nativeEvent ?? event);
              }}
              onSubmitEditing={(event) => {
                if (skipSubmitEditingByGatewayIdRef.current[profile.id]) {
                  delete skipSubmitEditingByGatewayIdRef.current[profile.id];
                  return;
                }
                if (event?.nativeEvent?.isComposing === true) return;
              }}
              onContentSizeChange={(event) => {
                const contentHeight = Number(event?.nativeEvent?.contentSize?.height ?? 0);
                if (!Number.isFinite(contentHeight) || contentHeight <= 0) return;
                const nextComposerHeight = clampComposerHeight(contentHeight + COMPOSER_VERTICAL_PADDING);
                if (nextComposerHeight === composerHeight) return;
                updateGatewayRuntime(profile.id, (current) => ({
                  ...current,
                  composerHeight: nextComposerHeight,
                }));
                recomputeHistoryBottomInsetForGateway(profile.id);
                triggerHistorySync();
              }}
              autoCorrect
              spellCheck={false}
              blurOnSubmit={false}
              multiline
              numberOfLines={COMPOSER_MIN_LINES}
              placeholder={controllerState.isSending ? 'Waiting for response...' : 'Type a message...'}
              placeholderTextColor={themeTokens.placeholder}
              selectionColor={themeTokens.inputCaret}
              cursorColor={themeTokens.inputCaret}
              keyboardAppearance={theme === 'dark' ? 'dark' : 'light'}
              editable={!controllerState.isSending}
              scrollEnabled={composerScrollEnabled}
            />

            <Pressable
              style={[
                styles.quickMenuTrigger,
                {
                  backgroundColor: themeTokens.card,
                  borderColor: themeTokens.inputBorder,
                  opacity: controllerState.isSending ? 0.65 : 1,
                },
              ]}
              disabled={controllerState.isSending}
              onPress={() => {
                setFocusedGatewayId(profile.id);
                setQuickMenuOpenForGateway(profile.id, false);
                setAttachmentPickerGatewayId(profile.id);
              }}
              accessibilityLabel="Attach file or image"
              accessibilityHint="Attach files or images to the current message."
            >
              <Text style={[styles.quickMenuIconText, { color: themeTokens.textSecondary }]}>📎</Text>
            </Pressable>

            <Pressable
              style={[
                styles.quickMenuTrigger,
                {
                  backgroundColor: themeTokens.card,
                  borderColor: themeTokens.inputBorder,
                },
              ]}
              onPress={() => {
                setFocusedGatewayId(profile.id);
                setQuickMenuOpenForGateway(profile.id, !quickMenuOpen);
              }}
              accessibilityLabel="Open quick text menu"
              accessibilityHint="Insert saved quick text at the current cursor position."
            >
              <Text style={[styles.quickMenuIconText, { color: themeTokens.textSecondary }]}>⚡</Text>
            </Pressable>

            {quickMenuOpen ? (
              <View
                style={[
                  styles.quickMenuPanel,
                  {
                    backgroundColor: themeTokens.card,
                    borderColor: themeTokens.inputBorder,
                  },
                ]}
              >
                <Pressable
                  style={[
                    styles.quickMenuItem,
                    (!canInsertLeftQuick || controllerState.isSending) && styles.quickMenuItemDisabled,
                    { backgroundColor: themeTokens.card },
                  ]}
                  disabled={!canInsertLeftQuick || controllerState.isSending}
                  onPress={() => {
                    insertQuickText(profile.id, leftQuickTextValue);
                    setQuickMenuOpenForGateway(profile.id, false);
                    focusComposerForGateway(profile.id);
                  }}
                >
                  <Text
                    style={[
                      styles.quickMenuItemTitle,
                      {
                        color:
                          canInsertLeftQuick && !controllerState.isSending
                            ? themeTokens.textSecondary
                            : themeTokens.textDisabled,
                      },
                    ]}
                  >
                    Left
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.quickMenuItemValue,
                      {
                        color:
                          canInsertLeftQuick && !controllerState.isSending
                            ? themeTokens.textMuted
                            : themeTokens.textDisabled,
                      },
                    ]}
                  >
                    {compactQuickTextLabel(leftQuickTextValue)}
                  </Text>
                </Pressable>

                <Pressable
                  style={[
                    styles.quickMenuItem,
                    (!canInsertRightQuick || controllerState.isSending) && styles.quickMenuItemDisabled,
                    { backgroundColor: themeTokens.card },
                  ]}
                  disabled={!canInsertRightQuick || controllerState.isSending}
                  onPress={() => {
                    insertQuickText(profile.id, rightQuickTextValue);
                    setQuickMenuOpenForGateway(profile.id, false);
                    focusComposerForGateway(profile.id);
                  }}
                >
                  <Text
                    style={[
                      styles.quickMenuItemTitle,
                      {
                        color:
                          canInsertRightQuick && !controllerState.isSending
                            ? themeTokens.textSecondary
                            : themeTokens.textDisabled,
                      },
                    ]}
                  >
                    Right
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.quickMenuItemValue,
                      {
                        color:
                          canInsertRightQuick && !controllerState.isSending
                            ? themeTokens.textMuted
                            : themeTokens.textDisabled,
                      },
                    ]}
                  >
                    {compactQuickTextLabel(rightQuickTextValue)}
                  </Text>
                </Pressable>
              </View>
            ) : null}

            {controllerState.isSending ? (
              <View
                style={[
                  styles.actionCircle,
                  styles.actionBusy,
                  { backgroundColor: themeTokens.textDisabled },
                ]}
              >
                <ActivityIndicator size="small" color="#ffffff" />
              </View>
            ) : canSend ? (
              <Pressable
                style={[styles.actionCircle, styles.actionSend]}
                onPress={triggerSendFromComposer}
                accessibilityLabel="Send message"
                accessibilityHint="Sends the current text and attachments."
              >
                <Text style={styles.actionIcon}>{'➤'}</Text>
              </Pressable>
            ) : (
              <Pressable
                style={[styles.actionCircle, styles.actionDisabled, { backgroundColor: themeTokens.input }]}
                disabled
                accessibilityLabel="Send unavailable"
                accessibilityHint={sendDisabledReason}
              >
                <Text style={[styles.actionIcon, { color: themeTokens.textDisabled }]}>{'➤'}</Text>
              </Pressable>
            )}
          </View>

          <View
            style={[styles.kbdHintRowCard, { borderTopColor: themeTokens.dividerStrong }]}
            onLayout={(event) => {
              if (!isExpanded) return;
              const height = Math.ceil(event?.nativeEvent?.layout?.height ?? 0);
              if (!Number.isFinite(height) || height <= 0) return;
              if (hintHeightByGatewayIdRef.current[profile.id] === height) return;
              hintHeightByGatewayIdRef.current[profile.id] = height;
              recomputeHistoryBottomInsetForGateway(profile.id);
              triggerHistorySync();
            }}
          >
            <Text
              numberOfLines={1}
              style={[
                styles.attachmentStatusText,
                {
                  color: composerStatusColor,
                  opacity: 1,
                },
              ]}
            >
              {composerStatusMessage}
            </Text>
            <Text style={[styles.kbdHintText, { color: themeTokens.textMuted }]}>Enter send</Text>
            <Text style={[styles.kbdHintText, { color: themeTokens.textMuted }]}>Shift+Enter newline</Text>
            <Text style={[styles.kbdHintText, { color: themeTokens.textMuted }]}>Cmd+Enter send</Text>
            <Text style={[styles.kbdHintText, { color: themeTokens.textMuted }]}>Cmd+R refresh</Text>
            <Text style={[styles.kbdHintText, { color: themeTokens.textMuted }]}>Esc clear</Text>
          </View>
        </View>
      );
    },
    [
      clearPendingAttachmentsForGateway,
      connectGateway,
      dropActiveByGatewayId,
      copiedMessageByKey,
      disconnectGateway,
      attachmentNoticeByGatewayId,
      forcedSelectionByGatewayId,
      focusComposerForGateway,
      gatewayRuntimeById,
      handleCopyMessage,
      handleDroppedFilesForGateway,
      handleOpenExternalLink,
      historyBottomInsetByGatewayId,
      identityPersistWarning,
      identityReady,
      insertQuickText,
      quickTextLeft,
      quickTextRight,
      refreshHistory,
      removePendingAttachmentForGateway,
      recomputeHistoryBottomInsetForGateway,
      scheduleHistoryBottomSync,
      scheduleHistoryTurnFocus,
      sendMessage,
      setDropActiveByGatewayId,
      setImeComposingForGateway,
      setComposerFocusedForGateway,
      setComposerSelectionForGateway,
      setComposerTextForGateway,
      setFocusedGatewayId,
      setForcedSelectionForGateway,
      setQuickMenuOpenForGateway,
      theme,
      themeTokens,
      tryImportFromClipboardShortcut,
      updateGatewayRuntime,
      quickMenuOpenByGatewayId,
    ],
  );

  const renderSelectedSession = useCallback(() => {
    if (!activeProfile) {
      return (
        <View style={styles.emptyWrap}>
          <Text style={[styles.emptyTitle, { color: themeTokens.textPrimary }]}>No gateways configured.</Text>
          <Text style={[styles.emptyDescription, { color: themeTokens.textMuted }]}>Create a gateway profile in Settings.</Text>
        </View>
      );
    }

    return (
      <View
        style={styles.selectedSessionWrap}
        onLayout={() => {
          if (!activeProfile?.id) return;
          scheduleHistoryBottomSync(activeProfile.id);
        }}
      >
        {renderGatewayCard(activeProfile, { expanded: true })}
      </View>
    );
  }, [activeProfile, renderGatewayCard, scheduleHistoryBottomSync, themeTokens]);

  const renderSettings = useCallback(() => {
    const activeRuntime =
      (activeGatewayId ? gatewayRuntimeById[activeGatewayId] : null) ?? createGatewayRuntime();
    const activeControllerState = activeRuntime.controllerState ?? INITIAL_CONTROLLER_STATE;

    const connectionState = activeControllerState.connectionState;
    const isGatewayConnected = connectionState === 'connected';
    const isConnecting = connectionState === 'connecting';
    const isReconnecting = connectionState === 'reconnecting';
    const canDisconnectGateway = connectionState !== 'disconnected';
    const canDeleteGatewayProfile = gatewayProfiles.length > 1;
    const gatewaySettingsRecoveryHint = gatewayRecoveryHint(
      {
        gatewayUrl,
        authToken,
        sessionKey,
      },
      activeControllerState,
    );

    const focusedRuntime = focusedGatewayId ? gatewayRuntimeById[focusedGatewayId] : null;
    const canInsertQuickText = Boolean(
      focusedGatewayId && focusedRuntime && !focusedRuntime.controllerState.isSending,
    );

    const settingsShadowStyle = null;

    const maskedAuthTokenPreview = authToken.length > 0 ? '●'.repeat(authToken.length) : '';

    return (
      <ScrollView
        style={styles.settingsScroll}
        contentContainerStyle={styles.settingsWrap}
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={[
            styles.settingsCard,
            settingsShadowStyle,
            { backgroundColor: themeTokens.card, borderColor: themeTokens.inputBorder },
          ]}
        >
          <Text style={[styles.settingsTitle, { color: themeTokens.textPrimary }]}>Gateway Profiles</Text>
          <View style={styles.gatewayProfilesList}>
            {gatewayProfiles.map((profile) => {
              const runtime = gatewayRuntimeById[profile.id] ?? createGatewayRuntime();
              const statusChip = connectionChipFromState(runtime.controllerState.connectionState);
              const isActiveProfile = profile.id === activeGatewayId;

              return (
                <Pressable
                  key={profile.id}
                  style={[
                    styles.gatewayProfileItem,
                    {
                      borderColor: isActiveProfile
                        ? themeTokens.inputBorderFocus
                        : themeTokens.inputBorder,
                      backgroundColor: isActiveProfile ? themeTokens.sideActiveBg : themeTokens.input,
                    },
                  ]}
                  onPress={() => handleSelectGatewayProfile(profile.id)}
                >
                  <View style={[styles.gatewayProfileDot, { backgroundColor: statusChip.color }]} />
                  <View style={styles.gatewayProfileMeta}>
                    <Text
                      numberOfLines={1}
                      style={[styles.gatewayProfileName, { color: themeTokens.textPrimary }]}
                    >
                      {profile.name || 'Unnamed Gateway'}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={[styles.gatewayProfileUrl, { color: themeTokens.textMuted }]}
                    >
                      {profile.gatewayUrl || 'URL not set'}
                    </Text>
                  </View>
                  <Text style={[styles.gatewayProfileActiveTag, { color: statusChip.color }]}>
                    {statusChip.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.settingsActionsRow}>
            <Pressable
              style={[
                styles.secondaryAction,
                { borderColor: themeTokens.inputBorder, backgroundColor: themeTokens.card },
              ]}
              onPress={handleCreateGatewayProfile}
            >
              <Text style={[styles.secondaryActionText, { color: themeTokens.textSecondary }]}>+ Add Gateway</Text>
            </Pressable>

            <Pressable
              style={[
                styles.secondaryAction,
                {
                  borderColor: canDeleteGatewayProfile ? 'rgba(220,38,38,0.35)' : themeTokens.inputBorder,
                  backgroundColor: themeTokens.card,
                  opacity: canDeleteGatewayProfile ? 1 : 0.65,
                },
              ]}
              disabled={!canDeleteGatewayProfile}
              onPress={handleDeleteActiveGatewayProfile}
            >
              <Text
                style={[
                  styles.secondaryActionText,
                  {
                    color: canDeleteGatewayProfile ? '#B91C1C' : themeTokens.textDisabled,
                  },
                ]}
              >
                Remove Active
              </Text>
            </Pressable>
          </View>
        </View>

        <View
          style={[
            styles.settingsCard,
            settingsShadowStyle,
            { backgroundColor: themeTokens.card, borderColor: themeTokens.inputBorder },
          ]}
        >
          <Text style={[styles.settingsTitle, { color: themeTokens.textPrimary }]}>Gateway Settings</Text>

          {isGatewayConnected || isReconnecting ? (
            <View
              style={[
                styles.gatewayConnectedHint,
                {
                  backgroundColor: isReconnecting ? SEMANTIC.amberSoft : SEMANTIC.greenSoft,
                  borderColor: isReconnecting ? 'rgba(217,119,6,0.20)' : 'rgba(5,150,105,0.18)',
                },
              ]}
            >
              <View
                style={[
                  styles.gatewayConnectedDot,
                  { backgroundColor: isReconnecting ? SEMANTIC.amber : SEMANTIC.green },
                ]}
              />
              <Text
                style={[
                  styles.gatewayConnectedHintText,
                  { color: isReconnecting ? SEMANTIC.amber : SEMANTIC.green },
                ]}
              >
                {isReconnecting
                  ? 'Reconnecting... You can reconnect manually or disconnect.'
                  : 'Connected. Update values and choose Reconnect to apply changes.'}
              </Text>
            </View>
          ) : null}
          {!isGatewayConnected && !isConnecting && gatewaySettingsRecoveryHint ? (
            <Text style={[styles.settingsRecoveryHint, { color: themeTokens.textSecondary }]}>
              {gatewaySettingsRecoveryHint}
            </Text>
          ) : null}

          <View style={styles.settingsGroup}>
            <Text style={[styles.fieldLabel, { color: themeTokens.textSecondary }]}>Gateway Name</Text>
            <TextInput
              style={[
                styles.settingsInput,
                {
                  backgroundColor: themeTokens.input,
                  borderColor:
                    focusedSettingsInput === 'gateway-name'
                      ? themeTokens.inputBorderFocus
                      : themeTokens.inputBorder,
                  color: themeTokens.textPrimary,
                },
              ]}
              value={gatewayName}
              onChangeText={setGatewayName}
              autoCorrect={false}
              onFocus={() => setFocusedSettingsInput('gateway-name')}
              onBlur={() => setFocusedSettingsInput(null)}
              placeholder="Gateway 1"
              placeholderTextColor={themeTokens.placeholder}
              selectionColor={themeTokens.inputCaret}
              cursorColor={themeTokens.inputCaret}
            />
          </View>

          <View style={styles.settingsGroup}>
            <Text style={[styles.fieldLabel, { color: themeTokens.textSecondary }]}>Gateway URL</Text>
            <TextInput
              style={[
                styles.settingsInput,
                {
                  backgroundColor: themeTokens.input,
                  borderColor:
                    focusedSettingsInput === 'gateway-url'
                      ? themeTokens.inputBorderFocus
                      : themeTokens.inputBorder,
                  color: themeTokens.textPrimary,
                },
              ]}
              value={gatewayUrl}
              onChangeText={setGatewayUrl}
              autoCapitalize="none"
              autoCorrect={false}
              onFocus={() => setFocusedSettingsInput('gateway-url')}
              onBlur={() => setFocusedSettingsInput(null)}
              placeholder="wss://your-gateway.example.com"
              placeholderTextColor={themeTokens.placeholder}
              selectionColor={themeTokens.inputCaret}
              cursorColor={themeTokens.inputCaret}
            />
          </View>

          <View style={styles.settingsGroup}>
            <Text style={[styles.fieldLabel, { color: themeTokens.textSecondary }]}>Token (optional)</Text>
            <View style={styles.tokenInputRow}>
              {isAuthTokenVisible ? (
                <TextInput
                  ref={authTokenInputRef}
                  style={[
                    styles.settingsInput,
                    styles.tokenInputField,
                    {
                      backgroundColor: themeTokens.input,
                      borderColor:
                        focusedSettingsInput === 'auth-token'
                          ? themeTokens.inputBorderFocus
                          : themeTokens.inputBorder,
                      color: themeTokens.textPrimary,
                    },
                  ]}
                  value={authToken}
                  onChangeText={setAuthToken}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="off"
                  onFocus={() => setFocusedSettingsInput('auth-token')}
                  onBlur={() => setFocusedSettingsInput(null)}
                  placeholder="token"
                  placeholderTextColor={themeTokens.placeholder}
                  selectionColor={themeTokens.inputCaret}
                  cursorColor={themeTokens.inputCaret}
                />
              ) : (
                <Pressable
                  style={[
                    styles.settingsInput,
                    styles.tokenInputField,
                    styles.tokenMaskedField,
                    {
                      backgroundColor: themeTokens.input,
                      borderColor:
                        focusedSettingsInput === 'auth-token'
                          ? themeTokens.inputBorderFocus
                          : themeTokens.inputBorder,
                    },
                  ]}
                  onPress={() => {
                    setIsAuthTokenVisible(true);
                    requestAnimationFrame(() => {
                      authTokenInputRef.current?.focus?.();
                    });
                  }}
                >
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.tokenMaskedText,
                      { color: authToken ? themeTokens.textSecondary : themeTokens.placeholder },
                    ]}
                  >
                    {authToken ? maskedAuthTokenPreview : 'token'}
                  </Text>
                </Pressable>
              )}

              <Pressable
                style={[
                  styles.tokenVisibilityButton,
                  { backgroundColor: themeTokens.card, borderColor: themeTokens.inputBorder },
                ]}
                accessibilityRole="button"
                accessibilityLabel={isAuthTokenVisible ? 'Hide token' : 'Show token'}
                onPress={() => {
                  setIsAuthTokenVisible((previous) => {
                    const next = !previous;
                    if (!next) {
                      authTokenInputRef.current?.blur?.();
                      setFocusedSettingsInput(null);
                    } else {
                      requestAnimationFrame(() => {
                        authTokenInputRef.current?.focus?.();
                      });
                    }
                    return next;
                  });
                }}
              >
                <EyeIcon visible={isAuthTokenVisible} color={themeTokens.textSecondary} />
              </Pressable>
            </View>
          </View>

          <View style={styles.settingsGroup}>
            <Text style={[styles.fieldLabel, { color: themeTokens.textSecondary }]}>Session Key</Text>
            <TextInput
              style={[
                styles.settingsInput,
                {
                  backgroundColor: themeTokens.input,
                  borderColor:
                    focusedSettingsInput === 'session-key'
                      ? themeTokens.inputBorderFocus
                      : themeTokens.inputBorder,
                  color: themeTokens.textPrimary,
                },
              ]}
              value={sessionKey}
              onChangeText={setSessionKey}
              autoCapitalize="none"
              autoCorrect={false}
              onFocus={() => setFocusedSettingsInput('session-key')}
              onBlur={() => setFocusedSettingsInput(null)}
              placeholder="main"
              placeholderTextColor={themeTokens.placeholder}
              selectionColor={themeTokens.inputCaret}
              cursorColor={themeTokens.inputCaret}
            />
          </View>

          <View style={styles.settingsActionsRow}>
            <Pressable
              style={[
                styles.primaryAction,
                {
                  backgroundColor: SEMANTIC.blue,
                  opacity: !identityReady || isConnecting ? 0.5 : 1,
                },
              ]}
              disabled={!identityReady || isConnecting}
              accessibilityRole="button"
              accessibilityLabel={isGatewayConnected || isReconnecting ? 'Reconnect gateway' : 'Connect gateway'}
              onPress={() => {
                if (!activeGatewayId) return;
                connectGateway(activeGatewayId).catch(() => {
                  // Surface via controller banner state.
                });
              }}
            >
              <Text style={styles.primaryActionText}>
                {isGatewayConnected || isReconnecting ? 'Reconnect' : 'Connect'}
              </Text>
            </Pressable>

            <Pressable
              style={[
                styles.secondaryAction,
                {
                  borderColor: themeTokens.inputBorder,
                  backgroundColor: themeTokens.card,
                  opacity: canDisconnectGateway ? 1 : 0.65,
                },
              ]}
              disabled={!canDisconnectGateway}
              accessibilityRole="button"
              accessibilityLabel="Disconnect gateway"
              onPress={() => {
                if (!activeGatewayId) return;
                disconnectGateway(activeGatewayId);
              }}
            >
              <Text
                style={[
                  styles.secondaryActionText,
                  { color: canDisconnectGateway ? themeTokens.textSecondary : themeTokens.textDisabled },
                ]}
              >
                Disconnect
              </Text>
            </Pressable>
          </View>
        </View>

        <View
          style={[
            styles.settingsCard,
            settingsShadowStyle,
            { backgroundColor: themeTokens.card, borderColor: themeTokens.inputBorder },
          ]}
        >
          <Text style={[styles.settingsTitle, { color: themeTokens.textPrimary }]}>Notifications</Text>
          <Pressable
            style={[
              styles.notificationRow,
              {
                borderColor: themeTokens.inputBorder,
                backgroundColor: themeTokens.input,
              },
            ]}
            onPress={toggleNotificationsEnabled}
          >
            <View style={styles.notificationRowTextWrap}>
              <Text style={[styles.notificationRowTitle, { color: themeTokens.textPrimary }]}>
                Enable notifications
              </Text>
              <Text style={[styles.notificationRowDescription, { color: themeTokens.textMuted }]}>
                Show new assistant replies for connected gateways.
              </Text>
            </View>
            <View
              style={[
                styles.notificationToggleTrack,
                {
                  backgroundColor: notificationSettings.enabled ? SEMANTIC.green : themeTokens.card,
                  borderColor: themeTokens.inputBorder,
                },
              ]}
            >
              <View
                style={[
                  styles.notificationToggleThumb,
                  {
                    backgroundColor: notificationSettings.enabled ? '#ffffff' : themeTokens.textDisabled,
                    transform: [{ translateX: notificationSettings.enabled ? 14 : 0 }],
                  },
                ]}
              />
            </View>
          </Pressable>

          <Pressable
            style={[
              styles.notificationRow,
              {
                borderColor: themeTokens.inputBorder,
                backgroundColor: themeTokens.input,
                opacity: notificationSettings.enabled ? 1 : 0.7,
              },
            ]}
            onPress={toggleMuteForegroundNotifications}
            disabled={!notificationSettings.enabled}
          >
            <View style={styles.notificationRowTextWrap}>
              <Text
                style={[
                  styles.notificationRowTitle,
                  {
                    color: notificationSettings.enabled
                      ? themeTokens.textPrimary
                      : themeTokens.textDisabled,
                  },
                ]}
              >
                Mute sound in foreground
              </Text>
              <Text
                style={[
                  styles.notificationRowDescription,
                  {
                    color: notificationSettings.enabled
                      ? themeTokens.textMuted
                      : themeTokens.textDisabled,
                  },
                ]}
              >
                Keep banner only while app is active.
              </Text>
            </View>
            <View
              style={[
                styles.notificationToggleTrack,
                {
                  backgroundColor:
                    notificationSettings.enabled && notificationSettings.muteForeground
                      ? SEMANTIC.green
                      : themeTokens.card,
                  borderColor: themeTokens.inputBorder,
                  opacity: notificationSettings.enabled ? 1 : 0.7,
                },
              ]}
            >
              <View
                style={[
                  styles.notificationToggleThumb,
                  {
                    backgroundColor:
                      notificationSettings.enabled && notificationSettings.muteForeground
                        ? '#ffffff'
                        : themeTokens.textDisabled,
                    transform: [
                      {
                        translateX:
                          notificationSettings.enabled && notificationSettings.muteForeground
                            ? 14
                            : 0,
                      },
                    ],
                  },
                ]}
              />
            </View>
          </Pressable>

          <Text style={[styles.notificationSectionLabel, { color: themeTokens.textSecondary }]}>
            Per gateway
          </Text>
          <View style={styles.notificationGatewayList}>
            {gatewayProfiles.map((profile) => {
              const enabledForGateway = isGatewayNotificationEnabled(profile.id);
              const enabledForToggle = notificationSettings.enabled;
              return (
                <Pressable
                  key={`notification:${profile.id}`}
                  style={[
                    styles.notificationGatewayRow,
                    {
                      borderColor: themeTokens.inputBorder,
                      backgroundColor: themeTokens.input,
                      opacity: enabledForToggle ? 1 : 0.7,
                    },
                  ]}
                  disabled={!enabledForToggle}
                  onPress={() => toggleGatewayNotifications(profile.id)}
                >
                  <View style={styles.notificationGatewayMeta}>
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.notificationGatewayName,
                        {
                          color: enabledForToggle
                            ? themeTokens.textPrimary
                            : themeTokens.textDisabled,
                        },
                      ]}
                    >
                      {profile.name || 'Unnamed Gateway'}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.notificationGatewayUrl,
                        {
                          color: enabledForToggle
                            ? themeTokens.textMuted
                            : themeTokens.textDisabled,
                        },
                      ]}
                    >
                      {profile.gatewayUrl || 'URL not set'}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.notificationToggleTrack,
                      {
                        backgroundColor:
                          enabledForToggle && enabledForGateway ? SEMANTIC.green : themeTokens.card,
                        borderColor: themeTokens.inputBorder,
                        opacity: enabledForToggle ? 1 : 0.7,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.notificationToggleThumb,
                        {
                          backgroundColor:
                            enabledForToggle && enabledForGateway
                              ? '#ffffff'
                              : themeTokens.textDisabled,
                          transform: [{ translateX: enabledForToggle && enabledForGateway ? 14 : 0 }],
                        },
                      ]}
                    />
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View
          style={[
            styles.settingsCard,
            settingsShadowStyle,
            { backgroundColor: themeTokens.card, borderColor: themeTokens.inputBorder },
          ]}
        >
          <Text style={[styles.settingsTitle, { color: themeTokens.textPrimary }]}>Quick Text</Text>

          <View style={styles.settingsGroup}>
            <Text style={[styles.fieldLabel, { color: themeTokens.textSecondary }]}>Left</Text>
            <TextInput
              style={[
                styles.settingsInput,
                {
                  backgroundColor: themeTokens.input,
                  borderColor:
                    focusedSettingsInput === 'quick-left'
                      ? themeTokens.inputBorderFocus
                      : themeTokens.inputBorder,
                  color: themeTokens.textPrimary,
                },
              ]}
              value={quickTextLeft}
              onChangeText={setQuickTextLeft}
              autoCorrect
              onFocus={() => setFocusedSettingsInput('quick-left')}
              onBlur={() => setFocusedSettingsInput(null)}
              placeholder="Quick text for left"
              placeholderTextColor={themeTokens.placeholder}
              selectionColor={themeTokens.inputCaret}
              cursorColor={themeTokens.inputCaret}
            />
          </View>

          <View style={styles.settingsGroup}>
            <Text style={[styles.fieldLabel, { color: themeTokens.textSecondary }]}>Right</Text>
            <TextInput
              style={[
                styles.settingsInput,
                {
                  backgroundColor: themeTokens.input,
                  borderColor:
                    focusedSettingsInput === 'quick-right'
                      ? themeTokens.inputBorderFocus
                      : themeTokens.inputBorder,
                  color: themeTokens.textPrimary,
                },
              ]}
              value={quickTextRight}
              onChangeText={setQuickTextRight}
              autoCorrect
              onFocus={() => setFocusedSettingsInput('quick-right')}
              onBlur={() => setFocusedSettingsInput(null)}
              placeholder="Quick text for right"
              placeholderTextColor={themeTokens.placeholder}
              selectionColor={themeTokens.inputCaret}
              cursorColor={themeTokens.inputCaret}
            />
          </View>

          <View style={styles.settingsInsertRow}>
            <Pressable
              style={[
                styles.insertAction,
                {
                  borderColor: themeTokens.inputBorder,
                  backgroundColor: 'transparent',
                  opacity: canInsertQuickText ? 1 : 0.65,
                },
              ]}
              disabled={!canInsertQuickText}
              accessibilityState={{ disabled: !canInsertQuickText }}
              onPress={() => insertQuickText(focusedGatewayId, quickTextLeft)}
            >
              <Text
                style={[
                  styles.insertActionText,
                  {
                    color: canInsertQuickText ? themeTokens.textMuted : themeTokens.textDisabled,
                  },
                ]}
              >
                Insert Left
              </Text>
            </Pressable>

            <Pressable
              style={[
                styles.insertAction,
                {
                  borderColor: themeTokens.inputBorder,
                  backgroundColor: 'transparent',
                  opacity: canInsertQuickText ? 1 : 0.65,
                },
              ]}
              disabled={!canInsertQuickText}
              accessibilityState={{ disabled: !canInsertQuickText }}
              onPress={() => insertQuickText(focusedGatewayId, quickTextRight)}
            >
              <Text
                style={[
                  styles.insertActionText,
                  {
                    color: canInsertQuickText ? themeTokens.textMuted : themeTokens.textDisabled,
                  },
                ]}
              >
                Insert Right
              </Text>
            </Pressable>
          </View>

          <Text style={[styles.quickTextHint, { color: themeTokens.textMuted }]}>
            Focus any gateway composer to enable quick insert.
          </Text>
        </View>
      </ScrollView>
    );
  }, [
    activeGatewayId,
    authToken,
    connectGateway,
    disconnectGateway,
    focusedGatewayId,
    focusedSettingsInput,
    gatewayName,
    gatewayProfiles,
    gatewayRuntimeById,
    gatewayUrl,
    handleCreateGatewayProfile,
    handleDeleteActiveGatewayProfile,
    handleSelectGatewayProfile,
    identityReady,
    isGatewayNotificationEnabled,
    insertQuickText,
    isAuthTokenVisible,
    notificationSettings,
    quickTextLeft,
    quickTextRight,
    sessionKey,
    themeTokens,
    toggleGatewayNotifications,
    toggleMuteForegroundNotifications,
    toggleNotificationsEnabled,
  ]);

  if (booting) {
    return (
      <SafeAreaView style={[styles.bootScreen, { backgroundColor: themeTokens.bg }]}>
        <Text style={[styles.bootText, { color: themeTokens.textSecondary }]}>Booting macOS workspace...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: themeTokens.bg }]}> 
      <View ref={rootRef} style={styles.outer} focusable onKeyDown={handleRootKeyDown}>
        <View style={[styles.window, { backgroundColor: themeTokens.bg }]}> 
          <View style={styles.windowBody}>
            <View
              style={[
                styles.sidebar,
                { backgroundColor: themeTokens.sidebar, borderRightColor: themeTokens.dividerStrong },
              ]}
            >
              <View style={[styles.sideChip, { backgroundColor: summaryChip.bg }]}>
                <View style={[styles.sideChipDot, { backgroundColor: summaryChip.color }]} />
                <Text style={[styles.sideChipText, { color: summaryChip.color }]}>{summaryChip.label}</Text>
              </View>

              <View style={[styles.sideSeparator, { backgroundColor: themeTokens.dividerStrong }]} />

              <Text style={[styles.sideHeader, { color: themeTokens.textMuted }]}>Gateways</Text>
              <View style={styles.sideList}>
                {gatewayProfiles.map((profile) => {
                  const profileSessions = mergeSessionKeys([profile.sessionKey], profile.sessions);
                  const profileRuntime = gatewayRuntimeById[profile.id];
                  const connectionState = profileRuntime?.controllerState?.connectionState ?? 'disconnected';
                  const connectionChip = connectionChipFromState(connectionState);
                  const unreadBySession = unreadByGatewaySession[profile.id] ?? {};
                  const gatewayUnreadCount = Object.values(unreadBySession).reduce((total, value) => {
                    const count = Number(value ?? 0);
                    return total + (Number.isFinite(count) ? Math.max(0, count) : 0);
                  }, 0);
                  const isActiveGateway = profile.id === activeGatewayId;
                  const isCollapsed = collapsedGatewayIds[profile.id] === true;

                  return (
                    <View key={profile.id} style={styles.gatewayGroup}>
                      <View style={styles.gatewayHeaderRow}>
                        <Pressable
                          onPress={() => handleSelectGatewayProfile(profile.id, 'chat')}
                          style={[
                            styles.sideItem,
                            styles.gatewayHeaderMain,
                            {
                              backgroundColor: isActiveGateway
                                ? themeTokens.sideActiveBg
                                : 'transparent',
                            },
                          ]}
                        >
                          <View
                            style={[
                              styles.sessionItemDot,
                              {
                                backgroundColor: connectionChip.color,
                              },
                            ]}
                          />
                          <Text
                            numberOfLines={1}
                            style={[
                              styles.sideItemLabel,
                              {
                                color: isActiveGateway
                                  ? themeTokens.sideActiveInk
                                  : themeTokens.textSecondary,
                                fontWeight: isActiveGateway ? '700' : '600',
                              },
                            ]}
                          >
                            {profile.name}
                          </Text>
                          {gatewayUnreadCount > 0 ? (
                            <View
                              style={[
                                styles.unreadBadge,
                                {
                                  backgroundColor: themeTokens.sideActiveBg,
                                  borderColor: themeTokens.inputBorder,
                                },
                              ]}
                            >
                              <Text style={[styles.unreadBadgeText, { color: themeTokens.sideActiveInk }]}>
                                {gatewayUnreadCount > 99 ? '99+' : String(gatewayUnreadCount)}
                              </Text>
                            </View>
                          ) : null}
                        </Pressable>

                        <Pressable
                          style={[
                            styles.gatewayCollapseButton,
                            {
                              borderColor: themeTokens.inputBorder,
                              backgroundColor: themeTokens.card,
                            },
                          ]}
                          onPress={() => toggleGatewayCollapse(profile.id)}
                          accessibilityRole="button"
                          accessibilityLabel={isCollapsed ? 'Expand sessions' : 'Collapse sessions'}
                        >
                          <Text
                            style={[
                              styles.gatewayCollapseButtonText,
                              { color: themeTokens.textSecondary },
                            ]}
                          >
                            {isCollapsed ? '▸' : '▾'}
                          </Text>
                        </Pressable>
                      </View>

                      {!isCollapsed ? <View style={styles.gatewaySessionList}>
                        {profileSessions.map((knownSessionKey) => {
                          const isActiveSession =
                            isActiveGateway && knownSessionKey === profile.sessionKey;
                          const unreadCount = Number(unreadBySession[knownSessionKey] ?? 0);

                          return (
                            <Pressable
                              key={`${profile.id}:${knownSessionKey}`}
                              style={[
                                styles.gatewaySessionItem,
                                {
                                  backgroundColor: isActiveSession
                                    ? themeTokens.sideActiveBg
                                    : 'transparent',
                                },
                              ]}
                              onPress={() => {
                                handleSelectSession(profile.id, knownSessionKey);
                              }}
                            >
                              <Text
                                numberOfLines={1}
                                style={[
                                  styles.gatewaySessionItemText,
                                  {
                                    color: isActiveSession
                                      ? themeTokens.sideActiveInk
                                      : themeTokens.textMuted,
                                    fontWeight: isActiveSession ? '700' : '500',
                                  },
                                ]}
                              >
                                {knownSessionKey}
                              </Text>
                              {unreadCount > 0 ? (
                                <View
                                  style={[
                                    styles.unreadBadge,
                                    styles.unreadBadgeSmall,
                                    {
                                      backgroundColor: isActiveSession
                                        ? themeTokens.card
                                        : themeTokens.sideActiveBg,
                                      borderColor: themeTokens.inputBorder,
                                    },
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.unreadBadgeText,
                                      styles.unreadBadgeTextSmall,
                                      {
                                        color: isActiveSession
                                          ? themeTokens.sideActiveInk
                                          : themeTokens.textSecondary,
                                      },
                                    ]}
                                  >
                                    {unreadCount > 99 ? '99+' : String(unreadCount)}
                                  </Text>
                                </View>
                              ) : null}
                            </Pressable>
                          );
                        })}

                        <Pressable
                          style={[
                            styles.gatewaySessionItem,
                            styles.gatewaySessionCreateItem,
                            {
                              borderColor: themeTokens.inputBorder,
                            },
                          ]}
                          onPress={() => {
                            handleCreateSession(profile.id);
                          }}
                        >
                          <Text
                            style={[
                              styles.gatewaySessionItemText,
                              {
                                color: themeTokens.textSecondary,
                                fontWeight: '600',
                              },
                            ]}
                          >
                            + New Session
                          </Text>
                        </Pressable>
                      </View> : null}
                    </View>
                  );
                })}
              </View>

              <View style={[styles.sideSeparator, { backgroundColor: themeTokens.dividerStrong }]} />

              <Pressable
                style={[
                  styles.sideItem,
                  styles.settingsNavItem,
                  {
                    backgroundColor: activeNav === 'settings' ? themeTokens.sideActiveBg : 'transparent',
                  },
                ]}
                onPress={() => setActiveNav('settings')}
              >
                <Text
                  style={[
                    styles.sideItemLabel,
                    {
                      color: activeNav === 'settings' ? themeTokens.sideActiveInk : themeTokens.textSecondary,
                      fontWeight: activeNav === 'settings' ? '700' : '600',
                    },
                  ]}
                >
                  Settings
                </Text>
              </Pressable>

              <View style={styles.sidebarGrow} />

              <Pressable
                style={[
                  styles.themeSwitch,
                  {
                    backgroundColor: themeTokens.card,
                    borderColor: themeTokens.inputBorder,
                  },
                ]}
                onPress={() => setTheme((current) => (current === 'light' ? 'dark' : 'light'))}
              >
                <Text style={[styles.themeSwitchText, { color: themeTokens.textSecondary }]}>Theme: {theme === 'light' ? 'Light' : 'Dark'}</Text>
              </Pressable>
            </View>

            <View style={styles.content}>{activeNav === 'settings' ? renderSettings() : renderSelectedSession()}</View>
          </View>
        </View>
      </View>
      <FileAttachmentPickerSheet
        visible={Boolean(attachmentPickerGatewayId)}
        themeTokens={themeTokens}
        onClose={() => setAttachmentPickerGatewayId(null)}
        onPick={handleAttachmentPick}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  outer: {
    flex: 1,
  },
  window: {
    flex: 1,
    width: '100%',
    overflow: 'hidden',
  },
  windowBody: {
    flex: 1,
    flexDirection: 'row',
    gap: 0,
  },
  sidebar: {
    width: 232,
    borderRightWidth: 1,
    paddingHorizontal: 10,
    paddingTop: 12,
    paddingBottom: 12,
  },
  sideChip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 6,
    marginBottom: 8,
  },
  sideChipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  sideChipText: {
    fontSize: 11,
    fontWeight: '700',
  },
  sideSeparator: {
    height: 1,
    marginVertical: 10,
  },
  sideHeader: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    paddingHorizontal: 10,
    marginBottom: 8,
  },
  sideList: {
    gap: 3,
  },
  gatewayGroup: {
    gap: 3,
    marginBottom: 4,
  },
  gatewayHeaderRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 4,
  },
  gatewayHeaderMain: {
    flex: 1,
  },
  sideItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    marginBottom: 2,
  },
  settingsNavItem: {
    paddingVertical: 10,
  },
  sideGlyphWrap: {
    width: 16,
    alignItems: 'center',
  },
  sideGlyph: {
    fontSize: 11,
    fontWeight: '800',
  },
  sideItemLabel: {
    flex: 1,
    fontSize: 13,
  },
  unreadBadge: {
    minWidth: 20,
    height: 18,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
    marginLeft: 6,
  },
  unreadBadgeSmall: {
    minWidth: 18,
    height: 16,
    paddingHorizontal: 4,
  },
  unreadBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  unreadBadgeTextSmall: {
    fontSize: 9,
  },
  sessionItemDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  gatewaySessionCountBadge: {
    minWidth: 22,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  gatewaySessionCountText: {
    fontSize: 10,
    fontWeight: '700',
  },
  gatewayCollapseButton: {
    width: 28,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  gatewayCollapseButtonText: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: -1,
  },
  gatewaySessionList: {
    paddingLeft: 22,
    gap: 2,
  },
  gatewaySessionItem: {
    borderRadius: 7,
    minHeight: 26,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 9,
  },
  gatewaySessionCreateItem: {
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  gatewaySessionItemText: {
    fontSize: 12,
  },
  newSessionButton: {
    borderWidth: 1,
    borderRadius: 8,
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
    marginBottom: 6,
  },
  newSessionButtonText: {
    fontSize: 12,
    fontWeight: '700',
  },
  sidebarGrow: {
    flex: 1,
  },
  themeSwitch: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 9,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  themeSwitchText: {
    fontSize: 12,
    fontWeight: '700',
  },
  content: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
  },
  homeScroll: {
    flex: 1,
    minHeight: 0,
  },
  homeScrollContent: {
    paddingHorizontal: 20,
    paddingVertical: 18,
    gap: 14,
  },
  selectedSessionWrap: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  gatewayCard: {
    borderWidth: 1.25,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 9,
    position: 'relative',
  },
  gatewayCardExpanded: {
    flex: 1,
    minHeight: 0,
  },
  gatewayCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  gatewayCardMeta: {
    flex: 1,
    minWidth: 0,
  },
  gatewayCardName: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  gatewayCardUrl: {
    fontSize: 11,
    marginTop: 1,
  },
  connectionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
    gap: 6,
  },
  connectionChipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  connectionChipText: {
    fontSize: 11,
    fontWeight: '700',
  },
  gatewayCardActions: {
    flexDirection: 'row',
    gap: 6,
  },
  gatewayActionHint: {
    fontSize: 10,
    fontWeight: '500',
    marginTop: 4,
  },
  gatewayRecoveryHint: {
    fontSize: 10,
    fontWeight: '500',
    marginTop: -2,
    marginBottom: 1,
  },
  inlineAction: {
    borderWidth: 1.25,
    borderRadius: 8,
    minHeight: 32,
    minWidth: 86,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineActionText: {
    fontSize: 11,
    fontWeight: '700',
  },
  inlineActionIconText: {
    fontSize: 14,
    fontWeight: '700',
  },
  inlinePrimary: {
    borderRadius: 8,
    minHeight: 32,
    minWidth: 102,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlinePrimaryText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  inlinePrimaryIconText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  gatewayStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minWidth: 220,
    maxWidth: '70%',
  },
  statusStaticDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusRowText: {
    fontSize: 11,
    fontWeight: '600',
    flexShrink: 1,
  },
  updatedText: {
    fontSize: 11,
    fontWeight: '500',
  },
  gatewayHistoryPreview: {
    borderWidth: 1,
    borderRadius: 10,
    minHeight: 160,
    overflow: 'hidden',
  },
  gatewayHistoryPreviewCompact: {
    maxHeight: 240,
  },
  gatewayHistoryPreviewExpanded: {
    flex: 1,
    minHeight: 0,
  },
  gatewayHistoryScroll: {
    flex: 1,
  },
  gatewayHistoryScrollContent: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
  },
  gatewayHistoryScrollContentExpanded: {
    paddingBottom: 8,
  },
  attachmentList: {
    maxHeight: 40,
  },
  attachmentListContent: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 3,
    paddingHorizontal: 2,
  },
  attachmentChip: {
    maxWidth: 360,
    minHeight: 32,
    borderWidth: 1,
    borderRadius: 999,
    paddingLeft: 9,
    paddingRight: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  attachmentChipPreview: {
    width: 18,
    height: 18,
    borderRadius: 4,
  },
  attachmentChipType: {
    fontSize: 10,
    fontWeight: '700',
  },
  attachmentChipName: {
    maxWidth: 170,
    fontSize: 11,
    fontWeight: '600',
  },
  attachmentChipSize: {
    fontSize: 10,
    fontWeight: '500',
  },
  attachmentChipRemove: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachmentChipRemoveText: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: -1,
  },
  gatewayComposerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    zIndex: 2,
    position: 'relative',
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: 10,
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  gatewayComposerRowRaised: {
    zIndex: 4,
  },
  gatewayComposerRowDropActive: {
    borderStyle: 'dashed',
  },
  quickMenuBackdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  quickMenuTrigger: {
    minHeight: 36,
    minWidth: 36,
    paddingHorizontal: 0,
    borderRadius: 8,
    borderWidth: 1.25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickMenuTriggerText: {
    fontSize: 11,
    fontWeight: '700',
  },
  quickMenuIconText: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 17,
  },
  quickMenuPanel: {
    position: 'absolute',
    right: 48,
    bottom: 44,
    width: 256,
    borderWidth: 1.25,
    borderRadius: 10,
    paddingVertical: 6,
    zIndex: 5,
  },
  quickMenuItem: {
    minHeight: 38,
    paddingHorizontal: 10,
    paddingVertical: 6,
    justifyContent: 'center',
    gap: 2,
  },
  quickMenuItemDisabled: {
    opacity: 1,
  },
  quickMenuItemTitle: {
    fontSize: 11,
    fontWeight: '700',
  },
  quickMenuItemValue: {
    fontSize: 10,
    fontWeight: '500',
  },
  composerField: {
    flex: 1,
    minHeight: COMPOSER_MIN_HEIGHT,
    maxHeight: COMPOSER_MAX_HEIGHT,
    borderWidth: 1.25,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    lineHeight: COMPOSER_LINE_HEIGHT,
    textAlignVertical: 'top',
  },
  actionCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionSend: {
    backgroundColor: SEMANTIC.green,
  },
  actionBusy: {
    backgroundColor: '#94A3B8',
  },
  actionDisabled: {
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  actionIcon: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700',
    marginTop: -2,
  },
  kbdHintRowCard: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'flex-end',
    borderTopWidth: 1,
    paddingTop: 6,
  },
  attachmentStatusText: {
    flex: 1,
    fontSize: 10,
    fontWeight: '600',
    marginRight: 8,
  },
  kbdHintText: {
    fontSize: 10,
    fontWeight: '500',
  },
  settingsScroll: {
    flex: 1,
    minHeight: 0,
  },
  settingsWrap: {
    paddingHorizontal: 20,
    paddingVertical: 18,
    gap: 14,
  },
  settingsCard: {
    borderWidth: 1.25,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: 10,
  },
  settingsTitle: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  gatewayProfilesList: {
    gap: 8,
  },
  gatewayProfileItem: {
    minHeight: 42,
    borderRadius: 8,
    borderWidth: 1.25,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  gatewayProfileDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  gatewayProfileMeta: {
    flex: 1,
    minWidth: 0,
  },
  gatewayProfileName: {
    fontSize: 13,
    fontWeight: '700',
  },
  gatewayProfileUrl: {
    fontSize: 11,
    marginTop: 1,
  },
  gatewayProfileActiveTag: {
    fontSize: 11,
    fontWeight: '700',
  },
  settingsGroup: {
    gap: 4,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  settingsInput: {
    height: 38,
    borderWidth: 1.25,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 13,
  },
  tokenInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tokenInputField: {
    flex: 1,
  },
  tokenMaskedField: {
    justifyContent: 'center',
  },
  tokenMaskedText: {
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 0.6,
  },
  tokenVisibilityButton: {
    width: 38,
    height: 38,
    borderRadius: 8,
    borderWidth: 1.25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyeIcon: {
    width: 16,
    height: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyeOutline: {
    position: 'absolute',
    width: 16,
    height: 10,
    borderWidth: 1.5,
    borderRadius: 999,
  },
  eyePupil: {
    width: 4,
    height: 4,
    borderRadius: 999,
  },
  eyeSlash: {
    position: 'absolute',
    width: 18,
    height: 1.5,
    borderRadius: 999,
    transform: [{ rotate: '-30deg' }],
  },
  settingsActionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 2,
  },
  primaryAction: {
    flex: 1,
    minHeight: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryActionText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  secondaryAction: {
    flex: 1,
    borderWidth: 1.25,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
  },
  secondaryActionText: {
    fontSize: 13,
    fontWeight: '600',
  },
  gatewayConnectedHint: {
    minHeight: 30,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  gatewayConnectedDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
  },
  gatewayConnectedHintText: {
    fontSize: 11,
    fontWeight: '600',
  },
  settingsInsertRow: {
    flexDirection: 'row',
    gap: 8,
  },
  insertAction: {
    flex: 1,
    minHeight: 34,
    borderRadius: 8,
    borderWidth: 1.25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  insertActionText: {
    fontSize: 12,
    fontWeight: '500',
  },
  quickTextHint: {
    fontSize: 10,
    marginTop: 4,
    fontStyle: 'italic',
  },
  settingsRecoveryHint: {
    fontSize: 11,
    lineHeight: 16,
    marginTop: -2,
  },
  notificationRow: {
    minHeight: 42,
    borderRadius: 8,
    borderWidth: 1.25,
    paddingHorizontal: 10,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  notificationRowTextWrap: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  notificationRowTitle: {
    fontSize: 12,
    fontWeight: '600',
  },
  notificationRowDescription: {
    fontSize: 10,
    lineHeight: 14,
  },
  notificationToggleTrack: {
    width: 34,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 2,
    justifyContent: 'center',
  },
  notificationToggleThumb: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  notificationSectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  notificationGatewayList: {
    gap: 6,
  },
  notificationGatewayRow: {
    minHeight: 42,
    borderRadius: 8,
    borderWidth: 1.25,
    paddingHorizontal: 10,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  notificationGatewayMeta: {
    flex: 1,
    minWidth: 0,
  },
  notificationGatewayName: {
    fontSize: 12,
    fontWeight: '600',
  },
  notificationGatewayUrl: {
    marginTop: 1,
    fontSize: 10,
    fontWeight: '500',
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  emptyWrapCompact: {
    minHeight: 130,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  emptyIconText: {
    fontSize: 14,
    fontWeight: '800',
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 5,
  },
  emptyDescription: {
    fontSize: 12,
    textAlign: 'center',
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingBottom: 8,
    paddingTop: 4,
  },
  dateLine: {
    flex: 1,
    height: 1,
  },
  dateLabel: {
    fontSize: 10,
    fontWeight: '700',
  },
  turnPair: {
    paddingBottom: 11,
  },
  importedTagRow: {
    alignItems: 'flex-end',
    marginBottom: 2,
  },
  importedTag: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  importedTagText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  userRow: {
    alignItems: 'flex-end',
    marginBottom: 4,
  },
  userBubble: {
    maxWidth: '72%',
    borderRadius: 12,
    borderBottomRightRadius: 4,
    backgroundColor: '#2563EB',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  userBubbleText: {
    color: '#ffffff',
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
  },
  assistantRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-end',
    marginBottom: 3,
  },
  assistantAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#1D4ED8',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  assistantAvatarText: {
    color: '#ffffff',
    fontSize: 8,
    fontWeight: '800',
  },
  assistantBubble: {
    flex: 1,
    minWidth: 0,
    maxWidth: 980,
    flexShrink: 1,
    borderRadius: 12,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
  },
  assistantBubbleHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 6,
    marginBottom: 6,
  },
  copyChip: {
    minHeight: 20,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copyChipText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  pendingBubbleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pendingBubbleText: {
    fontSize: 11,
    fontStyle: 'italic',
    fontWeight: '500',
  },
  turnTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
    marginLeft: 30,
  },
  turnStateDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  turnTimeText: {
    fontSize: 9,
    fontWeight: '500',
  },
  bootScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bootText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
