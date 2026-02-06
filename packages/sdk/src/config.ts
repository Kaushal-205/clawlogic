import type { ClawlogicConfig, DeploymentInfo } from './types.js';

// ─────────────────────────────────────────────────────────────────────────────
// Arbitrum Sepolia
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Arbitrum Sepolia chain ID.
 */
export const ARBITRUM_SEPOLIA_CHAIN_ID = 421614;

/**
 * Default RPC URL for Arbitrum Sepolia.
 */
export const ARBITRUM_SEPOLIA_RPC_URL = 'https://sepolia-rollup.arbitrum.io/rpc';

/**
 * Default configuration for Arbitrum Sepolia testnet.
 *
 * Contract addresses are placeholders and will be updated after deployment.
 * Use `loadConfig()` to load real addresses from a deployments JSON file.
 */
export const ARBITRUM_SEPOLIA_CONFIG: ClawlogicConfig = {
  chainId: ARBITRUM_SEPOLIA_CHAIN_ID,
  rpcUrl: ARBITRUM_SEPOLIA_RPC_URL,
  contracts: {
    agentRegistry: '0x0000000000000000000000000000000000000000',
    predictionMarketHook: '0x0000000000000000000000000000000000000000',
    poolManager: '0x0000000000000000000000000000000000000000',
    optimisticOracleV3: '0x0000000000000000000000000000000000000000',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Circle Arc Testnet
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Circle Arc testnet chain ID.
 */
export const ARC_TESTNET_CHAIN_ID = 5042002;

/**
 * Default RPC URL for Circle Arc testnet.
 */
export const ARC_TESTNET_RPC_URL = 'https://rpc.testnet.arc.network';

/**
 * Block explorer URL for Circle Arc testnet.
 */
export const ARC_TESTNET_EXPLORER_URL = 'https://testnet.arcscan.app';

/**
 * Default configuration for Circle Arc testnet.
 *
 * Arc is Circle's EVM-compatible L1 where USDC is the native gas token.
 * On Arc, `msg.value` sends native USDC (18 decimals), so the existing
 * `mintOutcomeTokens()` payable function works directly -- collateral is
 * USDC instead of ETH.
 *
 * Important: Uniswap V4 and UMA OOV3 are NOT natively available on Arc.
 * The deployment uses mock contracts for both. V4 pool swaps are not
 * functional; only the prediction market lifecycle operates.
 *
 * Contract addresses are placeholders and will be updated after deployment.
 * Use `loadConfigFromDeployment()` to load real addresses.
 */
export const ARC_TESTNET_CONFIG: ClawlogicConfig = {
  chainId: ARC_TESTNET_CHAIN_ID,
  rpcUrl: ARC_TESTNET_RPC_URL,
  contracts: {
    agentRegistry: '0x0000000000000000000000000000000000000000',
    predictionMarketHook: '0x0000000000000000000000000000000000000000',
    poolManager: '0x0000000000000000000000000000000000000000',
    optimisticOracleV3: '0x0000000000000000000000000000000000000000',
  },
};

/**
 * Load a ClawlogicConfig from a deployments JSON file.
 *
 * The deployments JSON must conform to the DeploymentInfo interface:
 * ```json
 * {
 *   "chainId": 421614,
 *   "deployer": "0x...",
 *   "deployedAt": "2026-02-XX",
 *   "blockNumber": 0,
 *   "contracts": {
 *     "AgentRegistry": "0x...",
 *     "PredictionMarketHook": "0x...",
 *     "PoolManager": "0x..."
 *   }
 * }
 * ```
 *
 * @param deployment - The parsed deployment info object.
 * @param rpcUrl - Optional RPC URL override. Defaults based on chain ID:
 *                 - Arc testnet (5042002) -> Arc testnet RPC
 *                 - All others -> Arbitrum Sepolia public RPC
 * @returns A ClawlogicConfig ready for use with the ClawlogicClient.
 */
export function loadConfigFromDeployment(
  deployment: DeploymentInfo,
  rpcUrl?: string,
): ClawlogicConfig {
  const defaultRpc =
    deployment.chainId === ARC_TESTNET_CHAIN_ID
      ? ARC_TESTNET_RPC_URL
      : ARBITRUM_SEPOLIA_RPC_URL;

  const zero = '0x0000000000000000000000000000000000000000' as `0x${string}`;

  return {
    chainId: deployment.chainId,
    rpcUrl: rpcUrl ?? defaultRpc,
    contracts: {
      agentRegistry: deployment.contracts.AgentRegistry as `0x${string}`,
      predictionMarketHook: deployment.contracts.PredictionMarketHook as `0x${string}`,
      poolManager: deployment.contracts.PoolManager as `0x${string}`,
      optimisticOracleV3: (deployment.contracts.OptimisticOracleV3 ?? zero) as `0x${string}`,
      bondCurrency: (deployment.contracts.BondCurrency ?? zero) as `0x${string}`,
      ensRegistry: (deployment.contracts.ENSRegistry ?? zero) as `0x${string}`,
      agentIdentityRegistry: (deployment.contracts.AgentIdentityRegistry ?? zero) as `0x${string}`,
      agentValidationRegistry: (deployment.contracts.AgentValidationRegistry ?? zero) as `0x${string}`,
      agentReputationRegistry: (deployment.contracts.AgentReputationRegistry ?? zero) as `0x${string}`,
      phalaVerifier: (deployment.contracts.PhalaVerifier ?? zero) as `0x${string}`,
    },
  };
}

/**
 * Create a ClawlogicConfig from explicit contract addresses.
 *
 * @param addresses - Object with contract addresses.
 * @param chainId - Chain ID (default: Arbitrum Sepolia 421614).
 * @param rpcUrl - RPC URL (default: Arbitrum Sepolia public RPC).
 * @returns A ClawlogicConfig ready for use with the ClawlogicClient.
 */
export function createConfig(
  addresses: {
    agentRegistry: `0x${string}`;
    predictionMarketHook: `0x${string}`;
    poolManager: `0x${string}`;
    optimisticOracleV3?: `0x${string}`;
  },
  chainId = ARBITRUM_SEPOLIA_CHAIN_ID,
  rpcUrl = ARBITRUM_SEPOLIA_RPC_URL,
): ClawlogicConfig {
  return {
    chainId,
    rpcUrl,
    contracts: {
      agentRegistry: addresses.agentRegistry,
      predictionMarketHook: addresses.predictionMarketHook,
      poolManager: addresses.poolManager,
      optimisticOracleV3:
        addresses.optimisticOracleV3 ?? '0x0000000000000000000000000000000000000000',
    },
  };
}
