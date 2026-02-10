/**
 * Helper utilities for OpenClaw Voice
 */

import { Vibration } from 'react-native';
import type { ChatMessage, SessionEntry } from '../openclaw';
import type { GatewayConnectDiagnostic, TextContentOptions } from '../types';
import { TIMINGS } from './constants';

// ============================================================================
// Haptics
// ============================================================================

type HapticsModule = {
  impactAsync?: (style: unknown) => Promise<void>;
  notificationAsync?: (type: unknown) => Promise<void>;
  ImpactFeedbackStyle?: {
    Light?: unknown;
    Medium?: unknown;
  };
  NotificationFeedbackType?: {
    Success?: unknown;
    Error?: unknown;
  };
};

let hapticsModuleCache: HapticsModule | null | undefined;

function getHapticsModule(): HapticsModule | null {
  if (hapticsModuleCache !== undefined) return hapticsModuleCache;
  try {
    hapticsModuleCache = require('expo-haptics') as HapticsModule;
  } catch {
    hapticsModuleCache = null;
  }
  return hapticsModuleCache;
}

export type HapticType =
  | 'button-press'
  | 'record-start'
  | 'record-stop'
  | 'send-success'
  | 'send-error';

export async function triggerHaptic(type: HapticType): Promise<void> {
  const haptics = getHapticsModule();
  if (haptics) {
    try {
      if (type === 'button-press') {
        await haptics.impactAsync?.(haptics.ImpactFeedbackStyle?.Medium);
        return;
      }
      if (type === 'send-success') {
        await haptics.notificationAsync?.(
          haptics.NotificationFeedbackType?.Success,
        );
        return;
      }
      if (type === 'send-error') {
        await haptics.notificationAsync?.(
          haptics.NotificationFeedbackType?.Error,
        );
        return;
      }
      await haptics.impactAsync?.(
        type === 'record-start'
          ? haptics.ImpactFeedbackStyle?.Light
          : haptics.ImpactFeedbackStyle?.Medium,
      );
      return;
    } catch {
      // fallback below
    }
  }
  Vibration.vibrate(
    type === 'send-error' ? 20 : type === 'button-press' ? 6 : 10,
  );
}

// ============================================================================
// Text Content Processing
// ============================================================================

function pieceOrUndefined(value: unknown): unknown {
  return value === null ? undefined : value;
}

function collectText(
  value: unknown,
  out: string[],
  depth = 0,
  trim = true,
): void {
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

  const record = value as Record<string, unknown>;
  collectText(record.text, out, depth + 1, trim);
  collectText(record.thinking, out, depth + 1, trim);
  collectText(record.content, out, depth + 1, trim);
  collectText(record.value, out, depth + 1, trim);
  collectText(record.message, out, depth + 1, trim);
  collectText(record.output, out, depth + 1, trim);
}

export function dedupeLines(lines: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  lines.forEach((line) => {
    if (!seen.has(line)) {
      seen.add(line);
      result.push(line);
    }
  });
  return result;
}

export function toTextContent(
  message?: ChatMessage,
  options?: TextContentOptions,
): string {
  if (!message) return '';
  const trim = options?.trim ?? true;
  const dedupe = options?.dedupe ?? true;

  const { content } = message;
  if (typeof content === 'string') return trim ? content.trim() : content;
  if (!Array.isArray(content)) return '';

  const lines = content
    .map((block) => {
      const pieces: string[] = [];
      collectText(pieceOrUndefined(block?.text), pieces, 0, trim);
      collectText(pieceOrUndefined(block?.thinking), pieces, 0, trim);
      collectText(pieceOrUndefined(block?.content), pieces, 0, trim);
      const normalized = dedupe ? dedupeLines(pieces) : pieces;
      const joined = normalized.join('\n');
      return trim ? joined.trim() : joined;
    })
    .filter(Boolean);

  const joined = lines.join('\n');
  return trim ? joined.trim() : joined;
}

export function textFromUnknown(value: unknown): string {
  const pieces: string[] = [];
  collectText(value, pieces);
  return dedupeLines(pieces).join('\n').trim();
}

// ============================================================================
// Error Handling
// ============================================================================

