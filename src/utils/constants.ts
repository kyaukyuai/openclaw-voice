/**
 * Application constants for OpenClaw Voice
 */

import { Platform } from 'react-native';
import type { ConnectionState } from '../openclaw';
import type {
  AppTheme,
  BottomActionStatus,
  QuickTextIcon,
  SpeechLang,
} from '../types';

// ============================================================================
// Environment & Client Configuration
// ============================================================================

export const REQUESTED_GATEWAY_CLIENT_ID =
  (process.env.EXPO_PUBLIC_GATEWAY_CLIENT_ID ?? 'openclaw-ios').trim() ||
  'openclaw-ios';

export const GATEWAY_DISPLAY_NAME =
  (process.env.EXPO_PUBLIC_GATEWAY_DISPLAY_NAME ?? 'OpenClaw Pocket').trim() ||
  'OpenClaw Pocket';

export const ENABLE_DEBUG_WARNINGS = /^(1|true|yes|on)$/i.test(
  (process.env.EXPO_PUBLIC_DEBUG_MODE ?? '').trim(),
);

function parseEnvBoolean(value: string | undefined, defaultValue: boolean): boolean {
  const raw = value?.trim();
  if (!raw) return defaultValue;
  if (/^(1|true|yes|on)$/i.test(raw)) return true;
  if (/^(0|false|no|off)$/i.test(raw)) return false;
  return defaultValue;
}

// Runtime V2 is enabled by default. Set EXPO_PUBLIC_IOS_RUNTIME_V2=false to fallback.
export const ENABLE_IOS_RUNTIME_V2 = parseEnvBoolean(
  process.env.EXPO_PUBLIC_IOS_RUNTIME_V2,
  true,
);

export const GATEWAY_PLATFORM: 'ios' | 'android' | 'web' =
  Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web';

// ============================================================================
// Default Values
// ============================================================================

export const DEFAULTS = {
  GATEWAY_URL: (process.env.EXPO_PUBLIC_DEFAULT_GATEWAY_URL ?? '').trim(),
  THEME: (process.env.EXPO_PUBLIC_DEFAULT_THEME === 'dark'
    ? 'dark'
    : 'light') as AppTheme,
  SPEECH_LANG: 'ja-JP' as SpeechLang,
  SESSION_KEY:
    (process.env.EXPO_PUBLIC_DEFAULT_SESSION_KEY ?? 'main').trim() || 'main',
  QUICK_TEXT_LEFT: 'ありがとう',
  QUICK_TEXT_RIGHT: 'お願いします',
  QUICK_TEXT_LEFT_ICON: 'chatbubble-ellipses-outline' as QuickTextIcon,
  QUICK_TEXT_RIGHT_ICON: 'chatbubble-ellipses-outline' as QuickTextIcon,
} as const;

// ============================================================================
// Timing Constants (in milliseconds)
// ============================================================================

export const TIMINGS = {
  // UI Feedback
  QUICK_TEXT_TOOLTIP_HIDE_MS: 1600,
  HISTORY_NOTICE_HIDE_MS: 2200,
  AUTH_TOKEN_AUTO_MASK_MS: 12000,
  BOTTOM_STATUS_COMPLETE_HOLD_MS: 1300,

  // Send & Retry
  DUPLICATE_SEND_BLOCK_MS: 1400,
  IDEMPOTENCY_REUSE_WINDOW_MS: 60_000,
  SEND_TIMEOUT_MS: 30_000,

  // Outbox
  OUTBOX_RETRY_BASE_MS: 1800,
  OUTBOX_RETRY_MAX_MS: 20_000,

  // Gateway Health
  GATEWAY_HEALTH_CHECK_TIMEOUT_MS: 4000,
  GATEWAY_HEALTH_CHECK_INTERVAL_MS: 18_000,

  // Startup Auto Connect
  STARTUP_AUTO_CONNECT_MAX_ATTEMPTS: 3,
  STARTUP_AUTO_CONNECT_RETRY_BASE_MS: 1400,

  // Final Response Recovery
  FINAL_RESPONSE_RECOVERY_BASE_DELAY_MS: 1300,
  FINAL_RESPONSE_RECOVERY_MAX_ATTEMPTS: 2,

  // Missing Response Recovery
  MISSING_RESPONSE_RECOVERY_INITIAL_DELAY_MS: 5200,
  MISSING_RESPONSE_RECOVERY_RETRY_BASE_MS: 2600,
  MISSING_RESPONSE_RECOVERY_MAX_ATTEMPTS: 3,

  // History Sync
  HISTORY_SYNC_INITIAL_DELAY_MS: 280,
  HISTORY_SYNC_RETRY_BASE_MS: 900,
  HISTORY_SYNC_MAX_ATTEMPTS: 3,
  HISTORY_REFRESH_TIMEOUT_MS: 20_000,
} as const;

