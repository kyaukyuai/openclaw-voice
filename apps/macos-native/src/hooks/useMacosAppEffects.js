import { useEffect } from 'react';
import { INITIAL_CONTROLLER_STATE } from '../logic/app-constants';
import {
  isSameStringArray,
  mergeSessionKeys,
  normalizeSessionKey,
  normalizeText,
} from '../logic/app-logic';

export default function useMacosAppEffects(input) {
  const {
    activeGatewayId,
    activeNav,
    activeProfile,
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
    manualDisconnectByIdRef,
    pendingTurnFocusByGatewayIdRef,
    persistSettings,
    quickTextLeft,
    quickTextRight,
    telemetry,
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
    lastAutoConnectSignatureByIdRef,
    applyGatewayProfileToEditor,
    notificationSettings,
  } = input;

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
      telemetry,
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
    notificationSettings,
    persistSettings,
    quickTextLeft,
    quickTextRight,
    telemetry,
    sessionKey,
    theme,
  ]);

  useEffect(() => {
    if (!activeProfile) return;
    applyGatewayProfileToEditor(activeProfile);
  }, [activeProfile, applyGatewayProfileToEditor]);

  useEffect(() => {
    const normalizedSession = normalizeSessionKey(sessionKey);
    setGatewayProfiles((previous) => {
      let changed = false;
      const next = previous.map((entry, index) => {
        if (entry.id !== activeGatewayId) return entry;

        const nextEntry = {
          ...entry,
          name: normalizeText(gatewayName) || `Gateway ${index + 1}`,
          gatewayUrl,
          authToken,
          sessionKey: normalizedSession,
          sessions: mergeSessionKeys([normalizedSession], entry.sessions),
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
  }, [activeGatewayId, authToken, gatewayName, gatewayUrl, sessionKey, setGatewayProfiles]);

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
  }, [
    booting,
    connectGateway,
    gatewayProfiles,
    gatewayRuntimeById,
    identityReady,
    lastAutoConnectSignatureByIdRef,
    manualDisconnectByIdRef,
  ]);

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
    }
  }, [
    booting,
    focusComposerForGateway,
    gatewayProfiles,
    gatewayRuntimeById,
    identityReady,
    initialAutoNavigationHandledRef,
    setActiveGatewayId,
    setActiveNav,
    setCollapsedGatewayIds,
    setFocusedGatewayId,
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
  }, [activeNav, gatewayProfiles, gatewayRuntimeById, setActiveNav]);

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
    scheduleHistoryBottomSync,
    scheduleHistoryTurnFocus,
  ]);
}
