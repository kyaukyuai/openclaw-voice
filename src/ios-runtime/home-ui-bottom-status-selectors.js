function resolveBottomStatusSelectors(input) {
  const hasRetryingState =
    Boolean(input.activeMissingResponseNotice) ||
    (input.outboxQueueLength > 0 && input.connectionState === 'connected');

  const hasErrorState =
    Boolean(input.gatewayError) ||
    Boolean(input.speechError) ||
    Boolean(input.historyRefreshErrorMessage);

  const bottomActionStatus = input.isRecognizing
    ? 'recording'
    : input.isSending
      ? 'sending'
      : hasRetryingState
        ? 'retrying'
        : hasErrorState
          ? 'error'
          : !input.isGatewayConnected
            ? input.isGatewayConnecting || input.isStartupAutoConnecting
              ? 'connecting'
              : 'disconnected'
            : input.isBottomCompletePulse
              ? 'complete'
              : 'ready';

  const bottomActionDetailText =
    bottomActionStatus === 'recording'
      ? 'Release to stop'
      : bottomActionStatus === 'sending'
        ? input.isStreamingGatewayEvent
          ? 'Streaming response'
          : 'Waiting response'
        : bottomActionStatus === 'retrying'
          ? input.activeMissingResponseNotice
            ? input.isMissingResponseRecoveryInFlight
              ? 'Fetching final output'
              : 'Retry available'
            : `Queued ${input.outboxQueueLength}`
          : bottomActionStatus === 'complete'
            ? 'Sent successfully'
            : bottomActionStatus === 'connecting'
              ? input.outboxQueueLength > 0
                ? `Queued ${input.outboxQueueLength}`
                : 'Please wait'
              : bottomActionStatus === 'disconnected'
                ? input.outboxQueueLength > 0
                  ? `Queued ${input.outboxQueueLength}`
                  : 'Connect Gateway'
                : bottomActionStatus === 'error'
                  ? 'Check top banner'
                  : input.canSendDraft
                    ? 'Tap send'
                    : input.speechRecognitionSupported
                      ? 'Hold to record'
                      : input.speechUnsupportedMessage;

  const showBottomStatus =
    !input.isKeyboardBarMounted && !input.isHomeComposingMode;

  return {
    bottomActionStatus,
    bottomActionDetailText,
    showBottomStatus,
    bottomActionStatusLabel: input.bottomActionStatusLabels[bottomActionStatus],
    connectionStatusLabel: input.connectionLabels[input.connectionState],
  };
}

module.exports = {
  resolveBottomStatusSelectors,
};
