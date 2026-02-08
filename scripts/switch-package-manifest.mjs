#!/usr/bin/env node

import { promises as fs } from 'node:fs';
import path from 'node:path';

const mode = process.argv[2];
const cwd = process.cwd();
const pkgPath = path.join(cwd, 'package.json');
const backupPath = path.join(cwd, '.package.json.app.backup');

const publishMain = './dist/package.js';
const publishTypes = './dist/package.d.ts';

async function fileExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function prepare() {
  if (await fileExists(backupPath)) {
    throw new Error(
      'Backup file already exists. Run "npm run restore:publish-manifest" first.',
    );
  }

  const raw = await fs.readFile(pkgPath, 'utf8');
  const pkg = JSON.parse(raw);

  await fs.writeFile(backupPath, raw, 'utf8');

  pkg.main = publishMain;
  pkg.types = publishTypes;
  pkg.exports = {
    '.': {
      types: publishTypes,
      default: publishMain,
    },
  };

  await fs.writeFile(`${pkgPath}.tmp`, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
  await fs.rename(`${pkgPath}.tmp`, pkgPath);
  console.log('[manifest] Prepared package.json for npm publish.');
}

async function restore() {
  if (!(await fileExists(backupPath))) {
    console.log('[manifest] No backup found. Skipped restore.');
    return;
  }

  const raw = await fs.readFile(backupPath, 'utf8');
  await fs.writeFile(`${pkgPath}.tmp`, raw, 'utf8');
  await fs.rename(`${pkgPath}.tmp`, pkgPath);
  await fs.unlink(backupPath);
  console.log('[manifest] Restored app package.json.');
}

async function main() {
  if (mode === 'prepare') {
    await prepare();
    return;
  }

  if (mode === 'restore') {
    await restore();
    return;
  }

  throw new Error('Usage: node scripts/switch-package-manifest.mjs <prepare|restore>');
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[manifest] ${message}`);
  process.exit(1);
});
