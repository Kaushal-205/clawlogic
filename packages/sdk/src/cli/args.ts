export interface ParsedArgs {
  command?: string;
  flags: Record<string, string | boolean>;
  positional: string[];
}

export function parseArgs(argv: string[]): ParsedArgs {
  const [command, ...rest] = argv;
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];

  for (let i = 0; i < rest.length; i++) {
    const token = rest[i];
    if (!token.startsWith('--')) {
      positional.push(token);
      continue;
    }

    const withoutPrefix = token.slice(2);
    if (!withoutPrefix) {
      continue;
    }

    const eqIndex = withoutPrefix.indexOf('=');
    if (eqIndex >= 0) {
      const key = withoutPrefix.slice(0, eqIndex);
      const value = withoutPrefix.slice(eqIndex + 1);
      flags[key] = value;
      continue;
    }

    const next = rest[i + 1];
    if (!next || next.startsWith('--')) {
      flags[withoutPrefix] = true;
      continue;
    }

    flags[withoutPrefix] = next;
    i += 1;
  }

  return { command, flags, positional };
}

export function getFlag(
  flags: Record<string, string | boolean>,
  key: string,
): string | undefined {
  const value = flags[key];
  return typeof value === 'string' ? value : undefined;
}

export function getBoolFlag(
  flags: Record<string, string | boolean>,
  key: string,
): boolean {
  const value = flags[key];
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes';
  }
  return false;
}
