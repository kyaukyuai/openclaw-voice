function validateGatewayConnectPreflight(input) {
  if (!input.settingsReady) {
    return {
      ok: false,
      message: 'Initializing. Please wait a few seconds and try again.',
    };
  }

  const trimmedGatewayUrl = String(input.gatewayUrl ?? '').trim();
  if (!trimmedGatewayUrl) {
    return {
      ok: false,
      message: 'Please enter a Gateway URL.',
    };
  }

  let parsedGatewayUrl;
  try {
    parsedGatewayUrl = new URL(trimmedGatewayUrl);
  } catch {
    const diagnostic = {
      kind: 'invalid-url',
      summary: 'Gateway URL is invalid.',
      guidance: 'Use ws:// or wss:// with a valid host.',
    };
    return {
      ok: false,
      message: `${diagnostic.summary} ${diagnostic.guidance}`,
      diagnostic,
    };
  }

  if (!/^wss?:$/i.test(parsedGatewayUrl.protocol)) {
    const diagnostic = {
      kind: 'invalid-url',
      summary: 'Gateway URL must start with ws:// or wss://.',
      guidance: `Current protocol is ${parsedGatewayUrl.protocol}`,
    };
    return {
      ok: false,
      message: `${diagnostic.summary} ${diagnostic.guidance}`,
      diagnostic,
    };
  }

  return {
    ok: true,
    trimmedGatewayUrl,
  };
}

function shouldRunAutoConnectRetry(input) {
  if (input.isUnmounting) return false;
  if (!String(input.gatewayUrl ?? '').trim()) return false;
  if (input.connectionState !== 'disconnected') return false;
  return true;
}

function applyDisconnectReset(input) {
  input.invalidateRefreshEpoch();
  input.clearFinalResponseRecoveryTimer();
  input.clearMissingResponseRecoveryState();
  input.clearStartupAutoConnectRetryTimer();
  input.clearBottomCompletePulseTimer();
  input.clearOutboxRetryTimer();
  if (input.historySyncTimerRef.current) {
    clearTimeout(input.historySyncTimerRef.current);
    input.historySyncTimerRef.current = null;
  }
  input.historySyncRequestRef.current = null;
  input.outboxProcessingRef.current = false;
  input.gatewayDisconnect();
  input.activeRunIdRef.current = null;
  input.setActiveRunId(null);
  input.pendingTurnIdRef.current = null;
  input.runIdToTurnIdRef.current.clear();
  input.setIsSessionOperationPending(false);
  input.runGatewayRuntimeAction({ type: 'RESET_RUNTIME' });
  input.setGatewayConnectDiagnostic(null);
  input.setIsBottomCompletePulse(false);
}

module.exports = {
  validateGatewayConnectPreflight,
  shouldRunAutoConnectRetry,
  applyDisconnectReset,
};
