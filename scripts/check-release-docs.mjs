#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const packageJsonPath = path.join(rootDir, 'package.json');
const readmePath = path.join(rootDir, 'README.md');
const changelogPath = path.join(rootDir, 'CHANGELOG.md');

const errors = [];
const notes = [];

function fail(message) {
  errors.push(message);
}

function ok(message) {
  notes.push(message);
}

if (!fs.existsSync(packageJsonPath)) {
  fail('package.json is missing.');
} else if (!fs.existsSync(readmePath)) {
  fail('README.md is missing.');
} else if (!fs.existsSync(changelogPath)) {
  fail('CHANGELOG.md is missing.');
}

if (errors.length === 0) {
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const readme = fs.readFileSync(readmePath, 'utf8');
  const changelog = fs.readFileSync(changelogPath, 'utf8');

  const versionHeader = `## [${pkg.version}]`;
  if (!changelog.includes(versionHeader)) {
    fail(`CHANGELOG.md must contain a section header for package version ${pkg.version} (${versionHeader}).`);
  } else {
    ok(`CHANGELOG.md contains ${versionHeader}.`);
  }

  const installSnippet = `npm install ${pkg.name}`;
  if (!readme.includes(installSnippet)) {
    fail(`README.md must include install snippet: \`${installSnippet}\`.`);
  } else {
    ok(`README.md install snippet matches package name (${pkg.name}).`);
  }

  const importRegex = new RegExp(`from ['"]${pkg.name}['"]`);
  if (!importRegex.test(readme)) {
    fail(`README.md must include an import example using package name '${pkg.name}'.`);
  } else {
    ok('README.md import example matches package name.');
  }

  const npmBadgeRegex = new RegExp(`img\\.shields\\.io\\/npm\\/v\\/${pkg.name}`);
  if (!npmBadgeRegex.test(readme)) {
    fail(`README.md should include npm version badge for ${pkg.name}.`);
  } else {
    ok('README.md includes npm version badge.');
  }
}

if (errors.length > 0) {
  for (const message of errors) {
    console.error(`[release-docs] ERROR: ${message}`);
  }
  process.exit(1);
}

for (const message of notes) {
  console.log(`[release-docs] OK: ${message}`);
}
