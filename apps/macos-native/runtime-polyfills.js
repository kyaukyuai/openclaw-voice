/* global globalThis */

import { decode as decodeBase64, encode as encodeBase64 } from 'base-64';
import 'react-native-get-random-values';

function ensureSecureRandomValues() {
  const hasCryptoObject =
    typeof globalThis.crypto !== 'undefined' && globalThis.crypto !== null;
  const hasGetRandomValues =
    hasCryptoObject && typeof globalThis.crypto.getRandomValues === 'function';

  if (hasGetRandomValues) {
    return;
  }

  throw new Error(
    'Secure RNG unavailable: crypto.getRandomValues is missing. ' +
      'Run `npm run macos:native:bootstrap` to ensure native modules are linked.',
  );
}

function installBase64Polyfills() {
  if (typeof globalThis.btoa === 'undefined') {
    globalThis.btoa = encodeBase64;
  }
  if (typeof globalThis.atob === 'undefined') {
    globalThis.atob = decodeBase64;
  }
}

ensureSecureRandomValues();
installBase64Polyfills();
