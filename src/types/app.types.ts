/**
 * Core application types for OpenClaw Voice
 */

import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';

// ============================================================================
// Theme & Display
// ============================================================================

export type AppTheme = 'dark' | 'light';

export type HomeDisplayMode = 'idle' | 'composing' | 'sending';

export type BottomActionStatus =
  | 'disconnected'
  | 'connecting'
  | 'ready'
  | 'recording'
  | 'sending'
  | 'retrying'
  | 'complete'
  | 'error';

export type FocusField =
  | 'gateway-url'
  | 'auth-token'
  | 'quick-text-left'
  | 'quick-text-right'
  | 'transcript'
  | null;

// ============================================================================
// Speech & Input
// ============================================================================

export type SpeechLang = 'ja-JP' | 'en-US';

export type QuickTextButtonSide = 'left' | 'right';

export type QuickTextFocusField = 'quick-text-left' | 'quick-text-right';

export type QuickTextIcon = ComponentProps<typeof Ionicons>['name'];

// Re-export ComponentProps for use in App.tsx
export type { ComponentProps } from 'react';

// ============================================================================
// Gateway & Connection
// ============================================================================

export type GatewayHealthState = 'unknown' | 'checking' | 'ok' | 'degraded';

export type GatewayConnectDiagnosticKind =
  | 'invalid-url'
  | 'timeout'
  | 'tls'
  | 'auth'
  | 'dns'
  | 'network'
  | 'server'
  | 'pairing'
  | 'unknown';

export type GatewayConnectDiagnostic = {
  kind: GatewayConnectDiagnosticKind;
  summary: string;
  guidance: string;
};

// ============================================================================
// Storage
// ============================================================================

export type KeyValueStore = {
  getItemAsync: (key: string) => Promise<string | null>;
  setItemAsync: (key: string, value: string) => Promise<void>;
  deleteItemAsync: (key: string) => Promise<void>;
};
