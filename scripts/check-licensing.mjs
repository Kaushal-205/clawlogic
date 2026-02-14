#!/usr/bin/env node

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

function run(cmd) {
  return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function safeRun(cmd) {
  try {
    return run(cmd);
  } catch {
    return '';
  }
}

function fail(msg) {
  console.error(`license-check: ${msg}`);
  process.exitCode = 1;
}

function checkRootLicense() {
  if (!existsSync('LICENSE')) {
    fail('Missing root LICENSE file.');
    return;
  }

  if (!existsSync('README.md')) {
    fail('Missing README.md.');
    return;
  }

  const readme = readFileSync('README.md', 'utf8');
  const hasLicenseLink = /\[LICENSE\]\(\.\/LICENSE\)/.test(readme);
  if (!hasLicenseLink) {
    fail('README.md must include a [LICENSE](./LICENSE) link.');
  }
}

function getNewFiles() {
  const baseRef = process.env.GITHUB_BASE_REF;
  if (baseRef) {
    const hasBase = safeRun(`git rev-parse --verify origin/${baseRef}`);
    if (hasBase) {
      const status = safeRun(`git diff --name-status --diff-filter=A origin/${baseRef}...HEAD`);
      return status
        .split('\n')
        .filter(Boolean)
        .map((line) => line.split('\t').at(-1))
        .filter(Boolean);
    }
  }

  const status = safeRun('git diff --name-status --diff-filter=A HEAD~1...HEAD');
  if (!status) {
    return [];
  }

  return status
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('\t').at(-1))
    .filter(Boolean);
}

function hasSpdxHeader(filePath) {
  const content = readFileSync(filePath, 'utf8');
  const firstLines = content.split('\n').slice(0, 5).join('\n');
  return /SPDX-License-Identifier:/.test(firstLines);
}

function hasSdkLicenseHeader(filePath) {
  const content = readFileSync(filePath, 'utf8');
  const firstLines = content.split('\n').slice(0, 5).join('\n');
  return (
    /SPDX-License-Identifier: MIT/.test(firstLines) ||
    /License:\s*MIT/.test(firstLines)
  );
}

function checkNewFileHeaders() {
  const newFiles = getNewFiles();
  if (newFiles.length === 0) {
    console.log('license-check: No new files detected; skipping new-file header checks.');
    return;
  }

  const contractFiles = newFiles.filter(
    (f) => f.startsWith('packages/contracts/src/') && f.endsWith('.sol') && existsSync(f),
  );
  for (const file of contractFiles) {
    if (!hasSpdxHeader(file)) {
      fail(`New Solidity contract missing SPDX header: ${file}`);
    }
  }

  const sdkFiles = newFiles.filter(
    (f) => f.startsWith('packages/sdk/src/') && /\.(ts|tsx|js|mjs|cjs)$/.test(f) && existsSync(f),
  );
  for (const file of sdkFiles) {
    if (!hasSdkLicenseHeader(file)) {
      fail(`New SDK source file missing MIT license header: ${file}`);
    }
  }
}

function main() {
  checkRootLicense();
  checkNewFileHeaders();

  if (process.exitCode && process.exitCode !== 0) {
    process.exit(process.exitCode);
  }

  console.log('license-check: OK');
}

main();
