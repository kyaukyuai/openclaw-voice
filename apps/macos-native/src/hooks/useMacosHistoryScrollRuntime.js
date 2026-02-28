import { useCallback, useEffect, useRef, useState } from 'react';
import { InteractionManager } from 'react-native';
import { groupTurnsByDate } from '../../../src/shared';
import { normalizeSessionKey, normalizeText } from '../logic/app-logic';

export default function useMacosHistoryScrollRuntime({
  gatewayProfilesRef,
  gatewayRuntimeByIdRef,
}) {
  const [historyBottomInsetByGatewayId, setHistoryBottomInsetByGatewayId] = useState({});

  const composerHeightByGatewayIdRef = useRef({});
  const hintHeightByGatewayIdRef = useRef({});
  const historyContentHeightByGatewayIdRef = useRef({});
  const historyViewportHeightByGatewayIdRef = useRef({});
  const historyScrollRefs = useRef(new Map());
  const historyScrollInteractionByGatewayIdRef = useRef({});
  const historyScrollRafByGatewayIdRef = useRef({});
  const historyScrollRetryTimersByGatewayIdRef = useRef({});
  const pendingTurnFocusByGatewayIdRef = useRef({});
  const turnFocusRetryTimersByGatewayIdRef = useRef({});

  const setHistoryBottomInsetForGateway = useCallback((gatewayId, inset) => {
    if (!gatewayId || !Number.isFinite(inset)) return;
    const normalized = Math.max(14, Math.min(48, Math.ceil(inset)));
    setHistoryBottomInsetByGatewayId((previous) => {
      if (previous[gatewayId] === normalized) return previous;
      return { ...previous, [gatewayId]: normalized };
    });
  }, []);

  const recomputeHistoryBottomInsetForGateway = useCallback(
    (gatewayId) => {
      if (!gatewayId) return;
      const composerHeight = composerHeightByGatewayIdRef.current[gatewayId] ?? 40;
      const hintHeight = hintHeightByGatewayIdRef.current[gatewayId] ?? 18;
      const nextInset = composerHeight * 0.25 + hintHeight * 0.25 + 8;
      setHistoryBottomInsetForGateway(gatewayId, nextInset);
    },
    [setHistoryBottomInsetForGateway],
  );

  const clearTurnFocusRetries = useCallback((gatewayId) => {
    if (!gatewayId) return;
    const timers = turnFocusRetryTimersByGatewayIdRef.current[gatewayId];
    if (Array.isArray(timers)) {
      timers.forEach((timerId) => clearTimeout(timerId));
    }
    delete turnFocusRetryTimersByGatewayIdRef.current[gatewayId];
  }, []);

  const clearPendingTurnFocus = useCallback(
    (gatewayId) => {
      if (!gatewayId) return;
      clearTurnFocusRetries(gatewayId);
      delete pendingTurnFocusByGatewayIdRef.current[gatewayId];
    },
    [clearTurnFocusRetries],
  );

  const scrollHistoryToBottom = useCallback((gatewayId, animated = false) => {
    if (!gatewayId) return;
    const pending = historyScrollRafByGatewayIdRef.current[gatewayId];
    if (pending?.first) {
      cancelAnimationFrame(pending.first);
    }
    if (pending?.second) {
      cancelAnimationFrame(pending.second);
    }
    const pendingInteraction = historyScrollInteractionByGatewayIdRef.current[gatewayId];
    if (pendingInteraction?.cancel) {
      pendingInteraction.cancel();
    }

    const interactionTask = InteractionManager.runAfterInteractions(() => {
      const first = requestAnimationFrame(() => {
        const second = requestAnimationFrame(() => {
          const scrollNode = historyScrollRefs.current.get(gatewayId);
          const contentHeight = historyContentHeightByGatewayIdRef.current[gatewayId] ?? 0;
          const viewportHeight = historyViewportHeightByGatewayIdRef.current[gatewayId] ?? 0;
          const targetOffset = Math.max(0, contentHeight - viewportHeight);

          if (Number.isFinite(targetOffset) && targetOffset > 0) {
            scrollNode?.scrollToOffset?.({ offset: targetOffset, animated });
          }
          scrollNode?.scrollToEnd?.({ animated });
          delete historyScrollRafByGatewayIdRef.current[gatewayId];
          delete historyScrollInteractionByGatewayIdRef.current[gatewayId];
        });
        historyScrollRafByGatewayIdRef.current[gatewayId] = { second };
      });
      historyScrollRafByGatewayIdRef.current[gatewayId] = { first };
    });
    historyScrollInteractionByGatewayIdRef.current[gatewayId] = interactionTask;
  }, []);

  const scrollHistoryToTurn = useCallback(
    (gatewayId, turnId, expectedSessionKey, animated = true) => {
      const normalizedGatewayId = normalizeText(gatewayId);
      const normalizedTurnId = normalizeText(turnId);
      if (!normalizedGatewayId || !normalizedTurnId) return false;

      const profile = gatewayProfilesRef.current.find((entry) => entry.id === normalizedGatewayId);
      if (!profile) return false;

      const currentSessionKey = normalizeSessionKey(profile.sessionKey);
      if (expectedSessionKey && currentSessionKey !== normalizeSessionKey(expectedSessionKey)) {
        return false;
      }

      const runtime = gatewayRuntimeByIdRef.current[normalizedGatewayId];
      const turns = Array.isArray(runtime?.controllerState?.turns) ? runtime.controllerState.turns : [];
      if (turns.length === 0) return false;

      const grouped = groupTurnsByDate(turns);
      const index = grouped.findIndex(
        (item) => item?.kind === 'turn' && String(item?.id ?? '').trim() === normalizedTurnId,
      );
      if (index < 0) return false;

      const scrollNode = historyScrollRefs.current.get(normalizedGatewayId);
      if (!scrollNode || typeof scrollNode.scrollToIndex !== 'function') return false;

      try {
        scrollNode.scrollToIndex({ index, animated, viewPosition: 1 });
        return true;
      } catch {
        return false;
      }
    },
    [gatewayProfilesRef, gatewayRuntimeByIdRef],
  );

  const scheduleHistoryTurnFocus = useCallback(
    (gatewayId, turnId, sessionForTurn) => {
      const normalizedGatewayId = normalizeText(gatewayId);
      const normalizedTurnId = normalizeText(turnId);
      if (!normalizedGatewayId || !normalizedTurnId) return;

      const normalizedSession = normalizeSessionKey(sessionForTurn);
      pendingTurnFocusByGatewayIdRef.current[normalizedGatewayId] = {
        turnId: normalizedTurnId,
        sessionKey: normalizedSession,
      };

      clearTurnFocusRetries(normalizedGatewayId);

      const timers = [];
      [0, 80, 220, 450, 800, 1200, 1800, 2600].forEach((delay) => {
        const timerId = setTimeout(() => {
          const pending = pendingTurnFocusByGatewayIdRef.current[normalizedGatewayId];
          if (!pending) return;
          const focused = scrollHistoryToTurn(
            normalizedGatewayId,
            pending.turnId,
            pending.sessionKey,
            false,
          );
          if (focused) {
            clearPendingTurnFocus(normalizedGatewayId);
          }
        }, delay);
        timers.push(timerId);
      });

      const expiryTimerId = setTimeout(() => {
        const pending = pendingTurnFocusByGatewayIdRef.current[normalizedGatewayId];
        if (!pending) return;
        if (
          pending.turnId === normalizedTurnId &&
          normalizeSessionKey(pending.sessionKey) === normalizedSession
        ) {
          clearPendingTurnFocus(normalizedGatewayId);
          scrollHistoryToBottom(normalizedGatewayId, false);
        }
      }, 3400);
      timers.push(expiryTimerId);

      turnFocusRetryTimersByGatewayIdRef.current[normalizedGatewayId] = timers;
    },
    [clearPendingTurnFocus, clearTurnFocusRetries, scrollHistoryToBottom, scrollHistoryToTurn],
  );

  const scheduleHistoryBottomSync = useCallback(
    (gatewayId) => {
      if (!gatewayId) return;
      const pendingTurnFocus = pendingTurnFocusByGatewayIdRef.current[gatewayId];
      if (pendingTurnFocus) return;
      const existing = historyScrollRetryTimersByGatewayIdRef.current[gatewayId];
      if (Array.isArray(existing)) {
        existing.forEach((timerId) => clearTimeout(timerId));
      }

      const timers = [];
      [0, 120, 320, 700, 1200, 2000].forEach((delay) => {
        const timerId = setTimeout(() => {
          scrollHistoryToBottom(gatewayId, false);
        }, delay);
        timers.push(timerId);
      });
      historyScrollRetryTimersByGatewayIdRef.current[gatewayId] = timers;
    },
    [scrollHistoryToBottom],
  );

  const clearGatewayHistoryRuntime = useCallback(
    (gatewayId) => {
      const pendingScroll = historyScrollRafByGatewayIdRef.current[gatewayId];
      if (pendingScroll?.first) {
        cancelAnimationFrame(pendingScroll.first);
      }
      if (pendingScroll?.second) {
        cancelAnimationFrame(pendingScroll.second);
      }
      delete historyScrollRafByGatewayIdRef.current[gatewayId];

      const pendingRetryTimers = historyScrollRetryTimersByGatewayIdRef.current[gatewayId];
      if (Array.isArray(pendingRetryTimers)) {
        pendingRetryTimers.forEach((timerId) => clearTimeout(timerId));
        delete historyScrollRetryTimersByGatewayIdRef.current[gatewayId];
      }
      const pendingInteraction = historyScrollInteractionByGatewayIdRef.current[gatewayId];
      if (pendingInteraction?.cancel) {
        pendingInteraction.cancel();
        delete historyScrollInteractionByGatewayIdRef.current[gatewayId];
      }

      clearPendingTurnFocus(gatewayId);

      delete historyContentHeightByGatewayIdRef.current[gatewayId];
      delete historyViewportHeightByGatewayIdRef.current[gatewayId];
      historyScrollRefs.current.delete(gatewayId);
      delete composerHeightByGatewayIdRef.current[gatewayId];
      delete hintHeightByGatewayIdRef.current[gatewayId];
    },
    [clearPendingTurnFocus],
  );

  useEffect(
    () => () => {
      Object.values(historyScrollRafByGatewayIdRef.current).forEach((pending) => {
        if (pending?.first) {
          cancelAnimationFrame(pending.first);
        }
        if (pending?.second) {
          cancelAnimationFrame(pending.second);
        }
      });
      historyScrollRafByGatewayIdRef.current = {};
      Object.values(historyScrollInteractionByGatewayIdRef.current).forEach((task) => {
        if (task?.cancel) {
          task.cancel();
        }
      });
      historyScrollInteractionByGatewayIdRef.current = {};
      Object.values(historyScrollRetryTimersByGatewayIdRef.current).forEach((timerIds) => {
        if (Array.isArray(timerIds)) {
          timerIds.forEach((timerId) => clearTimeout(timerId));
        }
      });
      historyScrollRetryTimersByGatewayIdRef.current = {};
      Object.values(turnFocusRetryTimersByGatewayIdRef.current).forEach((timerIds) => {
        if (Array.isArray(timerIds)) {
          timerIds.forEach((timerId) => clearTimeout(timerId));
        }
      });
      turnFocusRetryTimersByGatewayIdRef.current = {};
      pendingTurnFocusByGatewayIdRef.current = {};
      historyContentHeightByGatewayIdRef.current = {};
      historyViewportHeightByGatewayIdRef.current = {};
    },
    [],
  );

  return {
    clearGatewayHistoryRuntime,
    composerHeightByGatewayIdRef,
    hintHeightByGatewayIdRef,
    historyBottomInsetByGatewayId,
    historyContentHeightByGatewayIdRef,
    historyScrollRefs,
    historyViewportHeightByGatewayIdRef,
    pendingTurnFocusByGatewayIdRef,
    recomputeHistoryBottomInsetForGateway,
    scheduleHistoryBottomSync,
    scheduleHistoryTurnFocus,
  };
}
