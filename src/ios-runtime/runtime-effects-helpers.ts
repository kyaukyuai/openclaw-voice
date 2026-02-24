import type { ConnectionState, SessionEntry } from '../openclaw';
import type { ChatTurn, OutboxQueueItem } from '../types';

export function sanitizeGatewaySessionsForUi(input: {
  connectionState: ConnectionState;
  gatewaySessions: SessionEntry[];
  activeSessionKey: string;
}): SessionEntry[] {
  if (input.connectionState !== 'connected') {
    return [];
  }

  const fetched = Array.isArray(input.gatewaySessions)
    ? input.gatewaySessions.filter(
        (session): session is SessionEntry =>
          typeof session?.key === 'string' && session.key.trim().length > 0,
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

export function shouldHoldBottomCompletePulse(input: {
  connectionState: ConnectionState;
  isSending: boolean;
  gatewayEventState: string;
}) {
  return (
    input.connectionState === 'connected' &&
    !input.isSending &&
    input.gatewayEventState === 'complete'
  );
}

export function buildOutboxQueuedTurnsBySession(
  outboxQueue: OutboxQueueItem[],
): Map<string, ChatTurn[]> {
  const turnsBySession = new Map<string, ChatTurn[]>();

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

export function resolveRestoredActiveSessionKey(input: {
  savedSessionKey: string | null;
  activeSessionKeyRefValue: string;
  defaultSessionKey: string;
}) {
  return (
    (input.savedSessionKey?.trim() || input.activeSessionKeyRefValue).trim() ||
    input.defaultSessionKey
  );
}
