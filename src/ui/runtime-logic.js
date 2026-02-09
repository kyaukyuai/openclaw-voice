function normalizeMessageForDedupe(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function createLocalIdempotencyKey(now = Date.now(), random = Math.random()) {
  const suffix = Math.floor(random * 1_000_000_000)
    .toString(36)
    .slice(0, 8);
  return `idem-${now.toString(36)}-${suffix}`;
}

function isIncompleteAssistantContent(value) {
  const normalized = String(value ?? '').trim();
  if (!normalized) return true;
  return normalized === 'Responding...' || normalized === 'No response';
}

function shouldAttemptFinalRecovery(textValue, assistantValue = '') {
  const normalizedText = String(textValue ?? '').trim();
  if (!normalizedText) {
    return isIncompleteAssistantContent(assistantValue);
  }
  if (isIncompleteAssistantContent(normalizedText)) return true;
  return isIncompleteAssistantContent(assistantValue);
}

function resolveCompletedAssistantText({
  finalText,
  streamedText = '',
  stopReason,
} = {}) {
  const normalizedFinalText = String(finalText ?? '');
  const normalizedStreamedText = String(streamedText ?? '');
  if (normalizedFinalText) return normalizedFinalText;
  if (normalizedStreamedText) return normalizedStreamedText;
  if (stopReason === 'max_tokens') {
    return 'Response was truncated (max tokens reached).';
  }
  return 'Gateway returned no text content for this response.';
}

const WAITING_TURN_STATES = new Set(['sending', 'queued', 'delta', 'streaming']);

function mergeHistoryTurnsWithPendingLocal(
  historyTurns = [],
  localTurns = [],
  queuedTurnIds = new Set(),
) {
  const mergedTurns = Array.isArray(historyTurns) ? [...historyTurns] : [];
  const localCandidates = Array.isArray(localTurns) ? localTurns : [];
  const queuedIds =
    queuedTurnIds instanceof Set ? queuedTurnIds : new Set(queuedTurnIds ?? []);

  localCandidates.forEach((turn) => {
    if (!turn || typeof turn !== 'object') return;
    const turnId = String(turn.id ?? '').trim();
    if (!turnId) return;
    const turnState = String(turn.state ?? '').trim();
    const shouldKeepLocal =
      queuedIds.has(turnId) || WAITING_TURN_STATES.has(turnState);
    if (!shouldKeepLocal) return;
    if (!mergedTurns.some((existing) => existing?.id === turnId)) {
      mergedTurns.push(turn);
    }
  });

  mergedTurns.sort((a, b) => {
    const left = Number(a?.createdAt ?? 0);
    const right = Number(b?.createdAt ?? 0);
    return left - right;
  });
  return mergedTurns;
}

function resolveSendDispatch(previousFingerprint, input, options = {}) {
  const { sessionKey, message, now = Date.now() } = input;
  const duplicateBlockMs = options.duplicateBlockMs ?? 1400;
  const reuseWindowMs = options.reuseWindowMs ?? 60_000;

  const normalizedMessage = normalizeMessageForDedupe(message);
  const previous = previousFingerprint ?? null;
  const sameMessage =
    !!previous &&
    previous.sessionKey === sessionKey &&
    previous.message === normalizedMessage;

  const elapsedMs = sameMessage ? now - previous.sentAt : Number.POSITIVE_INFINITY;
  if (sameMessage && elapsedMs < duplicateBlockMs) {
    return {
      blocked: true,
      reason: 'duplicate-rapid',
      normalizedMessage,
      idempotencyKey: previous.idempotencyKey,
      nextFingerprint: previous,
      reusedIdempotencyKey: true,
    };
  }

  const reusedIdempotencyKey = sameMessage && elapsedMs < reuseWindowMs;
  const idempotencyKey = reusedIdempotencyKey
    ? previous.idempotencyKey
    : createLocalIdempotencyKey(now);

  const nextFingerprint = {
    sessionKey,
    message: normalizedMessage,
    sentAt: now,
    idempotencyKey,
  };

  return {
    blocked: false,
    reason: null,
    normalizedMessage,
    idempotencyKey,
    nextFingerprint,
    reusedIdempotencyKey,
  };
}

function computeAutoConnectRetryPlan({
  attempt,
  maxAttempts,
  baseDelayMs,
  errorText,
}) {
  if (attempt < maxAttempts) {
    return {
      shouldRetry: true,
      nextAttempt: attempt + 1,
      delayMs: baseDelayMs * attempt,
      message: `Gateway auto-connect failed (${attempt}/${maxAttempts}). Retrying...`,
    };
  }

  return {
    shouldRetry: false,
    nextAttempt: attempt,
    delayMs: 0,
    message: `Gateway auto-connect failed: ${errorText}. Tap Connect to retry manually.`,
  };
}

function shouldStartStartupAutoConnect({
  settingsReady,
  alreadyAttempted,
  gatewayUrl,
  connectionState,
}) {
  if (!settingsReady) return false;
  if (alreadyAttempted) return false;
  if (!String(gatewayUrl ?? '').trim()) return false;
  if (connectionState !== 'disconnected') return false;
  return true;
}

function buildHistoryRefreshNotice(success, syncedAtLabel = '') {
  if (success) {
    return {
      kind: 'success',
      message: syncedAtLabel ? `Updated ${syncedAtLabel}` : 'Updated',
    };
  }

  return {
    kind: 'error',
    message: 'Refresh failed',
  };
}

module.exports = {
  normalizeMessageForDedupe,
  createLocalIdempotencyKey,
  isIncompleteAssistantContent,
  shouldAttemptFinalRecovery,
  resolveCompletedAssistantText,
  mergeHistoryTurnsWithPendingLocal,
  resolveSendDispatch,
  computeAutoConnectRetryPlan,
  shouldStartStartupAutoConnect,
  buildHistoryRefreshNotice,
};
