function resolveActiveMissingResponseNotice(missingResponseNotice, activeSessionKey) {
  return missingResponseNotice?.sessionKey === activeSessionKey
    ? missingResponseNotice
    : null;
}

function resolveTopBannerSelectors(input) {
  const topBannerKind = input.gatewayError
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

  const topBannerIconName =
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

module.exports = {
  resolveActiveMissingResponseNotice,
  resolveTopBannerSelectors,
};
