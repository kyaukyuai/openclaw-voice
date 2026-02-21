type UnboundGatewayEventDecision = {
  normalizedState: string;
  shouldSyncHistory: boolean;
  shouldEndSending: boolean;
};

function normalizeState(state: string | undefined): string {
  const normalized = (state ?? 'unknown').trim().toLowerCase();
  if (normalized === 'done' || normalized === 'final') return 'complete';
  return normalized || 'unknown';
}

export function shouldEndSendingForGatewayState(state: string | undefined): boolean {
  const normalizedState = normalizeState(state);
  return (
    normalizedState === 'complete' ||
    normalizedState === 'error' ||
    normalizedState === 'aborted'
  );
}

export function resolveUnboundGatewayEventDecision(
  state: string | undefined,
  finalEventText: string | undefined,
): UnboundGatewayEventDecision {
  const normalizedState = normalizeState(state);
  const hasFinalText = Boolean(String(finalEventText ?? ''));
  const shouldEndSending = shouldEndSendingForGatewayState(normalizedState);
  return {
    normalizedState,
    shouldSyncHistory: hasFinalText || shouldEndSending,
    shouldEndSending,
  };
}
