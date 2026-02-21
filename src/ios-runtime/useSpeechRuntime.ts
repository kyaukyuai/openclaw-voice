import {
  useCallback,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import type { SpeechLang } from '../types';
import {
  errorMessage,
  isMacDesktopRuntime,
  isSpeechAbortLikeError,
  normalizeSpeechErrorCode,
  supportsSpeechRecognitionOnCurrentPlatform,
  triggerHaptic,
} from '../utils';

type UseSpeechRuntimeInput = {
  speechLang: SpeechLang;
  isRecognizing: boolean;
  expectedSpeechStopRef: MutableRefObject<boolean>;
  isUnmountingRef: MutableRefObject<boolean>;
  setIsRecognizing: Dispatch<SetStateAction<boolean>>;
  setSpeechError: Dispatch<SetStateAction<string | null>>;
  setTranscript: Dispatch<SetStateAction<string>>;
  setInterimTranscript: Dispatch<SetStateAction<string>>;
};

export function useSpeechRuntime(input: UseSpeechRuntimeInput) {
  const {
    speechLang,
    isRecognizing,
    expectedSpeechStopRef,
    isUnmountingRef,
    setIsRecognizing,
    setSpeechError,
    setTranscript,
    setInterimTranscript,
  } = input;

  useSpeechRecognitionEvent('start', () => {
    expectedSpeechStopRef.current = false;
    setIsRecognizing(true);
    setSpeechError(null);
    void triggerHaptic('record-start');
  });

  useSpeechRecognitionEvent('end', () => {
    expectedSpeechStopRef.current = false;
    setIsRecognizing(false);
    void triggerHaptic('record-stop');
  });

  useSpeechRecognitionEvent('result', (event) => {
    const text = event.results[0]?.transcript?.trim() ?? '';
    if (!text) return;

    if (event.isFinal) {
      setTranscript((prev) => (prev ? `${prev}\n${text}` : text));
      setInterimTranscript('');
      return;
    }

    setInterimTranscript(text);
  });

  useSpeechRecognitionEvent('error', (event) => {
    const code = normalizeSpeechErrorCode(event.error);
    const isAbortedLike = isSpeechAbortLikeError(code);
    const shouldIgnore =
      isUnmountingRef.current ||
      isAbortedLike ||
      (expectedSpeechStopRef.current && code.length > 0);

    expectedSpeechStopRef.current = false;
    setIsRecognizing(false);
    if (shouldIgnore) {
      setSpeechError(null);
      return;
    }
    void triggerHaptic('send-error');
    setSpeechError(`Speech recognition error: ${errorMessage(event.error)}`);
  });

  const startRecognition = useCallback(async () => {
    if (!supportsSpeechRecognitionOnCurrentPlatform()) {
      setSpeechError(
        isMacDesktopRuntime()
          ? 'macOSでは音声入力未対応です。'
          : 'Webでは音声入力未対応です。',
      );
      return;
    }
    if (isRecognizing) return;

    expectedSpeechStopRef.current = false;
    setSpeechError(null);
    setTranscript('');
    setInterimTranscript('');

    const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permission.granted) {
      setSpeechError('Microphone or speech recognition permission is not granted.');
      return;
    }

    if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
      setSpeechError('Speech recognition is not available on this device.');
      return;
    }

    ExpoSpeechRecognitionModule.start({
      lang: speechLang,
      interimResults: true,
      maxAlternatives: 1,
      continuous: false,
    });
  }, [
    expectedSpeechStopRef,
    isRecognizing,
    setInterimTranscript,
    setSpeechError,
    setTranscript,
    speechLang,
  ]);

  const stopRecognition = useCallback(() => {
    if (!supportsSpeechRecognitionOnCurrentPlatform()) return;
    expectedSpeechStopRef.current = true;
    ExpoSpeechRecognitionModule.stop();
  }, [expectedSpeechStopRef]);

  return {
    startRecognition,
    stopRecognition,
  };
}
