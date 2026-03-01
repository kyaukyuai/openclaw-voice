export const SETTINGS_KEY = 'openclaw-pocket.macos.settings.v2';
export const OPENCLAW_IDENTITY_STORAGE_KEY = 'openclaw_device_identity';

export const DEFAULTS = {
  gatewayUrl: '',
  authToken: '',
  sessionKey: 'main',
  quickTextLeft: 'Thank you',
  quickTextRight: 'Please help me with this.',
  theme: 'light',
};

export const DEFAULT_GATEWAY_PROFILE = {
  id: 'gateway-main',
  name: 'Gateway 1',
  gatewayUrl: DEFAULTS.gatewayUrl,
  authToken: DEFAULTS.authToken,
  sessionKey: DEFAULTS.sessionKey,
  sessions: [DEFAULTS.sessionKey],
};

export const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHMENT_COUNT = 5;
export const MESSAGE_NOTIFICATION_MAX_LENGTH = 180;
export const COMPOSER_LINE_HEIGHT = 20;
export const COMPOSER_VERTICAL_PADDING = 18;
export const COMPOSER_MIN_LINES = 2;
export const COMPOSER_MAX_LINES = 8;
export const COMPOSER_MIN_HEIGHT = COMPOSER_MIN_LINES * COMPOSER_LINE_HEIGHT + COMPOSER_VERTICAL_PADDING;
export const COMPOSER_MAX_HEIGHT = COMPOSER_MAX_LINES * COMPOSER_LINE_HEIGHT + COMPOSER_VERTICAL_PADDING;
export const DEFAULT_NOTIFICATION_SETTINGS = {
  enabled: true,
  muteForeground: true,
  byGatewayId: {},
};

export const DEFAULT_TELEMETRY_COUNTERS = {
  connectAttempts: 0,
  connectFailures: 0,
  reconnectAttempts: 0,
  sendAttempts: 0,
  sendFailures: 0,
  refreshAttempts: 0,
  refreshFailures: 0,
  refreshTimeouts: 0,
  assistantReplies: 0,
};

export const DEFAULT_TELEMETRY_SNAPSHOT = {
  lastUpdatedAt: null,
  totals: { ...DEFAULT_TELEMETRY_COUNTERS },
  byGatewayId: {},
};

export const THEMES = {
  light: {
    bg: '#F7F8FA',
    card: '#FFFFFF',
    input: '#F3F4F6',
    textPrimary: '#111827',
    textSecondary: '#374151',
    textMuted: '#6B7280',
    textDisabled: '#9CA3AF',
    placeholder: '#6B7280',
    inputCaret: '#2563EB',
    inputBorder: 'rgba(17,24,39,0.12)',
    inputBorderFocus: '#2563EB',
    dividerStrong: 'rgba(17,24,39,0.08)',
    sidebar: '#FCFCFD',
    sideActiveBg: 'rgba(37,99,235,0.07)',
    sideActiveInk: '#1D4ED8',
    emptyIconBg: 'rgba(37,99,235,0.07)',
    assistantBubble: '#FFFFFF',
    assistantBubbleBorder: 'rgba(17,24,39,0.08)',
    hintBg: 'rgba(17,24,39,0.05)',
  },
  dark: {
    bg: '#0F1115',
    card: '#171A20',
    input: '#1E232D',
    textPrimary: '#E5E7EB',
    textSecondary: '#C2C8D0',
    textMuted: '#94A0AE',
    textDisabled: '#6B7280',
    placeholder: '#8B97A6',
    inputCaret: '#60A5FA',
    inputBorder: 'rgba(255,255,255,0.14)',
    inputBorderFocus: '#60A5FA',
    dividerStrong: 'rgba(255,255,255,0.10)',
    sidebar: '#11141A',
    sideActiveBg: 'rgba(96,165,250,0.14)',
    sideActiveInk: '#93C5FD',
    emptyIconBg: 'rgba(96,165,250,0.12)',
    assistantBubble: '#1B212B',
    assistantBubbleBorder: 'rgba(255,255,255,0.10)',
    hintBg: 'rgba(255,255,255,0.07)',
  },
};

export const SEMANTIC = {
  blue: '#2563EB',
  green: '#059669',
  amber: '#D97706',
  red: '#DC2626',
  blueSoft: 'rgba(37,99,235,0.07)',
  greenSoft: 'rgba(5,150,105,0.07)',
  amberSoft: 'rgba(217,119,6,0.07)',
};

export const INITIAL_CONTROLLER_STATE = {
  connectionState: 'disconnected',
  turns: [],
  isSending: false,
  isSyncing: false,
  syncError: null,
  sendError: null,
  banner: null,
  status: {
    key: 'disconnected',
    label: 'Disconnected',
    color: '#6b7280',
    backgroundColor: '#f3f4f6',
  },
  lastUpdatedAt: null,
};
