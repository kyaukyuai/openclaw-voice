import { useCallback } from 'react';
import { COMPOSER_MIN_HEIGHT } from '../logic/app-constants';

export default function useMacosRootKeyHandler({
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
}) {
  return useCallback(
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
}
