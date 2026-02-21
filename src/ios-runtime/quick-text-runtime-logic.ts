import type { QuickTextButtonSide } from '../types';

export function normalizeQuickText(rawText: string): string {
  return rawText.trim();
}

export function shouldInsertQuickText(nextText: string, isRecognizing: boolean): boolean {
  return nextText.length > 0 && !isRecognizing;
}

export function appendQuickText(previous: string, nextText: string): string {
  const current = previous.trimEnd();
  if (!current) return nextText;
  return `${current}\n${nextText}`;
}

export function shouldConsumeQuickTextPress(input: {
  activeLongPressSide: QuickTextButtonSide | null;
  pressedSide: QuickTextButtonSide;
}): boolean {
  return input.activeLongPressSide === input.pressedSide;
}