// ============================================================================
// UI Constants
// ============================================================================

export const UI = {
  MAX_TEXT_SCALE: 1.35,
  MAX_TEXT_SCALE_TIGHT: 1.15,
  HISTORY_BOTTOM_THRESHOLD_PX: 72,
} as const;

// ============================================================================
// Label Mappings
// ============================================================================

export const CONNECTION_LABELS: Record<ConnectionState, string> = {
  disconnected: 'Disconnected',
  connecting: 'Connecting',
  connected: 'Connected',
  reconnecting: 'Connecting',
};

export const BOTTOM_ACTION_STATUS_LABELS: Record<BottomActionStatus, string> = {
  disconnected: 'Disconnected',
  connecting: 'Connecting',
  ready: 'Ready',
  recording: 'Recording',
  sending: 'Sending',
  retrying: 'Retrying',
  complete: 'Complete',
  error: 'Error',
};

// ============================================================================
// Option Lists
// ============================================================================

export const SPEECH_LANG_OPTIONS: Array<{ value: SpeechLang; label: string }> =
  [
    { value: 'ja-JP', label: '日本語' },
    { value: 'en-US', label: 'English' },
  ];

export const QUICK_TEXT_ICON_OPTIONS: Array<{
  value: QuickTextIcon;
  label: string;
}> = [
  { value: 'chatbubble-ellipses-outline', label: 'Chat' },
  { value: 'flash-outline', label: 'Flash' },
  { value: 'checkmark-done-outline', label: 'Done' },
  { value: 'bookmark-outline', label: 'Bookmark' },
  { value: 'heart-outline', label: 'Heart' },
  { value: 'star-outline', label: 'Star' },
];

export const QUICK_TEXT_ICON_SET = new Set<QuickTextIcon>(
  QUICK_TEXT_ICON_OPTIONS.map((option) => option.value),
);

// ============================================================================
// Messages
// ============================================================================

export const MESSAGES = {
  ONBOARDING_SAMPLE:
    'Hello OpenClaw! Please reply with a short greeting.',
} as const;

// ============================================================================
// Legacy Exports (for backward compatibility during migration)
// ============================================================================

// Default values
export const DEFAULT_GATEWAY_URL: string = DEFAULTS.GATEWAY_URL;
export const DEFAULT_THEME: AppTheme = DEFAULTS.THEME;
export const DEFAULT_SPEECH_LANG: SpeechLang = DEFAULTS.SPEECH_LANG;
export const DEFAULT_SESSION_KEY: string = DEFAULTS.SESSION_KEY;
export const DEFAULT_QUICK_TEXT_LEFT: string = DEFAULTS.QUICK_TEXT_LEFT;
export const DEFAULT_QUICK_TEXT_RIGHT: string = DEFAULTS.QUICK_TEXT_RIGHT;
export const DEFAULT_QUICK_TEXT_LEFT_ICON: QuickTextIcon = DEFAULTS.QUICK_TEXT_LEFT_ICON;
export const DEFAULT_QUICK_TEXT_RIGHT_ICON: QuickTextIcon = DEFAULTS.QUICK_TEXT_RIGHT_ICON;

