#!/usr/bin/env node

import { mkdir, readdir, readFile, rm, stat, writeFile } from 'fs/promises';
import { dirname, resolve, relative } from 'path';
import { fileURLToPath } from 'url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..');
const SOURCE_DIR = resolve(REPO_ROOT, 'apps/agent/skills/clawlogic');
const TARGET_DIR = resolve(REPO_ROOT, 'skills/clawlogic');

function parseArgs(argv) {
  return {
    checkOnly: argv.includes('--check'),
  };
}

async function listFiles(root, base = root) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const abs = resolve(root, entry.name);
    const rel = relative(base, abs);
    if (entry.isDirectory()) {
      files.push(...await listFiles(abs, base));
      continue;
    }
    if (entry.isFile()) {
      files.push(rel);
    }
  }
  return files.sort();
}

async function readUtf8(path) {
  return readFile(path, 'utf-8');
}

async function copyDir(source, target) {
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });

  const files = await listFiles(source);
  for (const rel of files) {
    const src = resolve(source, rel);
    const dst = resolve(target, rel);
    await mkdir(dirname(dst), { recursive: true });
    const text = await readUtf8(src);
    await writeFile(dst, text, 'utf-8');
  }
}

async function checkInSync(source, target) {
  try {
    const sourceStats = await stat(source);
    if (!sourceStats.isDirectory()) {
      throw new Error(`Source is not a directory: ${source}`);
    }
  } catch (error) {
    throw new Error(`Source skill directory missing: ${source}`, { cause: error });
  }

  const sourceFiles = await listFiles(source);
  let targetFiles = [];
  try {
    targetFiles = await listFiles(target);
  } catch {
    return false;
  }

  if (sourceFiles.length !== targetFiles.length) {
    return false;
  }
  for (let i = 0; i < sourceFiles.length; i += 1) {
    if (sourceFiles[i] !== targetFiles[i]) {
      return false;
    }
    const src = resolve(source, sourceFiles[i]);
    const dst = resolve(target, targetFiles[i]);
    const [srcText, dstText] = await Promise.all([readUtf8(src), readUtf8(dst)]);
    if (srcText !== dstText) {
      return false;
    }
  }
  return true;
}

async function main() {
  const { checkOnly } = parseArgs(process.argv.slice(2));
  const inSync = await checkInSync(SOURCE_DIR, TARGET_DIR);
  if (inSync) {
    console.log('[skill-sync] skills/clawlogic is up to date');
    return;
  }

  if (checkOnly) {
    console.error('[skill-sync] skills/clawlogic is out of sync with apps/agent/skills/clawlogic');
    process.exit(1);
  }

  await copyDir(SOURCE_DIR, TARGET_DIR);
  console.log('[skill-sync] Updated skills/clawlogic from apps/agent/skills/clawlogic');
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[skill-sync] ${message}`);
  process.exit(1);
});
