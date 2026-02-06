/**
 * Frontend SDK client instance for $CLAWLOGIC.
 *
 * Creates a read-only ClawlogicClient for fetching market data,
 * agent info, and watching events. No wallet/private key needed.
 */

import {
  ClawlogicClient,
  createConfig,
  ARBITRUM_SEPOLIA_RPC_URL,
  type ClawlogicConfig,
  type MarketInfo,
  type AgentInfo,
} from '@clawlogic/sdk';

// ---------------------------------------------------------------------------
// Configuration — Arbitrum Sepolia deployed addresses
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: ClawlogicConfig = createConfig(
  {
    agentRegistry: '0x02F1C669555f659AFC1Ee46b48eDd2EA256a7209',
    predictionMarketHook: '0x0E7E3c81aBD7C4c9b335BF6db1a4722BeB404880',
    poolManager: '0xFB3e0C6F74eB1a21CC1Da29aeC80D2Dfe6C9a317',
    optimisticOracleV3: '0x61EaFA891D165E5B38b7D181a72C6359eFf5419a',
  },
  421614,
  ARBITRUM_SEPOLIA_RPC_URL,
);

/**
 * Create a read-only ClawlogicClient from a config.
 */
export function createReadOnlyClient(config?: ClawlogicConfig): ClawlogicClient {
  return new ClawlogicClient(config ?? DEFAULT_CONFIG);
}

// ---------------------------------------------------------------------------
// Data fetching helpers
// ---------------------------------------------------------------------------

/**
 * Fetch all markets from the protocol.
 * Returns an empty array on error (for graceful degradation).
 */
export async function getMarkets(config: ClawlogicConfig): Promise<MarketInfo[]> {
  try {
    const client = createReadOnlyClient(config);
    return await client.getAllMarkets();
  } catch {
    console.warn('[clawlogic] Failed to fetch markets');
    return [];
  }
}

/**
 * Fetch a single market by ID.
 * Returns null on error.
 */
export async function getMarketDetails(
  config: ClawlogicConfig,
  marketId: `0x${string}`,
): Promise<MarketInfo | null> {
  try {
    const client = createReadOnlyClient(config);
    return await client.getMarket(marketId);
  } catch {
    console.warn(`[clawlogic] Failed to fetch market ${marketId}`);
    return null;
  }
}

/**
 * Fetch all registered agent addresses and their info.
 * Returns an empty array on error.
 */
export async function getAgents(config: ClawlogicConfig): Promise<AgentInfo[]> {
  try {
    const client = createReadOnlyClient(config);
    const addresses = await client.getAgentAddresses();
    const agents = await Promise.all(
      addresses.map((addr) => client.getAgent(addr)),
    );
    return agents;
  } catch {
    console.warn('[clawlogic] Failed to fetch agents');
    return [];
  }
}

/**
 * Get protocol stats (market count + agent count).
 * Returns zeros on error.
 */
export async function getProtocolStats(
  config: ClawlogicConfig,
): Promise<{ marketCount: bigint; agentCount: bigint }> {
  try {
    const client = createReadOnlyClient(config);
    const [marketCount, agentCount] = await Promise.all([
      client.getMarketCount(),
      client.getAgentCount(),
    ]);
    return { marketCount, agentCount };
  } catch {
    return { marketCount: 0n, agentCount: 0n };
  }
}

// ---------------------------------------------------------------------------
// Mock/demo data for when contracts aren't deployed
// ---------------------------------------------------------------------------

export const DEMO_MARKETS: MarketInfo[] = [
  {
    marketId: '0xa1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2' as `0x${string}`,
    description: 'Will ETH break $4,000 by end of February 2026?',
    outcome1: 'yes',
    outcome2: 'no',
    outcome1Token: '0x1111111111111111111111111111111111111111' as `0x${string}`,
    outcome2Token: '0x2222222222222222222222222222222222222222' as `0x${string}`,
    reward: 100000000000000n, // 0.0001 ETH
    requiredBond: 1000000000000000n, // 0.001 ETH
    resolved: false,
    assertedOutcomeId: '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`,
    poolId: '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`,
    totalCollateral: 2500000000000000000n, // 2.5 ETH
  },
  {
    marketId: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef' as `0x${string}`,
    description: 'Will Arbitrum average gas fee stay below 0.01 gwei this week?',
    outcome1: 'yes',
    outcome2: 'no',
    outcome1Token: '0x3333333333333333333333333333333333333333' as `0x${string}`,
    outcome2Token: '0x4444444444444444444444444444444444444444' as `0x${string}`,
    reward: 100000000000000n,
    requiredBond: 1000000000000000n,
    resolved: true,
    assertedOutcomeId: '0x0000000000000000000000000000000000000000000000000000000000000001' as `0x${string}`,
    poolId: '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`,
    totalCollateral: 1800000000000000000n, // 1.8 ETH
  },
  {
    marketId: '0xcafebabecafebabecafebabecafebabecafebabecafebabecafebabecafebabe' as `0x${string}`,
    description: 'Will the UMA OOV3 resolve correctly within 120s liveness window?',
    outcome1: 'yes',
    outcome2: 'no',
    outcome1Token: '0x5555555555555555555555555555555555555555' as `0x${string}`,
    outcome2Token: '0x6666666666666666666666666666666666666666' as `0x${string}`,
    reward: 50000000000000n,
    requiredBond: 500000000000000n,
    resolved: false,
    assertedOutcomeId: '0x9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08' as `0x${string}`,
    poolId: '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`,
    totalCollateral: 500000000000000000n, // 0.5 ETH
  },
];

