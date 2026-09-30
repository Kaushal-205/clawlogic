#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname, relative, resolve } from 'path';
import { fileURLToPath } from 'url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..');
const SOURCE_PATH = resolve(REPO_ROOT, 'apps/agent/skills/clawlogic/SKILL.md');
// The web copy is served at /skill.md; the SDK copy ships in the npm package so agents
// can install the skill with `clawlogic-agent skill --install` (no repository access).
const TARGET_PATHS = [
  resolve(REPO_ROOT, 'apps/web/public/skill.md'),
  resolve(REPO_ROOT, 'packages/sdk/skill/SKILL.md'),
];

function parseArgs(argv) {
  return {
    checkOnly: argv.includes('--check'),
  };
}

async function readText(path) {
  return readFile(path, 'utf-8');
}

// SKILL.md pins `npx @clawlogic/sdk@<version>`; it must match the SDK release it ships in.
async function assertPinnedSdkVersion(sourceText) {
  const sdk = JSON.parse(await readText(resolve(REPO_ROOT, 'packages/sdk/package.json')));
  const pinned = new Set([...sourceText.matchAll(/@clawlogic\/sdk@([^\s`"']+)/g)].map((m) => m[1]));
  const stale = [...pinned].filter((v) => v !== sdk.version && !v.startsWith('<'));
  if (stale.length > 0) {
    console.error(
      `[skill-sync] SKILL.md pins @clawlogic/sdk@${stale.join(', ')} but packages/sdk is ${sdk.version}. ` +
        `Update apps/agent/skills/clawlogic/SKILL.md.`,
    );
    process.exit(1);
  }
}

async function syncSkillMd(checkOnly) {
  const sourceText = await readText(SOURCE_PATH);
  await assertPinnedSdkVersion(sourceText);

  for (const target of TARGET_PATHS) {
    const label = relative(REPO_ROOT, target);
    let targetText = '';
    try {
      targetText = await readText(target);
    } catch {
      targetText = '';
    }

    if (targetText === sourceText) {
      console.log(`[skill-sync] ${label} is up to date`);
      continue;
    }

    if (checkOnly) {
      console.error(`[skill-sync] ${label} differs from the agent SKILL.md`);
      process.exit(1);
    }

    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, sourceText, 'utf-8');
    console.log(`[skill-sync] Updated ${label} from agent SKILL.md`);
  }
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
