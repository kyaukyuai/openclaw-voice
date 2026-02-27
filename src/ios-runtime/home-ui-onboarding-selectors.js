const { isIncompleteAssistantContent } = require('../ui/runtime-logic');

function resolveGatewayDiagnosticIconName(diagnostic) {
  const kind = diagnostic?.kind;
  if (kind === 'tls') return 'shield-checkmark-outline';
  if (kind === 'auth') return 'key-outline';
  if (kind === 'timeout') return 'time-outline';
  if (kind === 'dns') return 'globe-outline';
  if (kind === 'network') return 'cloud-offline-outline';
  if (kind === 'server') return 'server-outline';
  if (kind === 'pairing') return 'people-outline';
  if (kind === 'invalid-url') return 'link-outline';
  return 'alert-circle-outline';
}

function resolveOnboardingDiagnosticSelectors(input) {
  const showOnboardingGuide = input.settingsReady && !input.isOnboardingCompleted;
  const isOnboardingGatewayConfigured = input.gatewayUrl.trim().length > 0;
  const isOnboardingConnectDone = input.isGatewayConnected;
  const isOnboardingResponseDone = input.chatTurns.some(
    (turn) =>
      turn.state === 'complete' && !isIncompleteAssistantContent(turn.assistantText),
  );

  const canRunOnboardingConnectTest =
    input.settingsReady && !input.isGatewayConnecting;
  const canRunOnboardingSampleSend =
    input.isGatewayConnected &&
    !input.isSending &&
    !input.isOnboardingWaitingForResponse;

  const onboardingSampleButtonLabel = input.isOnboardingWaitingForResponse
    ? 'Waiting reply...'
    : 'Send Sample';

  const showGatewayDiagnostic =
    !input.isGatewayConnected && input.gatewayConnectDiagnostic != null;
  const gatewayDiagnosticIconName = resolveGatewayDiagnosticIconName(
    input.gatewayConnectDiagnostic,
  );

  return {
    showOnboardingGuide,
    isOnboardingGatewayConfigured,
    isOnboardingConnectDone,
    isOnboardingResponseDone,
    canRunOnboardingConnectTest,
    canRunOnboardingSampleSend,
    onboardingSampleButtonLabel,
    showGatewayDiagnostic,
    gatewayDiagnosticIconName,
  };
}

module.exports = {
  resolveGatewayDiagnosticIconName,
  resolveOnboardingDiagnosticSelectors,
};
