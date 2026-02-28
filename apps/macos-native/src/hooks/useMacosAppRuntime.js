import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  insertQuickTextAtSelection,
} from '../../../src/shared';
import { setStorage } from '../../../src/openclaw/storage';
import {
  DEFAULT_GATEWAY_PROFILE,
  DEFAULT_NOTIFICATION_SETTINGS,
  DEFAULTS,
  INITIAL_CONTROLLER_STATE,
  OPENCLAW_IDENTITY_STORAGE_KEY,
  SEMANTIC,
  SETTINGS_KEY,
  THEMES,
} from '../logic/app-constants';
import {
  buildRuntimeMap,
  createGatewayProfile,
  createGatewayRuntime,
  estimateComposerHeightFromText,
  extractNotificationRoute,
  isSameStringArray,
  mergeSessionKeys,
  normalizeComposerSelection,
  normalizeNotificationSettings,
  normalizeSessionKey,
  normalizeText,
} from '../logic/app-logic';
import useMacosAttachmentRuntime from './useMacosAttachmentRuntime';
import useMacosGatewayProfileActions from './useMacosGatewayProfileActions';
import useMacosHistoryScrollRuntime from './useMacosHistoryScrollRuntime';
import useMacosNotificationRuntime from './useMacosNotificationRuntime';
import useMacosRootKeyHandler from './useMacosRootKeyHandler';
import useMacosGatewayControllerRuntime from './useMacosGatewayControllerRuntime';

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

