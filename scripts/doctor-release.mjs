#!/usr/bin/env node

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const results = [];

function add(level, title, detail) {
  results.push({ level, title, detail });
}

function run(command) {
  try {
    return {
      ok: true,
      output: execSync(command, {
        cwd: rootDir,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
        env: process.env,
      }).trim(),
    };
  } catch (error) {
    return {
      ok: false,
      output: String(error?.stderr || error?.message || '').trim(),
    };
  }
}

function parseGithubRepoSlug(remoteUrl) {
  const sshMatch = remoteUrl.match(/^git@github\.com:([^/]+)\/(.+?)(\.git)?$/);
  if (sshMatch) {
    return `${sshMatch[1]}/${sshMatch[2]}`;
  }
  const httpsMatch = remoteUrl.match(/^https:\/\/github\.com\/([^/]+)\/(.+?)(\.git)?$/);
  if (httpsMatch) {
    return `${httpsMatch[1]}/${httpsMatch[2]}`;
  }
  return null;
}

const gitStatus = run('git status --porcelain');
if (!gitStatus.ok) {
  add('error', 'Git status', 'Could not read git status.');
} else if (gitStatus.output.length > 0) {
  add('warn', 'Git status', 'Working tree has uncommitted changes.');
} else {
  add('ok', 'Git status', 'Working tree is clean.');
}

const releaseWorkflowPath = path.join(rootDir, '.github/workflows/release.yml');
if (!fs.existsSync(releaseWorkflowPath)) {
  add('error', 'Release workflow', '.github/workflows/release.yml is missing.');
} else {
  const workflow = fs.readFileSync(releaseWorkflowPath, 'utf8');
  const hasTagTrigger = /tags:\s*[\r\n]+\s*-\s*["']v\*["']/.test(workflow);
  const hasDispatch = /workflow_dispatch:/.test(workflow);
  add(hasTagTrigger ? 'ok' : 'error', 'Tag trigger', hasTagTrigger ? 'Release workflow listens to v* tags.' : 'Release workflow is missing v* tag trigger.');
  add(hasDispatch ? 'ok' : 'error', 'Dispatch trigger', hasDispatch ? 'workflow_dispatch is enabled.' : 'workflow_dispatch is missing.');
}

const releaseDocs = run('node scripts/check-release-docs.mjs');
add(
  releaseDocs.ok ? 'ok' : 'error',
  'Release docs gate',
  releaseDocs.ok ? 'CHANGELOG/README checks passed.' : (releaseDocs.output.split('\n')[0] || 'check-release-docs failed.')
);

const originUrl = run('git remote get-url origin');
let repoSlug = null;
if (!originUrl.ok || !originUrl.output) {
  add('warn', 'Origin remote', 'Could not read origin remote URL.');
} else {
  repoSlug = parseGithubRepoSlug(originUrl.output);
  add(repoSlug ? 'ok' : 'warn', 'Origin repo', repoSlug || `Non-GitHub remote: ${originUrl.output}`);
}

const ghVersion = run('gh --version');
if (!ghVersion.ok) {
  add('warn', 'GitHub CLI', 'gh is not available. Skip GitHub secret/permission checks.');
} else {
  add('ok', 'GitHub CLI', ghVersion.output.split('\n')[0]);
}

if (ghVersion.ok && repoSlug) {
  const ghAuth = run('gh auth status');
  if (!ghAuth.ok) {
    add('warn', 'gh auth', 'Not authenticated. Run `gh auth login` to check repo secret/permissions.');
  } else {
    add('ok', 'gh auth', 'Authenticated.');

    const secretList = run(`gh secret list --repo ${repoSlug}`);
    if (!secretList.ok) {
      add('warn', 'NPM_TOKEN secret', 'Could not read repository secrets.');
    } else {
      const hasToken = secretList.output
        .split('\n')
        .map((line) => line.trim())
        .some((line) => line.startsWith('NPM_TOKEN'));
      add(hasToken ? 'ok' : 'error', 'NPM_TOKEN secret', hasToken ? 'NPM_TOKEN exists in repository secrets.' : 'NPM_TOKEN is missing in repository secrets.');
    }

    const workflowPerm = run(`gh api repos/${repoSlug}/actions/permissions/workflow --jq '.default_workflow_permissions'`);
    if (!workflowPerm.ok) {
      add('warn', 'Actions permission', 'Could not read default workflow permissions.');
    } else {
      const value = workflowPerm.output.trim();
      add(value === 'write' ? 'ok' : 'error', 'Actions permission', `default_workflow_permissions=${value}`);
    }
  }
}

const maxTitle = Math.max(...results.map((r) => r.title.length), 12);
for (const r of results) {
  const label = r.level.toUpperCase().padEnd(5, ' ');
  const title = r.title.padEnd(maxTitle, ' ');
  console.log(`[${label}] ${title}  ${r.detail}`);
}

console.log('');
console.log('Tip: run `gh workflow run release.yml` to execute preflight verify job via workflow_dispatch.');

const hasError = results.some((r) => r.level === 'error');
if (hasError) {
  process.exitCode = 1;
}
