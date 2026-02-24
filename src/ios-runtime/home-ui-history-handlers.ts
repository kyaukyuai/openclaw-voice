import { useCallback } from 'react';
import {
  Keyboard,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { buildHistoryRefreshNotice } from '../ui/runtime-logic';
import {
  resolveHistoryScrollState,
} from './home-ui-handlers-logic';
import type { UseHomeUiHandlersInput } from './home-ui-handlers.types';

export function useHomeUiHistoryHandlers(input: UseHomeUiHandlersInput) {
  const handleRefreshHistory = useCallback(() => {
    if (!input.isGatewayConnected || input.isSessionHistoryLoading) return;
    Keyboard.dismiss();
    input.setFocusedField(null);
    input.clearHistoryNoticeTimer();
    input.setHistoryRefreshNotice(null);
    const sessionKey = input.activeSessionKeyRef.current;
    void (async () => {
      const synced = await input.loadSessionHistory(sessionKey, { silentError: true });
      void input.refreshSessions();
      if (synced) {
        const now = Date.now();
        input.setHistoryLastSyncedAt(now);
        const notice = buildHistoryRefreshNotice(true, input.formatClockLabel(now));
        input.showHistoryRefreshNotice(notice.kind, notice.message);
        return;
      }
      const notice = buildHistoryRefreshNotice(false);
      input.showHistoryRefreshNotice(notice.kind, notice.message);
    })();
  }, [input]);

  const handleScrollHistoryToBottom = useCallback(() => {
    input.scrollHistoryToBottom(true);
    input.onButtonPressHaptic();
  }, [input]);

  const handleHistoryScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { isNearBottom } = resolveHistoryScrollState(
        event.nativeEvent,
        input.historyBottomThresholdPx,
      );
      input.historyAutoScrollRef.current = isNearBottom;
      input.setShowScrollToBottomButton(input.chatTurnsLength > 0 && !isNearBottom);
    },
    [input],
  );

  const handleHistoryAutoScroll = useCallback(() => {
    if (input.historyAutoScrollRef.current) {
      input.scrollHistoryToBottom(false);
    }
  }, [input]);

  const handleHistoryLayoutAutoScroll = useCallback(() => {
    if (input.historyAutoScrollRef.current) {
      input.scrollHistoryToBottom(false);
    }
  }, [input]);

  return {
    handleRefreshHistory,
    handleScrollHistoryToBottom,
    handleHistoryScroll,
    handleHistoryAutoScroll,
    handleHistoryLayoutAutoScroll,
  };
}
