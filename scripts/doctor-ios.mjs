#!/usr/bin/env node

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { URL } from 'node:url';

const rootDir = process.cwd();

const results = [];

function run(command) {
  try {
    return {
      ok: true,
      output: execSync(command, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim(),
    };
  } catch (error) {
    return {
      ok: false,
      output: String(error?.stderr || error?.message || '').trim(),
    };
  }
}

function addResult(level, title, detail) {
  results.push({ level, title, detail });
}

function isVersionAtLeast(actual, minimum) {
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

function testPort(host, port, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;

    const finish = (ok) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(ok);
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    socket.connect(port, host);
  });
}

async function main() {
  const nodeVersion = process.versions.node;
  if (isVersionAtLeast(nodeVersion, '18.0.0')) {
    addResult('ok', 'Node.js', `v${nodeVersion}`);
  } else {
    addResult('error', 'Node.js', `v${nodeVersion} (requires 18+)`);
  }

  const npm = run('npm -v');
  addResult(npm.ok ? 'ok' : 'error', 'npm', npm.ok ? npm.output : 'npm command failed');

  const expo = run('npx expo --version');
  addResult(expo.ok ? 'ok' : 'warn', 'Expo CLI', expo.ok ? expo.output : 'npx expo not available');

  const xcodebuild = run('xcodebuild -version');
  addResult(xcodebuild.ok ? 'ok' : 'error', 'Xcode', xcodebuild.ok ? xcodebuild.output.split('\n')[0] : 'xcodebuild not available');

  const pod = run('pod --version');
  addResult(pod.ok ? 'ok' : 'error', 'CocoaPods', pod.ok ? pod.output : 'pod command failed');

  const iosDir = path.join(rootDir, 'ios');
  addResult(fs.existsSync(iosDir) ? 'ok' : 'warn', 'iOS project', fs.existsSync(iosDir) ? 'ios/ found' : 'ios/ not found (run npm run setup)');

  const envFile = path.join(rootDir, '.env');
  addResult(fs.existsSync(envFile) ? 'ok' : 'warn', '.env file', fs.existsSync(envFile) ? '.env present' : '.env missing (copy from .env.example)');

  const deviceList = run('xcrun devicectl list devices');
  if (!deviceList.ok) {
    addResult('warn', 'Physical device', 'Could not read device list');
  } else {
    const hasPaired = deviceList.output.includes('available (paired)');
    addResult(hasPaired ? 'ok' : 'warn', 'Physical device', hasPaired ? 'Paired iOS device detected' : 'No paired iOS device detected');
  }

  const metroLocal = await testPort('127.0.0.1', 8081);
  addResult(metroLocal ? 'ok' : 'warn', 'Metro localhost:8081', metroLocal ? 'Reachable' : 'Not reachable');

  const expoDevServerUrl = process.env.EXPO_DEV_SERVER_URL?.trim();
  if (expoDevServerUrl) {
    try {
      const parsed = new URL(expoDevServerUrl);
      const port = parsed.port ? Number(parsed.port) : parsed.protocol === 'https:' ? 443 : 80;
      const metroRemote = await testPort(parsed.hostname, port);
      addResult(
        metroRemote ? 'ok' : 'warn',
        'EXPO_DEV_SERVER_URL',
        `${parsed.protocol}//${parsed.hostname}:${port} ${metroRemote ? 'reachable' : 'not reachable'}`
      );
    } catch {
      addResult('warn', 'EXPO_DEV_SERVER_URL', `Invalid URL: ${expoDevServerUrl}`);
    }
  } else {
    addResult('warn', 'EXPO_DEV_SERVER_URL', 'Not set (optional, used by ios:dev:device:open)');
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
    console.log('doctor:ios found blocking issues.');
    process.exitCode = 1;
    return;
  }

  console.log('doctor:ios completed.');
  if (!metroLocal) {
    console.log('Tip: Start Metro with `npm run dev:metro` before Debug runs.');
  }
}

main().catch((error) => {
  console.error('doctor:ios failed:', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
