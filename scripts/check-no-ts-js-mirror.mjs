#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const srcDir = path.join(rootDir, 'src');

/**
 * Allowlist for intentional mirrors (path relative to src without extension).
 * Keep this empty by default and add explicit entries only when absolutely required.
 */
const ALLOWLIST = new Set([]);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const nextPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(nextPath, out);
      continue;
    }
    if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.js'))) {
      out.push(nextPath);
    }
  }
  return out;
}

if (!fs.existsSync(srcDir)) {
  console.error('[check:no-ts-js-mirror] src directory not found');
  process.exit(1);
}

const files = walk(srcDir);
const stems = new Map();

for (const file of files) {
  const ext = path.extname(file);
  const relativeWithExt = path.relative(srcDir, file).split(path.sep).join('/');
  const relativeStem = relativeWithExt.slice(0, -ext.length);
  if (!stems.has(relativeStem)) {
    stems.set(relativeStem, new Set());
  }
  stems.get(relativeStem).add(ext);
}

const mirrored = [];
for (const [stem, exts] of stems.entries()) {
  if (exts.has('.ts') && exts.has('.js') && !ALLOWLIST.has(stem)) {
    mirrored.push(stem);
  }
}

if (mirrored.length > 0) {
  console.error('[check:no-ts-js-mirror] Found disallowed TS/JS mirrors:');
  for (const stem of mirrored.sort()) {
    console.error(`- src/${stem}.ts + src/${stem}.js`);
  }
  process.exit(1);
}

console.log(`[check:no-ts-js-mirror] OK (${ALLOWLIST.size} allowlisted)`);
