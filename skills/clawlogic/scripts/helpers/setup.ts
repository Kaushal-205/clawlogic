/**
 * Shared setup for all OpenClaw tool scripts.
 *
 * Creates a ClawlogicClient instance from environment variables, with
 * production-safe Arbitrum Sepolia defaults when explicit addresses are not set.
 */

import 'dotenv/config';

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { ClawlogicClient } from '@clawlogic/sdk';
import {
  createConfig,
  ARBITRUM_SEPOLIA_RPC_URL,
} from '@clawlogic/sdk';
import type { ClawlogicConfig } from '@clawlogic/sdk';

const DEFAULT_AGENT_REGISTRY =
  '0xd0B1864A1da6407A7DE5a08e5f82352b5e230cd3' as const;
const DEFAULT_PREDICTION_MARKET_HOOK =
  '0xB3C4a85906493f3Cf0d59e891770Bb2e77FA8880' as const;
const DEFAULT_V4_POOL_MANAGER =
  '0xFB3e0C6F74eB1a21CC1Da29aeC80D2Dfe6C9a317' as const;
const DEFAULT_UMA_OOV3 =
  '0x9023B0bB4E082CDcEdFA2b3671371646f4C5FBFb' as const;
const DEFAULT_STATE_PATH = '~/.config/clawlogic/agent.json';

/**
 * Build config from environment overrides, falling back to known deployed defaults.
 */
function loadConfig(): ClawlogicConfig {
  const rpcUrl = process.env.AGENT_RPC_URL ?? process.env.ARBITRUM_SEPOLIA_RPC_URL ?? ARBITRUM_SEPOLIA_RPC_URL;
  const agentRegistry = process.env.AGENT_REGISTRY ?? DEFAULT_AGENT_REGISTRY;
  const predictionMarketHook =
    process.env.PREDICTION_MARKET_HOOK ?? DEFAULT_PREDICTION_MARKET_HOOK;
  const poolManager = process.env.V4_POOL_MANAGER ?? DEFAULT_V4_POOL_MANAGER;
  const optimisticOracleV3 = process.env.UMA_OOV3 ?? DEFAULT_UMA_OOV3;

  return createConfig(
    {
      agentRegistry: agentRegistry as `0x${string}`,
      predictionMarketHook: predictionMarketHook as `0x${string}`,
      poolManager: poolManager as `0x${string}`,
      optimisticOracleV3: (optimisticOracleV3 ?? '0x0000000000000000000000000000000000000000') as `0x${string}`,
    },
    421614,
    rpcUrl,
  );
}

/**
 * Create a signing-capable ClawlogicClient.
 * Key source precedence: AGENT_PRIVATE_KEY env -> local state file.
 */
export function createClient(): ClawlogicClient {
  const privateKey = resolveSigningPrivateKey();

  if (!privateKey) {
    console.error(JSON.stringify({
      success: false,
      error: 'No signing key found. Set AGENT_PRIVATE_KEY or run `npx @clawlogic/sdk@latest clawlogic-agent init` first.',
    }));
    process.exit(1);
  }

  const config = loadConfig();
  return new ClawlogicClient(config, privateKey as `0x${string}`);
}

/**
 * Create a read-only ClawlogicClient (no private key needed).
 */
export function createReadOnlyClient(): ClawlogicClient {
  const config = loadConfig();
  return new ClawlogicClient(config);
}

export function resolveSigningPrivateKey(): `0x${string}` | undefined {
  return readPrivateKeyFromEnv() ?? readPrivateKeyFromState();
}

function readPrivateKeyFromEnv(): `0x${string}` | undefined {
  const candidate = process.env.AGENT_PRIVATE_KEY?.trim();
  if (!candidate) {
    return undefined;
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(candidate)) {
    throw new Error('AGENT_PRIVATE_KEY must be a 32-byte hex string (0x + 64 hex chars).');
  }
  return candidate as `0x${string}`;
}

function readPrivateKeyFromState(): `0x${string}` | undefined {
  const statePath = resolveStatePath(process.env.CLAWLOGIC_STATE_PATH ?? DEFAULT_STATE_PATH);
  try {
    const parsed = JSON.parse(readFileSync(statePath, 'utf-8')) as {
      privateKey?: string;
    };
    const candidate = parsed.privateKey?.trim();
    if (!candidate) {
      return undefined;
    }
    return /^0x[0-9a-fA-F]{64}$/.test(candidate)
      ? (candidate as `0x${string}`)
      : undefined;
  } catch {
    return undefined;
  }
}

function resolveStatePath(path: string): string {
  if (path.startsWith('~/')) {
    return resolve(homedir(), path.slice(2));
  }
  return resolve(path);
}

/**
 * Output a success result as JSON to stdout.
 */
export function outputSuccess(data: Record<string, unknown>): void {
  console.log(JSON.stringify({ success: true, ...data }, bigintReplacer, 2));
}

/**
 * Output an error result as JSON to stderr and exit.
 */
export function outputError(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify({ success: false, error: message }, null, 2));
  process.exit(1);
}

/**
 * JSON replacer that converts BigInt values to strings with a "n" suffix
 * so they can be serialized.
 */
function bigintReplacer(_key: string, value: unknown): unknown {
  if (typeof value === 'bigint') {
    return value.toString();
  }
  return value;
}
