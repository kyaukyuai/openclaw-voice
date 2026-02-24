function sanitizeGatewaySessionsForUi(input) {
  if (input.connectionState !== 'connected') {
    return [];
  }

  const fetched = Array.isArray(input.gatewaySessions)
    ? input.gatewaySessions.filter(
        (session) => typeof session?.key === 'string' && session.key.trim().length > 0,
      )
    : [];

  const merged = [...fetched];
  if (!merged.some((session) => session.key === input.activeSessionKey)) {
    merged.unshift({
      key: input.activeSessionKey,
      displayName: input.activeSessionKey,
    });
  }

  merged.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  return merged;
}

function shouldHoldBottomCompletePulse(input) {
  return (
    input.connectionState === 'connected' &&
    !input.isSending &&
    input.gatewayEventState === 'complete'
  );
}

function buildOutboxQueuedTurnsBySession(outboxQueue) {
  const turnsBySession = new Map();

  outboxQueue.forEach((item) => {
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
    turnsBySession.set(
      sessionKey,
      [...turns].sort((a, b) => a.createdAt - b.createdAt),
    );
  });

  return turnsBySession;
}

function resolveRestoredActiveSessionKey(input) {
  return (
    (input.savedSessionKey?.trim() || input.activeSessionKeyRefValue).trim() ||
    input.defaultSessionKey
  );
}

module.exports = {
  sanitizeGatewaySessionsForUi,
  shouldHoldBottomCompletePulse,
  buildOutboxQueuedTurnsBySession,
  resolveRestoredActiveSessionKey,
};
