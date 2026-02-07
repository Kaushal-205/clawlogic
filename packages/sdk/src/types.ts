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
  /** ENS node (bytes32) if linked, or zero bytes if not */
  ensNode?: `0x${string}`;
  /** ERC-8004 agent identity token ID (if minted) */
  agentId?: bigint;
  /** Reputation score from ERC-8004 registry */
  reputationScore?: ReputationScore;
}

/**
 * Market probability derived from AMM reserve ratios.
 */
export interface MarketProbability {
  /** Outcome1 probability as a percentage (0-100) */
  outcome1Probability: number;
  /** Outcome2 probability as a percentage (0-100) */
  outcome2Probability: number;
}

/**
 * Raw AMM reserves for a market.
 */
export interface MarketReserves {
  /** Outcome1 token reserve held by the contract */
  reserve1: bigint;
  /** Outcome2 token reserve held by the contract */
  reserve2: bigint;
}

/**
 * Agent reputation score from ERC-8004 AgentReputationRegistry.
 */
export interface ReputationScore {
  /** Total number of assertions made */
  totalAssertions: bigint;
  /** Number of successful (correct) assertions */
  successfulAssertions: bigint;
  /** Total trading volume participated in (in wei) */
  totalVolume: bigint;
  /** Timestamp of last reputation update */
  lastUpdated: bigint;
}

/**
 * Global reputation score aggregated across all chains.
 */
export interface GlobalReputationScore {
  /** Agent's ERC-8004 identity token ID */
  agentId: bigint;
  /** Reputation scores per chain */
  chainScores: Map<number, ReputationScore>;
  /** Aggregated total assertions across all chains */
  totalAssertions: bigint;
  /** Aggregated successful assertions across all chains */
  successfulAssertions: bigint;
  /** Overall accuracy percentage (0-10000 basis points) */
  accuracy: bigint;
}

/**
 * Validation types for ERC-8004 AgentValidationRegistry.
 */
export enum ValidationType {
  NONE = 0,
  TEE = 1,
  STAKE = 2,
  ZKML = 3,
}

/**
 * Agent validation proof data.
 */
export interface ValidationProof {
  /** Type of validation */
  validationType: ValidationType;
  /** Validation proof bytes */
  proof: `0x${string}`;
  /** Timestamp when validation was submitted */
  timestamp: bigint;
  /** Whether the validation is verified/valid */
  valid: boolean;
}

/**
 * Options for registering an agent with ENS and TEE attestation.
 */
export interface AgentRegistrationOptions {
  /** Human-readable agent name */
  name: string;
  /** Optional ENS node (bytes32) - if provided, must be owned by caller */
  ensNode?: `0x${string}`;
  /** Optional TEE attestation for immediate verification */
  teeAttestation?: {
    /** Phala attestation quote */
    quote: `0x${string}`;
    /** Public key corresponding to the TEE */
    publicKey: `0x${string}`;
  };
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
    /** ERC-20 bond currency address */
    bondCurrency?: `0x${string}`;
    /** ENS Registry address (MockENS on testnet) */
    ensRegistry?: `0x${string}`;
    /** ERC-8004 AgentIdentityRegistry address */
    agentIdentityRegistry?: `0x${string}`;
    /** ERC-8004 AgentValidationRegistry address */
    agentValidationRegistry?: `0x${string}`;
    /** ERC-8004 AgentReputationRegistry address */
    agentReputationRegistry?: `0x${string}`;
    /** Phala zkDCAP verifier address (MockPhalaVerifier on testnet) */
    phalaVerifier?: `0x${string}`;
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
    BondCurrency?: string;
    ENSRegistry?: string;
    AgentIdentityRegistry?: string;
    AgentValidationRegistry?: string;
    AgentReputationRegistry?: string;
    PhalaVerifier?: string;
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
    | 'TokensSettled'
    | 'OutcomeTokenBought';
  marketId: `0x${string}`;
  blockNumber: bigint;
  transactionHash: `0x${string}`;
  args: Record<string, unknown>;
}

/**
 * Callback type for watching market events.
 */
export type MarketEventCallback = (event: MarketEvent) => void;
