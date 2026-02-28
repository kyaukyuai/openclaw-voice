import { useMemo } from 'react';
import {
  INITIAL_CONTROLLER_STATE,
  SEMANTIC,
} from '../logic/app-constants';
import useMacosRootKeyHandler from './useMacosRootKeyHandler';

export default function useMacosAppUiWiring(input) {
  const {
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
  } = input;

  const activeProfile = useMemo(
    () => gatewayProfiles.find((profile) => profile.id === activeGatewayId) ?? gatewayProfiles[0] ?? null,
    [activeGatewayId, gatewayProfiles],
  );

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

  const activeControllerState = activeProfile?.id
    ? gatewayRuntimeById[activeProfile.id]?.controllerState ?? INITIAL_CONTROLLER_STATE
    : null;

  return {
    activeControllerState,
    activeProfile,
    connectedGatewayIds,
    handleRootKeyDown,
    summaryChip,
  };
}
