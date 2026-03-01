import assert from 'node:assert/strict';
import test from 'node:test';

import __srcModule0 from '../src/ui/ios/history-markdown.ts';

const {
  MAX_MARKDOWN_RENDER_CHARS,
  clampMarkdownSource,
} = __srcModule0;

test('clampMarkdownSource returns original text under limit', () => {
  const input = 'short markdown text';
  const output = clampMarkdownSource(input);
  assert.equal(output, input);
});

test('clampMarkdownSource truncates oversized markdown and appends marker', () => {
  const input = 'a'.repeat(MAX_MARKDOWN_RENDER_CHARS + 64);
  const output = clampMarkdownSource(input);

  assert.equal(output.endsWith('…(message truncated for safe rendering)'), true);
  assert.equal(output.includes('\n\n…(message truncated for safe rendering)'), true);
  assert.equal(output.length < input.length, true);
});