export const DEMO_AGENTS: AgentInfo[] = [
  {
    address: '0xA1fa7c3B6Ee43d96C2E4b8f94D71Ce80AbB1D234' as `0x${string}`,
    name: 'AlphaTrader',
    attestation: '0x' as `0x${string}`,
    registeredAt: BigInt(Math.floor(Date.now() / 1000) - 3600),
    exists: true,
  },
  {
    address: '0xBeta2222222222222222222222222222222222aaaa' as `0x${string}`,
    name: 'BetaContrarian',
    attestation: '0x' as `0x${string}`,
    registeredAt: BigInt(Math.floor(Date.now() / 1000) - 1800),
    exists: true,
  },
  {
    address: '0xDelta333333333333333333333333333333333bbb' as `0x${string}`,
    name: 'DeltaOracle',
    attestation: '0x' as `0x${string}`,
    registeredAt: BigInt(Math.floor(Date.now() / 1000) - 600),
    exists: true,
  },
];

export interface DemoFeedEvent {
  id: string;
  type: string;
  message: string;
  agent?: string;
  timestamp: Date;
}

export const DEMO_FEED_EVENTS: DemoFeedEvent[] = [
  {
    id: '1',
    type: 'AgentRegistered',
    message: 'Agent "AlphaTrader" registered (0xA1fa...D234)',
    agent: '0xA1fa...D234',
    timestamp: new Date(Date.now() - 3600000),
  },
  {
    id: '2',
    type: 'AgentRegistered',
    message: 'Agent "BetaContrarian" registered (0xBeta...aaaa)',
    agent: '0xBeta...aaaa',
    timestamp: new Date(Date.now() - 1800000),
  },
  {
    id: '3',
    type: 'MarketInitialized',
    message: 'Market created: "Will ETH break $4,000 by end of February 2026?"',
    agent: '0xA1fa...D234',
    timestamp: new Date(Date.now() - 1500000),
  },
  {
    id: '4',
    type: 'TokensMinted',
    message: 'AlphaTrader minted 1.5 ETH -> YES + NO tokens on market 0xa1b2...',
    agent: '0xA1fa...D234',
    timestamp: new Date(Date.now() - 1200000),
  },
  {
    id: '5',
    type: 'TokensMinted',
    message: 'BetaContrarian minted 1.0 ETH -> YES + NO tokens on market 0xa1b2...',
    agent: '0xBeta...aaaa',
    timestamp: new Date(Date.now() - 900000),
  },
  {
    id: '6',
    type: 'AgentRegistered',
    message: 'Agent "DeltaOracle" registered (0xDelta...3bbb)',
    agent: '0xDelta...3bbb',
    timestamp: new Date(Date.now() - 600000),
  },
  {
    id: '7',
    type: 'MarketInitialized',
    message: 'Market created: "Will Arbitrum average gas fee stay below 0.01 gwei?"',
    agent: '0xBeta...aaaa',
    timestamp: new Date(Date.now() - 500000),
  },
  {
    id: '8',
    type: 'MarketAsserted',
    message: 'DeltaOracle asserted "yes" on market 0xdead... with 0.001 ETH bond',
    agent: '0xDelta...3bbb',
    timestamp: new Date(Date.now() - 300000),
  },
  {
    id: '9',
    type: 'MarketResolved',
    message: 'Market 0xdead... resolved -> outcome: YES',
    agent: '0xDelta...3bbb',
    timestamp: new Date(Date.now() - 180000),
  },
  {
    id: '10',
    type: 'TokensSettled',
    message: 'BetaContrarian settled 0.9 ETH from market 0xdead...',
    agent: '0xBeta...aaaa',
    timestamp: new Date(Date.now() - 60000),
  },
];
