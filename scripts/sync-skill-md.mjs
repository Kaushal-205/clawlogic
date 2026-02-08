#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..');
const SOURCE_PATH = resolve(REPO_ROOT, 'apps/agent/skills/clawlogic/SKILL.md');
const TARGET_PATH = resolve(REPO_ROOT, 'apps/web/public/skill.md');

function parseArgs(argv) {
  return {
    checkOnly: argv.includes('--check'),
  };
}

async function readText(path) {
  return readFile(path, 'utf-8');
}

async function syncSkillMd(checkOnly) {
  const sourceText = await readText(SOURCE_PATH);

  let targetText = '';
  try {
    targetText = await readText(TARGET_PATH);
  } catch {
    targetText = '';
  }

  if (targetText === sourceText) {
    console.log('[skill-sync] apps/web/public/skill.md is up to date');
    return;
  }

  if (checkOnly) {
    console.error('[skill-sync] skill.md mismatch between agent skill and web public copy');
    process.exit(1);
  }

  await mkdir(dirname(TARGET_PATH), { recursive: true });
  await writeFile(TARGET_PATH, sourceText, 'utf-8');
  console.log('[skill-sync] Updated apps/web/public/skill.md from agent SKILL.md');
}

async function main() {
  const { checkOnly } = parseArgs(process.argv.slice(2));
  await syncSkillMd(checkOnly);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[skill-sync] ${message}`);
  process.exit(1);
});
