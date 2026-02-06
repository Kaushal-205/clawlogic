/**
 * Information about a prediction market.
 *
 * Matches the return values from PredictionMarketHook.getMarket():
 *   (description, outcome1, outcome2, outcome1Token, outcome2Token,
 *    reward, requiredBond, resolved, assertedOutcomeId, poolId, totalCollateral)
 */
export interface MarketInfo {
  /** Unique identifier for the market (bytes32) */
  marketId: `0x${string}`;
  /** Human-readable market question / description */
  description: string;
  /** Label for outcome 1 (e.g., "yes") */
  outcome1: string;
  /** Label for outcome 2 (e.g., "no") */
  outcome2: string;
  /** Address of the outcome 1 ERC-20 token */
  outcome1Token: `0x${string}`;
  /** Address of the outcome 2 ERC-20 token */
  outcome2Token: `0x${string}`;
  /** Amount of bond currency offered as incentive to the asserter */
  reward: bigint;
  /** Minimum bond required from an asserter */
  requiredBond: bigint;
  /** Whether the market has been resolved */
  resolved: boolean;
  /** keccak256 hash of the asserted outcome string (bytes32(0) if none) */
  assertedOutcomeId: `0x${string}`;
  /** V4 pool identifier (bytes32(0) if no pool associated) */
  poolId: `0x${string}`;
  /** Total ETH collateral backing the market */
  totalCollateral: bigint;
}

/**
 * Information about a registered agent.
 *
 * Matches the Agent struct returned by AgentRegistry.getAgent():
 *   { name, attestation, registeredAt, exists }
 */
export interface AgentInfo {
  /** The agent's wallet address */
  address: `0x${string}`;
  /** Human-readable name of the agent */
  name: string;
  /** TEE attestation bytes (hex-encoded) */
  attestation: `0x${string}`;
  /** Timestamp when the agent was registered (block.timestamp) */
  registeredAt: bigint;
  /** Whether the agent is registered (exists flag) */
  exists: boolean;
}

/**
 * Configuration for the Clawlogic SDK client.
 */
export interface ClawlogicConfig {
  /** Chain ID of the target network */
  chainId: number;
  /** RPC URL for the target network */
  rpcUrl: string;
  /** Contract addresses for the protocol */
  contracts: {
    /** AgentRegistry contract address */
    agentRegistry: `0x${string}`;
    /** PredictionMarketHook contract address */
    predictionMarketHook: `0x${string}`;
    /** Uniswap v4 PoolManager contract address */
    poolManager: `0x${string}`;
    /** UMA OptimisticOracleV3 contract address */
    optimisticOracleV3: `0x${string}`;
  };
}

/**
 * Deployment info loaded from a deployments JSON file.
 */
export interface DeploymentInfo {
  chainId: number;
  deployer: string;
  deployedAt: string;
  blockNumber: number;
  contracts: {
    AgentRegistry: string;
    PredictionMarketHook: string;
    PoolManager: string;
    OptimisticOracleV3?: string;
  };
}

/**
 * Event log for market-related contract events.
 */
export interface MarketEvent {
  type:
    | 'MarketInitialized'
    | 'TokensMinted'
    | 'MarketAsserted'
    | 'MarketResolved'
    | 'AssertionFailed'
    | 'AssertionDisputed'
    | 'TokensSettled';
  marketId: `0x${string}`;
  blockNumber: bigint;
  transactionHash: `0x${string}`;
  args: Record<string, unknown>;
}

/**
 * Callback type for watching market events.
 */
export type MarketEventCallback = (event: MarketEvent) => void;
