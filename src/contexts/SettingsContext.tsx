/**
 * Settings Context for OpenClaw Voice
 *
 * Manages user settings: speech language, quick text buttons, gateway configuration.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { QuickTextIcon, SpeechLang } from '../types';
import {
  DEFAULT_GATEWAY_URL,
  DEFAULT_QUICK_TEXT_LEFT,
  DEFAULT_QUICK_TEXT_LEFT_ICON,
  DEFAULT_QUICK_TEXT_RIGHT,
  DEFAULT_QUICK_TEXT_RIGHT_ICON,
  DEFAULT_SPEECH_LANG,
  QUICK_TEXT_ICON_SET,
  STORAGE_KEYS,
} from '../utils';
import { getKvStore } from '../utils/kv-store';

// ============================================================================
// Types
// ============================================================================

type SettingsState = {
  gatewayUrl: string;
  authToken: string;
  speechLang: SpeechLang;
  quickTextLeft: string;
  quickTextRight: string;
  quickTextLeftIcon: QuickTextIcon;
  quickTextRightIcon: QuickTextIcon;
  isOnboardingCompleted: boolean;
};

type SettingsActions = {
  setGatewayUrl: (url: string) => void;
  setAuthToken: (token: string) => void;
  setSpeechLang: (lang: SpeechLang) => void;
  setQuickTextLeft: (text: string) => void;
  setQuickTextRight: (text: string) => void;
  setQuickTextLeftIcon: (icon: QuickTextIcon) => void;
  setQuickTextRightIcon: (icon: QuickTextIcon) => void;
  setOnboardingCompleted: (completed: boolean) => void;
  saveSettings: () => Promise<void>;
};

type SettingsContextValue = SettingsState &
  SettingsActions & {
    isReady: boolean;
    isSaving: boolean;
    pendingSaveCount: number;
    lastSavedAt: number | null;
    saveError: string | null;
  };

// ============================================================================
// Context
// ============================================================================

const SettingsContext = createContext<SettingsContextValue | undefined>(
  undefined,
);

// ============================================================================
// Provider
// ============================================================================

type SettingsProviderProps = {
  children: ReactNode;
};

export function SettingsProvider({ children }: SettingsProviderProps) {
  const [isReady, setIsReady] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingSaveCount, setPendingSaveCount] = useState(0);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const hasHydratedRef = useRef(false);

  // Settings state
  const [gatewayUrl, setGatewayUrl] = useState(DEFAULT_GATEWAY_URL);
  const [authToken, setAuthToken] = useState('');
  const [speechLang, setSpeechLang] = useState<SpeechLang>(DEFAULT_SPEECH_LANG);
  const [quickTextLeft, setQuickTextLeft] = useState(DEFAULT_QUICK_TEXT_LEFT);
  const [quickTextRight, setQuickTextRight] = useState(DEFAULT_QUICK_TEXT_RIGHT);
  const [quickTextLeftIcon, setQuickTextLeftIcon] = useState<QuickTextIcon>(
    DEFAULT_QUICK_TEXT_LEFT_ICON,
  );
  const [quickTextRightIcon, setQuickTextRightIcon] = useState<QuickTextIcon>(
    DEFAULT_QUICK_TEXT_RIGHT_ICON,
  );
  const [isOnboardingCompleted, setIsOnboardingCompleted] = useState(false);

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const store = getKvStore();
        const [
          savedUrl,
          savedToken,
          savedLang,
          savedLeft,
          savedRight,
          savedLeftIcon,
          savedRightIcon,
          savedOnboarding,
        ] = await Promise.all([
          store.getItemAsync(STORAGE_KEYS.gatewayUrl),
          store.getItemAsync(STORAGE_KEYS.authToken),
          store.getItemAsync(STORAGE_KEYS.speechLang),
          store.getItemAsync(STORAGE_KEYS.quickTextLeft),
          store.getItemAsync(STORAGE_KEYS.quickTextRight),
          store.getItemAsync(STORAGE_KEYS.quickTextLeftIcon),
          store.getItemAsync(STORAGE_KEYS.quickTextRightIcon),
          store.getItemAsync(STORAGE_KEYS.onboardingCompleted),
        ]);

        if (savedUrl) setGatewayUrl(savedUrl);
        if (savedToken) setAuthToken(savedToken);
        if (savedLang === 'ja-JP' || savedLang === 'en-US') {
          setSpeechLang(savedLang);
        }
        if (savedLeft) setQuickTextLeft(savedLeft);
        if (savedRight) setQuickTextRight(savedRight);
        if (savedLeftIcon && QUICK_TEXT_ICON_SET.has(savedLeftIcon as QuickTextIcon)) {
          setQuickTextLeftIcon(savedLeftIcon as QuickTextIcon);
        }
        if (savedRightIcon && QUICK_TEXT_ICON_SET.has(savedRightIcon as QuickTextIcon)) {
          setQuickTextRightIcon(savedRightIcon as QuickTextIcon);
        }
        if (savedOnboarding === 'true') {
          setIsOnboardingCompleted(true);
        }
      } catch {
        // Ignore errors, use defaults
      } finally {
        setIsReady(true);
      }
    };
    void loadSettings();
  }, []);

  // Save settings
  const persistSettingsSnapshot = useCallback(async () => {
    setSaveError(null);
    const store = getKvStore();
    await Promise.all([
      store.setItemAsync(STORAGE_KEYS.gatewayUrl, gatewayUrl),
      authToken
        ? store.setItemAsync(STORAGE_KEYS.authToken, authToken)
        : store.deleteItemAsync(STORAGE_KEYS.authToken),
      store.setItemAsync(STORAGE_KEYS.speechLang, speechLang),
      store.setItemAsync(STORAGE_KEYS.quickTextLeft, quickTextLeft),
      store.setItemAsync(STORAGE_KEYS.quickTextRight, quickTextRight),
      store.setItemAsync(STORAGE_KEYS.quickTextLeftIcon, quickTextLeftIcon),
      store.setItemAsync(STORAGE_KEYS.quickTextRightIcon, quickTextRightIcon),
      store.setItemAsync(
        STORAGE_KEYS.onboardingCompleted,
        isOnboardingCompleted ? 'true' : 'false',
      ),
    ]);
  }, [
    gatewayUrl,
    authToken,
    speechLang,
    quickTextLeft,
    quickTextRight,
    quickTextLeftIcon,
    quickTextRightIcon,
    isOnboardingCompleted,
  ]);

  const saveSettings = useCallback(async () => {
    setIsSaving(true);
    setPendingSaveCount(1);
    try {
      await persistSettingsSnapshot();
      setLastSavedAt(Date.now());
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setSaveError(message);
      throw err;
    } finally {
      setPendingSaveCount(0);
      setIsSaving(false);
    }
  }, [persistSettingsSnapshot]);

  useEffect(() => {
    if (!isReady) return;

    if (!hasHydratedRef.current) {
      hasHydratedRef.current = true;
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      if (cancelled) return;
      setPendingSaveCount(1);
      setIsSaving(true);
      setSaveError(null);
      void persistSettingsSnapshot()
        .then(() => {
          if (cancelled) return;
          setLastSavedAt(Date.now());
        })
        .catch((err) => {
          if (cancelled) return;
          const message = err instanceof Error ? err.message : String(err);
          setSaveError(message);
        })
        .finally(() => {
          if (cancelled) return;
          setPendingSaveCount(0);
          setIsSaving(false);
        });
    }, 120);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    authToken,
    gatewayUrl,
    isOnboardingCompleted,
    isReady,
    persistSettingsSnapshot,
    quickTextLeft,
    quickTextLeftIcon,
    quickTextRight,
    quickTextRightIcon,
    speechLang,
  ]);

  const value = useMemo<SettingsContextValue>(
    () => ({
      // State
      gatewayUrl,
      authToken,
      speechLang,
      quickTextLeft,
      quickTextRight,
      quickTextLeftIcon,
      quickTextRightIcon,
      isOnboardingCompleted,
      isReady,
      isSaving,
      pendingSaveCount,
      lastSavedAt,
      saveError,
      // Actions
      setGatewayUrl,
      setAuthToken,
      setSpeechLang,
      setQuickTextLeft,
      setQuickTextRight,
      setQuickTextLeftIcon,
      setQuickTextRightIcon,
      setOnboardingCompleted: setIsOnboardingCompleted,
      saveSettings,
    }),
    [
      gatewayUrl,
      authToken,
      speechLang,
      quickTextLeft,
      quickTextRight,
      quickTextLeftIcon,
      quickTextRightIcon,
      isOnboardingCompleted,
      isReady,
      isSaving,
      pendingSaveCount,
      lastSavedAt,
      saveError,
      saveSettings,
    ],
  );

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

// ============================================================================
// Hook
// ============================================================================

export function useSettings(): SettingsContextValue {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}

// ============================================================================
// Exports
// ============================================================================

export type { SettingsState, SettingsActions, SettingsContextValue };
