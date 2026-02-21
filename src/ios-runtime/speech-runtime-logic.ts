export function getSpeechUnsupportedMessage(isMacRuntime: boolean): string {
  return isMacRuntime ? 'macOSでは音声入力未対応です。' : 'Webでは音声入力未対応です。';
}

export function shouldIgnoreSpeechError(input: {
  isUnmounting: boolean;
  isAbortedLike: boolean;
  expectedSpeechStop: boolean;
  code: string;
}): boolean {
  return (
    input.isUnmounting ||
    input.isAbortedLike ||
    (input.expectedSpeechStop && input.code.length > 0)
  );
}

export function appendFinalSpeechTranscript(previous: string, text: string): string {
  return previous ? `${previous}\n${text}` : text;
}
