import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const rootDir = process.cwd();
const packageJsonPath = path.join(rootDir, 'package.json');
const backupPath = path.join(rootDir, '.package.json.app.backup');
const switchScriptPath = path.join(rootDir, 'scripts', 'switch-package-manifest.mjs');

function runSwitch(mode) {
  const result = spawnSync(process.execPath, [switchScriptPath, mode], {
    cwd: rootDir,
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    const stderr = result.stderr?.trim() ?? '';
    const stdout = result.stdout?.trim() ?? '';
    throw new Error(
      `switch-package-manifest failed (${mode})\nstdout:\n${stdout}\nstderr:\n${stderr}`,
    );
  }
}

test('switch-package-manifest prepare/restore roundtrip keeps package.json intact', () => {
  // Ensure previous interrupted runs are cleaned up.
  runSwitch('restore');
  const baseline = fs.readFileSync(packageJsonPath, 'utf8');

  try {
    runSwitch('prepare');

    const prepared = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    assert.equal(prepared.main, './dist/package.js');
    assert.equal(prepared.types, './dist/package.d.ts');
    assert.equal(fs.existsSync(backupPath), true);
  } finally {
    runSwitch('restore');
  }

  const restored = fs.readFileSync(packageJsonPath, 'utf8');
  assert.equal(restored, baseline);
  assert.equal(fs.existsSync(backupPath), false);
});
