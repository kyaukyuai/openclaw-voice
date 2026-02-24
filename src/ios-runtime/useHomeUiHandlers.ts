import { useHomeUiBannerHandlers } from './home-ui-banner-handlers';
import { useHomeUiComposerHandlers } from './home-ui-composer-handlers';
import { useHomeUiHistoryHandlers } from './home-ui-history-handlers';
import { useHomeUiPanelHandlers } from './home-ui-panel-handlers';
import { useHomeUiSpeechHandlers } from './home-ui-speech-handlers';
import type { UseHomeUiHandlersInput } from './home-ui-handlers.types';

export type { UseHomeUiHandlersInput } from './home-ui-handlers.types';

export function useHomeUiHandlers(input: UseHomeUiHandlersInput) {
  const bannerHandlers = useHomeUiBannerHandlers(input);
  const panelHandlers = useHomeUiPanelHandlers(input);
  const composerHandlers = useHomeUiComposerHandlers(input);
  const historyHandlers = useHomeUiHistoryHandlers(input);
  const speechHandlers = useHomeUiSpeechHandlers(input);

  return {
    ...bannerHandlers,
    ...panelHandlers,
    ...composerHandlers,
    ...historyHandlers,
    ...speechHandlers,
  };
}
