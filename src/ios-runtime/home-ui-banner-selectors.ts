import type { MissingResponseRecoveryNotice } from '../types';

export type HomeTopBannerKind =
  | 'gateway'
  | 'recovery'
  | 'history'
  | 'speech'
  | null;

export function resolveActiveMissingResponseNotice(
  missingResponseNotice: MissingResponseRecoveryNotice | null,
  activeSessionKey: string,
) {
  return missingResponseNotice?.sessionKey === activeSessionKey
    ? missingResponseNotice
    : null;
}

export function resolveTopBannerSelectors(input: {
  gatewayError: string | null;
  activeMissingResponseNotice: MissingResponseRecoveryNotice | null;
  historyRefreshErrorMessage: string | null;
  speechError: string | null;
}) {
  const topBannerKind: HomeTopBannerKind = input.gatewayError
    ? 'gateway'
    : input.activeMissingResponseNotice
      ? 'recovery'
      : input.historyRefreshErrorMessage
        ? 'history'
        : input.speechError
          ? 'speech'
          : null;

  const topBannerMessage =
    input.gatewayError ??
    input.activeMissingResponseNotice?.message ??
    input.historyRefreshErrorMessage ??
    input.speechError;

  const topBannerIconName:
    | 'cloud-offline-outline'
    | 'time-outline'
    | 'refresh-outline'
    | 'mic-off-outline' =
    topBannerKind === 'gateway'
      ? 'cloud-offline-outline'
      : topBannerKind === 'recovery'
        ? 'time-outline'
        : topBannerKind === 'history'
          ? 'refresh-outline'
          : 'mic-off-outline';

  return {
    topBannerKind,
    topBannerMessage,
    topBannerIconName,
  };
}
