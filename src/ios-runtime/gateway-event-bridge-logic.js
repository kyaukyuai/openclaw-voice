function normalizeState(state) {
  const normalized = String(state ?? 'unknown').trim().toLowerCase();
  if (normalized === 'done' || normalized === 'final') return 'complete';
  return normalized || 'unknown';
}

function shouldEndSendingForGatewayState(state) {
  const normalizedState = normalizeState(state);
  return (
    normalizedState === 'complete' ||
    normalizedState === 'error' ||
    normalizedState === 'aborted'
  );
}

function resolveUnboundGatewayEventDecision(state, finalEventText) {
  const normalizedState = normalizeState(state);
  const hasFinalText = Boolean(String(finalEventText ?? ''));
  const shouldEndSending = shouldEndSendingForGatewayState(normalizedState);
  return {
    normalizedState,
    shouldSyncHistory: hasFinalText || shouldEndSending,
    shouldEndSending,
  };
}

module.exports = {
  shouldEndSendingForGatewayState,
  resolveUnboundGatewayEventDecision,
};
