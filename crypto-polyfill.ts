import * as ExpoCrypto from 'expo-crypto';
import { decode as decodeBase64, encode as encodeBase64 } from 'base-64';

if (typeof globalThis.crypto === 'undefined') {
  (globalThis as unknown as { crypto: Partial<Crypto> }).crypto = {};
}

if (typeof globalThis.crypto.getRandomValues === 'undefined') {
  globalThis.crypto.getRandomValues = <T extends ArrayBufferView | null>(
    array: T,
  ): T => {
    if (array === null) return array;
    const bytes = ExpoCrypto.getRandomBytes(array.byteLength);
    const view = new Uint8Array(
      array.buffer,
      array.byteOffset,
      array.byteLength,
    );
    view.set(bytes);
    return array;
  };
}

if (typeof globalThis.btoa === 'undefined') {
  globalThis.btoa = encodeBase64;
}

if (typeof globalThis.atob === 'undefined') {
  globalThis.atob = decodeBase64;
}
