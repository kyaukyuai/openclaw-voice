import { useCallback } from 'react';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import { supportsSpeechRecognitionOnCurrentPlatform } from '../utils';
import { useRuntimePersistenceEffects, useRuntimeUiEffects } from './useAppRuntimeEffects';
import { useAppLifecycleRuntime } from './useAppLifecycleRuntime';

type UseAppRuntimeSideEffectsInput = {
  uiEffectsInput: Parameters<typeof useRuntimeUiEffects>[0];
  persistenceEffectsInput: Parameters<typeof useRuntimePersistenceEffects>[0];
  lifecycleInput: Omit<
    Parameters<typeof useAppLifecycleRuntime>[0],
    'abortSpeechRecognitionIfSupported'
  >;
};

export function useAppRuntimeSideEffects(input: UseAppRuntimeSideEffectsInput) {
  useRuntimeUiEffects(input.uiEffectsInput);
  useRuntimePersistenceEffects(input.persistenceEffectsInput);

  const abortSpeechRecognitionIfSupported = useCallback(() => {
    if (!supportsSpeechRecognitionOnCurrentPlatform()) return;
    ExpoSpeechRecognitionModule.abort();
  }, []);

  useAppLifecycleRuntime({
    ...input.lifecycleInput,
    abortSpeechRecognitionIfSupported,
  });
}
