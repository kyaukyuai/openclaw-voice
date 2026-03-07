import {
  DEFAULTS,
  INITIAL_CONTROLLER_STATE,
  MESSAGE_NOTIFICATION_MAX_LENGTH,
  SEMANTIC,
  COMPOSER_MIN_HEIGHT,
} from './app-constants';
import {
  isSameStringArray,
  normalizeSessionKey,
  normalizeText,
} from './shared-logic';
import { clampComposerHeight } from './composer-logic';

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
  const knownGatewayIds = new Set(
    profiles.map((profile) => String(profile?.id ?? '').trim()).filter(Boolean),
  );
  const next = {};

  Object.entries(source).forEach(([gatewayId, sessionMap]) => {
    if (!knownGatewayIds.has(gatewayId)) return;
    if (!sessionMap || typeof sessionMap !== 'object') return;
    const nextSessionMap = {};
    Object.entries(sessionMap).forEach(([session, count]) => {
      const normalizedSession = normalizeSessionKey(session);
      const normalizedCount = Math.max(0, Math.trunc(Number(count ?? 0)));
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
