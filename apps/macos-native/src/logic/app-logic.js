import {
  COMPOSER_MAX_HEIGHT,
  COMPOSER_MIN_HEIGHT,
  COMPOSER_LINE_HEIGHT,
  COMPOSER_VERTICAL_PADDING,
  DEFAULTS,
  INITIAL_CONTROLLER_STATE,
  MAX_ATTACHMENT_SIZE_BYTES,
  MESSAGE_NOTIFICATION_MAX_LENGTH,
  SEMANTIC,
} from './app-constants';

export function normalizeText(value) {
  return String(value ?? '').trim();
}

export function normalizeNotificationSettings(rawSettings, profiles = []) {
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

export function isSameNotificationSettings(left, right) {
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

export function normalizeUnreadByGatewaySession(rawUnread, profiles = []) {
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

export function isSameUnreadByGatewaySession(left, right) {
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

export function notificationSnippet(value) {
  const normalized = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return 'You received a new message.';
  if (normalized.length <= MESSAGE_NOTIFICATION_MAX_LENGTH) return normalized;
  return `${normalized.slice(0, MESSAGE_NOTIFICATION_MAX_LENGTH - 1)}…`;
}

export function extractNotificationRoute(payload) {
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

export function normalizeSessionKey(value) {
  const normalized = normalizeText(value);
  return normalized || DEFAULTS.sessionKey;
}

export function normalizeComposerSelection(selection, text = '') {
  const safeText = String(text ?? '');
  const max = safeText.length;
  const startRaw = Number.isFinite(selection?.start) ? selection.start : max;
  const endRaw = Number.isFinite(selection?.end) ? selection.end : max;
  const start = Math.max(0, Math.min(max, startRaw));
  const end = Math.max(start, Math.min(max, endRaw));
  return { start, end };
}

export function clampComposerHeight(nextHeight) {
  if (!Number.isFinite(nextHeight)) return COMPOSER_MIN_HEIGHT;
  return Math.max(COMPOSER_MIN_HEIGHT, Math.min(COMPOSER_MAX_HEIGHT, Math.ceil(nextHeight)));
}

export function estimateComposerHeightFromText(text) {
  const safeText = String(text ?? '');
  const lineCount = Math.max(1, safeText.split(/\r?\n/).length);
  return clampComposerHeight(lineCount * COMPOSER_LINE_HEIGHT + COMPOSER_VERTICAL_PADDING);
}

export function compactQuickTextLabel(value) {
  const normalized = normalizeText(value);
  if (!normalized) return '(empty)';
  if (normalized.length <= 44) return normalized;
  return `${normalized.slice(0, 44)}...`;
}

export function createAttachmentId() {
  return `att-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeAttachmentDraft(input) {
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

export function attachmentLabel(attachment) {
  const typeLabel = attachment?.type === 'image' ? 'IMG' : 'FILE';
  return `${typeLabel}: ${String(attachment?.fileName ?? '').trim() || 'attachment'}`;
}

export function bytesLabel(sizeBytes) {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return '-';
  if (sizeBytes >= 1024 * 1024) return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.ceil(sizeBytes / 1024)} KB`;
}

export function decodeFileNameFromUri(uri) {
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

export function normalizeFileUri(uriOrPath) {
  const raw = String(uriOrPath ?? '').trim();
  if (!raw) return '';
  if (raw.startsWith('file://')) return raw;
  if (raw.startsWith('/')) return `file://${raw}`;
  return '';
}

export function guessAttachmentType({ mimeType, fileName }) {
  const mime = String(mimeType ?? '').toLowerCase();
  const name = String(fileName ?? '').toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (/\.(png|jpe?g|gif|webp|bmp|heic|heif|svg)$/i.test(name)) return 'image';
  return 'file';
}

export function blobToBase64(blob) {
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

export function extractDroppedFileCandidates(nativeEvent) {
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

export function mergeSessionKeys(...groups) {
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

export function extractSessionKeys(sessionsPayload) {
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

export function createGatewayProfile(overrides = {}, indexHint = 1) {
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

export function isSameStringArray(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

export function createGatewayRuntime() {
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

export function buildRuntimeMap(profiles, previous = {}) {
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

export function timestampLabel(timestampMs) {
  if (!timestampMs) return '';
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(timestampMs);
}

export function isPendingTurn(turn) {
  const state = String(turn?.state ?? '').toLowerCase();
  return state === 'sending' || state === 'streaming' || state === 'delta' || state === 'queued';
}

export function findLatestCompletedAssistantTurn(controllerState) {
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

export function assistantTurnSignature(turn) {
  if (!turn) return '';
  const turnId = String(turn.id ?? turn.runId ?? '').trim();
  const updatedAt = String(turn.updatedAt ?? turn.createdAt ?? '').trim();
  const assistantText = normalizeText(turn.assistantText);
  if (!turnId || !assistantText) return '';
  return `${turnId}:${updatedAt}:${assistantText}`;
}

export function gatewayRecoveryHint(profile, controllerState) {
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

export function turnDotColor(turnState) {
  if (turnState === 'complete') return SEMANTIC.green;
  if (turnState === 'error') return SEMANTIC.red;
  return SEMANTIC.blue;
}

export function connectionChipFromState(connectionState) {
  if (connectionState === 'connected') {
    return { label: 'Connected', color: SEMANTIC.green, bg: SEMANTIC.greenSoft };
  }
  if (connectionState === 'connecting' || connectionState === 'reconnecting') {
    return { label: 'Connecting', color: SEMANTIC.amber, bg: SEMANTIC.amberSoft };
  }
  return { label: 'Disconnected', color: '#6b7280', bg: 'rgba(107,114,128,0.12)' };
}

export function statusRowMeta(controllerState, identityPersistWarning, themeTokens) {
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

