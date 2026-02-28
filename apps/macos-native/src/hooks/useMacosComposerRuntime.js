import { useCallback } from 'react';
import { insertQuickTextAtSelection } from '../../../src/shared';
import {
  createGatewayRuntime,
  estimateComposerHeightFromText,
  normalizeComposerSelection,
  normalizeSessionKey,
} from '../logic/app-logic';

export default function useMacosComposerRuntime({
  activeGatewayId,
  gatewayProfiles,
  gatewayRuntimeById,
  sessionKey,
  composerFocusTimerRef,
  composerInputRefs,
  forcedSelectionByGatewayIdRef,
  isImeComposingByGatewayIdRef,
  setFocusedGatewayId,
  setForcedSelectionByGatewayId,
  setQuickMenuOpenByGatewayId,
  updateGatewayRuntime,
}) {
  const currentSessionKeyForGateway = useCallback(
    (gatewayId) => {
      if (gatewayId === activeGatewayId) {
        return normalizeSessionKey(sessionKey);
      }
      const profile = gatewayProfiles.find((entry) => entry.id === gatewayId);
      return normalizeSessionKey(profile?.sessionKey);
    },
    [activeGatewayId, gatewayProfiles, sessionKey],
  );

  const setQuickMenuOpenForGateway = useCallback((gatewayId, isOpen) => {
    if (!gatewayId) return;
    setQuickMenuOpenByGatewayId((previous) => {
      if (!isOpen) {
        if (!previous[gatewayId]) return previous;
        const next = { ...previous };
        delete next[gatewayId];
        return next;
      }
      if (previous[gatewayId]) return previous;
      return { ...previous, [gatewayId]: true };
    });
  }, [setQuickMenuOpenByGatewayId]);

  const closeAllQuickMenus = useCallback(() => {
    setQuickMenuOpenByGatewayId((previous) =>
      Object.keys(previous).length === 0 ? previous : {},
    );
  }, [setQuickMenuOpenByGatewayId]);

  const setImeComposingForGateway = useCallback((gatewayId, isComposing) => {
    if (!gatewayId) return;
    if (isComposing) {
      isImeComposingByGatewayIdRef.current[gatewayId] = true;
      return;
    }
    delete isImeComposingByGatewayIdRef.current[gatewayId];
  }, [isImeComposingByGatewayIdRef]);

  const setForcedSelectionForGateway = useCallback((gatewayId, selection) => {
    if (!gatewayId) return;

    if (!selection) {
      delete forcedSelectionByGatewayIdRef.current[gatewayId];
      setForcedSelectionByGatewayId((previous) => {
        if (!(gatewayId in previous)) return previous;
        const next = { ...previous };
        delete next[gatewayId];
        return next;
      });
      return;
    }

    const normalized = {
      start: Number.isFinite(selection.start) ? selection.start : 0,
      end: Number.isFinite(selection.end) ? selection.end : Number.isFinite(selection.start) ? selection.start : 0,
    };

    forcedSelectionByGatewayIdRef.current[gatewayId] = normalized;
    setForcedSelectionByGatewayId((previous) => {
      const current = previous[gatewayId];
      if (current && current.start === normalized.start && current.end === normalized.end) {
        return previous;
      }
      return { ...previous, [gatewayId]: normalized };
    });
  }, [forcedSelectionByGatewayIdRef, setForcedSelectionByGatewayId]);

  const focusComposerForGateway = useCallback((gatewayId) => {
    if (!gatewayId) return;
    if (composerFocusTimerRef.current) {
      clearTimeout(composerFocusTimerRef.current);
    }
    composerFocusTimerRef.current = setTimeout(() => {
      composerFocusTimerRef.current = null;
      const input = composerInputRefs.current.get(gatewayId);
      input?.focus?.();
      setFocusedGatewayId(gatewayId);
    }, 0);
  }, [composerFocusTimerRef, composerInputRefs, setFocusedGatewayId]);

  const insertQuickText = useCallback(
    (gatewayId, snippet) => {
      if (!gatewayId) return;
      const runtime = gatewayRuntimeById[gatewayId] ?? createGatewayRuntime();
      const baseText = String(runtime.composerText ?? '');
      const baseSelection = normalizeComposerSelection(runtime.composerSelection, baseText);
      const result = insertQuickTextAtSelection({
        sourceText: baseText,
        insertText: snippet,
        selectionStart: baseSelection.start,
        selectionEnd: baseSelection.end,
      });
      const activeSessionKeyForGateway = currentSessionKeyForGateway(gatewayId);
      updateGatewayRuntime(gatewayId, (current) => ({
        ...current,
        composerText: result.nextText,
        composerSelection: result.selection,
        composerHeight: estimateComposerHeightFromText(result.nextText),
        composerBySession: {
          ...(current.composerBySession ?? {}),
          [activeSessionKeyForGateway]: {
            text: result.nextText,
            selection: result.selection,
          },
        },
      }));
      setForcedSelectionForGateway(gatewayId, result.selection);
      setImeComposingForGateway(gatewayId, false);
    },
    [
      currentSessionKeyForGateway,
      gatewayRuntimeById,
      setForcedSelectionForGateway,
      setImeComposingForGateway,
      updateGatewayRuntime,
    ],
  );

  const setComposerTextForGateway = useCallback(
    (gatewayId, text) => {
      const activeSessionKeyForGateway = currentSessionKeyForGateway(gatewayId);
      updateGatewayRuntime(gatewayId, (current) => ({
        ...current,
        composerText: text,
        composerHeight: estimateComposerHeightFromText(text),
        composerBySession: {
          ...(current.composerBySession ?? {}),
          [activeSessionKeyForGateway]: {
            text,
            selection: normalizeComposerSelection(current.composerSelection, text),
          },
        },
      }));
    },
    [currentSessionKeyForGateway, updateGatewayRuntime],
  );

  const setComposerSelectionForGateway = useCallback(
    (gatewayId, selection) => {
      const activeSessionKeyForGateway = currentSessionKeyForGateway(gatewayId);
      updateGatewayRuntime(gatewayId, (current) => ({
        ...current,
        composerSelection: selection,
        composerBySession: {
          ...(current.composerBySession ?? {}),
          [activeSessionKeyForGateway]: {
            text: current.composerText,
            selection,
          },
        },
      }));
    },
    [currentSessionKeyForGateway, updateGatewayRuntime],
  );

  const setComposerFocusedForGateway = useCallback(
    (gatewayId, focused) => {
      updateGatewayRuntime(gatewayId, (current) => ({
        ...current,
        isComposerFocused: focused,
      }));
      if (focused) {
        setFocusedGatewayId(gatewayId);
      }
    },
    [setFocusedGatewayId, updateGatewayRuntime],
  );

  return {
    closeAllQuickMenus,
    currentSessionKeyForGateway,
    focusComposerForGateway,
    insertQuickText,
    setComposerFocusedForGateway,
    setComposerSelectionForGateway,
    setComposerTextForGateway,
    setForcedSelectionForGateway,
    setImeComposingForGateway,
    setQuickMenuOpenForGateway,
  };
}
