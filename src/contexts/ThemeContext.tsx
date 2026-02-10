/**
 * Theme Context for OpenClaw Voice
 *
 * Provides theme state (dark/light) and toggle functionality across the app.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { StyleSheet } from 'react-native';
import type { AppTheme } from '../types';
import { DEFAULT_THEME, STORAGE_KEYS } from '../utils';
import { getKvStore } from '../utils/kv-store';

// ============================================================================
// Types
// ============================================================================

type ThemeColors = {
  background: string;
  surface: string;
  surfaceSecondary: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  primary: string;
  success: string;
  error: string;
  warning: string;
};

type ThemeContextValue = {
  theme: AppTheme;
  colors: ThemeColors;
  isDark: boolean;
  setTheme: (theme: AppTheme) => void;
  toggleTheme: () => void;
};

// ============================================================================
// Color Palettes
// ============================================================================

const DARK_COLORS: ThemeColors = {
  background: '#000000',
  surface: '#1c1c1e',
  surfaceSecondary: '#2c2c2e',
  text: '#ffffff',
  textSecondary: '#ebebf5',
  textMuted: '#8e8e93',
  border: '#38383a',
  primary: '#0a84ff',
  success: '#30d158',
  error: '#ff453a',
  warning: '#ffd60a',
};

const LIGHT_COLORS: ThemeColors = {
  background: '#ffffff',
  surface: '#f2f2f7',
  surfaceSecondary: '#e5e5ea',
  text: '#000000',
  textSecondary: '#3c3c43',
  textMuted: '#8e8e93',
  border: '#c6c6c8',
  primary: '#007aff',
  success: '#34c759',
  error: '#ff3b30',
  warning: '#ffcc00',
};

// ============================================================================
// Context
// ============================================================================

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

// ============================================================================
// Provider
// ============================================================================

type ThemeProviderProps = {
  children: ReactNode;
  initialTheme?: AppTheme;
};

export function ThemeProvider({
  children,
  initialTheme = DEFAULT_THEME,
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<AppTheme>(initialTheme);

  // Load saved theme on mount
  useEffect(() => {
    const loadTheme = async () => {
      try {
        const saved = await getKvStore().getItemAsync(STORAGE_KEYS.theme);
        if (saved === 'dark' || saved === 'light') {
          setThemeState(saved);
        }
      } catch {
        // Ignore errors, use default
      }
    };
    void loadTheme();
  }, []);

  const setTheme = useCallback((newTheme: AppTheme) => {
    setThemeState(newTheme);
    void getKvStore()
      .setItemAsync(STORAGE_KEYS.theme, newTheme)
      .catch(() => {
        // Ignore persistence errors
      });
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      colors: theme === 'dark' ? DARK_COLORS : LIGHT_COLORS,
      isDark: theme === 'dark',
      setTheme,
      toggleTheme,
    }),
    [theme, setTheme, toggleTheme],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

// ============================================================================
// Hook
// ============================================================================

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

// ============================================================================
// Utility: Create themed styles
// ============================================================================

export function useThemedStyles<T extends StyleSheet.NamedStyles<T>>(
  styleFactory: (colors: ThemeColors, isDark: boolean) => T,
): T {
  const { colors, isDark } = useTheme();
  return useMemo(() => styleFactory(colors, isDark), [colors, isDark, styleFactory]);
}

// ============================================================================
// Exports
// ============================================================================

export { DARK_COLORS, LIGHT_COLORS };
export type { ThemeColors, ThemeContextValue };
