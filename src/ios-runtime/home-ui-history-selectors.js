function resolveHistoryRefreshErrorMessage(historyRefreshNotice) {
  return historyRefreshNotice?.kind === 'error'
    ? historyRefreshNotice.message
    : null;
}

function resolveHistoryUpdatedLabel(historyLastSyncedAt, formatClockLabel) {
  if (historyLastSyncedAt == null) return null;
  return `Updated ${formatClockLabel(historyLastSyncedAt)}`;
}

function resolveHistoryUiSelectors(input) {
  const showHistoryUpdatedMeta =
    input.showHistoryCard &&
    input.showHistorySecondaryUi &&
    Boolean(input.historyUpdatedLabel);

  const historyListBottomPadding = Math.max(
    12,
    input.historyBottomInset + (input.showScrollToBottomButton ? 28 : 0),
  );

  const showHistoryDateDivider = input.showHistorySecondaryUi;
  const showHistoryScrollButton =
    input.showScrollToBottomButton && !input.isHomeComposingMode;

  return {
    showHistoryUpdatedMeta,
    historyListBottomPadding,
    showHistoryDateDivider,
    showHistoryScrollButton,
  };
}

module.exports = {
  resolveHistoryRefreshErrorMessage,
  resolveHistoryUpdatedLabel,
  resolveHistoryUiSelectors,
};
