function shouldResetMissingRecoveryRequest(input) {
  if (!input.targetSessionKey) return true;
  return input.request?.sessionKey === input.targetSessionKey;
}

function resolveClearedMissingResponseNotice(previous, targetSessionKey) {
  if (!previous) return previous;
  if (targetSessionKey && previous.sessionKey !== targetSessionKey) {
    return previous;
  }
  return null;
}

function canRunGatewayHealthCheck(connectionState) {
  return connectionState === 'connected';
}

module.exports = {
  shouldResetMissingRecoveryRequest,
  resolveClearedMissingResponseNotice,
  canRunGatewayHealthCheck,
};
