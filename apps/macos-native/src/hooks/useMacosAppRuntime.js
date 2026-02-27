import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
  InteractionManager,
  Linking,
  NativeModules,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Clipboard from '@react-native-clipboard/clipboard';
import {
  GatewayChatController,
  groupTurnsByDate,
  insertQuickTextAtSelection,
} from '../../../src/shared';
import { setStorage } from '../../../src/openclaw/storage';
import {
  COMPOSER_MIN_HEIGHT,
  DEFAULT_GATEWAY_PROFILE,
  DEFAULT_NOTIFICATION_SETTINGS,
  DEFAULTS,
  INITIAL_CONTROLLER_STATE,
  MAX_ATTACHMENT_COUNT,
  MAX_ATTACHMENT_SIZE_BYTES,
  OPENCLAW_IDENTITY_STORAGE_KEY,
  SEMANTIC,
  SETTINGS_KEY,
  THEMES,
} from '../logic/app-constants';
import {
  assistantTurnSignature,
  blobToBase64,
  buildRuntimeMap,
  bytesLabel,
  createGatewayProfile,
  createGatewayRuntime,
  decodeFileNameFromUri,
  estimateComposerHeightFromText,
  extractDroppedFileCandidates,
  extractNotificationRoute,
  extractSessionKeys,
  findLatestCompletedAssistantTurn,
  guessAttachmentType,
  isSameNotificationSettings,
  isSameStringArray,
  isSameUnreadByGatewaySession,
  mergeSessionKeys,
  normalizeAttachmentDraft,
  normalizeComposerSelection,
  normalizeFileUri,
  normalizeNotificationSettings,
  normalizeSessionKey,
  normalizeText,
  normalizeUnreadByGatewaySession,
  notificationSnippet,
} from '../logic/app-logic';

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
  const [notificationSettings, setNotificationSettings] = useState(() =>
    normalizeNotificationSettings(DEFAULT_NOTIFICATION_SETTINGS, [DEFAULT_GATEWAY_PROFILE]),
  );
  const [isAuthTokenVisible, setIsAuthTokenVisible] = useState(false);
  const [activeNav, setActiveNav] = useState('settings');
  const [focusedSettingsInput, setFocusedSettingsInput] = useState(null);
  const [focusedGatewayId, setFocusedGatewayId] = useState(null);
  const [collapsedGatewayIds, setCollapsedGatewayIds] = useState({});
  const [quickMenuOpenByGatewayId, setQuickMenuOpenByGatewayId] = useState({});
  const [attachmentPickerGatewayId, setAttachmentPickerGatewayId] = useState(null);
  const [attachmentNoticeByGatewayId, setAttachmentNoticeByGatewayId] = useState({});
  const [dropActiveByGatewayId, setDropActiveByGatewayId] = useState({});
  const [forcedSelectionByGatewayId, setForcedSelectionByGatewayId] = useState({});
  const [historyBottomInsetByGatewayId, setHistoryBottomInsetByGatewayId] = useState({});
  const [copiedMessageByKey, setCopiedMessageByKey] = useState({});
  const [unreadByGatewaySession, setUnreadByGatewaySession] = useState({});

  const [gatewayRuntimeById, setGatewayRuntimeById] = useState(() => ({
    [DEFAULT_GATEWAY_PROFILE.id]: createGatewayRuntime(),
  }));

  const gatewayRuntimeByIdRef = useRef(gatewayRuntimeById);
  const controllersRef = useRef(new Map());
  const subscriptionsRef = useRef(new Map());
  const historyScrollRefs = useRef(new Map());
  const historyScrollRafByGatewayIdRef = useRef({});
  const historyScrollInteractionByGatewayIdRef = useRef({});
  const historyScrollRetryTimersByGatewayIdRef = useRef({});
  const historyContentHeightByGatewayIdRef = useRef({});
  const historyViewportHeightByGatewayIdRef = useRef({});
  const composerHeightByGatewayIdRef = useRef({});
  const hintHeightByGatewayIdRef = useRef({});
  const composerInputRefs = useRef(new Map());
  const composerFocusTimerRef = useRef(null);
  const isImeComposingByGatewayIdRef = useRef({});
  const skipSubmitEditingByGatewayIdRef = useRef({});
  const forcedSelectionByGatewayIdRef = useRef({});
  const copiedMessageTimerByKeyRef = useRef({});
  const authTokenInputRef = useRef(null);
  const rootRef = useRef(null);
  const lastAutoConnectSignatureByIdRef = useRef({});
  const manualDisconnectByIdRef = useRef({});
  const initialAutoNavigationHandledRef = useRef(false);
  const appStateRef = useRef(AppState.currentState ?? 'active');
  const activeNavRef = useRef(activeNav);
  const activeGatewayIdRef = useRef(activeGatewayId);
  const activeSessionKeyRef = useRef(sessionKey);
  const gatewayProfilesRef = useRef(gatewayProfiles);
  const previousControllerStateByGatewayIdRef = useRef({});
  const lastNotifiedAssistantTurnByGatewayIdRef = useRef({});
  const notificationSettingsRef = useRef(notificationSettings);
  const notificationPermissionRequestedRef = useRef(false);
  const notificationPermissionGrantedRef = useRef(false);
  const pushNotificationModuleRef = useRef(undefined);
  const lastHandledNotificationRouteSignatureRef = useRef('');
  const pendingNotificationRouteRef = useRef(null);
  const pendingTurnFocusByGatewayIdRef = useRef({});
  const turnFocusRetryTimersByGatewayIdRef = useRef({});

  const themeTokens = theme === 'dark' ? THEMES.dark : THEMES.light;
  const getPushNotificationModule = useCallback(() => {
    if (Platform.OS !== 'macos') return null;
    if (pushNotificationModuleRef.current !== undefined) {
      return pushNotificationModuleRef.current;
    }

    const nativePushManager =
      NativeModules?.PushNotificationManager ?? NativeModules?.PushNotificationManagerIOS ?? null;
    const supported =
      nativePushManager &&
      typeof nativePushManager.requestPermissions === 'function' &&
      typeof nativePushManager.presentLocalNotification === 'function';
    pushNotificationModuleRef.current = supported ? nativePushManager : null;

    return pushNotificationModuleRef.current;
  }, []);

  const requestNotificationPermission = useCallback(async () => {
    if (!notificationSettingsRef.current?.enabled) return false;
    const pushNotificationModule = getPushNotificationModule();
    if (!pushNotificationModule) {
      return false;
    }
    if (notificationPermissionGrantedRef.current) return true;
    if (notificationPermissionRequestedRef.current) {
      return notificationPermissionGrantedRef.current;
    }

    notificationPermissionRequestedRef.current = true;

    try {
      const permissions = await pushNotificationModule.requestPermissions({
        alert: true,
        sound: true,
        badge: false,
      });
      const allowed = Boolean(permissions?.alert || permissions?.sound || permissions?.badge);
      notificationPermissionGrantedRef.current = allowed;
      return allowed;
    } catch {
      notificationPermissionGrantedRef.current = false;
      return false;
    }
  }, [getPushNotificationModule]);

  const notifyNewAssistantMessage = useCallback(
    async (gatewayId, assistantTurn, session) => {
      if (Platform.OS !== 'macos') return;
      if (!notificationSettingsRef.current?.enabled) return;
      const gatewayNotificationEnabled =
        notificationSettingsRef.current?.byGatewayId?.[gatewayId];
      if (gatewayNotificationEnabled === false) return;

      const signature = assistantTurnSignature(assistantTurn);
      const turnKey = String(assistantTurn?.id ?? assistantTurn?.runId ?? '');
      if (!turnKey || lastNotifiedAssistantTurnByGatewayIdRef.current[gatewayId] === signature) return;
      lastNotifiedAssistantTurnByGatewayIdRef.current[gatewayId] = signature;

      const granted = await requestNotificationPermission();
      if (!granted) return;

      const profile = gatewayProfilesRef.current.find((entry) => entry.id === gatewayId);
      const titleProfile = normalizeText(profile?.name) || 'OpenClawPocket';
      const normalizedSession = normalizeSessionKey(session || profile?.sessionKey);
      const isForeground = appStateRef.current === 'active';
      const muteForeground = notificationSettingsRef.current?.muteForeground !== false;
      const pushNotificationModule = getPushNotificationModule();

      if (!pushNotificationModule) return;

      const payload = {
        alertTitle: `${titleProfile} • ${normalizedSession}`,
        alertBody: notificationSnippet(assistantTurn?.assistantText),
        alertAction: 'View',
        userInfo: {
          gatewayId,
          sessionKey: normalizedSession,
          turnId: turnKey,
        },
      };
      if (!isForeground || !muteForeground) {
        payload.soundName = 'default';
      }

      pushNotificationModule.presentLocalNotification(payload);
    },
    [getPushNotificationModule, requestNotificationPermission],
  );

  const incrementUnreadForSession = useCallback((gatewayId, session) => {
    const normalizedGatewayId = String(gatewayId ?? '').trim();
    const normalizedSession = normalizeSessionKey(session);
    if (!normalizedGatewayId || !normalizedSession) return;
    setUnreadByGatewaySession((previous) => {
      const gatewayMap = previous[normalizedGatewayId] ?? {};
      const nextCount = Math.max(0, Number(gatewayMap[normalizedSession] ?? 0)) + 1;
      return {
        ...previous,
        [normalizedGatewayId]: {
          ...gatewayMap,
          [normalizedSession]: nextCount,
        },
      };
    });
  }, []);

  const clearUnreadForSession = useCallback((gatewayId, session) => {
    const normalizedGatewayId = String(gatewayId ?? '').trim();
    const normalizedSession = normalizeSessionKey(session);
    if (!normalizedGatewayId || !normalizedSession) return;

    setUnreadByGatewaySession((previous) => {
      const gatewayMap = previous[normalizedGatewayId];
      if (!gatewayMap || !gatewayMap[normalizedSession]) return previous;
      const nextGatewayMap = { ...gatewayMap };
      delete nextGatewayMap[normalizedSession];

      const next = { ...previous };
      if (Object.keys(nextGatewayMap).length === 0) {
        delete next[normalizedGatewayId];
      } else {
        next[normalizedGatewayId] = nextGatewayMap;
      }
      return next;
    });
  }, []);

  const handleAssistantTurnArrival = useCallback(
    (gatewayId, previousState, nextState) => {
      const previousAssistantTurn = findLatestCompletedAssistantTurn(previousState);
      const nextAssistantTurn = findLatestCompletedAssistantTurn(nextState);
      const previousSignature = assistantTurnSignature(previousAssistantTurn);
      const nextSignature = assistantTurnSignature(nextAssistantTurn);

      if (!nextSignature || nextSignature === previousSignature) return;

      const previousTurnCount = Array.isArray(previousState?.turns) ? previousState.turns.length : 0;
      const appearsToBeInitialHistoryLoad = previousTurnCount === 0 && !previousState?.isSending;
      const arrivedDuringHistorySync = Boolean(previousState?.isSyncing);
      if (appearsToBeInitialHistoryLoad || arrivedDuringHistorySync) return;

      const profile = gatewayProfilesRef.current.find((entry) => entry.id === gatewayId);
      const sessionForGateway = normalizeSessionKey(profile?.sessionKey);
      const isViewingSameSession =
        activeNavRef.current === 'chat' &&
        activeGatewayIdRef.current === gatewayId &&
        normalizeSessionKey(activeSessionKeyRef.current) === sessionForGateway;

      if (isViewingSameSession) {
        clearUnreadForSession(gatewayId, sessionForGateway);
      } else {
        incrementUnreadForSession(gatewayId, sessionForGateway);
      }

      notifyNewAssistantMessage(gatewayId, nextAssistantTurn, sessionForGateway).catch(() => {
        // Notification failures must not affect chat flow.
      });
    },
    [clearUnreadForSession, incrementUnreadForSession, notifyNewAssistantMessage],
  );

  const handleOpenExternalLink = useCallback((url) => {
    const normalized = String(url ?? '').trim();
    if (!normalized) return;
    Linking.openURL(normalized).catch(() => {
      // noop
    });
  }, []);
  const handleCopyMessage = useCallback((key, message) => {
    const normalizedKey = String(key ?? '').trim();
    const normalizedMessage = String(message ?? '').trim();
    if (!normalizedKey || !normalizedMessage) return;

    Clipboard.setString(normalizedMessage);

    const existingTimer = copiedMessageTimerByKeyRef.current[normalizedKey];
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    setCopiedMessageByKey((previous) => {
      if (previous[normalizedKey] === true) return previous;
      return { ...previous, [normalizedKey]: true };
    });

    copiedMessageTimerByKeyRef.current[normalizedKey] = setTimeout(() => {
      setCopiedMessageByKey((previous) => {
        if (!previous[normalizedKey]) return previous;
        const next = { ...previous };
        delete next[normalizedKey];
        return next;
      });
      delete copiedMessageTimerByKeyRef.current[normalizedKey];
    }, 1400);
  }, []);

  const activeProfile = useMemo(
    () => gatewayProfiles.find((profile) => profile.id === activeGatewayId) ?? gatewayProfiles[0] ?? null,
    [activeGatewayId, gatewayProfiles],
  );

  const isGatewayNotificationEnabled = useCallback((gatewayId) => {
    const value = notificationSettings?.byGatewayId?.[gatewayId];
    return typeof value === 'boolean' ? value : true;
  }, [notificationSettings]);

  const toggleNotificationsEnabled = useCallback(() => {
    setNotificationSettings((previous) => ({
      ...previous,
      enabled: !previous.enabled,
    }));
  }, []);

  const toggleMuteForegroundNotifications = useCallback(() => {
    setNotificationSettings((previous) => ({
      ...previous,
      muteForeground: !previous.muteForeground,
    }));
  }, []);

  const toggleGatewayNotifications = useCallback((gatewayId) => {
    const normalizedGatewayId = String(gatewayId ?? '').trim();
    if (!normalizedGatewayId) return;
    setNotificationSettings((previous) => {
      const current = previous.byGatewayId?.[normalizedGatewayId];
      const nextValue = typeof current === 'boolean' ? !current : false;
      return {
        ...previous,
        byGatewayId: {
          ...(previous.byGatewayId ?? {}),
          [normalizedGatewayId]: nextValue,
        },
      };
    });
  }, []);

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

  const setAttachmentNoticeForGateway = useCallback((gatewayId, message, kind = 'info') => {
    if (!gatewayId) return;
    const normalizedMessage = String(message ?? '').trim();
    if (!normalizedMessage) {
      setAttachmentNoticeByGatewayId((previous) => {
        if (!(gatewayId in previous)) return previous;
        const next = { ...previous };
        delete next[gatewayId];
        return next;
      });
      return;
    }

    setAttachmentNoticeByGatewayId((previous) => ({
      ...previous,
      [gatewayId]: {
        message: normalizedMessage,
        kind,
      },
    }));
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

  const setHistoryBottomInsetForGateway = useCallback((gatewayId, inset) => {
    if (!gatewayId || !Number.isFinite(inset)) return;
    const normalized = Math.max(14, Math.min(48, Math.ceil(inset)));
    setHistoryBottomInsetByGatewayId((previous) => {
      if (previous[gatewayId] === normalized) return previous;
      return { ...previous, [gatewayId]: normalized };
    });
  }, []);

  const recomputeHistoryBottomInsetForGateway = useCallback(
    (gatewayId) => {
      if (!gatewayId) return;
      const composerHeight = composerHeightByGatewayIdRef.current[gatewayId] ?? 40;
      const hintHeight = hintHeightByGatewayIdRef.current[gatewayId] ?? 18;
      const nextInset = composerHeight * 0.25 + hintHeight * 0.25 + 8;
      setHistoryBottomInsetForGateway(gatewayId, nextInset);
    },
    [setHistoryBottomInsetForGateway],
  );

  const clearTurnFocusRetries = useCallback((gatewayId) => {
    if (!gatewayId) return;
    const timers = turnFocusRetryTimersByGatewayIdRef.current[gatewayId];
    if (Array.isArray(timers)) {
      timers.forEach((timerId) => clearTimeout(timerId));
    }
    delete turnFocusRetryTimersByGatewayIdRef.current[gatewayId];
  }, []);

  const clearPendingTurnFocus = useCallback(
    (gatewayId) => {
      if (!gatewayId) return;
      clearTurnFocusRetries(gatewayId);
      delete pendingTurnFocusByGatewayIdRef.current[gatewayId];
    },
    [clearTurnFocusRetries],
  );

  const scrollHistoryToBottom = useCallback((gatewayId, animated = false) => {
    if (!gatewayId) return;
    const pending = historyScrollRafByGatewayIdRef.current[gatewayId];
    if (pending?.first) {
      cancelAnimationFrame(pending.first);
    }
    if (pending?.second) {
      cancelAnimationFrame(pending.second);
    }
    const pendingInteraction = historyScrollInteractionByGatewayIdRef.current[gatewayId];
    if (pendingInteraction?.cancel) {
      pendingInteraction.cancel();
    }

    const interactionTask = InteractionManager.runAfterInteractions(() => {
      const first = requestAnimationFrame(() => {
        const second = requestAnimationFrame(() => {
          const scrollNode = historyScrollRefs.current.get(gatewayId);
          const contentHeight = historyContentHeightByGatewayIdRef.current[gatewayId] ?? 0;
          const viewportHeight = historyViewportHeightByGatewayIdRef.current[gatewayId] ?? 0;
          const targetOffset = Math.max(0, contentHeight - viewportHeight);

          if (Number.isFinite(targetOffset) && targetOffset > 0) {
            scrollNode?.scrollToOffset?.({ offset: targetOffset, animated });
          }
          scrollNode?.scrollToEnd?.({ animated });
          delete historyScrollRafByGatewayIdRef.current[gatewayId];
          delete historyScrollInteractionByGatewayIdRef.current[gatewayId];
        });
        historyScrollRafByGatewayIdRef.current[gatewayId] = { second };
      });
      historyScrollRafByGatewayIdRef.current[gatewayId] = { first };
    });
    historyScrollInteractionByGatewayIdRef.current[gatewayId] = interactionTask;
  }, []);

  const scrollHistoryToTurn = useCallback(
    (gatewayId, turnId, expectedSessionKey, animated = true) => {
      const normalizedGatewayId = normalizeText(gatewayId);
      const normalizedTurnId = normalizeText(turnId);
      if (!normalizedGatewayId || !normalizedTurnId) return false;

      const profile = gatewayProfilesRef.current.find((entry) => entry.id === normalizedGatewayId);
      if (!profile) return false;

      const currentSessionKey = normalizeSessionKey(profile.sessionKey);
      if (expectedSessionKey && currentSessionKey !== normalizeSessionKey(expectedSessionKey)) {
        return false;
      }

      const runtime = gatewayRuntimeByIdRef.current[normalizedGatewayId];
      const turns = Array.isArray(runtime?.controllerState?.turns) ? runtime.controllerState.turns : [];
      if (turns.length === 0) return false;

      const grouped = groupTurnsByDate(turns);
      const index = grouped.findIndex(
        (item) => item?.kind === 'turn' && String(item?.id ?? '').trim() === normalizedTurnId,
      );
      if (index < 0) return false;

      const scrollNode = historyScrollRefs.current.get(normalizedGatewayId);
      if (!scrollNode || typeof scrollNode.scrollToIndex !== 'function') return false;

      try {
        scrollNode.scrollToIndex({ index, animated, viewPosition: 1 });
        return true;
      } catch {
        return false;
      }
    },
    [],
  );

  const scheduleHistoryTurnFocus = useCallback(
    (gatewayId, turnId, sessionForTurn) => {
      const normalizedGatewayId = normalizeText(gatewayId);
      const normalizedTurnId = normalizeText(turnId);
      if (!normalizedGatewayId || !normalizedTurnId) return;

      const normalizedSession = normalizeSessionKey(sessionForTurn);
      pendingTurnFocusByGatewayIdRef.current[normalizedGatewayId] = {
        turnId: normalizedTurnId,
        sessionKey: normalizedSession,
      };

      clearTurnFocusRetries(normalizedGatewayId);

      const timers = [];
      [0, 80, 220, 450, 800, 1200, 1800, 2600].forEach((delay) => {
        const timerId = setTimeout(() => {
          const pending = pendingTurnFocusByGatewayIdRef.current[normalizedGatewayId];
          if (!pending) return;
          const focused = scrollHistoryToTurn(
            normalizedGatewayId,
            pending.turnId,
            pending.sessionKey,
            false,
          );
          if (focused) {
            clearPendingTurnFocus(normalizedGatewayId);
          }
        }, delay);
        timers.push(timerId);
      });

      const expiryTimerId = setTimeout(() => {
        const pending = pendingTurnFocusByGatewayIdRef.current[normalizedGatewayId];
        if (!pending) return;
        if (
          pending.turnId === normalizedTurnId &&
          normalizeSessionKey(pending.sessionKey) === normalizedSession
        ) {
          clearPendingTurnFocus(normalizedGatewayId);
          scrollHistoryToBottom(normalizedGatewayId, false);
        }
      }, 3400);
      timers.push(expiryTimerId);

      turnFocusRetryTimersByGatewayIdRef.current[normalizedGatewayId] = timers;
    },
    [clearPendingTurnFocus, clearTurnFocusRetries, scrollHistoryToBottom, scrollHistoryToTurn],
  );

  const scheduleHistoryBottomSync = useCallback(
    (gatewayId) => {
      if (!gatewayId) return;
      const pendingTurnFocus = pendingTurnFocusByGatewayIdRef.current[gatewayId];
      if (pendingTurnFocus) return;
      const existing = historyScrollRetryTimersByGatewayIdRef.current[gatewayId];
      if (Array.isArray(existing)) {
        existing.forEach((timerId) => clearTimeout(timerId));
      }

      const timers = [];
      [0, 120, 320, 700, 1200, 2000].forEach((delay) => {
        const timerId = setTimeout(() => {
          scrollHistoryToBottom(gatewayId, false);
        }, delay);
        timers.push(timerId);
      });
      historyScrollRetryTimersByGatewayIdRef.current[gatewayId] = timers;
    },
    [scrollHistoryToBottom],
  );

  const disconnectAndRemoveController = useCallback((gatewayId) => {
    const pendingScroll = historyScrollRafByGatewayIdRef.current[gatewayId];
    if (pendingScroll?.first) {
      cancelAnimationFrame(pendingScroll.first);
    }
    if (pendingScroll?.second) {
      cancelAnimationFrame(pendingScroll.second);
    }
    delete historyScrollRafByGatewayIdRef.current[gatewayId];

    const pendingRetryTimers = historyScrollRetryTimersByGatewayIdRef.current[gatewayId];
    if (Array.isArray(pendingRetryTimers)) {
      pendingRetryTimers.forEach((timerId) => clearTimeout(timerId));
      delete historyScrollRetryTimersByGatewayIdRef.current[gatewayId];
    }
    const pendingInteraction = historyScrollInteractionByGatewayIdRef.current[gatewayId];
    if (pendingInteraction?.cancel) {
      pendingInteraction.cancel();
      delete historyScrollInteractionByGatewayIdRef.current[gatewayId];
    }

    clearPendingTurnFocus(gatewayId);

    delete historyContentHeightByGatewayIdRef.current[gatewayId];
    delete historyViewportHeightByGatewayIdRef.current[gatewayId];

    const unsubscribe = subscriptionsRef.current.get(gatewayId);
    if (unsubscribe) {
      try {
        unsubscribe();
      } catch {
        // noop
      }
      subscriptionsRef.current.delete(gatewayId);
    }

    const controller = controllersRef.current.get(gatewayId);
    if (controller) {
      try {
        controller.disconnect();
      } catch {
        // noop
      }
      controllersRef.current.delete(gatewayId);
    }

    historyScrollRefs.current.delete(gatewayId);
    composerInputRefs.current.delete(gatewayId);
    delete composerHeightByGatewayIdRef.current[gatewayId];
    delete hintHeightByGatewayIdRef.current[gatewayId];
    delete previousControllerStateByGatewayIdRef.current[gatewayId];
    delete lastNotifiedAssistantTurnByGatewayIdRef.current[gatewayId];
  }, [clearPendingTurnFocus]);

  const createControllerForGateway = useCallback(
    (gatewayId, initialSessionKey = DEFAULTS.sessionKey) => {
      if (controllersRef.current.has(gatewayId)) {
        return controllersRef.current.get(gatewayId);
      }

      const controller = new GatewayChatController({
        sessionKey: normalizeSessionKey(initialSessionKey),
        clientOptions: {
          clientId: 'openclaw-ios',
          displayName: 'OpenClaw Pocket macOS',
          platform: 'macos',
          role: 'operator',
          scopes: ['operator.read', 'operator.write'],
          caps: ['talk'],
        },
      });

      previousControllerStateByGatewayIdRef.current[gatewayId] = controller.getState();

      const unsubscribe = controller.subscribe((nextState) => {
        const previousState =
          previousControllerStateByGatewayIdRef.current[gatewayId] ?? INITIAL_CONTROLLER_STATE;
        previousControllerStateByGatewayIdRef.current[gatewayId] = nextState;
        handleAssistantTurnArrival(gatewayId, previousState, nextState);

        updateGatewayRuntime(gatewayId, (current) => ({
          ...current,
          controllerState: nextState,
          sendingAttachmentCount: nextState.isSending ? current.sendingAttachmentCount ?? 0 : 0,
        }));
      });

      controllersRef.current.set(gatewayId, controller);
      subscriptionsRef.current.set(gatewayId, unsubscribe);
      return controller;
    },
    [handleAssistantTurnArrival, updateGatewayRuntime],
  );

  const getController = useCallback(
    (gatewayId) => {
      const existing = controllersRef.current.get(gatewayId);
      if (existing) return existing;

      const profile = gatewayProfiles.find((entry) => entry.id === gatewayId);
      if (!profile) return null;
      return createControllerForGateway(gatewayId, profile.sessionKey);
    },
    [createControllerForGateway, gatewayProfiles],
  );

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
  }, [applyGatewayProfileToEditor]);

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

  useEffect(() => {
    notificationSettingsRef.current = notificationSettings;
  }, [notificationSettings]);

  useEffect(() => {
    setNotificationSettings((previous) => {
      const normalized = normalizeNotificationSettings(previous, gatewayProfiles);
      return isSameNotificationSettings(previous, normalized) ? previous : normalized;
    });
    setUnreadByGatewaySession((previous) => {
      const normalized = normalizeUnreadByGatewaySession(previous, gatewayProfiles);
      return isSameUnreadByGatewaySession(previous, normalized) ? previous : normalized;
    });
  }, [gatewayProfiles]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      appStateRef.current = nextState;
    });
    appStateRef.current = AppState.currentState ?? 'active';

    requestNotificationPermission().catch(() => {
      // Notifications remain optional.
    });

    return () => {
      subscription?.remove?.();
    };
  }, [requestNotificationPermission]);

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
    gatewayProfiles.forEach((profile) => {
      createControllerForGateway(profile.id, profile.sessionKey);
    });

    const knownIds = new Set(gatewayProfiles.map((profile) => profile.id));
    Array.from(controllersRef.current.keys()).forEach((gatewayId) => {
      if (!knownIds.has(gatewayId)) {
        disconnectAndRemoveController(gatewayId);
      }
    });

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
  }, [createControllerForGateway, disconnectAndRemoveController, gatewayProfiles]);

  useEffect(
    () => () => {
      Array.from(controllersRef.current.keys()).forEach((gatewayId) => {
        disconnectAndRemoveController(gatewayId);
      });
      controllersRef.current.clear();
      subscriptionsRef.current.clear();
    },
    [disconnectAndRemoveController],
  );

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

  const refreshKnownSessions = useCallback(
    async (gatewayId) => {
      const controller = getController(gatewayId);
      if (!controller?.client || typeof controller.client.sessionsList !== 'function') return;

      try {
        const response = await controller.client.sessionsList({ includeGlobal: true, limit: 200 });
        const discoveredSessions = extractSessionKeys(response?.sessions);
        if (!discoveredSessions.length) return;

        setGatewayProfiles((previous) => {
          let changed = false;
          const next = previous.map((entry) => {
            if (entry.id !== gatewayId) return entry;
            const mergedSessions = mergeSessionKeys([entry.sessionKey], entry.sessions, discoveredSessions);
            if (isSameStringArray(entry.sessions, mergedSessions)) {
              return entry;
            }
            changed = true;
            return {
              ...entry,
              sessions: mergedSessions,
            };
          });
          return changed ? next : previous;
        });
      } catch {
        // Ignore listing failures; chat can continue without session list sync.
      }
    },
    [getController],
  );

  const connectGateway = useCallback(
    async (gatewayId, targetSessionKey) => {
      if (!identityReady) return;
      const profile = gatewayProfiles.find((entry) => entry.id === gatewayId);
      if (!profile) return;

      const controller = getController(gatewayId);
      if (!controller) return;

      const localDraftForActive =
        gatewayId === activeGatewayId
          ? {
              ...profile,
              name: normalizeText(gatewayName) || profile.name,
              gatewayUrl,
              authToken,
              sessionKey: normalizeSessionKey(sessionKey),
              sessions: mergeSessionKeys([normalizeSessionKey(sessionKey)], profile.sessions),
            }
          : profile;

      const nextSessionKey = normalizeSessionKey(targetSessionKey ?? localDraftForActive.sessionKey);

      setGatewayProfiles((previous) =>
        previous.map((entry) => {
          if (entry.id !== gatewayId) return entry;
          return {
            ...entry,
            ...localDraftForActive,
            sessionKey: nextSessionKey,
            sessions: mergeSessionKeys([nextSessionKey], localDraftForActive.sessions),
          };
        }),
      );

      manualDisconnectByIdRef.current[gatewayId] = false;

      await controller.connect({
        url: localDraftForActive.gatewayUrl,
        token: localDraftForActive.authToken,
        sessionKey: nextSessionKey,
      });

      await refreshKnownSessions(gatewayId);
    },
    [
      activeGatewayId,
      authToken,
      gatewayName,
      gatewayProfiles,
      gatewayUrl,
      getController,
      identityReady,
      refreshKnownSessions,
      sessionKey,
    ],
  );

  const disconnectGateway = useCallback(
    (gatewayId, { manual = true } = {}) => {
      const controller = getController(gatewayId);
      if (!controller) return;

      if (manual) {
        manualDisconnectByIdRef.current[gatewayId] = true;
      }

      controller.disconnect();
    },
    [getController],
  );

  const refreshHistory = useCallback(
    async (gatewayId) => {
      const controller = getController(gatewayId);
      if (!controller) return;
      await controller.refreshHistory();
      await refreshKnownSessions(gatewayId);
    },
    [getController, refreshKnownSessions],
  );

  const sendMessage = useCallback(
    async (gatewayId) => {
      const runtime = gatewayRuntimeById[gatewayId];
      if (!runtime) return;
      const controllerState = runtime.controllerState ?? INITIAL_CONTROLLER_STATE;
      const message = normalizeText(runtime.composerText);
      const attachments = Array.isArray(runtime.pendingAttachments)
        ? runtime.pendingAttachments
            .map((entry) => normalizeAttachmentDraft(entry))
            .filter(Boolean)
        : [];
      const hasAttachments = attachments.length > 0;
      const activeSessionKeyForGateway = currentSessionKeyForGateway(gatewayId);
      const imeComposing = isImeComposingByGatewayIdRef.current[gatewayId] === true;
      const outgoingMessage = message;
      const outgoingAttachments = attachments.map((entry) => ({ ...entry }));

      if (
        (!message && !hasAttachments) ||
        imeComposing ||
        controllerState.connectionState !== 'connected' ||
        controllerState.isSending
      ) {
        return;
      }

      if (outgoingAttachments.length > 0) {
        setAttachmentNoticeForGateway(
          gatewayId,
          `Sending ${outgoingAttachments.length} attachment${outgoingAttachments.length > 1 ? 's' : ''}...`,
          'info',
        );
      } else {
        setAttachmentNoticeForGateway(gatewayId, '');
      }

      updateGatewayRuntime(gatewayId, (current) => ({
        ...current,
        composerText: '',
        composerSelection: { start: 0, end: 0 },
        composerHeight: COMPOSER_MIN_HEIGHT,
        pendingAttachments: [],
        sendingAttachmentCount: outgoingAttachments.length,
        composerBySession: {
          ...(current.composerBySession ?? {}),
          [activeSessionKeyForGateway]: {
            text: '',
            selection: { start: 0, end: 0 },
          },
        },
        attachmentsBySession: {
          ...(current.attachmentsBySession ?? {}),
          [activeSessionKeyForGateway]: [],
        },
      }));
      setForcedSelectionForGateway(gatewayId, null);
      setImeComposingForGateway(gatewayId, false);

      const controller = getController(gatewayId);
      if (!controller) return;
      try {
        await controller.sendMessage(outgoingMessage, outgoingAttachments);
        updateGatewayRuntime(gatewayId, (current) => ({
          ...current,
          composerText: '',
          composerSelection: { start: 0, end: 0 },
          composerHeight: COMPOSER_MIN_HEIGHT,
          pendingAttachments: [],
          sendingAttachmentCount: outgoingAttachments.length,
          composerBySession: {
            ...(current.composerBySession ?? {}),
            [activeSessionKeyForGateway]: {
              text: '',
              selection: { start: 0, end: 0 },
            },
          },
          attachmentsBySession: {
            ...(current.attachmentsBySession ?? {}),
            [activeSessionKeyForGateway]: [],
          },
        }));
        setAttachmentNoticeForGateway(gatewayId, '');
        setForcedSelectionForGateway(gatewayId, null);
        focusComposerForGateway(gatewayId);
        scheduleHistoryBottomSync(gatewayId);
      } catch (error) {
        const restoredSelection = {
          start: outgoingMessage.length,
          end: outgoingMessage.length,
        };
        updateGatewayRuntime(gatewayId, (current) => ({
          ...current,
          composerText: outgoingMessage,
          composerSelection: restoredSelection,
          composerHeight: estimateComposerHeightFromText(outgoingMessage),
          pendingAttachments: outgoingAttachments,
          sendingAttachmentCount: 0,
          composerBySession: {
            ...(current.composerBySession ?? {}),
            [activeSessionKeyForGateway]: {
              text: outgoingMessage,
              selection: restoredSelection,
            },
          },
          attachmentsBySession: {
            ...(current.attachmentsBySession ?? {}),
            [activeSessionKeyForGateway]: outgoingAttachments,
          },
        }));
        setAttachmentNoticeForGateway(
          gatewayId,
          `Send failed. Draft restored (${String(error?.message ?? 'unknown error')}).`,
          'error',
        );
        focusComposerForGateway(gatewayId);
        scheduleHistoryBottomSync(gatewayId);
        throw error;
      }
    },
    [
      currentSessionKeyForGateway,
      focusComposerForGateway,
      gatewayRuntimeById,
      getController,
      setAttachmentNoticeForGateway,
      setForcedSelectionForGateway,
      setImeComposingForGateway,
      scheduleHistoryBottomSync,
      updateGatewayRuntime,
    ],
  );

  const setPendingAttachmentsForGateway = useCallback(
    (gatewayId, nextAttachments) => {
      if (!gatewayId) return;
      const normalized = Array.isArray(nextAttachments)
        ? nextAttachments.map((entry) => normalizeAttachmentDraft(entry)).filter(Boolean)
        : [];
      const activeSessionKeyForGateway = currentSessionKeyForGateway(gatewayId);

      updateGatewayRuntime(gatewayId, (current) => ({
        ...current,
        pendingAttachments: normalized,
        attachmentsBySession: {
          ...(current.attachmentsBySession ?? {}),
          [activeSessionKeyForGateway]: normalized,
        },
      }));
    },
    [currentSessionKeyForGateway, updateGatewayRuntime],
  );

  const appendPendingAttachmentForGateway = useCallback(
    (gatewayId, candidate) => {
      if (!gatewayId) return false;
      const size = Number(candidate?.size ?? 0);
      if (Number.isFinite(size) && size > MAX_ATTACHMENT_SIZE_BYTES) {
        setAttachmentNoticeForGateway(
          gatewayId,
          `Attachment exceeds 10MB limit (${bytesLabel(size)}).`,
          'error',
        );
        return false;
      }

      const nextAttachment = normalizeAttachmentDraft(candidate);
      if (!nextAttachment) {
        setAttachmentNoticeForGateway(gatewayId, 'Attachment could not be processed.', 'error');
        return false;
      }

      const runtime = gatewayRuntimeById[gatewayId] ?? createGatewayRuntime();
      const current = Array.isArray(runtime.pendingAttachments) ? runtime.pendingAttachments : [];
      if (current.length >= MAX_ATTACHMENT_COUNT) {
        setAttachmentNoticeForGateway(gatewayId, `You can attach up to ${MAX_ATTACHMENT_COUNT} files.`, 'warn');
        return false;
      }

      const duplicated = current.some(
        (entry) =>
          String(entry?.fileName ?? '') === nextAttachment.fileName &&
          String(entry?.content ?? '') === nextAttachment.content,
      );
      if (duplicated) {
        setAttachmentNoticeForGateway(gatewayId, 'This attachment is already added.', 'info');
        return false;
      }

      setPendingAttachmentsForGateway(gatewayId, [...current, nextAttachment]);
      setAttachmentNoticeForGateway(gatewayId, `Attached: ${nextAttachment.fileName}`, 'success');
      return true;
    },
    [gatewayRuntimeById, setAttachmentNoticeForGateway, setPendingAttachmentsForGateway],
  );

  const removePendingAttachmentForGateway = useCallback(
    (gatewayId, attachmentId) => {
      if (!gatewayId || !attachmentId) return;
      const runtime = gatewayRuntimeById[gatewayId] ?? createGatewayRuntime();
      const existing = Array.isArray(runtime.pendingAttachments) ? runtime.pendingAttachments : [];
      const filtered = existing.filter((entry) => entry?.id !== attachmentId);
      if (filtered.length === existing.length) return;
      setPendingAttachmentsForGateway(gatewayId, filtered);
      if (filtered.length === 0) {
        setAttachmentNoticeForGateway(gatewayId, '');
      }
    },
    [gatewayRuntimeById, setAttachmentNoticeForGateway, setPendingAttachmentsForGateway],
  );

  const clearPendingAttachmentsForGateway = useCallback(
    (gatewayId) => {
      if (!gatewayId) return;
      setPendingAttachmentsForGateway(gatewayId, []);
      setAttachmentNoticeForGateway(gatewayId, '');
    },
    [setAttachmentNoticeForGateway, setPendingAttachmentsForGateway],
  );

  const importAttachmentFromUriForGateway = useCallback(
    async (gatewayId, candidate) => {
      const fileUri = normalizeFileUri(
        candidate?.uri ?? candidate?.url ?? candidate?.path ?? candidate?.filePath,
      );
      if (!fileUri) {
        setAttachmentNoticeForGateway(gatewayId, 'Unsupported dropped content. Use Attach button.', 'warn');
        return false;
      }

      const sizeHint = Number(candidate?.size ?? 0);
      if (Number.isFinite(sizeHint) && sizeHint > MAX_ATTACHMENT_SIZE_BYTES) {
        setAttachmentNoticeForGateway(
          gatewayId,
          `Attachment exceeds 10MB limit (${bytesLabel(sizeHint)}).`,
          'error',
        );
        return false;
      }

      try {
        setAttachmentNoticeForGateway(gatewayId, 'Importing dropped file...', 'info');
        const response = await fetch(fileUri);
        if (!response || !response.ok) {
          throw new Error(`File read failed (${response?.status ?? 'unknown'})`);
        }

        const blob = await response.blob();
        const blobSize = Number(blob?.size ?? sizeHint ?? 0);
        if (Number.isFinite(blobSize) && blobSize > MAX_ATTACHMENT_SIZE_BYTES) {
          setAttachmentNoticeForGateway(
            gatewayId,
            `Attachment exceeds 10MB limit (${bytesLabel(blobSize)}).`,
            'error',
          );
          return false;
        }

        const fileName =
          normalizeText(candidate?.fileName ?? candidate?.name) || decodeFileNameFromUri(fileUri) || 'attachment';
        const mimeType =
          normalizeText(candidate?.mimeType ?? candidate?.type) ||
          normalizeText(blob?.type) ||
          'application/octet-stream';
        const type = guessAttachmentType({ mimeType, fileName });
        const content = await blobToBase64(blob);

        return appendPendingAttachmentForGateway(gatewayId, {
          fileName,
          mimeType,
          content,
          type,
          size: blobSize,
        });
      } catch (error) {
        setAttachmentNoticeForGateway(
          gatewayId,
          `Failed to import dropped file: ${String(error?.message ?? error)}`,
          'error',
        );
        return false;
      }
    },
    [appendPendingAttachmentForGateway, setAttachmentNoticeForGateway],
  );

  const handleDroppedFilesForGateway = useCallback(
    (gatewayId, nativeEvent) => {
      const candidates = extractDroppedFileCandidates(nativeEvent);
      if (!Array.isArray(candidates) || candidates.length === 0) {
        setAttachmentNoticeForGateway(gatewayId, 'No file detected from drop.', 'warn');
        return;
      }

      const limited = candidates.slice(0, MAX_ATTACHMENT_COUNT);
      if (candidates.length > MAX_ATTACHMENT_COUNT) {
        setAttachmentNoticeForGateway(
          gatewayId,
          `Only first ${MAX_ATTACHMENT_COUNT} dropped files were considered.`,
          'warn',
        );
      }

      (async () => {
        for (const entry of limited) {
          if (!entry) continue;

          const directAttachment = normalizeAttachmentDraft(entry);
          if (directAttachment) {
            appendPendingAttachmentForGateway(gatewayId, directAttachment);
            continue;
          }

          await importAttachmentFromUriForGateway(gatewayId, entry);
        }
      })().catch(() => {
        // surfaced via notice
      });
    },
    [appendPendingAttachmentForGateway, importAttachmentFromUriForGateway, setAttachmentNoticeForGateway],
  );

  const tryImportFromClipboardShortcut = useCallback(
    (gatewayId) => {
      Clipboard.getString()
        .then((clipboardText) => {
          const uri = normalizeFileUri(clipboardText);
          if (!uri) return;
          return importAttachmentFromUriForGateway(gatewayId, { uri });
        })
        .catch(() => {
          // ignore clipboard failures
        });
    },
    [importAttachmentFromUriForGateway],
  );

  const handleAttachmentPick = useCallback(
    (payload) => {
      const gatewayId = attachmentPickerGatewayId || focusedGatewayId || activeGatewayId;
      if (!gatewayId) {
        setAttachmentPickerGatewayId(null);
        return;
      }

      appendPendingAttachmentForGateway(gatewayId, payload);
      setAttachmentPickerGatewayId(null);
      focusComposerForGateway(gatewayId);
    },
    [
      activeGatewayId,
      attachmentPickerGatewayId,
      appendPendingAttachmentForGateway,
      focusedGatewayId,
      focusComposerForGateway,
    ],
  );

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

  const handleSelectGatewayProfile = useCallback(
    (gatewayId, nextNav = 'settings') => {
      if (!gatewayId) return;
      const profile = gatewayProfiles.find((entry) => entry.id === gatewayId);
      if (!profile) return;
      setAttachmentPickerGatewayId(null);

      if (gatewayId !== activeGatewayId) {
        setActiveGatewayId(profile.id);
        setCollapsedGatewayIds((previous) => ({
          ...previous,
          [profile.id]: false,
        }));
      }
      setQuickMenuOpenForGateway(profile.id, false);
      applyGatewayProfileToEditor(profile);
      setActiveNav(nextNav);
      if (nextNav === 'chat') {
        clearUnreadForSession(profile.id, normalizeSessionKey(profile.sessionKey));
        focusComposerForGateway(profile.id);
      }
    },
    [
      activeGatewayId,
      applyGatewayProfileToEditor,
      clearUnreadForSession,
      focusComposerForGateway,
      gatewayProfiles,
      setQuickMenuOpenForGateway,
    ],
  );

  const handleCreateGatewayProfile = useCallback(() => {
    const nextProfile = createGatewayProfile(
      {
        name: `Gateway ${gatewayProfiles.length + 1}`,
        sessionKey: DEFAULTS.sessionKey,
        sessions: [DEFAULTS.sessionKey],
      },
      gatewayProfiles.length + 1,
    );

    setGatewayProfiles((previous) => [...previous, nextProfile]);
    setActiveGatewayId(nextProfile.id);
    setCollapsedGatewayIds((previous) => ({
      ...previous,
      [nextProfile.id]: false,
    }));
    applyGatewayProfileToEditor(nextProfile);
    setFocusedGatewayId(nextProfile.id);
    setActiveNav('settings');
  }, [applyGatewayProfileToEditor, gatewayProfiles.length]);

  const handleDeleteActiveGatewayProfile = useCallback(() => {
    if (gatewayProfiles.length <= 1) return;

    const nextProfiles = gatewayProfiles.filter((entry) => entry.id !== activeGatewayId);
    const removedProfile = gatewayProfiles.find((entry) => entry.id === activeGatewayId);
    const nextActiveProfile = nextProfiles[0];

    if (!nextActiveProfile) return;

    if (removedProfile) {
      disconnectGateway(removedProfile.id, { manual: false });
      disconnectAndRemoveController(removedProfile.id);
    }

    setGatewayProfiles(nextProfiles);
    setAttachmentPickerGatewayId(null);
    setGatewayRuntimeById((previous) => buildRuntimeMap(nextProfiles, previous));
    setCollapsedGatewayIds((previous) => {
      const next = { ...previous };
      delete next[activeGatewayId];
      return next;
    });
    setActiveGatewayId(nextActiveProfile.id);
    applyGatewayProfileToEditor(nextActiveProfile);

    if (focusedGatewayId === activeGatewayId) {
      setFocusedGatewayId(nextActiveProfile.id);
    }
  }, [
    activeGatewayId,
    applyGatewayProfileToEditor,
    disconnectAndRemoveController,
    disconnectGateway,
    focusedGatewayId,
    gatewayProfiles,
  ]);

  const handleSelectSession = useCallback(
    (gatewayId, nextSessionKey) => {
      const normalizedSessionKey = normalizeSessionKey(nextSessionKey);
      const profile = gatewayProfiles.find((entry) => entry.id === gatewayId);
      const currentSessionForGateway = normalizeSessionKey(profile?.sessionKey);

      updateGatewayRuntime(gatewayId, (current) => {
        const composerBySession = {
          ...(current.composerBySession ?? {}),
          [currentSessionForGateway]: {
            text: current.composerText,
            selection: normalizeComposerSelection(current.composerSelection, current.composerText),
          },
        };
        const attachmentsBySession = {
          ...(current.attachmentsBySession ?? {}),
          [currentSessionForGateway]: Array.isArray(current.pendingAttachments)
            ? current.pendingAttachments
            : [],
        };
        const nextDraft = composerBySession[normalizedSessionKey] ?? {
          text: '',
          selection: { start: 0, end: 0 },
        };
        const nextAttachments = Array.isArray(attachmentsBySession[normalizedSessionKey])
          ? attachmentsBySession[normalizedSessionKey]
          : [];
        const nextSelection = normalizeComposerSelection(nextDraft.selection, nextDraft.text);

        return {
          ...current,
          composerBySession: {
            ...composerBySession,
            [normalizedSessionKey]: {
              text: nextDraft.text,
              selection: nextSelection,
            },
          },
          attachmentsBySession: {
            ...attachmentsBySession,
            [normalizedSessionKey]: nextAttachments,
          },
          composerText: nextDraft.text,
          composerSelection: nextSelection,
          composerHeight: estimateComposerHeightFromText(nextDraft.text),
          pendingAttachments: nextAttachments,
        };
      });

      setGatewayProfiles((previous) =>
        previous.map((entry) => {
          if (entry.id !== gatewayId) return entry;
          return {
            ...entry,
            sessionKey: normalizedSessionKey,
            sessions: mergeSessionKeys([normalizedSessionKey], entry.sessions),
          };
        }),
      );

      if (gatewayId !== activeGatewayId) {
        setActiveGatewayId(gatewayId);
      }
      setSessionKey(normalizedSessionKey);
      setActiveNav('chat');
      setFocusedGatewayId(gatewayId);
      setAttachmentPickerGatewayId(null);
      setQuickMenuOpenForGateway(gatewayId, false);
      setForcedSelectionForGateway(gatewayId, null);
      setImeComposingForGateway(gatewayId, false);
      clearUnreadForSession(gatewayId, normalizedSessionKey);
      focusComposerForGateway(gatewayId);

      const runtime = gatewayRuntimeById[gatewayId];
      const connectionState = runtime?.controllerState?.connectionState ?? 'disconnected';

      if (
        connectionState === 'connected' ||
        connectionState === 'connecting' ||
        connectionState === 'reconnecting'
      ) {
        connectGateway(gatewayId, normalizedSessionKey).catch(() => {
          // Surface via controller banner state.
        });
      }
    },
    [
      activeGatewayId,
      clearUnreadForSession,
      connectGateway,
      focusComposerForGateway,
      gatewayProfiles,
      gatewayRuntimeById,
      setForcedSelectionForGateway,
      setImeComposingForGateway,
      setQuickMenuOpenForGateway,
      updateGatewayRuntime,
    ],
  );

  const handleCreateSession = useCallback(
    (gatewayId) => {
      const nextSessionKey = `session-${Date.now().toString(36)}`;
      handleSelectSession(gatewayId, nextSessionKey);
    },
    [handleSelectSession],
  );

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
  }, [activeNav]);

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

  useEffect(
    () => () => {
      Object.values(historyScrollRafByGatewayIdRef.current).forEach((pending) => {
        if (pending?.first) {
          cancelAnimationFrame(pending.first);
        }
        if (pending?.second) {
          cancelAnimationFrame(pending.second);
        }
      });
      historyScrollRafByGatewayIdRef.current = {};
      Object.values(historyScrollInteractionByGatewayIdRef.current).forEach((task) => {
        if (task?.cancel) {
          task.cancel();
        }
      });
      historyScrollInteractionByGatewayIdRef.current = {};
      Object.values(historyScrollRetryTimersByGatewayIdRef.current).forEach((timerIds) => {
        if (Array.isArray(timerIds)) {
          timerIds.forEach((timerId) => clearTimeout(timerId));
        }
      });
      historyScrollRetryTimersByGatewayIdRef.current = {};
      Object.values(turnFocusRetryTimersByGatewayIdRef.current).forEach((timerIds) => {
        if (Array.isArray(timerIds)) {
          timerIds.forEach((timerId) => clearTimeout(timerId));
        }
      });
      turnFocusRetryTimersByGatewayIdRef.current = {};
      pendingTurnFocusByGatewayIdRef.current = {};
      Object.values(copiedMessageTimerByKeyRef.current).forEach((timerId) => {
        clearTimeout(timerId);
      });
      copiedMessageTimerByKeyRef.current = {};
      historyContentHeightByGatewayIdRef.current = {};
      historyViewportHeightByGatewayIdRef.current = {};
    },
    [],
  );

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

  const handleRootKeyDown = useCallback(
    (event) => {
      const nativeEvent = event?.nativeEvent ?? {};
      const key = String(nativeEvent.key ?? '');
      const hasMeta = Boolean(nativeEvent.metaKey);
      const hasFocusedGateway =
        focusedGatewayId && gatewayProfiles.some((profile) => profile.id === focusedGatewayId);
      const fallbackGatewayId = activeNav === 'chat' ? activeGatewayId : null;
      const focusedTargetGatewayId = hasFocusedGateway ? focusedGatewayId : fallbackGatewayId;

      if (key === 'Escape') {
        if (!focusedTargetGatewayId) return;
        if (quickMenuOpenByGatewayId[focusedTargetGatewayId]) {
          setQuickMenuOpenForGateway(focusedTargetGatewayId, false);
          return;
        }
        const runtime = gatewayRuntimeById[focusedTargetGatewayId];
        const bannerMessage = runtime?.controllerState?.banner?.message;

        if (bannerMessage) {
          const controller = getController(focusedTargetGatewayId);
          controller?.clearBanner();
          return;
        }

        const activeSessionForGateway = currentSessionKeyForGateway(focusedTargetGatewayId);
        updateGatewayRuntime(focusedTargetGatewayId, (current) => ({
          ...current,
          composerText: '',
          composerSelection: { start: 0, end: 0 },
          composerHeight: COMPOSER_MIN_HEIGHT,
          pendingAttachments: [],
          attachmentsBySession: {
            ...(current.attachmentsBySession ?? {}),
            [activeSessionForGateway]: [],
          },
        }));
        return;
      }

      if (hasMeta && key.toLowerCase() === 'r') {
        event?.preventDefault?.();

        if (focusedTargetGatewayId) {
          refreshHistory(focusedTargetGatewayId).catch(() => {
            // surfaced via banner
          });
          return;
        }

        connectedGatewayIds.forEach((gatewayId) => {
          refreshHistory(gatewayId).catch(() => {
            // surfaced via banner
          });
        });
      }
    },
    [
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
    ],
  );


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
