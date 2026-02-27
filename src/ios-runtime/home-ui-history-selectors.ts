import type { HistoryRefreshNotice } from '../types';

export function resolveHistoryRefreshErrorMessage(
  historyRefreshNotice: HistoryRefreshNotice | null,
) {
  return historyRefreshNotice?.kind === 'error'
    ? historyRefreshNotice.message
    : null;
}

export function resolveHistoryUpdatedLabel(
  historyLastSyncedAt: number | null,
  formatClockLabel: (timestamp: number) => string,
) {
  if (historyLastSyncedAt == null) return null;
  return `Updated ${formatClockLabel(historyLastSyncedAt)}`;
}

export function resolveHistoryUiSelectors(input: {
  showHistoryCard: boolean;
  showHistorySecondaryUi: boolean;
  historyUpdatedLabel: string | null;
  historyBottomInset: number;
  showScrollToBottomButton: boolean;
  isHomeComposingMode: boolean;
}) {
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
