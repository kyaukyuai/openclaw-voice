import {
  useCallback,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import {
  Keyboard,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { buildHistoryRefreshNotice } from '../ui/runtime-logic';
import type {
  FocusField,
  HistoryRefreshNotice,
  MissingResponseRecoveryNotice,
} from '../types';
import {
  resolveDraftText,
  resolveHistoryScrollState,
  resolveTopBannerDismissTarget,
  shouldStartHoldToTalk,
} from './home-ui-handlers-logic';

type ScheduleMissingResponseRecoveryOptions = {
  attempt?: number;
  delayMs?: number;
};

export type UseHomeUiHandlersInput = {
  onButtonPressHaptic: () => void;

  canReconnectFromError: boolean;
  canRetryFromError: boolean;
  latestRetryText: string;
  connectGateway: () => Promise<unknown>;
  sendToGateway: (text: string) => Promise<void>;
  setFocusedField: Dispatch<SetStateAction<FocusField>>;

  activeMissingResponseNotice: MissingResponseRecoveryNotice | null;
  isMissingResponseRecoveryInFlight: boolean;
  isGatewayConnected: boolean;
  setGatewayError: Dispatch<SetStateAction<string | null>>;
  scheduleMissingResponseRecovery: (
    sessionKey: string,
    turnId: string,
    options?: ScheduleMissingResponseRecoveryOptions,
  ) => void;
  topBannerKind: 'gateway' | 'recovery' | 'history' | 'speech' | null;
  setMissingResponseNotice: Dispatch<
    SetStateAction<MissingResponseRecoveryNotice | null>
  >;
  setHistoryRefreshNotice: Dispatch<SetStateAction<HistoryRefreshNotice | null>>;
  setSpeechError: Dispatch<SetStateAction<string | null>>;

  setIsOnboardingWaitingForResponse: Dispatch<SetStateAction<boolean>>;
  setIsOnboardingCompleted: (next: boolean) => void;
  canRunOnboardingConnectTest: boolean;
  canRunOnboardingSampleSend: boolean;
  onboardingSampleMessage: string;

  forceMaskAuthToken: () => void;
  isSessionPanelOpen: boolean;
  refreshSessions: () => Promise<unknown>;
  setIsSettingsPanelOpen: Dispatch<SetStateAction<boolean>>;
  setIsSessionPanelOpen: Dispatch<SetStateAction<boolean>>;
  setIsSessionRenameOpen: Dispatch<SetStateAction<boolean>>;
  setSessionRenameTargetKey: Dispatch<SetStateAction<string | null>>;
  setSessionRenameDraft: Dispatch<SetStateAction<string>>;
  canToggleSettingsPanel: boolean;
  canDismissSettingsScreen: boolean;

  canClearFromKeyboardBar: boolean;
  clearTranscriptDraft: () => void;
  canSendFromKeyboardBar: boolean;
  transcript: string;
  interimTranscript: string;
  setTranscript: Dispatch<SetStateAction<string>>;
  setInterimTranscript: Dispatch<SetStateAction<string>>;

  isSessionHistoryLoading: boolean;
  clearHistoryNoticeTimer: () => void;
  activeSessionKeyRef: MutableRefObject<string>;
  loadSessionHistory: (
    sessionKey: string,
    options?: {
      silentError?: boolean;
    },
  ) => Promise<boolean>;
  setHistoryLastSyncedAt: Dispatch<SetStateAction<number | null>>;
  showHistoryRefreshNotice: (
    kind: HistoryRefreshNotice['kind'],
    message: string,
  ) => void;
  formatClockLabel: (timestamp: number) => string;

  scrollHistoryToBottom: (animated: boolean) => void;
  historyAutoScrollRef: MutableRefObject<boolean>;
  setShowScrollToBottomButton: Dispatch<SetStateAction<boolean>>;
  chatTurnsLength: number;
  historyBottomThresholdPx: number;

  speechRecognitionSupported: boolean;
  isRecognizing: boolean;
  isSending: boolean;
  holdActivatedRef: MutableRefObject<boolean>;
  holdStartTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  startRecognition: () => Promise<void>;
  stopRecognition: () => void;
  composerHeight: number;
  setComposerHeight: Dispatch<SetStateAction<number>>;
};

export function useHomeUiHandlers(input: UseHomeUiHandlersInput) {
  const handleReconnectFromError = useCallback(() => {
    if (!input.canReconnectFromError) return;
    Keyboard.dismiss();
    input.setFocusedField(null);
    void input.connectGateway();
  }, [input]);

  const handleRetryFromError = useCallback(() => {
    if (!input.canRetryFromError) return;
    Keyboard.dismiss();
    input.setFocusedField(null);
    void input.sendToGateway(input.latestRetryText);
  }, [input]);

  const handleRetryMissingResponse = useCallback(() => {
    const notice = input.activeMissingResponseNotice;
    if (!notice || input.isMissingResponseRecoveryInFlight) return;
    if (!input.isGatewayConnected) {
      input.setGatewayError('Reconnect to retry fetching final response.');
      return;
    }
    Keyboard.dismiss();
    input.setFocusedField(null);
    input.scheduleMissingResponseRecovery(notice.sessionKey, notice.turnId, {
      attempt: 1,
      delayMs: 0,
    });
  }, [input]);

  const handleDismissTopBanner = useCallback(() => {
    const dismissTarget = resolveTopBannerDismissTarget(input.topBannerKind);
    if (dismissTarget === 'gateway') {
      input.setGatewayError(null);
      return;
    }
    if (dismissTarget === 'recovery') {
      input.setMissingResponseNotice(null);
      return;
    }
    if (dismissTarget === 'history') {
      input.setHistoryRefreshNotice(null);
      return;
    }
    if (dismissTarget === 'speech') {
      input.setSpeechError(null);
    }
  }, [input]);

  const handleCompleteOnboarding = useCallback(() => {
    Keyboard.dismiss();
    input.setFocusedField(null);
    input.setIsOnboardingWaitingForResponse(false);
    input.setIsOnboardingCompleted(true);
  }, [input]);

  const handleOnboardingConnectTest = useCallback(() => {
    if (!input.canRunOnboardingConnectTest) return;
    Keyboard.dismiss();
    input.setFocusedField(null);
    void input.connectGateway();
  }, [input]);

  const handleOnboardingSendSample = useCallback(() => {
    if (!input.canRunOnboardingSampleSend) return;
    Keyboard.dismiss();
    input.setFocusedField(null);
    input.setIsOnboardingWaitingForResponse(true);
    void input.sendToGateway(input.onboardingSampleMessage);
  }, [input]);

  const handleToggleSessionPanel = useCallback(() => {
    if (!input.isGatewayConnected) return;
    Keyboard.dismiss();
    input.setFocusedField(null);
    input.setIsSettingsPanelOpen(false);
    input.forceMaskAuthToken();
    const next = !input.isSessionPanelOpen;
    input.setIsSessionPanelOpen(next);
    if (next) {
      void input.refreshSessions();
      return;
    }
    input.setIsSessionRenameOpen(false);
    input.setSessionRenameTargetKey(null);
    input.setSessionRenameDraft('');
  }, [input]);

  const handleToggleSettingsPanel = useCallback(() => {
    if (!input.canToggleSettingsPanel) return;
    Keyboard.dismiss();
    input.setFocusedField(null);
    input.setIsSessionPanelOpen(false);
    input.setIsSettingsPanelOpen((current) => {
      const next = !current;
      if (!next) {
        input.forceMaskAuthToken();
      }
      return next;
    });
  }, [input]);

  const handleCloseSettingsPanel = useCallback(() => {
    if (!input.canDismissSettingsScreen) return;
    input.forceMaskAuthToken();
    input.setIsSettingsPanelOpen(false);
    input.setFocusedField(null);
    Keyboard.dismiss();
  }, [input]);

  const handleCloseSessionPanel = useCallback(() => {
    input.setIsSessionPanelOpen(false);
    input.setIsSessionRenameOpen(false);
    input.setSessionRenameTargetKey(null);
    input.setSessionRenameDraft('');
    Keyboard.dismiss();
  }, [input]);

  const handleDoneKeyboardAction = useCallback(() => {
    Keyboard.dismiss();
    input.setFocusedField(null);
  }, [input]);

  const handleClearKeyboardAction = useCallback(() => {
    if (!input.canClearFromKeyboardBar) return;
    input.clearTranscriptDraft();
  }, [input]);

  const handleSendKeyboardAction = useCallback(() => {
    if (!input.canSendFromKeyboardBar) return;
    const text = resolveDraftText(input.transcript, input.interimTranscript);
    if (!text) return;
    Keyboard.dismiss();
    input.setFocusedField(null);
    void input.sendToGateway(text);
  }, [input]);

  const handleSendDraftAction = useCallback(() => {
    const text = resolveDraftText(input.transcript, input.interimTranscript);
    if (!text) return;
    Keyboard.dismiss();
    input.setFocusedField(null);
    void input.sendToGateway(text);
  }, [input]);

  const handleTranscriptChange = useCallback(
    (value: string) => {
      input.setTranscript(value);
      input.setInterimTranscript('');
    },
    [input],
  );

  const handleTranscriptFocus = useCallback(() => {
    input.setFocusedField('transcript');
  }, [input]);

  const handleTranscriptBlur = useCallback(() => {
    input.setFocusedField((current) => (current === 'transcript' ? null : current));
  }, [input]);

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

  const handleHoldToTalkPressIn = useCallback(() => {
    if (
      !shouldStartHoldToTalk({
        speechRecognitionSupported: input.speechRecognitionSupported,
        isRecognizing: input.isRecognizing,
        isSending: input.isSending,
      })
    ) {
      return;
    }
    input.onButtonPressHaptic();
    Keyboard.dismiss();
    input.setFocusedField(null);
    input.holdActivatedRef.current = false;
    if (input.holdStartTimerRef.current) {
      clearTimeout(input.holdStartTimerRef.current);
    }
    input.holdStartTimerRef.current = setTimeout(() => {
      input.holdStartTimerRef.current = null;
      input.holdActivatedRef.current = true;
      void input.startRecognition();
    }, 120);
  }, [input]);

  const handleHoldToTalkPressOut = useCallback(() => {
    if (input.holdStartTimerRef.current) {
      clearTimeout(input.holdStartTimerRef.current);
      input.holdStartTimerRef.current = null;
    }
    if (!input.holdActivatedRef.current) return;
    input.holdActivatedRef.current = false;
    if (!input.isRecognizing) return;
    input.stopRecognition();
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

  const handleBottomDockHeightChange = useCallback(
    (nextHeight: number) => {
      if (input.composerHeight !== nextHeight) {
        input.setComposerHeight(nextHeight);
      }
    },
    [input],
  );

  const handleBottomDockActionPressHaptic = useCallback(() => {
    input.onButtonPressHaptic();
  }, [input]);

  return {
    handleReconnectFromError,
    handleRetryFromError,
    handleRetryMissingResponse,
    handleDismissTopBanner,
    handleCompleteOnboarding,
    handleOnboardingConnectTest,
    handleOnboardingSendSample,
    handleToggleSessionPanel,
    handleToggleSettingsPanel,
    handleCloseSettingsPanel,
    handleCloseSessionPanel,
    handleDoneKeyboardAction,
    handleClearKeyboardAction,
    handleSendKeyboardAction,
    handleSendDraftAction,
    handleTranscriptChange,
    handleTranscriptFocus,
    handleTranscriptBlur,
    handleRefreshHistory,
    handleScrollHistoryToBottom,
    handleHoldToTalkPressIn,
    handleHoldToTalkPressOut,
    handleHistoryScroll,
    handleHistoryAutoScroll,
    handleHistoryLayoutAutoScroll,
    handleBottomDockHeightChange,
    handleBottomDockActionPressHaptic,
  };
}
