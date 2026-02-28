import { useCallback, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  insertQuickTextAtSelection,
} from '../../../src/shared';
import { setStorage } from '../../../src/openclaw/storage';
import {
  DEFAULT_GATEWAY_PROFILE,
  DEFAULTS,
  SETTINGS_KEY,
  THEMES,
} from '../logic/app-constants';
import {
  createGatewayRuntime,
  estimateComposerHeightFromText,
  normalizeComposerSelection,
  normalizeSessionKey,
} from '../logic/app-logic';
import useMacosAttachmentRuntime from './useMacosAttachmentRuntime';
import useMacosAppEffects from './useMacosAppEffects';
import useMacosAppLifecycle from './useMacosAppLifecycle';
import useMacosAppUiWiring from './useMacosAppUiWiring';
import useMacosGatewayProfileActions from './useMacosGatewayProfileActions';
import useMacosHistoryScrollRuntime from './useMacosHistoryScrollRuntime';
import useMacosNotificationRuntime from './useMacosNotificationRuntime';
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

  const toggleGatewayCollapse = useCallback((gatewayId) => {
    if (!gatewayId) return;
    setCollapsedGatewayIds((previous) => ({
      ...previous,
      [gatewayId]: !previous[gatewayId],
    }));
  }, []);
  const {
    activeProfile,
    handleRootKeyDown,
    summaryChip,
  } = useMacosAppUiWiring({
    activeGatewayId,
    activeNav,
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

  useMacosAppLifecycle({
    activeGatewayId,
    activeNav,
    activeGatewayIdRef,
    activeNavRef,
    activeSessionKeyRef,
    applyGatewayProfileToEditor,
    booting,
    composerFocusTimerRef,
    disposeAllControllers,
    gatewayProfiles,
    gatewayProfilesRef,
    gatewayRuntimeById,
    gatewayRuntimeByIdRef,
    getPushNotificationModule,
    handleSelectSession,
    identityCache,
    identityReady,
    lastHandledNotificationRouteSignatureRef,
    pendingNotificationRouteRef,
    refreshHistory,
    rootRef,
    scheduleHistoryTurnFocus,
    sessionKey,
    setActiveGatewayId,
    setBooting,
    setGatewayProfiles,
    setGatewayRuntimeById,
    setIdentityPersistWarning,
    setIdentityReady,
    setNotificationSettings,
    setQuickTextLeft,
    setQuickTextRight,
    setTheme,
    syncControllersWithProfiles,
  });

  useMacosAppEffects({
    activeGatewayId,
    activeNav,
    activeProfile,
    applyGatewayProfileToEditor,
    attachmentNoticeByGatewayId,
    authToken,
    booting,
    clearUnreadForSession,
    closeAllQuickMenus,
    connectGateway,
    focusComposerForGateway,
    gatewayName,
    gatewayProfiles,
    gatewayRuntimeById,
    gatewayUrl,
    historyBottomInsetByGatewayId,
    identityReady,
    initialAutoNavigationHandledRef,
    lastAutoConnectSignatureByIdRef,
    manualDisconnectByIdRef,
    notificationSettings,
    pendingTurnFocusByGatewayIdRef,
    persistSettings,
    quickTextLeft,
    quickTextRight,
    recomputeHistoryBottomInsetForGateway,
    refreshKnownSessions,
    scheduleHistoryBottomSync,
    scheduleHistoryTurnFocus,
    sessionKey,
    setActiveGatewayId,
    setActiveNav,
    setAttachmentNoticeForGateway,
    setCollapsedGatewayIds,
    setDropActiveByGatewayId,
    setFocusedGatewayId,
    setGatewayProfiles,
    theme,
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
