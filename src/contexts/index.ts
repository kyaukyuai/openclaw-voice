/**
 * Context exports for OpenClaw Voice
 */

export { ThemeProvider, useTheme, useThemedStyles, DARK_COLORS, LIGHT_COLORS } from './ThemeContext';
export type { ThemeColors, ThemeContextValue } from './ThemeContext';

export { SettingsProvider, useSettings } from './SettingsContext';
export type { SettingsState, SettingsActions, SettingsContextValue } from './SettingsContext';

export { GatewayProvider, useGateway } from './GatewayContext';
export type { GatewayState, GatewayActions, GatewayContextValue } from './GatewayContext';
