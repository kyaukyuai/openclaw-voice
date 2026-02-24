import { useMemo } from 'react';
import {
  buildHistoryItems,
  buildHomeUiStateSnapshot,
  buildVisibleSessions,
  resolveLatestRetryText,
  type HomeUiStateLogicInput,
} from './home-ui-state-logic';

type UseHomeUiStateInput = HomeUiStateLogicInput;

export function useHomeUiState(input: UseHomeUiStateInput) {
  const visibleSessions = useMemo(() => {
    return buildVisibleSessions(
      input.sessions,
      input.activeSessionKey,
      input.sessionPreferences,
    );
  }, [input.activeSessionKey, input.sessionPreferences, input.sessions]);

  const historyItems = useMemo(() => {
    return buildHistoryItems(
      input.chatTurns,
      input.getHistoryDayKey,
      input.getHistoryDayLabel,
    );
  }, [input.chatTurns, input.getHistoryDayKey, input.getHistoryDayLabel]);

  const latestRetryText = useMemo(() => {
    return resolveLatestRetryText(
      input.chatTurns,
      input.transcript,
      input.interimTranscript,
    );
  }, [input.chatTurns, input.interimTranscript, input.transcript]);

  return buildHomeUiStateSnapshot(input, {
    visibleSessions,
    historyItems,
    latestRetryText,
  });
}
