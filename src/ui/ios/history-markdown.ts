export const MAX_MARKDOWN_RENDER_CHARS = 20_000;

export function clampMarkdownSource(value: string): string {
  if (value.length <= MAX_MARKDOWN_RENDER_CHARS) return value;
  return `${value.slice(0, MAX_MARKDOWN_RENDER_CHARS)}\n\n…(message truncated for safe rendering)`;
}
