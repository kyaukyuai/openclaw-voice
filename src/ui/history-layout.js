function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function computeHistoryBottomInset(snapshot) {
  const minInset = snapshot.minInset ?? 14;
  const maxInset = snapshot.maxInset ?? 220;
  const safeAreaBottom = Math.max(0, snapshot.safeAreaBottom || 0);
  const keyboardHeight = snapshot.isKeyboardVisible
    ? Math.max(0, snapshot.keyboardHeight || 0)
    : 0;
  const composerHeight = Math.max(0, snapshot.composerHeight || 0);
  const composerContribution = composerHeight > 0 ? Math.min(56, composerHeight * 0.4) : 0;
  const keyboardContribution = keyboardHeight > 0 ? Math.min(96, keyboardHeight * 0.24) : 0;
  const extraInset = Math.max(0, snapshot.extraInset || 0);

  const nextInset = safeAreaBottom + composerContribution + keyboardContribution + extraInset;
  return clamp(Math.round(nextInset), minInset, maxInset);
}

function scheduleHistoryScrollToEnd(task) {
  const raf =
    typeof globalThis.requestAnimationFrame === 'function'
      ? globalThis.requestAnimationFrame.bind(globalThis)
      : (callback) => setTimeout(() => callback(Date.now()), 16);

  raf(() => {
    raf(() => {
      task();
    });
  });
}

module.exports = {
  clamp,
  computeHistoryBottomInset,
  scheduleHistoryScrollToEnd,
};
