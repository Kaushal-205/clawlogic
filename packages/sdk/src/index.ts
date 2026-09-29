// ─────────────────────────────────────────────────────────────────────────────
// @clawlogic/sdk - Public API
// ─────────────────────────────────────────────────────────────────────────────

// Main client
export { ClawlogicClient } from './client.js';
export {
  bridge,
  bridgeQuote,
  bridgeStatus,
  bridgeExecute,
} from './bridge.js';
export type {
  LiFiQuoteRequest,
  LiFiQuoteResponse,
  LiFiStatusRequest,
  LiFiStatusResponse,
  LiFiExecuteRequest,
  LiFiExecuteResult,
} from './bridge.js';

// Phase 1: Identity & Trust infrastructure
export { IdentityClient } from './identity.js';
export type { IdentityContracts } from './identity.js';

// Duplicate-market helpers
export {
  computeMarketKey,
  normalizeForKey,
  questionSimilarity,
  findSimilarMarkets,
} from './market-dedupe.js';
export type { SimilarMarket } from './market-dedupe.js';

// Type definitions
export type {
  MarketDetails,
  CreateMarketParams,
  TradeQuote,
  FeeConfig,
  AssertionInfo,
  MarketInfo,
  AgentInfo,
  ClawlogicConfig,
  DeploymentInfo,
  MarketEvent,
  MarketEventCallback,
  MarketProbability,
  MarketReserves,
  ReputationScore,
  GlobalReputationScore,
  ValidationProof,
  AgentRegistrationOptions,
} from './types.js';
export { ValidationType } from './types.js';

// Configuration helpers
export {
  ARBITRUM_ONE_CONFIG,
  ARBITRUM_ONE_CHAIN_ID,
  ARBITRUM_ONE_RPC_URL,
  ARBITRUM_ONE_HOOK_DEPLOY_BLOCK,
  ARBITRUM_ONE_WETH,
  ARC_TESTNET_CONFIG,
  ARC_TESTNET_CHAIN_ID,
  ARC_TESTNET_RPC_URL,
  ARC_TESTNET_EXPLORER_URL,
  loadConfigFromDeployment,
  createConfig,
} from './config.js';

// ABIs (for advanced usage / direct contract interaction)
export { agentRegistryAbi } from './abis/agentRegistryAbi.js';
export { predictionMarketHookAbi } from './abis/predictionMarketHookAbi.js';
export { outcomeTokenAbi } from './abis/outcomeTokenAbi.js';
export { optimisticOracleV3Abi } from './abis/optimisticOracleV3Abi.js';

// Phase 1: Identity ABIs
export { agentIdentityRegistryAbi } from './abis/agentIdentityRegistryAbi.js';
export { agentReputationRegistryAbi } from './abis/agentReputationRegistryAbi.js';
export { agentValidationRegistryAbi } from './abis/agentValidationRegistryAbi.js';
