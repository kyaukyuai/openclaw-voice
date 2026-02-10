#!/usr/bin/env node

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const iosDir = path.join(rootDir, 'ios');
const workspacePath = path.join(iosDir, 'OpenClawVoice.xcworkspace');
const scheme = 'OpenClawVoice';
const results = [];

function add(level, title, detail) {
  results.push({ level, title, detail });
}

function run(command) {
  try {
    return {
      ok: true,
      output: execSync(command, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim(),
    };
  } catch (error) {
    return {
      ok: false,
      output: String(error?.stderr || error?.message || '').trim(),
    };
  }
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

const nodeVersion = process.versions.node;
add('ok', 'Node.js', `v${nodeVersion}`);

const xcode = run('xcodebuild -version');
add(
  xcode.ok ? 'ok' : 'error',
  'Xcode',
  xcode.ok ? xcode.output.split('\n')[0] : 'xcodebuild not available',
);

add(
  fs.existsSync(workspacePath) ? 'ok' : 'error',
  'Workspace',
  fs.existsSync(workspacePath)
    ? workspacePath
    : 'ios/OpenClawVoice.xcworkspace not found (run npm run setup)',
);

if (fs.existsSync(workspacePath)) {
  const destinations = run(
    `xcodebuild -workspace ${shellQuote(workspacePath)} -scheme ${shellQuote(
      scheme,
    )} -showdestinations`,
  );

  if (!destinations.ok) {
    add('error', 'Destinations', 'Could not query Xcode destinations');
  } else {
    const destinationLine = destinations.output
      .split('\n')
      .find((line) => line.includes('variant:Designed for [iPad,iPhone]'));

    if (!destinationLine) {
      add(
        'error',
        'macOS runtime',
        'No "Designed for iPad/iPhone" macOS destination found',
      );
    } else {
      const match = destinationLine.match(/id:([^,}]+)/);
      const destinationId = match?.[1]?.trim() ?? 'unknown';
      add('ok', 'macOS runtime', `Destination available (id=${destinationId})`);
    }
  }
}

const signingIdentity = run('security find-identity -v -p codesigning');
if (!signingIdentity.ok) {
  add('warn', 'Code signing', 'Could not read local signing identities');
} else if (signingIdentity.output.includes('Apple Development')) {
  add('ok', 'Code signing', 'Apple Development identity found');
} else {
  add('warn', 'Code signing', 'Apple Development identity not found');
}

const maxTitle = Math.max(...results.map((item) => item.title.length), 12);
for (const result of results) {
  const level = result.level.toUpperCase().padEnd(5, ' ');
  const title = result.title.padEnd(maxTitle, ' ');
  console.log(`[${level}] ${title}  ${result.detail}`);
}

const hasError = results.some((item) => item.level === 'error');
console.log('');

if (hasError) {
  console.log('doctor:macos found blocking issues.');
  process.exitCode = 1;
} else {
  console.log('doctor:macos completed.');
  console.log('Run `npm run ios:mac` to build and launch on macOS.');
}