export function errorMessage(err: unknown): string {
  if (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    typeof (err as { code?: unknown }).code === 'string'
  ) {
    const code = String((err as { code: string }).code);
    const message = err instanceof Error ? err.message : String(err);
    return `${code}: ${message}`;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

export function classifyGatewayConnectFailure(input: {
  error: unknown;
  hasToken: boolean;
}): GatewayConnectDiagnostic {
  const raw = errorMessage(input.error).trim();
  const normalized = raw.toLowerCase();

  if (
    normalized.includes('pairing') ||
    normalized.includes('allow this device')
  ) {
    return {
      kind: 'pairing',
      summary: 'Pairing approval required.',
      guidance: 'Approve this device on OpenClaw, then retry.',
    };
  }

  if (normalized.includes('timeout')) {
    return {
      kind: 'timeout',
      summary: 'Connection timed out.',
      guidance: 'Check URL reachability and Gateway health, then retry.',
    };
  }

  if (
    normalized.includes('certificate') ||
    normalized.includes('tls') ||
    normalized.includes('ssl') ||
    normalized.includes('handshake') ||
    normalized.includes('self signed') ||
    normalized.includes('unable to verify')
  ) {
    return {
      kind: 'tls',
      summary: 'TLS/certificate validation failed.',
      guidance: 'Use a trusted certificate and a valid wss:// endpoint.',
    };
  }

  if (
    normalized.includes('invalid_request') ||
    normalized.includes('unauthorized') ||
    normalized.includes('forbidden') ||
    normalized.includes('401') ||
    normalized.includes('403') ||
    normalized.includes('auth') ||
    normalized.includes('token')
  ) {
    return {
      kind: 'auth',
      summary: input.hasToken
        ? 'Authentication failed.'
        : 'Gateway rejected the request.',
      guidance: input.hasToken
        ? 'Verify token/scopes and Gateway client permissions.'
        : 'Set token if required, and verify client permissions.',
    };
  }

  if (
    normalized.includes('enotfound') ||
    normalized.includes('getaddrinfo') ||
    normalized.includes('dns') ||
    normalized.includes('name resolution') ||
    normalized.includes('host not found')
  ) {
    return {
      kind: 'dns',
      summary: 'Gateway host could not be resolved.',
      guidance: 'Check host name, DNS, and network/VPN configuration.',
    };
  }

  if (
    normalized.includes('network request failed') ||
    normalized.includes('econnrefused') ||
    normalized.includes('connection refused') ||
    normalized.includes('offline') ||
    normalized.includes('network') ||
    normalized.includes('unreachable') ||
    normalized.includes('reset')
  ) {
    return {
      kind: 'network',
      summary: 'Network connection failed.',
      guidance: 'Check internet connectivity and Gateway endpoint access.',
    };
  }

  if (
    normalized.includes('500') ||
    normalized.includes('502') ||
    normalized.includes('503') ||
    normalized.includes('504') ||
    normalized.includes('service unavailable') ||
    normalized.includes('bad gateway')
  ) {
    return {
      kind: 'server',
      summary: 'Gateway returned a server error.',
      guidance: 'Check Gateway logs and server health before retrying.',
    };
  }

  return {
    kind: 'unknown',
    summary: 'Connection failed for an unknown reason.',
    guidance: 'Check URL, token, and network, then retry.',
  };
}

// ============================================================================
// Speech Recognition
// ============================================================================

export function normalizeSpeechErrorCode(error: unknown): string {
  return String(error ?? '').trim().toLowerCase();
}

export function isSpeechAbortLikeError(code: string): boolean {
  return (
    code.includes('aborted') ||
    code.includes('cancelled') ||
    code.includes('canceled') ||
    code.includes('interrupted')
  );
}

// ============================================================================
// ID Generation
// ============================================================================

export function createTurnId(): string {
  return `turn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function createSessionKey(): string {
  return `mobile-openclaw-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

export function createOutboxItemId(): string {
  return `outbox-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

// ============================================================================
// Retry & Timing
// ============================================================================

export function getOutboxRetryDelayMs(retryCount: number): number {
  const safeRetryCount = Math.max(1, retryCount);
  const delay = TIMINGS.OUTBOX_RETRY_BASE_MS * 2 ** (safeRetryCount - 1);
  return Math.min(TIMINGS.OUTBOX_RETRY_MAX_MS, delay);
}

// ============================================================================
// Session Helpers
// ============================================================================

export function sessionDisplayName(session: SessionEntry): string {
  const preferred =
    session.displayName ??
    session.label ??
    session.subject ??
    session.room ??
    session.key;
  return (preferred ?? session.key).trim() || session.key;
}

// ============================================================================
// Data Extraction
// ============================================================================

export function extractTimestampFromUnknown(
  value: unknown,
  fallback: number,
): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const asNumber = Number(value);
    if (Number.isFinite(asNumber)) return asNumber;
    const asDate = Date.parse(value);
    if (Number.isFinite(asDate)) return asDate;
  }
  return fallback;
}

export function normalizeChatEventState(state: string | undefined): string {
  const normalized = (state ?? 'unknown').trim().toLowerCase();
  if (normalized === 'done' || normalized === 'final') return 'complete';
  return normalized || 'unknown';
}

// ============================================================================
// Text Merging
// ============================================================================

export function getTextOverlapSize(base: string, incoming: string): number {
  const max = Math.min(base.length, incoming.length);
  for (let size = max; size > 0; size -= 1) {
    if (base.slice(-size) === incoming.slice(0, size)) return size;
  }
  return 0;
}

export function mergeAssistantStreamText(
  previousRaw: string,
  incomingRaw: string,
): string {
  const previous = previousRaw === 'Responding...' ? '' : previousRaw;
  const incoming = incomingRaw;

  if (!incoming) return previous || 'Responding...';
  if (!previous) return incoming;
  if (incoming === previous) return previous;
  if (incoming.startsWith(previous)) return incoming;
  if (previous.startsWith(incoming)) return previous;

  const overlapSize = getTextOverlapSize(previous, incoming);
  if (overlapSize > 0) {
    return previous + incoming.slice(overlapSize);
  }
  return previous + incoming;
}
