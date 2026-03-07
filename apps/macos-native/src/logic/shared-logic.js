import { DEFAULTS } from './app-constants';

export function normalizeText(value) {
  return String(value ?? '').trim();
}

export function normalizeSessionKey(value) {
  const normalized = normalizeText(value);
  return normalized || DEFAULTS.sessionKey;
}

export function isSameStringArray(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}
