import { useCallback, type Dispatch, type SetStateAction } from 'react';
import { isIncompleteAssistantContent } from '../ui/runtime-logic';
import type { ChatTurn } from '../types';
import { buildTurnsFromHistory, extractFinalChatEventText } from './app-runtime-pure';
import { useGatewayConnectionFlow } from './useGatewayConnectionFlow';
import { useGatewayEventBridge } from './useGatewayEventBridge';
import { useOutboxRuntime } from './useOutboxRuntime';
import { useSessionActionsRuntime } from './useSessionActionsRuntime';
import { useSessionHistoryRuntime } from './useSessionHistoryRuntime';
import { useSessionRuntime } from './useSessionRuntime';
import { useSpeechRuntime } from './useSpeechRuntime';

type UseAppRuntimeOrchestratorInput = {
  setChatTurns: Dispatch<SetStateAction<ChatTurn[]>>;
  sessionHistoryInput: Omit<
    Parameters<typeof useSessionHistoryRuntime>[0],
    'buildTurnsFromHistory'
  >;
  sessionActionsInput: Omit<
    Parameters<typeof useSessionActionsRuntime>[0],
    'refreshSessions' | 'loadSessionHistory' | 'switchSession' | 'createAndSwitchSession'
  >;
  sessionRuntimeInput: Omit<
    Parameters<typeof useSessionRuntime>[0],
    'loadSessionHistory' | 'refreshSessions'
  >;
  gatewayEventBridgeInput: Omit<
    Parameters<typeof useGatewayEventBridge>[0],
    | 'isIncompleteAssistantContent'
    | 'extractFinalChatEventText'
    | 'updateChatTurn'
    | 'scheduleFinalResponseRecovery'
    | 'scheduleMissingResponseRecovery'
    | 'scheduleSessionHistorySync'
    | 'refreshSessions'
  >;
  gatewayConnectionFlowInput: Omit<
    Parameters<typeof useGatewayConnectionFlow>[0],
    'handleChatEvent'
  >;
  outboxRuntimeInput: Omit<
    Parameters<typeof useOutboxRuntime>[0],
    'refreshSessions' | 'updateChatTurn'
  >;
  speechRuntimeInput: Parameters<typeof useSpeechRuntime>[0];
};

export function useAppRuntimeOrchestrator(input: UseAppRuntimeOrchestratorInput) {
  const updateChatTurn = useCallback(
    (turnId: string, updater: (turn: ChatTurn) => ChatTurn) => {
      input.setChatTurns((previous) =>
        previous.map((turn) => (turn.id === turnId ? updater(turn) : turn)),
      );
    },
    [input],
  );

  const {
    refreshSessions,
    loadSessionHistory,
    switchSession,
    createAndSwitchSession,
  } = useSessionHistoryRuntime({
    ...input.sessionHistoryInput,
    buildTurnsFromHistory,
  });

  const {
    scheduleSessionHistorySync,
    scheduleMissingResponseRecovery,
    scheduleFinalResponseRecovery,
  } = useSessionRuntime({
    ...input.sessionRuntimeInput,
    loadSessionHistory,
    refreshSessions,
  });

  const { handleChatEvent } = useGatewayEventBridge({
    ...input.gatewayEventBridgeInput,
    updateChatTurn,
    scheduleFinalResponseRecovery,
    scheduleMissingResponseRecovery,
    scheduleSessionHistorySync,
    refreshSessions,
    isIncompleteAssistantContent,
    extractFinalChatEventText,
  });

  const { disconnectGateway, connectGateway } = useGatewayConnectionFlow({
    ...input.gatewayConnectionFlowInput,
    handleChatEvent,
  });

  const { sendToGateway } = useOutboxRuntime({
    ...input.outboxRuntimeInput,
    refreshSessions,
    updateChatTurn,
  });

  const {
    isSessionPinned,
    getSessionTitle,
    startSessionRename,
    submitSessionRename,
    toggleSessionPinned,
  } = useSessionActionsRuntime({
    ...input.sessionActionsInput,
    refreshSessions,
    loadSessionHistory,
    switchSession,
    createAndSwitchSession,
  });

  const { startRecognition, stopRecognition } = useSpeechRuntime(
    input.speechRuntimeInput,
  );

  return {
    refreshSessions,
    loadSessionHistory,
    switchSession,
    createAndSwitchSession,
    isSessionPinned,
    getSessionTitle,
    startSessionRename,
    submitSessionRename,
    toggleSessionPinned,
    connectGateway,
    disconnectGateway,
    sendToGateway,
    startRecognition,
    stopRecognition,
    scheduleSessionHistorySync,
    scheduleMissingResponseRecovery,
    scheduleFinalResponseRecovery,
  };
}
