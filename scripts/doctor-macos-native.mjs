#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const rootDir = process.cwd();
const appDir = join(rootDir, 'apps', 'macos-native');
const macosDir = join(appDir, 'macos');

const checks = [];

function add(status, name, detail) {
  checks.push({ status, name, detail });
}

function commandOutput(command) {
  try {
    return execSync(command, {
      cwd: rootDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
    }).trim();
  } catch (error) {
    const stderr = error?.stderr ? String(error.stderr).trim() : '';
    const stdout = error?.stdout ? String(error.stdout).trim() : '';
    throw new Error(stderr || stdout || error?.message || `Command failed: ${command}`);
  }
}

function commandExists(command) {
  try {
    commandOutput(`command -v ${command}`);
    return true;
  } catch {
    return false;
  }
}

const platform = process.platform;
const arch = process.arch;
add(platform === 'darwin' ? 'ok' : 'error', 'Platform', `${platform}`);
add(arch === 'arm64' ? 'ok' : 'warn', 'CPU', `${arch}${arch !== 'arm64' ? ' (Apple Silicon recommended)' : ''}`);

add(existsSync(appDir) ? 'ok' : 'error', 'apps/macos-native', existsSync(appDir) ? 'Found' : 'Missing');
add(existsSync(macosDir) ? 'ok' : 'error', 'macOS project', existsSync(macosDir) ? 'Found' : 'Missing');

if (commandExists('xcodebuild')) {
  add('ok', 'xcodebuild', commandOutput('xcodebuild -version').split('\n')[0] ?? 'available');
} else {
  add('error', 'xcodebuild', 'not found');
}

if (commandExists('pod')) {
  add('ok', 'CocoaPods', commandOutput('pod --version'));
} else {
  add('error', 'CocoaPods', 'pod command not found');
}

const packageJsonPath = join(appDir, 'package.json');
if (existsSync(packageJsonPath)) {
  try {
    const pkg = JSON.parse(commandOutput(`cat "${packageJsonPath}"`));
    const rnMacVersion = pkg?.dependencies?.['react-native-macos'];
    add(rnMacVersion ? 'ok' : 'error', 'react-native-macos', rnMacVersion ?? 'missing');
  } catch (error) {
    add('error', 'package.json', error.message);
  }
} else {
  add('error', 'package.json', 'missing');
}

let hasBlocking = false;
for (const check of checks) {
  const marker = check.status === 'ok' ? 'OK' : check.status === 'warn' ? 'WARN' : 'ERROR';
  if (check.status === 'error') hasBlocking = true;
  console.log(`[${marker.padEnd(5)}] ${check.name.padEnd(22)} ${check.detail}`);
}

if (hasBlocking) {
  console.log('\ndoctor:macos-native found blocking issues.');
  process.exit(1);
}

console.log('\ndoctor:macos-native completed.');
console.log('Bootstrap: npm run macos:native:bootstrap');
console.log('Run: npm run macos:native:start (Terminal A), npm run macos:native:run (Terminal B)');
