function resolveDraftText(transcript, interimTranscript) {
  return transcript.trim() || interimTranscript.trim();
}

function resolveTopBannerDismissTarget(kind) {
  if (kind === 'gateway') return 'gateway';
  if (kind === 'recovery') return 'recovery';
  if (kind === 'history') return 'history';
  if (kind === 'speech') return 'speech';
  return null;
}

function shouldStartHoldToTalk(input) {
  return (
    input.speechRecognitionSupported &&
    !input.isRecognizing &&
    !input.isSending
  );
}

function resolveHistoryScrollState(event, thresholdPx) {
  const distanceFromBottom =
    event.contentSize.height - (event.contentOffset.y + event.layoutMeasurement.height);
  const isNearBottom = distanceFromBottom < thresholdPx;
  return {
    distanceFromBottom,
    isNearBottom,
  };
}

module.exports = {
  resolveDraftText,
  resolveTopBannerDismissTarget,
  shouldStartHoldToTalk,
  resolveHistoryScrollState,
};
