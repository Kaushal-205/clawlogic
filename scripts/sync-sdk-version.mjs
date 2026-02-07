#!/usr/bin/env node

import { readFile, writeFile } from 'fs/promises';

const SDK_PKG_PATH = 'packages/sdk/package.json';
const WEB_PKG_PATH = 'apps/web/package.json';
const DEP_NAME = '@clawlogic/sdk';

function parseArgs(argv) {
  return {
    checkOnly: argv.includes('--check'),
  };
}

async function readJson(path) {
  const text = await readFile(path, 'utf-8');
  return JSON.parse(text);
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf-8');
}

async function main() {
  const { checkOnly } = parseArgs(process.argv.slice(2));

  const sdkPkg = await readJson(SDK_PKG_PATH);
  const webPkg = await readJson(WEB_PKG_PATH);

  if (!sdkPkg?.version || typeof sdkPkg.version !== 'string') {
    throw new Error(`Missing SDK version in ${SDK_PKG_PATH}`);
  }
  if (!webPkg?.dependencies || typeof webPkg.dependencies !== 'object') {
    throw new Error(`Missing dependencies in ${WEB_PKG_PATH}`);
  }

  const target = `^${sdkPkg.version}`;
  const current = webPkg.dependencies[DEP_NAME];

  if (current === target) {
    console.log(`[sdk-sync] ${DEP_NAME} already matches ${target}`);
    return;
  }

  if (checkOnly) {
    console.error(
      `[sdk-sync] Version mismatch: web has ${String(current)}, expected ${target}`,
    );
    process.exit(1);
  }

  webPkg.dependencies[DEP_NAME] = target;
  await writeJson(WEB_PKG_PATH, webPkg);
  console.log(`[sdk-sync] Updated ${DEP_NAME}: ${String(current)} -> ${target}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[sdk-sync] ${message}`);
  process.exit(1);
});
