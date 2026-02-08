/**
 * Shared setup for all OpenClaw tool scripts.
 *
 * Creates a ClawlogicClient instance from environment variables.
 * Expects:
 *   - AGENT_PRIVATE_KEY: Hex-encoded private key for the agent wallet
 *   - ARBITRUM_SEPOLIA_RPC_URL: RPC endpoint (defaults to public Arbitrum Sepolia)
 *   - AGENT_REGISTRY: Deployed AgentRegistry address
 *   - PREDICTION_MARKET_HOOK: Deployed PredictionMarketHook address
 *   - V4_POOL_MANAGER: Uniswap V4 PoolManager address
 *   - UMA_OOV3: UMA Optimistic Oracle V3 address
 */

import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, existsSync } from 'fs';
import 'dotenv/config';

// Import SDK source directly (monorepo, tsx handles TS imports)
import { ClawlogicClient } from '../../../../../../packages/sdk/src/client.js';
import {
  createConfig,
  loadConfigFromDeployment,
  ARBITRUM_SEPOLIA_RPC_URL,
} from '../../../../../../packages/sdk/src/config.js';
import type { ClawlogicConfig, DeploymentInfo } from '../../../../../../packages/sdk/src/types.js';

/**
 * Try to load contract addresses from the deployments JSON file.
 * Falls back to environment variables if the file doesn't exist.
 */
function loadConfig(): ClawlogicConfig {
  const rpcUrl = process.env.ARBITRUM_SEPOLIA_RPC_URL ?? ARBITRUM_SEPOLIA_RPC_URL;

  // Try loading from deployments file first
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const deploymentsPath = resolve(
    __dirname,
    '../../../../../../packages/contracts/deployments/arbitrum-sepolia.json',
  );

  if (existsSync(deploymentsPath)) {
    try {
      const raw = readFileSync(deploymentsPath, 'utf-8');
      const deployment: DeploymentInfo = JSON.parse(raw);
      return loadConfigFromDeployment(deployment, rpcUrl);
    } catch {
      // Fall through to env vars
    }
  }

  // Fall back to environment variables
  const agentRegistry = process.env.AGENT_REGISTRY;
  const predictionMarketHook = process.env.PREDICTION_MARKET_HOOK;
  const poolManager = process.env.V4_POOL_MANAGER;
  const optimisticOracleV3 = process.env.UMA_OOV3;

  if (!agentRegistry || !predictionMarketHook || !poolManager) {
    console.error(JSON.stringify({
      success: false,
      error: 'Missing contract addresses. Set AGENT_REGISTRY, PREDICTION_MARKET_HOOK, and V4_POOL_MANAGER environment variables, or provide a deployments JSON file at packages/contracts/deployments/arbitrum-sepolia.json.',
    }));
    process.exit(1);
  }

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
 * Create a ClawlogicClient with the agent's private key.
 * Exits with a JSON error if the private key is not set.
 */
export function createClient(): ClawlogicClient {
  const privateKey = process.env.AGENT_PRIVATE_KEY;

  if (!privateKey) {
    console.error(JSON.stringify({
      success: false,
      error: 'AGENT_PRIVATE_KEY environment variable is not set. The agent needs a private key to sign transactions.',
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
