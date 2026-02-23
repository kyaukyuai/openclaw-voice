const QUICK_TEXT_ICON_SET = new Set([
  'chatbubble-ellipses-outline',
  'flash-outline',
  'checkmark-done-outline',
  'bookmark-outline',
  'heart-outline',
  'star-outline',
]);

const WAITING_TURN_STATES = new Set(['sending', 'queued', 'delta', 'streaming']);

function dedupeLines(lines) {
  const seen = new Set();
  const result = [];
  lines.forEach((line) => {
    if (!seen.has(line)) {
      seen.add(line);
      result.push(line);
    }
  });
  return result;
}

function collectText(value, out, depth = 0, trim = true) {
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
  const record = value;
  collectText(record.text, out, depth + 1, trim);
  collectText(record.thinking, out, depth + 1, trim);
  collectText(record.content, out, depth + 1, trim);
  collectText(record.value, out, depth + 1, trim);
  collectText(record.message, out, depth + 1, trim);
  collectText(record.output, out, depth + 1, trim);
}

function textFromUnknown(value) {
  const pieces = [];
  collectText(value, pieces);
  return dedupeLines(pieces).join('\n').trim();
}

function extractTimestampFromUnknown(value, fallback) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const asNumber = Number(value);
    if (Number.isFinite(asNumber)) return asNumber;
    const asDate = Date.parse(value);
    if (Number.isFinite(asDate)) return asDate;
  }
  return fallback;
}

function normalizeChatEventState(state) {
  const normalized = (state ?? 'unknown').trim().toLowerCase();
  if (normalized === 'done' || normalized === 'final') return 'complete';
  return normalized || 'unknown';
}

function isTurnWaitingState(state) {
  return WAITING_TURN_STATES.has(state);
}

function isTurnErrorState(state) {
  return state === 'error' || state === 'aborted';
}

function buildTurnsFromHistory(messages, sessionKey) {
  if (!Array.isArray(messages) || messages.length === 0) return [];

  const turns = [];
  let pendingTurn = null;
  const finalizePendingTurn = () => {
    if (pendingTurn) turns.push(pendingTurn);
    pendingTurn = null;
  };

  messages.forEach((entry, index) => {
    if (typeof entry !== 'object' || entry === null) return;
    const record = entry;
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

function getHistoryDayKey(timestamp) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getHistoryDayLabel(timestamp) {
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

function formatSessionUpdatedAt(updatedAt) {
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

function formatClockLabel(timestamp) {
  return new Date(timestamp).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function extractFinalChatEventText(payload) {
  const record = payload;
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

function normalizeQuickTextIcon(value, fallback) {
  const candidate = (value ?? '').trim();
  if (QUICK_TEXT_ICON_SET.has(candidate)) {
    return candidate;
  }
  return fallback;
}

function parseSessionPreferences(raw) {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    const next = {};
    Object.entries(parsed).forEach(([sessionKey, value]) => {
      if (!sessionKey || !value || typeof value !== 'object' || Array.isArray(value)) {
        return;
      }

      const record = value;
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

function parseOutboxQueue(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const next = [];
    parsed.forEach((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return;
      const record = entry;

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

module.exports = {
  isTurnWaitingState,
  isTurnErrorState,
  buildTurnsFromHistory,
  getHistoryDayKey,
  getHistoryDayLabel,
  formatSessionUpdatedAt,
  formatClockLabel,
  extractFinalChatEventText,
  normalizeQuickTextIcon,
  parseSessionPreferences,
  parseOutboxQueue,
};
