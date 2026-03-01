import { useCallback, useRef } from 'react';
import { GatewayChatController } from '../../../src/shared';
import {
  COMPOSER_MIN_HEIGHT,
  DEFAULTS,
  INITIAL_CONTROLLER_STATE,
} from '../logic/app-constants';
import {
  estimateComposerHeightFromText,
  extractSessionKeys,
  isSameStringArray,
  mergeSessionKeys,
  normalizeAttachmentDraft,
  normalizeSessionKey,
  normalizeText,
} from '../logic/app-logic';

export default function useMacosGatewayControllerRuntime(input) {
  const {
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
    lastNotifiedAssistantTurnByGatewayIdRef,
    manualDisconnectByIdRef,
    scheduleHistoryBottomSync,
    sessionKey,
    setAttachmentNoticeForGateway,
    setForcedSelectionForGateway,
    setGatewayProfiles,
    setImeComposingForGateway,
    updateGatewayRuntime,
    recordTelemetryEvent,
  } = input;

  const controllersRef = useRef(new Map());
  const subscriptionsRef = useRef(new Map());
  const previousControllerStateByGatewayIdRef = useRef({});

  const disconnectAndRemoveController = useCallback((gatewayId) => {
    clearGatewayHistoryRuntime(gatewayId);

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

    composerInputRefs.current.delete(gatewayId);
    delete previousControllerStateByGatewayIdRef.current[gatewayId];
    delete lastNotifiedAssistantTurnByGatewayIdRef.current[gatewayId];
  }, [clearGatewayHistoryRuntime, composerInputRefs, lastNotifiedAssistantTurnByGatewayIdRef]);

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
    [getController, setGatewayProfiles],
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

      const previousConnectionState =
        gatewayRuntimeById[gatewayId]?.controllerState?.connectionState ?? 'disconnected';
      if (previousConnectionState === 'connected' || previousConnectionState === 'reconnecting') {
        recordTelemetryEvent?.(gatewayId, 'reconnectAttempts');
      } else {
        recordTelemetryEvent?.(gatewayId, 'connectAttempts');
      }

      try {
        await controller.connect({
          url: localDraftForActive.gatewayUrl,
          token: localDraftForActive.authToken,
          sessionKey: nextSessionKey,
        });
      } catch (error) {
        recordTelemetryEvent?.(gatewayId, 'connectFailures');
        throw error;
      }

      await refreshKnownSessions(gatewayId);
    },
    [
      activeGatewayId,
      authToken,
      gatewayName,
      gatewayProfiles,
      gatewayRuntimeById,
      gatewayUrl,
      getController,
      identityReady,
      manualDisconnectByIdRef,
      recordTelemetryEvent,
      refreshKnownSessions,
      sessionKey,
      setGatewayProfiles,
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
    [getController, manualDisconnectByIdRef],
  );

  const refreshHistory = useCallback(
    async (gatewayId) => {
      const controller = getController(gatewayId);
      if (!controller) return;
      recordTelemetryEvent?.(gatewayId, 'refreshAttempts');
      try {
        await controller.refreshHistory();
      } catch (error) {
        if (String(error?.code ?? '') === 'REFRESH_TIMEOUT') {
          recordTelemetryEvent?.(gatewayId, 'refreshTimeouts');
        } else {
          recordTelemetryEvent?.(gatewayId, 'refreshFailures');
        }
        throw error;
      }
      await refreshKnownSessions(gatewayId);
    },
    [getController, recordTelemetryEvent, refreshKnownSessions],
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
      const imeComposing = input.isImeComposingByGatewayIdRef.current[gatewayId] === true;
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
      recordTelemetryEvent?.(gatewayId, 'sendAttempts');

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
        recordTelemetryEvent?.(gatewayId, 'sendFailures');
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
      input.isImeComposingByGatewayIdRef,
      recordTelemetryEvent,
      scheduleHistoryBottomSync,
      setAttachmentNoticeForGateway,
      setForcedSelectionForGateway,
      setImeComposingForGateway,
      updateGatewayRuntime,
    ],
  );

  const syncControllersWithProfiles = useCallback(
    (profiles) => {
      profiles.forEach((profile) => {
        createControllerForGateway(profile.id, profile.sessionKey);
      });

      const knownIds = new Set(profiles.map((profile) => profile.id));
      Array.from(controllersRef.current.keys()).forEach((gatewayId) => {
        if (!knownIds.has(gatewayId)) {
          disconnectAndRemoveController(gatewayId);
        }
      });
    },
    [createControllerForGateway, disconnectAndRemoveController],
  );

  const disposeAllControllers = useCallback(() => {
    Array.from(controllersRef.current.keys()).forEach((gatewayId) => {
      disconnectAndRemoveController(gatewayId);
    });
    controllersRef.current.clear();
    subscriptionsRef.current.clear();
  }, [disconnectAndRemoveController]);

  return {
    connectGateway,
    createControllerForGateway,
    disconnectAndRemoveController,
    disconnectGateway,
    disposeAllControllers,
    getController,
    refreshHistory,
    refreshKnownSessions,
    sendMessage,
    syncControllersWithProfiles,
  };
}
