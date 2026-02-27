/**
 * Platform capability guards for runtime feature toggles.
 */

type PlatformLike = {
  OS: string;
  constants?: { interfaceIdiom?: string };
};

function resolvePlatform(): PlatformLike {
  try {
    const dynamicRequire = Function(
      'return typeof require === "function" ? require : null;',
    )() as ((id: string) => { Platform?: PlatformLike } | undefined) | null;
    const platform = dynamicRequire?.('react-native')?.Platform;
    if (platform && typeof platform.OS === 'string') {
      return platform;
    }
  } catch {
    // Keep non-react-native runtimes (tests/scripts) functional.
  }
  return { OS: 'web', constants: {} };
}

export function isWebPlatform(): boolean {
  const Platform = resolvePlatform();
  return Platform.OS === 'web';
}

export function isMacDesktopRuntime(): boolean {
  const Platform = resolvePlatform();
  if (Platform.OS === 'macos') return true;
  if (Platform.OS !== 'ios') return false;

  const constants = Platform.constants as { interfaceIdiom?: string } | undefined;
  return constants?.interfaceIdiom === 'mac';
}

export function supportsSpeechRecognitionOnCurrentPlatform(): boolean {
  const Platform = resolvePlatform();
  if (isWebPlatform()) return false;
  if (isMacDesktopRuntime()) return false;
  return Platform.OS === 'ios' || Platform.OS === 'android';
}
