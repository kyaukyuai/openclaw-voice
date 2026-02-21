function getSpeechUnsupportedMessage(isMacRuntime) {
  return isMacRuntime ? 'macOSでは音声入力未対応です。' : 'Webでは音声入力未対応です。';
}

function shouldIgnoreSpeechError(input) {
  return (
    input.isUnmounting ||
    input.isAbortedLike ||
    (input.expectedSpeechStop && input.code.length > 0)
  );
}

function appendFinalSpeechTranscript(previous, text) {
  return previous ? `${previous}\n${text}` : text;
}

module.exports = {
  getSpeechUnsupportedMessage,
  shouldIgnoreSpeechError,
  appendFinalSpeechTranscript,
};
