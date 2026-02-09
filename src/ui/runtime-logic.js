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
  if (!normalizedText) return true;
  if (isIncompleteAssistantContent(normalizedText)) return true;
  return isIncompleteAssistantContent(assistantValue);
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
  resolveSendDispatch,
  computeAutoConnectRetryPlan,
  shouldStartStartupAutoConnect,
  buildHistoryRefreshNotice,
};
