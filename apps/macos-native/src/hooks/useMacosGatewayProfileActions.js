import { useCallback } from 'react';
import { DEFAULTS } from '../logic/app-constants';
import {
  buildRuntimeMap,
  createGatewayProfile,
  estimateComposerHeightFromText,
  mergeSessionKeys,
  normalizeComposerSelection,
  normalizeSessionKey,
} from '../logic/app-logic';

export default function useMacosGatewayProfileActions({
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
}) {
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
      setAttachmentPickerGatewayId,
      setQuickMenuOpenForGateway,
      setActiveGatewayId,
      setCollapsedGatewayIds,
      setActiveNav,
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
  }, [
    applyGatewayProfileToEditor,
    gatewayProfiles.length,
    setGatewayProfiles,
    setActiveGatewayId,
    setCollapsedGatewayIds,
    setFocusedGatewayId,
    setActiveNav,
  ]);

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
    setAttachmentPickerGatewayId,
    setGatewayProfiles,
    setGatewayRuntimeById,
    setCollapsedGatewayIds,
    setActiveGatewayId,
    setFocusedGatewayId,
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
      setAttachmentPickerGatewayId,
      setForcedSelectionForGateway,
      setImeComposingForGateway,
      setQuickMenuOpenForGateway,
      updateGatewayRuntime,
      setGatewayProfiles,
      setActiveGatewayId,
      setSessionKey,
      setActiveNav,
      setFocusedGatewayId,
    ],
  );

  const handleCreateSession = useCallback(
    (gatewayId) => {
      const nextSessionKey = `session-${Date.now().toString(36)}`;
      handleSelectSession(gatewayId, nextSessionKey);
    },
    [handleSelectSession],
  );

  return {
    handleCreateGatewayProfile,
    handleCreateSession,
    handleDeleteActiveGatewayProfile,
    handleSelectGatewayProfile,
    handleSelectSession,
  };
}
