/**
 * Shared setup for all OpenClaw tool scripts.
 *
 * Creates a ClawlogicClient for the Arbitrum One mainnet deployment, with optional
 * environment overrides for the RPC and contract addresses.
 */

import 'dotenv/config';

import { ClawlogicClient, ARBITRUM_ONE_CONFIG, createConfig } from '@clawlogic/sdk';
import type { ClawlogicConfig } from '@clawlogic/sdk';

/**
 * Build config from environment overrides, falling back to the deployed contracts.
 */
function loadConfig(): ClawlogicConfig {
  const defaults = ARBITRUM_ONE_CONFIG.contracts;
  const rpcUrl = process.env.ARBITRUM_ONE_RPC_URL ?? ARBITRUM_ONE_CONFIG.rpcUrl;
  const agentRegistry = process.env.AGENT_REGISTRY ?? defaults.agentRegistry;
  const predictionMarketHook = process.env.PREDICTION_MARKET_HOOK ?? defaults.predictionMarketHook;
  const poolManager = process.env.V4_POOL_MANAGER ?? defaults.poolManager;
  const optimisticOracleV3 = process.env.UMA_OOV3 ?? defaults.optimisticOracleV3;

  return createConfig(
    {
      agentRegistry: agentRegistry as `0x${string}`,
      predictionMarketHook: predictionMarketHook as `0x${string}`,
      poolManager: poolManager as `0x${string}`,
      optimisticOracleV3: optimisticOracleV3 as `0x${string}`,
    },
    ARBITRUM_ONE_CONFIG.chainId,
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
