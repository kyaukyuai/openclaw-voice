#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const rootDir = process.cwd();
const cacheDir = path.join(rootDir, '.npm-cache');
const backupPath = path.join(rootDir, '.package.json.app.backup');
const packageJsonPath = path.join(rootDir, 'package.json');
const restoreScriptPath = path.join(rootDir, 'scripts', 'switch-package-manifest.mjs');

function run(cmd, args, cwd, extraEnv = {}, timeoutMs = 0) {
  const result = spawnSync(cmd, args, {
    cwd,
    encoding: 'utf8',
    timeout: timeoutMs > 0 ? timeoutMs : undefined,
    env: {
      ...process.env,
      ...extraEnv,
    },
  });

  if (result.error) {
    throw new Error(`Command failed: ${cmd} ${args.join(' ')}\n${result.error.message}`);
  }

  if (result.status !== 0) {
    const stdout = result.stdout?.trim() ?? '';
    const stderr = result.stderr?.trim() ?? '';
    throw new Error(
      `Command failed: ${cmd} ${args.join(' ')}\nstdout:\n${stdout}\nstderr:\n${stderr}`,
    );
  }

  return result;
}

function findTarballName(output) {
  const tokens = output.split(/\s+/).filter(Boolean);
  const match = [...tokens].reverse().find((token) => token.endsWith('.tgz'));
  if (!match) {
    throw new Error('Failed to detect tarball filename from npm pack output.');
  }
  return match;
}

function verifyManifestRestored() {
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  if (pkg.main !== 'index.ts') {
    throw new Error('package.json main should be restored to index.ts after pack.');
  }
  if (fs.existsSync(backupPath)) {
    throw new Error('Temporary manifest backup should be cleaned up after pack.');
  }
}

function restoreIfNeeded() {
  if (!fs.existsSync(backupPath)) {
    return;
  }
  run(process.execPath, [restoreScriptPath, 'restore'], rootDir);
}

function removeIfExists(targetPath) {
  if (fs.existsSync(targetPath)) {
    fs.rmSync(targetPath, { force: true, recursive: true });
  }
}

function main() {
  let tempDir = '';
  let tarballPath = '';
  const skipInstall = /^(1|true|yes|on)$/i.test(
    (process.env.OPENCLAW_SMOKE_SKIP_INSTALL ?? '').trim(),
  );

  try {
    const pack = run('npm', ['pack'], rootDir, { NPM_CONFIG_CACHE: cacheDir }, 120000);
    const packOutput = `${pack.stdout ?? ''}\n${pack.stderr ?? ''}`;
    const tarballName = findTarballName(packOutput);
    tarballPath = path.join(rootDir, tarballName);

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openclaw-voice-smoke-'));
    fs.writeFileSync(
      path.join(tempDir, 'package.json'),
      `${JSON.stringify(
        {
          name: 'openclaw-voice-smoke',
          private: true,
          type: 'module',
        },
        null,
        2,
      )}\n`,
      'utf8',
    );

    if (!skipInstall) {
      run(
        'npm',
        ['install', '--no-audit', '--no-fund', '--ignore-scripts', tarballPath],
        tempDir,
        { NPM_CONFIG_CACHE: cacheDir },
        180000,
      );

      fs.writeFileSync(
        path.join(tempDir, 'verify.mjs'),
        [
          "import { GatewayClient } from 'openclaw-voice';",
          "if (typeof GatewayClient !== 'function') {",
          "  throw new Error('GatewayClient export is not available');",
          '}',
        ].join('\n'),
        'utf8',
      );

      run('node', ['verify.mjs'], tempDir, {}, 30000);
    } else {
      console.log('[smoke] Skipped install/import check (OPENCLAW_SMOKE_SKIP_INSTALL=1).');
    }

    verifyManifestRestored();
    console.log('[smoke] Tarball install and import check passed.');
  } finally {
    restoreIfNeeded();
    removeIfExists(tempDir);
    removeIfExists(tarballPath);
  }
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[smoke] ${message}`);
  process.exit(1);
}
