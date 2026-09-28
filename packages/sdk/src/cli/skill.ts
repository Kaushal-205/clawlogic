import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getBoolFlag, getFlag } from './args.js';
import { outputSuccess } from './output.js';

/** SKILL.md ships in the npm package (packages/sdk/skill), next to dist/. */
const BUNDLED_SKILL = resolve(dirname(fileURLToPath(import.meta.url)), '../../skill/SKILL.md');
const DEFAULT_DIR = 'skills/clawlogic';

/**
 * Print or install the agent skill from the npm package itself, so onboarding
 * never needs the source repository.
 *   clawlogic-agent skill                 -> prints SKILL.md content in JSON
 *   clawlogic-agent skill --install       -> writes ./skills/clawlogic/SKILL.md
 *   clawlogic-agent skill --install --dir <path>
 */
export async function commandSkill(flags: Record<string, string | boolean>): Promise<void> {
  const content = await readFile(BUNDLED_SKILL, 'utf-8');
  if (!getBoolFlag(flags, 'install')) {
    outputSuccess({ command: 'skill', source: 'npm package', content });
    return;
  }
  const dir = resolve(getFlag(flags, 'dir') ?? DEFAULT_DIR);
  const target = resolve(dir, 'SKILL.md');
  await mkdir(dir, { recursive: true });
  await writeFile(target, content, 'utf-8');
  outputSuccess({
    command: 'skill',
    installed: target,
    next: 'Run `clawlogic-agent init`, fund the printed address, then `clawlogic-agent doctor`.',
  });
}
