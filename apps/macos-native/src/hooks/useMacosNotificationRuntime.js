import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, NativeModules, Platform } from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { assistantTurnSignature } from '../logic/app-logic';
import {
  DEFAULT_NOTIFICATION_SETTINGS,
} from '../logic/app-constants';
import {
  findLatestCompletedAssistantTurn,
  isSameNotificationSettings,
  isSameUnreadByGatewaySession,
  normalizeNotificationSettings,
  normalizeSessionKey,
  normalizeText,
  normalizeUnreadByGatewaySession,
  notificationSnippet,
} from '../logic/app-logic';

export default function useMacosNotificationRuntime({
  activeGatewayIdRef,
  activeNavRef,
  activeSessionKeyRef,
  gatewayProfiles,
  gatewayProfilesRef,
  recordTelemetryEvent,
}) {
  const [notificationSettings, setNotificationSettings] = useState(() =>
    normalizeNotificationSettings(DEFAULT_NOTIFICATION_SETTINGS, gatewayProfiles),
  );
  const [copiedMessageByKey, setCopiedMessageByKey] = useState({});
  const [unreadByGatewaySession, setUnreadByGatewaySession] = useState({});

  const appStateRef = useRef(AppState.currentState ?? 'active');
  const copiedMessageTimerByKeyRef = useRef({});
  const lastNotifiedAssistantTurnByGatewayIdRef = useRef({});
  const notificationPermissionGrantedRef = useRef(false);
  const notificationPermissionRequestedRef = useRef(false);
  const notificationSettingsRef = useRef(notificationSettings);
  const pushNotificationModuleRef = useRef(undefined);

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
    [getPushNotificationModule, requestNotificationPermission, gatewayProfilesRef],
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
      recordTelemetryEvent?.(gatewayId, 'assistantReplies');

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
    [
      activeGatewayIdRef,
      activeNavRef,
      activeSessionKeyRef,
      clearUnreadForSession,
      incrementUnreadForSession,
      notifyNewAssistantMessage,
      recordTelemetryEvent,
      gatewayProfilesRef,
    ],
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
      Object.values(copiedMessageTimerByKeyRef.current).forEach((timerId) => {
        clearTimeout(timerId);
      });
      copiedMessageTimerByKeyRef.current = {};
    },
    [],
  );

  return {
    clearUnreadForSession,
    copiedMessageByKey,
    getPushNotificationModule,
    handleAssistantTurnArrival,
    handleCopyMessage,
    handleOpenExternalLink,
    incrementUnreadForSession,
    isGatewayNotificationEnabled,
    lastNotifiedAssistantTurnByGatewayIdRef,
    notificationSettings,
    setNotificationSettings,
    toggleGatewayNotifications,
    toggleMuteForegroundNotifications,
    toggleNotificationsEnabled,
    unreadByGatewaySession,
  };
}
