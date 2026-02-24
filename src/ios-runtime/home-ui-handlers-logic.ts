import type { NativeScrollEvent } from 'react-native';

export type TopBannerKind = 'gateway' | 'recovery' | 'history' | 'speech' | null;

export function resolveDraftText(
  transcript: string,
  interimTranscript: string,
): string {
  return transcript.trim() || interimTranscript.trim();
}

export function resolveTopBannerDismissTarget(kind: TopBannerKind) {
  if (kind === 'gateway') return 'gateway';
  if (kind === 'recovery') return 'recovery';
  if (kind === 'history') return 'history';
  if (kind === 'speech') return 'speech';
  return null;
}

export function shouldStartHoldToTalk(input: {
  speechRecognitionSupported: boolean;
  isRecognizing: boolean;
  isSending: boolean;
}) {
  return (
    input.speechRecognitionSupported &&
    !input.isRecognizing &&
    !input.isSending
  );
}

export function resolveHistoryScrollState(
  event: NativeScrollEvent,
  thresholdPx: number,
) {
  const distanceFromBottom =
    event.contentSize.height - (event.contentOffset.y + event.layoutMeasurement.height);
  const isNearBottom = distanceFromBottom < thresholdPx;
  return {
    distanceFromBottom,
    isNearBottom,
  };
}
