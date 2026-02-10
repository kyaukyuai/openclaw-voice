/**
 * Chat and conversation types for OpenClaw Voice
 */

// ============================================================================
// Chat Turns
// ============================================================================

export type ChatTurn = {
  id: string;
  userText: string;
  assistantText: string;
  state: string;
  runId?: string;
  createdAt: number;
};

export type HistoryListItem =
  | {
      kind: 'date';
      id: string;
      label: string;
    }
  | {
      kind: 'turn';
      id: string;
      turn: ChatTurn;
      isLast: boolean;
    };

// ============================================================================
// Outbox Queue
// ============================================================================

export type OutboxQueueItem = {
  id: string;
  sessionKey: string;
  message: string;
  turnId: string;
  idempotencyKey: string;
  createdAt: number;
  retryCount: number;
  nextRetryAt: number;
  lastError: string | null;
};

// ============================================================================
// History & Sync
// ============================================================================

export type HistoryRefreshNotice = {
  kind: 'success' | 'error';
  message: string;
};

export type MissingResponseRecoveryNotice = {
  sessionKey: string;
  turnId: string;
  attempt: number;
  message: string;
};

// ============================================================================
// Text Content Processing
// ============================================================================

export type TextContentOptions = {
  trim?: boolean;
  dedupe?: boolean;
};
