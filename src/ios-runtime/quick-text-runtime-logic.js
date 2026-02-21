function normalizeQuickText(rawText) {
  return rawText.trim();
}

function shouldInsertQuickText(nextText, isRecognizing) {
  return nextText.length > 0 && !isRecognizing;
}

function appendQuickText(previous, nextText) {
  const current = previous.trimEnd();
  if (!current) return nextText;
  return `${current}\n${nextText}`;
}

function shouldConsumeQuickTextPress(input) {
  return input.activeLongPressSide === input.pressedSide;
}

module.exports = {
  normalizeQuickText,
  shouldInsertQuickText,
  appendQuickText,
  shouldConsumeQuickTextPress,
};
