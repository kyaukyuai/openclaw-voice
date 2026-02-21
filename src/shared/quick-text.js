function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/**
 * Insert quick text at the current selection.
 */
export function insertQuickTextAtSelection({
  sourceText,
  insertText,
  selectionStart,
  selectionEnd,
}) {
  const baseText = String(sourceText ?? '');
  const snippet = String(insertText ?? '');
  const start = clamp(selectionStart ?? baseText.length, 0, baseText.length);
  const end = clamp(selectionEnd ?? start, start, baseText.length);

  const prefix = baseText.slice(0, start);
  const suffix = baseText.slice(end);
  const nextText = `${prefix}${snippet}${suffix}`;
  const cursor = start + snippet.length;

  return {
    nextText,
    selection: {
      start: cursor,
      end: cursor,
    },
  };
}
