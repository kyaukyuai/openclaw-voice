export type SendFingerprint = {
  sessionKey: string;
  message: string;
  sentAt: number;
  idempotencyKey: string;
};

export type SendDispatchInput = {
  sessionKey: string;
  message: string;
  now?: number;
};

export type ResolveSendDispatchOptions = {
  duplicateBlockMs?: number;
  reuseWindowMs?: number;
};

export type SendDispatchResult = {
  blocked: boolean;
  reason: 'duplicate-rapid' | null;
  normalizedMessage: string;
  idempotencyKey: string;
  nextFingerprint: SendFingerprint;
  reusedIdempotencyKey: boolean;
};

export type AutoConnectRetryPlan = {
  shouldRetry: boolean;
  nextAttempt: number;
  delayMs: number;
  message: string;
};

export function normalizeMessageForDedupe(value: unknown): string;

export function createLocalIdempotencyKey(now?: number, random?: number): string;

export function isIncompleteAssistantContent(value: unknown): boolean;

export function shouldAttemptFinalRecovery(textValue: unknown, assistantValue?: unknown): boolean;

export function resolveSendDispatch(
  previousFingerprint: SendFingerprint | null | undefined,
  input: SendDispatchInput,
  options?: ResolveSendDispatchOptions,
): SendDispatchResult;

export function computeAutoConnectRetryPlan(input: {
  attempt: number;
  maxAttempts: number;
  baseDelayMs: number;
  errorText: string;
}): AutoConnectRetryPlan;

export function shouldStartStartupAutoConnect(input: {
  settingsReady: boolean;
  alreadyAttempted: boolean;
  gatewayUrl: string;
  connectionState: string;
}): boolean;

export function buildHistoryRefreshNotice(
  success: boolean,
  syncedAtLabel?: string,
): { kind: 'success' | 'error'; message: string };
