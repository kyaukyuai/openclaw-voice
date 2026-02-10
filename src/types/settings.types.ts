/**
 * Settings and session types for OpenClaw Voice
 */

// ============================================================================
// Session Preferences
// ============================================================================

export type SessionPreference = {
  alias?: string;
  pinned?: boolean;
};

export type SessionPreferences = Record<string, SessionPreference>;

// ============================================================================
// Storage Keys
// ============================================================================

export const STORAGE_KEYS = {
  gatewayUrl: 'mobile-openclaw.gateway-url',
  authToken: 'mobile-openclaw.auth-token',
  onboardingCompleted: 'mobile-openclaw.onboarding-completed',
  theme: 'mobile-openclaw.theme',
  speechLang: 'mobile-openclaw.speech-lang',
  quickTextLeft: 'mobile-openclaw.quick-text-left',
  quickTextRight: 'mobile-openclaw.quick-text-right',
  quickTextLeftIcon: 'mobile-openclaw.quick-text-left-icon',
  quickTextRightIcon: 'mobile-openclaw.quick-text-right-icon',
  sessionKey: 'mobile-openclaw.session-key',
  sessionPrefs: 'mobile-openclaw.session-prefs',
  outboxQueue: 'mobile-openclaw.outbox-queue',
} as const;

export type StorageKey = typeof STORAGE_KEYS[keyof typeof STORAGE_KEYS];

export const OPENCLAW_IDENTITY_STORAGE_KEY = 'openclaw_device_identity';
