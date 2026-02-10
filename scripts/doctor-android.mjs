#!/usr/bin/env node

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const results = [];

function add(level, title, detail) {
  results.push({ level, title, detail });
}

function versionAtLeast(actual, minimum) {
  const a = actual.split('.').map((n) => Number(n));
  const b = minimum.split('.').map((n) => Number(n));
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const av = a[i] || 0;
    const bv = b[i] || 0;
    if (av > bv) return true;
    if (av < bv) return false;
  }
  return true;
}

function run(command) {
  try {
    return {
      ok: true,
      output: execSync(command, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], env: process.env }).trim(),
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

function commandPath(name) {
  const whichResult = run(process.platform === 'win32' ? `where ${name}` : `which ${name}`);
  if (!whichResult.ok || !whichResult.output) return null;
  return whichResult.output.split('\n')[0].trim();
}

function pickTool(androidHome, relativePath, fallbackName) {
  if (androidHome) {
    const candidate = path.join(androidHome, ...relativePath.split('/'));
    if (fs.existsSync(candidate)) {
      return { path: candidate, source: 'sdk' };
    }
  }
  const fallback = commandPath(fallbackName);
  if (fallback) {
    return { path: fallback, source: 'path' };
  }
  return { path: null, source: 'missing' };
}

function findAndroidHome() {
  // 1. Check environment variables
  const envHome = (process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || '').trim();
  if (envHome && fs.existsSync(envHome)) return envHome;

  // 2. Check common paths
  const commonAndroidPaths = [
    path.join(process.env.HOME || '', 'Library/Android/sdk'),
    path.join(process.env.HOME || '', 'Android/Sdk'),
    path.join(process.env.HOME || '', 'android-sdk'),
    '/usr/local/share/android-sdk',
    '/opt/homebrew/share/android-sdk',
  ];
  for (const p of commonAndroidPaths) {
    if (fs.existsSync(p)) return p;
  }

  // 3. Try to find adb in PATH and infer ANDROID_HOME
  try {
    const whichAdb = execSync(process.platform === 'win32' ? 'where adb' : 'which adb', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    if (whichAdb) {
      const adbDir = path.dirname(whichAdb);
      if (adbDir.endsWith('platform-tools')) {
        const potentialHome = path.dirname(adbDir);
        if (fs.existsSync(potentialHome)) return potentialHome;
      }
    }
  } catch {
    // ignore
  }

  return envHome || null;
}

const nodeVersion = process.versions.node;
add(versionAtLeast(nodeVersion, '18.0.0') ? 'ok' : 'error', 'Node.js', `v${nodeVersion}`);

const npm = run('npm -v');
add(npm.ok ? 'ok' : 'error', 'npm', npm.ok ? npm.output : 'npm command failed');

const expo = run('npx expo --version');
add(expo.ok ? 'ok' : 'warn', 'Expo CLI', expo.ok ? expo.output : 'npx expo not available');

const javaVersion = run('java -version 2>&1');
if (javaVersion.ok) {
  const firstLine = javaVersion.output.split('\n')[0] || 'java found';
  add('ok', 'Java', firstLine);
} else {
  add('error', 'Java', 'java command not found (required for Android build)');
}

let androidHome = findAndroidHome();

if (!androidHome) {
  add('error', 'ANDROID_HOME', 'Not set and could not find in common locations (set ANDROID_HOME or ANDROID_SDK_ROOT)');
} else if (!fs.existsSync(androidHome)) {
  add('error', 'ANDROID_HOME', `${androidHome} does not exist`);
} else {
  // Normalize environment so all checks use the same SDK root.
  process.env.ANDROID_HOME = androidHome;
  process.env.ANDROID_SDK_ROOT = androidHome;
  process.env.PATH = [
    path.join(androidHome, 'platform-tools'),
    path.join(androidHome, 'emulator'),
    path.join(androidHome, 'cmdline-tools', 'latest', 'bin'),
    process.env.PATH || '',
  ].join(':');

  add('ok', 'ANDROID_HOME', androidHome);
  const cmdlineToolsDir = path.join(androidHome, 'cmdline-tools', 'latest', 'bin');
  const hasSdkmanager = fs.existsSync(path.join(cmdlineToolsDir, 'sdkmanager'));
  const hasAvdmanager = fs.existsSync(path.join(cmdlineToolsDir, 'avdmanager'));
  add(
    hasSdkmanager && hasAvdmanager ? 'ok' : 'warn',
    'cmdline-tools',
    hasSdkmanager && hasAvdmanager
      ? path.join(androidHome, 'cmdline-tools', 'latest')
      : 'cmdline-tools/latest is missing (run: sdkmanager --sdk_root="$ANDROID_HOME" "cmdline-tools;latest")'
  );
}

const sdkmanagerTool = pickTool(androidHome, 'cmdline-tools/latest/bin/sdkmanager', 'sdkmanager');
const avdmanagerTool = pickTool(androidHome, 'cmdline-tools/latest/bin/avdmanager', 'avdmanager');
const emulatorTool = pickTool(androidHome, 'emulator/emulator', 'emulator');
const adbTool = pickTool(androidHome, 'platform-tools/adb', 'adb');

if (sdkmanagerTool.path) {
  add(sdkmanagerTool.source === 'sdk' ? 'ok' : 'warn', 'sdkmanager', sdkmanagerTool.path);
} else {
  add('error', 'sdkmanager', 'sdkmanager not found');
}

if (avdmanagerTool.path) {
  add(avdmanagerTool.source === 'sdk' ? 'ok' : 'warn', 'avdmanager', avdmanagerTool.path);
} else {
  add('error', 'avdmanager', 'avdmanager not found');
}

if (emulatorTool.path) {
  add(emulatorTool.source === 'sdk' ? 'ok' : 'warn', 'emulator', emulatorTool.path);
} else {
  add('warn', 'emulator', 'emulator binary not found');
}

if (adbTool.path) {
  add(adbTool.source === 'sdk' ? 'ok' : 'warn', 'ADB binary', adbTool.path);
} else {
  add('warn', 'ADB binary', 'adb binary not found');
}

if (sdkmanagerTool.path) {
  const sdkVersion = run(`${shellQuote(sdkmanagerTool.path)} --version`);
  add(sdkVersion.ok ? 'ok' : 'warn', 'SDK tools ver', sdkVersion.ok ? sdkVersion.output : 'Could not read sdkmanager version');
}

if (avdmanagerTool.path) {
  const targets = run(`${shellQuote(avdmanagerTool.path)} list target`);
  if (!targets.ok) {
    add('warn', 'AVD targets', 'Could not list targets from avdmanager');
  } else if (/id:\s+\d+/.test(targets.output)) {
    add('ok', 'AVD targets', 'Android targets detected');
  } else {
    add('error', 'AVD targets', 'No targets detected. Install cmdline-tools in SDK and retry.');
  }
}

const adb = adbTool.path ? run(`${shellQuote(adbTool.path)} version`) : { ok: false, output: '' };
add(adb.ok ? 'ok' : 'warn', 'adb command', adb.ok ? adb.output.split('\n')[0] : 'adb not available');

const devices = adbTool.path ? run(`${shellQuote(adbTool.path)} devices`) : { ok: false, output: '' };
if (devices.ok) {
  const connected = devices.output
    .split('\n')
    .slice(1)
    .map((line) => line.trim())
    .filter((line) => line && /\bdevice$/.test(line));
  add(connected.length > 0 ? 'ok' : 'warn', 'Android devices', connected.length > 0 ? `${connected.length} connected` : 'No device/emulator connected');
} else {
  add('warn', 'Android devices', 'Could not query `adb devices`');
}

const appJsonPath = path.join(rootDir, 'app.json');
if (fs.existsSync(appJsonPath)) {
  try {
    const raw = fs.readFileSync(appJsonPath, 'utf8');
    const config = JSON.parse(raw);
    const pkg = config?.expo?.android?.package;
    if (typeof pkg === 'string' && pkg.trim()) {
      add('ok', 'Android package', pkg.trim());
    } else {
      add('warn', 'Android package', 'expo.android.package is not set in app.json');
    }
  } catch {
    add('warn', 'app.json', 'Could not parse app.json');
  }
} else {
  add('warn', 'app.json', 'app.json not found');
}

const maxTitle = Math.max(...results.map((r) => r.title.length), 10);
for (const r of results) {
  const label = r.level.toUpperCase().padEnd(5, ' ');
  const title = r.title.padEnd(maxTitle, ' ');
  console.log(`[${label}] ${title}  ${r.detail}`);
}

const hasError = results.some((r) => r.level === 'error');
console.log('');
if (hasError) {
  console.log('doctor:android found blocking issues.');
  process.exitCode = 1;
} else {
  console.log('doctor:android completed.');
}