export default function useMacosAppRuntime() {
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
  const {
    clearUnreadForSession,
    copiedMessageByKey,
    getPushNotificationModule,
    handleAssistantTurnArrival,
    handleCopyMessage,
    handleOpenExternalLink,
    isGatewayNotificationEnabled,
    lastNotifiedAssistantTurnByGatewayIdRef,
    notificationSettings,
    setNotificationSettings,
    toggleGatewayNotifications,
    toggleMuteForegroundNotifications,
    toggleNotificationsEnabled,
    unreadByGatewaySession,
  } = useMacosNotificationRuntime({
    activeGatewayIdRef,
    activeNavRef,
    activeSessionKeyRef,
    gatewayProfiles,
    gatewayProfilesRef,
  });
  const {
    clearGatewayHistoryRuntime,
    composerHeightByGatewayIdRef,
    hintHeightByGatewayIdRef,
    historyBottomInsetByGatewayId,
    historyContentHeightByGatewayIdRef,
    historyScrollRefs,
    historyViewportHeightByGatewayIdRef,
    pendingTurnFocusByGatewayIdRef,
    recomputeHistoryBottomInsetForGateway,
    scheduleHistoryBottomSync,
    scheduleHistoryTurnFocus,
  } = useMacosHistoryScrollRuntime({
    gatewayProfilesRef,
    gatewayRuntimeByIdRef,
  });

  const activeProfile = useMemo(
    () => gatewayProfiles.find((profile) => profile.id === activeGatewayId) ?? gatewayProfiles[0] ?? null,
    [activeGatewayId, gatewayProfiles],
  );

  const updateGatewayRuntime = useCallback((gatewayId, updater) => {
    setGatewayRuntimeById((previous) => {
      const current = previous[gatewayId] ?? createGatewayRuntime();
      const next = typeof updater === 'function' ? updater(current) : { ...current, ...updater };
      if (next === current) return previous;
      return { ...previous, [gatewayId]: next };
    });
  }, []);

  const currentSessionKeyForGateway = useCallback(
    (gatewayId) => {
      if (gatewayId === activeGatewayId) {
        return normalizeSessionKey(sessionKey);
      }
      const profile = gatewayProfiles.find((entry) => entry.id === gatewayId);
      return normalizeSessionKey(profile?.sessionKey);
    },
    [activeGatewayId, gatewayProfiles, sessionKey],
  );

  const setQuickMenuOpenForGateway = useCallback((gatewayId, isOpen) => {
    if (!gatewayId) return;
    setQuickMenuOpenByGatewayId((previous) => {
      if (!isOpen) {
        if (!previous[gatewayId]) return previous;
        const next = { ...previous };
        delete next[gatewayId];
        return next;
      }
      if (previous[gatewayId]) return previous;
      return { ...previous, [gatewayId]: true };
    });
  }, []);

  const closeAllQuickMenus = useCallback(() => {
    setQuickMenuOpenByGatewayId((previous) =>
      Object.keys(previous).length === 0 ? previous : {},
    );
  }, []);

  const setImeComposingForGateway = useCallback((gatewayId, isComposing) => {
    if (!gatewayId) return;
    if (isComposing) {
      isImeComposingByGatewayIdRef.current[gatewayId] = true;
      return;
    }
    delete isImeComposingByGatewayIdRef.current[gatewayId];
  }, []);

  const setForcedSelectionForGateway = useCallback((gatewayId, selection) => {
    if (!gatewayId) return;

    if (!selection) {
      delete forcedSelectionByGatewayIdRef.current[gatewayId];
      setForcedSelectionByGatewayId((previous) => {
        if (!(gatewayId in previous)) return previous;
        const next = { ...previous };
        delete next[gatewayId];
        return next;
      });
      return;
    }

    const normalized = {
      start: Number.isFinite(selection.start) ? selection.start : 0,
      end: Number.isFinite(selection.end) ? selection.end : Number.isFinite(selection.start) ? selection.start : 0,
    };

    forcedSelectionByGatewayIdRef.current[gatewayId] = normalized;
    setForcedSelectionByGatewayId((previous) => {
      const current = previous[gatewayId];
      if (current && current.start === normalized.start && current.end === normalized.end) {
        return previous;
      }
      return { ...previous, [gatewayId]: normalized };
    });
  }, []);

  const focusComposerForGateway = useCallback((gatewayId) => {
    if (!gatewayId) return;
    if (composerFocusTimerRef.current) {
      clearTimeout(composerFocusTimerRef.current);
    }
    composerFocusTimerRef.current = setTimeout(() => {
      composerFocusTimerRef.current = null;
      const input = composerInputRefs.current.get(gatewayId);
      input?.focus?.();
      setFocusedGatewayId(gatewayId);
    }, 0);
  }, []);
  const {
    attachmentNoticeByGatewayId,
    attachmentPickerGatewayId,
    clearPendingAttachmentsForGateway,
    dropActiveByGatewayId,
    handleAttachmentPick,
    handleDroppedFilesForGateway,
    removePendingAttachmentForGateway,
    setAttachmentNoticeForGateway,
    setAttachmentPickerGatewayId,
    setDropActiveByGatewayId,
    tryImportFromClipboardShortcut,
  } = useMacosAttachmentRuntime({
    activeGatewayId,
    currentSessionKeyForGateway,
    focusComposerForGateway,
    focusedGatewayId,
    gatewayRuntimeById,
    updateGatewayRuntime,
  });

  const {
    connectGateway,
    disconnectAndRemoveController,
    disconnectGateway,
    disposeAllControllers,
    getController,
    refreshHistory,
    refreshKnownSessions,
    sendMessage,
    syncControllersWithProfiles,
  } = useMacosGatewayControllerRuntime({
    activeGatewayId,
    authToken,
    clearGatewayHistoryRuntime,
    composerInputRefs,
    currentSessionKeyForGateway,
    focusComposerForGateway,
    gatewayName,
    gatewayProfiles,
    gatewayRuntimeById,
    gatewayUrl,
    handleAssistantTurnArrival,
    identityReady,
    isImeComposingByGatewayIdRef,
    lastNotifiedAssistantTurnByGatewayIdRef,
    manualDisconnectByIdRef,
    scheduleHistoryBottomSync,
    sessionKey,
    setAttachmentNoticeForGateway,
    setForcedSelectionForGateway,
    setGatewayProfiles,
    setImeComposingForGateway,
    updateGatewayRuntime,
  });

  const persistSettings = useCallback(async (next) => {
    try {
      await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    } catch {
      // Keep running with in-memory values.
    }
  }, []);

  const applyGatewayProfileToEditor = useCallback((profile) => {
    if (!profile) return;
    setGatewayName(profile.name);
    setGatewayUrl(profile.gatewayUrl);
    setAuthToken(profile.authToken);
    setSessionKey(normalizeSessionKey(profile.sessionKey));
    setIsAuthTokenVisible(false);
    setFocusedSettingsInput(null);
  }, []);

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const [savedSettingsRaw, savedIdentity] = await Promise.all([
          AsyncStorage.getItem(SETTINGS_KEY),
          AsyncStorage.getItem(OPENCLAW_IDENTITY_STORAGE_KEY),
        ]);

        let nextProfiles = [DEFAULT_GATEWAY_PROFILE];
        let nextActiveId = DEFAULT_GATEWAY_PROFILE.id;
        let nextQuickTextLeft = DEFAULTS.quickTextLeft;
        let nextQuickTextRight = DEFAULTS.quickTextRight;
        let nextTheme = DEFAULTS.theme;
        let nextNotificationSettings = normalizeNotificationSettings(
          DEFAULT_NOTIFICATION_SETTINGS,
          nextProfiles,
        );

        if (savedSettingsRaw) {
          const parsed = JSON.parse(savedSettingsRaw);
          if (parsed && typeof parsed === 'object') {
            const legacySessionKey = normalizeSessionKey(parsed.sessionKey);
            const legacyGatewayUrl =
              typeof parsed.gatewayUrl === 'string' ? parsed.gatewayUrl : DEFAULTS.gatewayUrl;
            const legacyAuthToken =
              typeof parsed.authToken === 'string' ? parsed.authToken : DEFAULTS.authToken;

            const importedProfiles = [];
            const seen = new Set();
            if (Array.isArray(parsed.gateways)) {
              parsed.gateways.forEach((entry, index) => {
                const profile = createGatewayProfile(entry, index + 1);
                if (seen.has(profile.id)) return;
                seen.add(profile.id);
                importedProfiles.push(profile);
              });
            }

            if (importedProfiles.length === 0) {
              importedProfiles.push(
                createGatewayProfile(
                  {
                    id: DEFAULT_GATEWAY_PROFILE.id,
                    name: parsed.gatewayName,
                    gatewayUrl: legacyGatewayUrl,
                    authToken: legacyAuthToken,
                    sessionKey: legacySessionKey,
                    sessions: parsed.sessions,
                  },
                  1,
                ),
              );
            }

            nextProfiles = importedProfiles;
            const requestedActiveId =
              typeof parsed.activeGatewayId === 'string' ? parsed.activeGatewayId : '';
            nextActiveId =
              nextProfiles.find((entry) => entry.id === requestedActiveId)?.id ?? nextProfiles[0].id;

            if (typeof parsed.quickTextLeft === 'string') {
              nextQuickTextLeft = parsed.quickTextLeft;
            }
            if (typeof parsed.quickTextRight === 'string') {
              nextQuickTextRight = parsed.quickTextRight;
            }
            if (parsed.theme === 'light' || parsed.theme === 'dark') {
              nextTheme = parsed.theme;
            }
            nextNotificationSettings = normalizeNotificationSettings(
              parsed.notifications,
              nextProfiles,
            );
          }
        }

        setGatewayProfiles(nextProfiles);
        setActiveGatewayId(nextActiveId);
        setGatewayRuntimeById((previous) => buildRuntimeMap(nextProfiles, previous));
        applyGatewayProfileToEditor(nextProfiles.find((entry) => entry.id === nextActiveId) ?? nextProfiles[0]);
        setQuickTextLeft(nextQuickTextLeft);
        setQuickTextRight(nextQuickTextRight);
        setTheme(nextTheme);
        setNotificationSettings(nextNotificationSettings);

        if (savedIdentity) {
          identityCache.set(OPENCLAW_IDENTITY_STORAGE_KEY, savedIdentity);
        }
      } catch {
        setIdentityPersistWarning('Local identity persistence is limited in this runtime.');
      } finally {
        setIdentityReady(true);
        setBooting(false);
      }
    };

    bootstrap().catch(() => {
      // Ignore bootstrap failures and keep defaults.
    });
  }, [applyGatewayProfileToEditor, setNotificationSettings]);

  useEffect(() => {
    rootRef.current?.focus?.();
  }, []);

  useEffect(() => {
    gatewayProfilesRef.current = gatewayProfiles;
  }, [gatewayProfiles]);

  useEffect(() => {
    gatewayRuntimeByIdRef.current = gatewayRuntimeById;
  }, [gatewayRuntimeById]);

  useEffect(() => {
    activeNavRef.current = activeNav;
  }, [activeNav]);

  useEffect(() => {
    activeGatewayIdRef.current = activeGatewayId;
  }, [activeGatewayId]);

  useEffect(() => {
    activeSessionKeyRef.current = sessionKey;
  }, [sessionKey]);

  useEffect(
    () => () => {
      if (composerFocusTimerRef.current) {
        clearTimeout(composerFocusTimerRef.current);
        composerFocusTimerRef.current = null;
      }
    },
    [],
  );

  useEffect(() => {
    syncControllersWithProfiles(gatewayProfiles);

    setGatewayRuntimeById((previous) => {
      const next = buildRuntimeMap(gatewayProfiles, previous);
      const previousKeys = Object.keys(previous);
      const nextKeys = Object.keys(next);
      if (
        previousKeys.length === nextKeys.length &&
        nextKeys.every((key) => previous[key] === next[key])
      ) {
        return previous;
      }
      return next;
    });
  }, [gatewayProfiles, syncControllersWithProfiles]);

  useEffect(() => () => {
    disposeAllControllers();
  }, [disposeAllControllers]);

  useEffect(() => {
    if (booting) return;
    persistSettings({
      gatewayName,
      gatewayUrl,
      authToken,
      sessionKey,
      gateways: gatewayProfiles,
      activeGatewayId,
      quickTextLeft,
      quickTextRight,
      theme,
      notifications: notificationSettings,
    }).catch(() => {
      // Keep running even if persistence fails.
    });
  }, [
    activeGatewayId,
    authToken,
    booting,
    gatewayName,
    gatewayProfiles,
    gatewayUrl,
    persistSettings,
    quickTextLeft,
    quickTextRight,
    sessionKey,
    theme,
    notificationSettings,
  ]);

  useEffect(() => {
    if (!activeProfile) return;
    applyGatewayProfileToEditor(activeProfile);
  }, [activeProfile, applyGatewayProfileToEditor]);

  useEffect(() => {
    const normalizedSessionKey = normalizeSessionKey(sessionKey);
    setGatewayProfiles((previous) => {
      let changed = false;
      const next = previous.map((entry, index) => {
        if (entry.id !== activeGatewayId) return entry;

        const nextEntry = {
          ...entry,
          name: normalizeText(gatewayName) || `Gateway ${index + 1}`,
          gatewayUrl,
          authToken,
          sessionKey: normalizedSessionKey,
          sessions: mergeSessionKeys([normalizedSessionKey], entry.sessions),
        };

        if (
          entry.name === nextEntry.name &&
          entry.gatewayUrl === nextEntry.gatewayUrl &&
          entry.authToken === nextEntry.authToken &&
          entry.sessionKey === nextEntry.sessionKey &&
          isSameStringArray(entry.sessions, nextEntry.sessions)
        ) {
          return entry;
        }

        changed = true;
        return nextEntry;
      });

      return changed ? next : previous;
    });
  }, [activeGatewayId, authToken, gatewayName, gatewayUrl, sessionKey]);

  const insertQuickText = useCallback(
    (gatewayId, snippet) => {
      if (!gatewayId) return;
      const runtime = gatewayRuntimeById[gatewayId] ?? createGatewayRuntime();
      const baseText = String(runtime.composerText ?? '');
      const baseSelection = normalizeComposerSelection(runtime.composerSelection, baseText);
      const result = insertQuickTextAtSelection({
        sourceText: baseText,
        insertText: snippet,
        selectionStart: baseSelection.start,
        selectionEnd: baseSelection.end,
      });
      const activeSessionKeyForGateway = currentSessionKeyForGateway(gatewayId);
      updateGatewayRuntime(gatewayId, (current) => ({
        ...current,
        composerText: result.nextText,
        composerSelection: result.selection,
        composerHeight: estimateComposerHeightFromText(result.nextText),
        composerBySession: {
          ...(current.composerBySession ?? {}),
          [activeSessionKeyForGateway]: {
            text: result.nextText,
            selection: result.selection,
          },
        },
      }));
      setForcedSelectionForGateway(gatewayId, result.selection);
      setImeComposingForGateway(gatewayId, false);
    },
    [
      currentSessionKeyForGateway,
      gatewayRuntimeById,
      setForcedSelectionForGateway,
      setImeComposingForGateway,
      updateGatewayRuntime,
    ],
  );

  const setComposerTextForGateway = useCallback(
    (gatewayId, text) => {
      const activeSessionKeyForGateway = currentSessionKeyForGateway(gatewayId);
      updateGatewayRuntime(gatewayId, (current) => ({
        ...current,
        composerText: text,
        composerHeight: estimateComposerHeightFromText(text),
        composerBySession: {
          ...(current.composerBySession ?? {}),
          [activeSessionKeyForGateway]: {
            text,
            selection: normalizeComposerSelection(current.composerSelection, text),
          },
        },
      }));
    },
    [currentSessionKeyForGateway, updateGatewayRuntime],
  );

  const setComposerSelectionForGateway = useCallback(
    (gatewayId, selection) => {
      const activeSessionKeyForGateway = currentSessionKeyForGateway(gatewayId);
      updateGatewayRuntime(gatewayId, (current) => ({
        ...current,
        composerSelection: selection,
        composerBySession: {
          ...(current.composerBySession ?? {}),
          [activeSessionKeyForGateway]: {
            text: current.composerText,
            selection,
          },
        },
      }));
    },
    [currentSessionKeyForGateway, updateGatewayRuntime],
  );

  const setComposerFocusedForGateway = useCallback(
    (gatewayId, focused) => {
      updateGatewayRuntime(gatewayId, (current) => ({
        ...current,
        isComposerFocused: focused,
      }));
      if (focused) {
        setFocusedGatewayId(gatewayId);
      }
    },
    [updateGatewayRuntime],
  );

  const {
    handleCreateGatewayProfile,
    handleCreateSession,
    handleDeleteActiveGatewayProfile,
    handleSelectGatewayProfile,
    handleSelectSession,
  } = useMacosGatewayProfileActions({
    activeGatewayId,
    applyGatewayProfileToEditor,
    clearUnreadForSession,
    connectGateway,
    disconnectAndRemoveController,
    disconnectGateway,
    focusComposerForGateway,
    focusedGatewayId,
    gatewayProfiles,
    gatewayRuntimeById,
    setActiveGatewayId,
    setActiveNav,
    setAttachmentPickerGatewayId,
    setCollapsedGatewayIds,
    setFocusedGatewayId,
    setForcedSelectionForGateway,
    setGatewayProfiles,
    setGatewayRuntimeById,
    setImeComposingForGateway,
    setQuickMenuOpenForGateway,
    setSessionKey,
    updateGatewayRuntime,
  });

  const applyNotificationRoute = useCallback(
    (route) => {
      const normalizedGatewayId = normalizeText(route?.gatewayId);
      if (!normalizedGatewayId) return false;

      const profile = gatewayProfilesRef.current.find((entry) => entry.id === normalizedGatewayId);
      if (!profile) return false;

      const normalizedSession = normalizeSessionKey(route?.sessionKey ?? profile.sessionKey);
      const signature = normalizeText(route?.signature) || `${normalizedGatewayId}::${normalizedSession}::-`;
      if (lastHandledNotificationRouteSignatureRef.current === signature) {
        return true;
      }

      lastHandledNotificationRouteSignatureRef.current = signature;
      const normalizedTurnId = normalizeText(route?.turnId);
      if (normalizedTurnId) {
        scheduleHistoryTurnFocus(normalizedGatewayId, normalizedTurnId, normalizedSession);
      }
      handleSelectSession(normalizedGatewayId, normalizedSession);
      refreshHistory(normalizedGatewayId).catch(() => {
        // surfaced via banner
      });
      return true;
    },
    [handleSelectSession, refreshHistory, scheduleHistoryTurnFocus],
  );

  const syncNotificationRouteFromSystem = useCallback(async () => {
    if (Platform.OS !== 'macos') return;
    const pushNotificationModule = getPushNotificationModule();
    if (!pushNotificationModule || typeof pushNotificationModule.getInitialNotification !== 'function') {
      return;
    }

    try {
      const payload = await pushNotificationModule.getInitialNotification();
      const route = extractNotificationRoute(payload);
      if (!route) return;

      if (booting || !identityReady) {
        pendingNotificationRouteRef.current = route;
        return;
      }

      const applied = applyNotificationRoute(route);
      if (applied) {
        pendingNotificationRouteRef.current = null;
      } else {
        pendingNotificationRouteRef.current = route;
      }
    } catch {
      // Keep app stable if notification bridge fails.
    }
  }, [applyNotificationRoute, booting, getPushNotificationModule, identityReady]);

  const toggleGatewayCollapse = useCallback((gatewayId) => {
    if (!gatewayId) return;
    setCollapsedGatewayIds((previous) => ({
      ...previous,
      [gatewayId]: !previous[gatewayId],
    }));
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'macos') return undefined;
    syncNotificationRouteFromSystem().catch(() => {
      // Keep app usable without notification routing.
    });

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        syncNotificationRouteFromSystem().catch(() => {
          // noop
        });
      }
    });

    return () => {
      subscription?.remove?.();
    };
  }, [syncNotificationRouteFromSystem]);

  useEffect(() => {
    if (booting || !identityReady) return;
    const pendingRoute = pendingNotificationRouteRef.current;
    if (!pendingRoute) return;

    if (applyNotificationRoute(pendingRoute)) {
      pendingNotificationRouteRef.current = null;
    }
  }, [applyNotificationRoute, booting, gatewayProfiles, identityReady]);

  useEffect(() => {
    gatewayProfiles.forEach((profile) => {
      const runtime = gatewayRuntimeById[profile.id];
      const state = runtime?.controllerState?.connectionState ?? 'disconnected';
      if (state !== 'connected') return;
      refreshKnownSessions(profile.id).catch(() => {
        // ignore
      });
    });
  }, [gatewayProfiles, gatewayRuntimeById, refreshKnownSessions]);

  useEffect(() => {
    if (booting || !identityReady) return;

    gatewayProfiles.forEach((profile) => {
      const runtime = gatewayRuntimeById[profile.id];
      const state = runtime?.controllerState?.connectionState ?? 'disconnected';
      if (state !== 'disconnected') return;

      if (manualDisconnectByIdRef.current[profile.id]) return;

      const url = normalizeText(profile.gatewayUrl);
      const token = normalizeText(profile.authToken);
      if (!url || !token) return;

      const signature = `${url}::${token}::${normalizeSessionKey(profile.sessionKey)}`;
      if (lastAutoConnectSignatureByIdRef.current[profile.id] === signature) return;

      lastAutoConnectSignatureByIdRef.current[profile.id] = signature;
      connectGateway(profile.id).catch(() => {
        // Keep app usable; errors are surfaced via controller banner.
      });
    });
  }, [booting, connectGateway, gatewayProfiles, gatewayRuntimeById, identityReady]);

  useEffect(() => {
    gatewayProfiles.forEach((profile) => {
      const runtime = gatewayRuntimeById[profile.id];
      if (!runtime) return;
      const state = runtime.controllerState ?? INITIAL_CONTROLLER_STATE;
      if (state.isSending) return;
      if ((runtime.sendingAttachmentCount ?? 0) <= 0) return;

      updateGatewayRuntime(profile.id, (current) => ({
        ...current,
        sendingAttachmentCount: 0,
      }));

      const notice = attachmentNoticeByGatewayId[profile.id];
      if (notice?.kind === 'info' && String(notice?.message ?? '').startsWith('Sending ')) {
        setAttachmentNoticeForGateway(profile.id, '');
      }
    });
  }, [
    attachmentNoticeByGatewayId,
    gatewayProfiles,
    gatewayRuntimeById,
    setAttachmentNoticeForGateway,
    updateGatewayRuntime,
  ]);

  useEffect(() => {
    if (activeNav === 'chat') return;
    setDropActiveByGatewayId((previous) => (Object.keys(previous).length === 0 ? previous : {}));
  }, [activeNav, setDropActiveByGatewayId]);

  useEffect(() => {
    if (initialAutoNavigationHandledRef.current) return;
    if (booting || !identityReady) return;

    const hasAutoConnectTarget = gatewayProfiles.some((profile) => {
      const url = normalizeText(profile.gatewayUrl);
      const token = normalizeText(profile.authToken);
      return Boolean(url && token);
    });

    if (!hasAutoConnectTarget) {
      initialAutoNavigationHandledRef.current = true;
      return;
    }

    const connectedProfile =
      gatewayProfiles.find((profile) => {
        const state = gatewayRuntimeById[profile.id]?.controllerState?.connectionState;
        return state === 'connected';
      }) ?? null;

    if (connectedProfile) {
      initialAutoNavigationHandledRef.current = true;
      setActiveGatewayId(connectedProfile.id);
      setActiveNav('chat');
      setFocusedGatewayId(connectedProfile.id);
      setCollapsedGatewayIds((previous) => ({
        ...previous,
        [connectedProfile.id]: false,
      }));
      focusComposerForGateway(connectedProfile.id);
      return;
    }

    // Keep waiting until one auto-connect target becomes connected.
    // This avoids finishing too early during initial "all disconnected" frame.
  }, [
    booting,
    focusComposerForGateway,
    gatewayProfiles,
    gatewayRuntimeById,
    identityReady,
  ]);

  useEffect(() => {
    const hasConnectedGateway = gatewayProfiles.some((profile) => {
      const runtime = gatewayRuntimeById[profile.id];
      return runtime?.controllerState?.connectionState === 'connected';
    });
    const hasConnectingGateway = gatewayProfiles.some((profile) => {
      const connectionState = gatewayRuntimeById[profile.id]?.controllerState?.connectionState;
      return connectionState === 'connecting' || connectionState === 'reconnecting';
    });

    if (!hasConnectedGateway && !hasConnectingGateway && activeNav !== 'settings') {
      setActiveNav('settings');
    }
  }, [activeNav, gatewayProfiles, gatewayRuntimeById]);

  useEffect(() => {
    if (activeNav !== 'chat' || !activeProfile?.id) {
      closeAllQuickMenus();
      return;
    }
    focusComposerForGateway(activeProfile.id);
  }, [
    activeNav,
    activeProfile?.id,
    activeProfile?.sessionKey,
    closeAllQuickMenus,
    focusComposerForGateway,
  ]);

  useEffect(() => {
    if (activeNav !== 'chat' || !activeGatewayId) return;
    clearUnreadForSession(activeGatewayId, normalizeSessionKey(sessionKey));
  }, [activeGatewayId, activeNav, clearUnreadForSession, sessionKey]);

  const activeControllerState = activeProfile?.id
    ? gatewayRuntimeById[activeProfile.id]?.controllerState ?? INITIAL_CONTROLLER_STATE
    : null;
  const activeTurnCount = activeControllerState?.turns?.length ?? 0;
  const activeLastUpdatedAt = activeControllerState?.lastUpdatedAt ?? null;
  const activeIsSending = activeControllerState?.isSending ?? false;
  const activeIsSyncing = activeControllerState?.isSyncing ?? false;
  const activeHistoryBottomInset = activeProfile?.id
    ? historyBottomInsetByGatewayId[activeProfile.id] ?? 0
    : 0;

  useEffect(() => {
    if (activeNav !== 'chat' || !activeProfile?.id) return;
    recomputeHistoryBottomInsetForGateway(activeProfile.id);
    const pendingTurnFocus = pendingTurnFocusByGatewayIdRef.current[activeProfile.id];
    if (
      pendingTurnFocus &&
      normalizeSessionKey(activeProfile.sessionKey) === normalizeSessionKey(pendingTurnFocus.sessionKey)
    ) {
      scheduleHistoryTurnFocus(
        activeProfile.id,
        pendingTurnFocus.turnId,
        pendingTurnFocus.sessionKey,
      );
      return;
    }
    scheduleHistoryBottomSync(activeProfile.id);
  }, [
    activeNav,
    activeProfile?.id,
    activeProfile?.sessionKey,
    activeTurnCount,
    activeLastUpdatedAt,
    activeIsSending,
    activeIsSyncing,
    activeHistoryBottomInset,
    pendingTurnFocusByGatewayIdRef,
    recomputeHistoryBottomInsetForGateway,
    scheduleHistoryTurnFocus,
    scheduleHistoryBottomSync,
  ]);

  const connectedGatewayIds = useMemo(
    () =>
      gatewayProfiles
        .filter((profile) => {
          const runtime = gatewayRuntimeById[profile.id];
          return runtime?.controllerState?.connectionState === 'connected';
        })
        .map((profile) => profile.id),
    [gatewayProfiles, gatewayRuntimeById],
  );

  const summaryChip = useMemo(() => {
    if (connectedGatewayIds.length > 0) {
      return {
        label: connectedGatewayIds.length === 1 ? '1 Connected' : `${connectedGatewayIds.length} Connected`,
        color: SEMANTIC.green,
        bg: SEMANTIC.greenSoft,
      };
    }

    const hasConnecting = gatewayProfiles.some((profile) => {
      const state = gatewayRuntimeById[profile.id]?.controllerState?.connectionState;
      return state === 'connecting' || state === 'reconnecting';
    });

    if (hasConnecting) {
      return { label: 'Connecting', color: SEMANTIC.amber, bg: SEMANTIC.amberSoft };
    }

    return { label: 'Disconnected', color: '#6b7280', bg: 'rgba(107,114,128,0.12)' };
  }, [connectedGatewayIds.length, gatewayProfiles, gatewayRuntimeById]);

  const handleRootKeyDown = useMacosRootKeyHandler({
    activeGatewayId,
    activeNav,
    connectedGatewayIds,
    currentSessionKeyForGateway,
    focusedGatewayId,
    gatewayProfiles,
    gatewayRuntimeById,
    getController,
    quickMenuOpenByGatewayId,
    refreshHistory,
    setQuickMenuOpenForGateway,
    updateGatewayRuntime,
  });


  return {
    activeGatewayId,
    activeNav,
    activeProfile,
    attachmentNoticeByGatewayId,
    attachmentPickerGatewayId,
    authToken,
    authTokenInputRef,
    booting,
    clearPendingAttachmentsForGateway,
    collapsedGatewayIds,
    composerHeightByGatewayIdRef,
    composerInputRefs,
    connectGateway,
    copiedMessageByKey,
    currentSessionKeyForGateway,
    disconnectGateway,
    dropActiveByGatewayId,
    focusedGatewayId,
    focusedSettingsInput,
    focusComposerForGateway,
    forcedSelectionByGatewayId,
    forcedSelectionByGatewayIdRef,
    gatewayName,
    gatewayProfiles,
    gatewayRuntimeById,
    gatewayUrl,
    handleAttachmentPick,
    handleCopyMessage,
    handleCreateGatewayProfile,
    handleCreateSession,
    handleDeleteActiveGatewayProfile,
    handleDroppedFilesForGateway,
    handleOpenExternalLink,
    handleRootKeyDown,
    handleSelectGatewayProfile,
    handleSelectSession,
    hintHeightByGatewayIdRef,
    historyBottomInsetByGatewayId,
    historyContentHeightByGatewayIdRef,
    historyScrollRefs,
    historyViewportHeightByGatewayIdRef,
    identityPersistWarning,
    identityReady,
    insertQuickText,
    isAuthTokenVisible,
    isGatewayNotificationEnabled,
    isImeComposingByGatewayIdRef,
    notificationSettings,
    pendingTurnFocusByGatewayIdRef,
    quickMenuOpenByGatewayId,
    quickTextLeft,
    quickTextRight,
    recomputeHistoryBottomInsetForGateway,
    refreshHistory,
    removePendingAttachmentForGateway,
    rootRef,
    scheduleHistoryBottomSync,
    scheduleHistoryTurnFocus,
    sendMessage,
    sessionKey,
    setActiveNav,
    setAttachmentPickerGatewayId,
    setAuthToken,
    setComposerFocusedForGateway,
    setComposerSelectionForGateway,
    setComposerTextForGateway,
    setDropActiveByGatewayId,
    setFocusedGatewayId,
    setFocusedSettingsInput,
    setForcedSelectionForGateway,
    setGatewayName,
    setGatewayUrl,
    setImeComposingForGateway,
    setIsAuthTokenVisible,
    setQuickMenuOpenForGateway,
    setQuickTextLeft,
    setQuickTextRight,
    setSessionKey,
    setTheme,
    skipSubmitEditingByGatewayIdRef,
    summaryChip,
    theme,
    themeTokens,
    toggleGatewayCollapse,
    toggleGatewayNotifications,
    toggleMuteForegroundNotifications,
    toggleNotificationsEnabled,
    tryImportFromClipboardShortcut,
    unreadByGatewaySession,
    updateGatewayRuntime,
  };
}
