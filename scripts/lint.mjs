#!/usr/bin/env node

import { promises as fs } from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const scanTargets = [
  '.github/workflows',
  'App.tsx',
  'README.md',
  'app.json',
  'index.ts',
  'package.json',
  'scripts',
  'src',
  'tests',
];

const allowedExtensions = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.mjs',
  '.json',
  '.md',
  '.yml',
  '.yaml',
]);

const skipDirs = new Set(['.git', '.expo', '.npm-cache', 'android', 'dist', 'ios', 'node_modules']);
const codeExtensions = new Set(['.ts', '.tsx', '.js', '.mjs']);

async function exists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function collectFiles(targetPath, files) {
  const fullPath = path.join(rootDir, targetPath);
  if (!(await exists(fullPath))) {
    return;
  }

  const stat = await fs.stat(fullPath);
  if (stat.isFile()) {
    if (allowedExtensions.has(path.extname(fullPath))) {
      files.push(fullPath);
    }
    return;
  }

  const entries = await fs.readdir(fullPath, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(targetPath, entry.name);
    if (entry.isDirectory()) {
      if (!skipDirs.has(entry.name)) {
        await collectFiles(entryPath, files);
      }
      continue;
    }

    const fullEntryPath = path.join(rootDir, entryPath);
    if (allowedExtensions.has(path.extname(fullEntryPath))) {
      files.push(fullEntryPath);
    }
  }
}

function isAppSource(relativePath) {
  return relativePath === 'App.tsx' || relativePath === 'index.ts' || relativePath.startsWith('src/');
}

async function lintFile(filePath, issues) {
  const relativePath = path.relative(rootDir, filePath);
  const content = await fs.readFile(filePath, 'utf8');
  const lines = content.split('\n');

  if (content.includes('\r')) {
    issues.push(`${relativePath}: use LF line endings`);
  }

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (/[ \t]+$/.test(line)) {
      issues.push(`${relativePath}:${i + 1} trailing whitespace`);
    }
  }

  if (
    codeExtensions.has(path.extname(filePath)) &&
    isAppSource(relativePath) &&
    /console\.log\(/.test(content)
  ) {
    issues.push(`${relativePath}: avoid console.log in app source`);
  }
}

async function main() {
  const files = [];
  for (const target of scanTargets) {
    await collectFiles(target, files);
  }

  const uniqueFiles = [...new Set(files)].sort((a, b) => a.localeCompare(b));
  const issues = [];
  for (const filePath of uniqueFiles) {
    await lintFile(filePath, issues);
  }

  if (issues.length > 0) {
    console.error('[lint] Found issues:');
    for (const issue of issues) {
      console.error(`- ${issue}`);
    }
    process.exit(1);
  }

  console.log(`[lint] OK (${uniqueFiles.length} files checked)`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[lint] ${message}`);
  process.exit(1);
});
