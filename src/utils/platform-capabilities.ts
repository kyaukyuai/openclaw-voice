/**
 * Platform capability guards for runtime feature toggles.
 */

import { Platform } from 'react-native';

export function isWebPlatform(): boolean {
  return Platform.OS === 'web';
}

export function isMacDesktopRuntime(): boolean {
  if (Platform.OS === 'macos') return true;
  if (Platform.OS !== 'ios') return false;

  const constants = Platform.constants as { interfaceIdiom?: string } | undefined;
  return constants?.interfaceIdiom === 'mac';
}

export function supportsSpeechRecognitionOnCurrentPlatform(): boolean {
  if (isWebPlatform()) return false;
  if (isMacDesktopRuntime()) return false;
  return Platform.OS === 'ios' || Platform.OS === 'android';
}
