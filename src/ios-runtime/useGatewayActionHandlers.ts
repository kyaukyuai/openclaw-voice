import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { triggerHaptic } from '../utils';
import {
  useHomeUiWiring,
  type UseHomeUiWiringInput,
} from './useHomeUiWiring';
import { useQuickTextRuntime } from './useQuickTextRuntime';

type UseGatewayActionHandlersInput = {
  homeUiInput: Omit<UseHomeUiWiringInput, 'clearTranscriptDraft'>;
  quickTextInput: Parameters<typeof useQuickTextRuntime>[0];
  transcriptRef: MutableRefObject<string>;
  interimTranscriptRef: MutableRefObject<string>;
  setTranscript: Dispatch<SetStateAction<string>>;
  setInterimTranscript: Dispatch<SetStateAction<string>>;
  setSpeechError: Dispatch<SetStateAction<string | null>>;
};

export function useGatewayActionHandlers(input: UseGatewayActionHandlersInput) {
  const clearTranscriptDraft = useCallback(() => {
    input.transcriptRef.current = '';
    input.interimTranscriptRef.current = '';
    input.setTranscript('');
    input.setInterimTranscript('');
    input.setSpeechError(null);
    void triggerHaptic('button-press');
  }, [input]);

  const homeUiHandlers = useHomeUiWiring({
    ...input.homeUiInput,
    clearTranscriptDraft,
  });
  const quickTextHandlers = useQuickTextRuntime(input.quickTextInput);

  return {
    ...homeUiHandlers,
    ...quickTextHandlers,
  };
}