// Timing constants
export const QUICK_TEXT_TOOLTIP_HIDE_MS = TIMINGS.QUICK_TEXT_TOOLTIP_HIDE_MS;
export const HISTORY_NOTICE_HIDE_MS = TIMINGS.HISTORY_NOTICE_HIDE_MS;
export const AUTH_TOKEN_AUTO_MASK_MS = TIMINGS.AUTH_TOKEN_AUTO_MASK_MS;
export const BOTTOM_STATUS_COMPLETE_HOLD_MS = TIMINGS.BOTTOM_STATUS_COMPLETE_HOLD_MS;
export const DUPLICATE_SEND_BLOCK_MS = TIMINGS.DUPLICATE_SEND_BLOCK_MS;
export const IDEMPOTENCY_REUSE_WINDOW_MS = TIMINGS.IDEMPOTENCY_REUSE_WINDOW_MS;
export const SEND_TIMEOUT_MS = TIMINGS.SEND_TIMEOUT_MS;
export const OUTBOX_RETRY_BASE_MS = TIMINGS.OUTBOX_RETRY_BASE_MS;
export const OUTBOX_RETRY_MAX_MS = TIMINGS.OUTBOX_RETRY_MAX_MS;
export const GATEWAY_HEALTH_CHECK_TIMEOUT_MS = TIMINGS.GATEWAY_HEALTH_CHECK_TIMEOUT_MS;
export const GATEWAY_HEALTH_CHECK_INTERVAL_MS = TIMINGS.GATEWAY_HEALTH_CHECK_INTERVAL_MS;
export const STARTUP_AUTO_CONNECT_MAX_ATTEMPTS = TIMINGS.STARTUP_AUTO_CONNECT_MAX_ATTEMPTS;
export const STARTUP_AUTO_CONNECT_RETRY_BASE_MS = TIMINGS.STARTUP_AUTO_CONNECT_RETRY_BASE_MS;
export const FINAL_RESPONSE_RECOVERY_BASE_DELAY_MS = TIMINGS.FINAL_RESPONSE_RECOVERY_BASE_DELAY_MS;
export const FINAL_RESPONSE_RECOVERY_MAX_ATTEMPTS = TIMINGS.FINAL_RESPONSE_RECOVERY_MAX_ATTEMPTS;
export const MISSING_RESPONSE_RECOVERY_INITIAL_DELAY_MS = TIMINGS.MISSING_RESPONSE_RECOVERY_INITIAL_DELAY_MS;
export const MISSING_RESPONSE_RECOVERY_RETRY_BASE_MS = TIMINGS.MISSING_RESPONSE_RECOVERY_RETRY_BASE_MS;
export const MISSING_RESPONSE_RECOVERY_MAX_ATTEMPTS = TIMINGS.MISSING_RESPONSE_RECOVERY_MAX_ATTEMPTS;
export const HISTORY_SYNC_INITIAL_DELAY_MS = TIMINGS.HISTORY_SYNC_INITIAL_DELAY_MS;
export const HISTORY_SYNC_RETRY_BASE_MS = TIMINGS.HISTORY_SYNC_RETRY_BASE_MS;
export const HISTORY_SYNC_MAX_ATTEMPTS = TIMINGS.HISTORY_SYNC_MAX_ATTEMPTS;
export const HISTORY_REFRESH_TIMEOUT_MS = TIMINGS.HISTORY_REFRESH_TIMEOUT_MS;

// UI constants
export const MAX_TEXT_SCALE = UI.MAX_TEXT_SCALE;
export const MAX_TEXT_SCALE_TIGHT = UI.MAX_TEXT_SCALE_TIGHT;
export const HISTORY_BOTTOM_THRESHOLD_PX = UI.HISTORY_BOTTOM_THRESHOLD_PX;

// Messages
export const ONBOARDING_SAMPLE_MESSAGE = MESSAGES.ONBOARDING_SAMPLE;
