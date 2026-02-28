import { useCallback, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setStorage } from '../../../src/openclaw/storage';
import {
  DEFAULT_GATEWAY_PROFILE,
  DEFAULTS,
  SETTINGS_KEY,
  THEMES,
} from '../logic/app-constants';
import { createGatewayRuntime } from '../logic/app-logic';

const identityCache = new Map();

setStorage({
  getString(key) {
    return identityCache.get(key);
  },
  set(key, value) {
    identityCache.set(key, value);
    AsyncStorage.setItem(key, value).catch(() => {
      // Best-effort persistence.
    });
  },
});

export default function useMacosRuntimeState() {
  const [booting, setBooting] = useState(true);
  const [identityReady, setIdentityReady] = useState(false);
  const [identityPersistWarning, setIdentityPersistWarning] = useState(null);

  const [gatewayName, setGatewayName] = useState(DEFAULT_GATEWAY_PROFILE.name);
  const [gatewayUrl, setGatewayUrl] = useState(DEFAULT_GATEWAY_PROFILE.gatewayUrl);
  const [authToken, setAuthToken] = useState(DEFAULT_GATEWAY_PROFILE.authToken);
  const [sessionKey, setSessionKey] = useState(DEFAULT_GATEWAY_PROFILE.sessionKey);
  const [gatewayProfiles, setGatewayProfiles] = useState([DEFAULT_GATEWAY_PROFILE]);
  const [activeGatewayId, setActiveGatewayId] = useState(DEFAULT_GATEWAY_PROFILE.id);

  const [quickTextLeft, setQuickTextLeft] = useState(DEFAULTS.quickTextLeft);
  const [quickTextRight, setQuickTextRight] = useState(DEFAULTS.quickTextRight);
  const [theme, setTheme] = useState(DEFAULTS.theme);
  const [isAuthTokenVisible, setIsAuthTokenVisible] = useState(false);
  const [activeNav, setActiveNav] = useState('settings');
  const [focusedSettingsInput, setFocusedSettingsInput] = useState(null);
  const [focusedGatewayId, setFocusedGatewayId] = useState(null);
  const [collapsedGatewayIds, setCollapsedGatewayIds] = useState({});
  const [quickMenuOpenByGatewayId, setQuickMenuOpenByGatewayId] = useState({});
  const [forcedSelectionByGatewayId, setForcedSelectionByGatewayId] = useState({});

  const [gatewayRuntimeById, setGatewayRuntimeById] = useState(() => ({
    [DEFAULT_GATEWAY_PROFILE.id]: createGatewayRuntime(),
  }));

  const gatewayRuntimeByIdRef = useRef(gatewayRuntimeById);
  const composerInputRefs = useRef(new Map());
  const composerFocusTimerRef = useRef(null);
  const isImeComposingByGatewayIdRef = useRef({});
  const skipSubmitEditingByGatewayIdRef = useRef({});
  const forcedSelectionByGatewayIdRef = useRef({});
  const authTokenInputRef = useRef(null);
  const rootRef = useRef(null);
  const lastAutoConnectSignatureByIdRef = useRef({});
  const manualDisconnectByIdRef = useRef({});
  const initialAutoNavigationHandledRef = useRef(false);
  const activeNavRef = useRef(activeNav);
  const activeGatewayIdRef = useRef(activeGatewayId);
  const activeSessionKeyRef = useRef(sessionKey);
  const gatewayProfilesRef = useRef(gatewayProfiles);
  const lastHandledNotificationRouteSignatureRef = useRef('');
  const pendingNotificationRouteRef = useRef(null);

  const themeTokens = theme === 'dark' ? THEMES.dark : THEMES.light;

  const updateGatewayRuntime = useCallback((gatewayId, updater) => {
    setGatewayRuntimeById((previous) => {
      const current = previous[gatewayId] ?? createGatewayRuntime();
      const next = typeof updater === 'function' ? updater(current) : { ...current, ...updater };
      if (next === current) return previous;
      return { ...previous, [gatewayId]: next };
    });
  }, []);

  const persistSettings = useCallback(async (next) => {
    try {
      await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    } catch {
      // Keep running with in-memory values.
    }
  }, []);

  return {
    activeGatewayId,
    activeGatewayIdRef,
    activeNav,
    activeNavRef,
    activeSessionKeyRef,
    authToken,
    authTokenInputRef,
    booting,
    collapsedGatewayIds,
    composerFocusTimerRef,
    composerInputRefs,
    focusedGatewayId,
    focusedSettingsInput,
    forcedSelectionByGatewayId,
    forcedSelectionByGatewayIdRef,
    gatewayName,
    gatewayProfiles,
    gatewayProfilesRef,
    gatewayRuntimeById,
    gatewayRuntimeByIdRef,
    gatewayUrl,
    identityCache,
    identityPersistWarning,
    identityReady,
    initialAutoNavigationHandledRef,
    isAuthTokenVisible,
    isImeComposingByGatewayIdRef,
    lastAutoConnectSignatureByIdRef,
    lastHandledNotificationRouteSignatureRef,
    manualDisconnectByIdRef,
    pendingNotificationRouteRef,
    persistSettings,
    quickMenuOpenByGatewayId,
    quickTextLeft,
    quickTextRight,
    rootRef,
    sessionKey,
    setActiveGatewayId,
    setActiveNav,
    setAuthToken,
    setBooting,
    setCollapsedGatewayIds,
    setFocusedGatewayId,
    setFocusedSettingsInput,
    setForcedSelectionByGatewayId,
    setGatewayName,
    setGatewayProfiles,
    setGatewayRuntimeById,
    setGatewayUrl,
    setIdentityPersistWarning,
    setIdentityReady,
    setIsAuthTokenVisible,
    setQuickMenuOpenByGatewayId,
    setQuickTextLeft,
    setQuickTextRight,
    setSessionKey,
    setTheme,
    skipSubmitEditingByGatewayIdRef,
    theme,
    themeTokens,
    updateGatewayRuntime,
  };
}
