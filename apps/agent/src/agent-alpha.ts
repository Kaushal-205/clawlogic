/**
 * Agent Alpha - Primary prediction market participant
 *
 * This agent demonstrates the CLAWLOGIC prediction market workflow:
 * 1. Register as an agent in AgentRegistry
 * 2. Create a new prediction market
 * 3. Mint outcome tokens (get YES and NO)
 *
 * Usage:
 *   pnpm agent:alpha
 *
 * Required environment variables:
 *   - AGENT_ALPHA_PRIVATE_KEY: Hex private key for this agent
 *   - ARBITRUM_SEPOLIA_RPC_URL: Optional, defaults to public RPC
 */

import 'dotenv/config';
import { parseEther, formatEther, type Hex } from 'viem';
import {
  ClawlogicClient,
  loadConfigFromDeployment,
  ARBITRUM_SEPOLIA_RPC_URL,
  type DeploymentInfo,
} from '@clawlogic/sdk';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ensureAgentOnboarding } from './onboarding.js';
import { publishAgentBroadcast } from './broadcast.js';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadDeployment(): DeploymentInfo {
  const deploymentsPath = resolve(
    __dirname,
    '../../../packages/contracts/deployments/arbitrum-sepolia.json',
  );
  return JSON.parse(readFileSync(deploymentsPath, 'utf-8')) as DeploymentInfo;
}

function createAlphaClient(privateKey: Hex): ClawlogicClient {
  const rpcUrl = process.env.ARBITRUM_SEPOLIA_RPC_URL ?? ARBITRUM_SEPOLIA_RPC_URL;
  const deployment = loadDeployment();
  const config = loadConfigFromDeployment(deployment, rpcUrl);
  return new ClawlogicClient(config, privateKey);
}

export interface AlphaDirectionalTradeOptions {
  amountEth?: string;
  sessionId?: string;
  reasoning?: string;
  confidence?: number;
  requireSessionLink?: boolean;
}

export interface RunAlphaOptions {
  skipDirectionalBuy?: boolean;
  directionalTrade?: AlphaDirectionalTradeOptions;
  forceNewMarket?: boolean;
  initialMarketLiquidityEth?: string;
}

export async function executeAlphaDirectionalTrade(
  client: ClawlogicClient,
  marketId: `0x${string}`,
  options: AlphaDirectionalTradeOptions = {},
): Promise<`0x${string}` | null> {
  const address = client.getAddress();
  if (!address) {
    throw new Error('Alpha directional trade requires wallet-backed client.');
  }

  const ensName = process.env.AGENT_ALPHA_ENS_NAME;
  const ensNode = process.env.AGENT_ALPHA_ENS_NODE as Hex | undefined;
  const amountEth = options.amountEth ?? '0.005';
  const buyAmount = parseEther(amountEth);
  const sessionId = options.sessionId ?? process.env.NEGOTIATION_SESSION_ID;
  const requireSessionLink = options.requireSessionLink ?? false;

  if (requireSessionLink && !sessionId) {
    throw new Error('Alpha trade requires a negotiation session link, but sessionId is missing.');
  }

  console.log('\n[Phase 4] Buying YES tokens via AMM...');
  console.log(`  Buying YES with ${amountEth} ETH...`);

  try {
    const buyTxHash = await client.buyOutcomeToken(marketId, true, buyAmount);
    console.log(`  Buy TX: ${buyTxHash}`);

    try {
      await publishAgentBroadcast({
        type: 'TradeRationale',
        agent: 'AlphaTrader',
        agentAddress: address,
        ensName,
        ensNode,
        marketId,
        sessionId,
        side: 'yes',
        stakeEth: amountEth,
        tradeTxHash: buyTxHash,
        confidence: options.confidence ?? 74,
        reasoning:
          options.reasoning ??
          'I am increasing YES exposure because post-mint probability remains below my internal fair value estimate.',
      });
    } catch (error: unknown) {
      if (requireSessionLink) {
        throw error;
      }
    }

    const probability = await client.getMarketProbability(marketId);
    console.log(
      `  Market probability: YES=${probability.outcome1Probability.toFixed(1)}%, ` +
        `NO=${probability.outcome2Probability.toFixed(1)}%`,
    );
    return buyTxHash;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log(`  Buy skipped (no AMM liquidity): ${msg}`);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Exported functions for orchestrator
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run the full Agent Alpha workflow:
 * 1. Register as "AlphaTrader" (idempotent)
 * 2. Create a prediction market
 * 3. Mint outcome tokens with 0.01 ETH
 *
 * @param client - A ClawlogicClient initialized with Alpha's private key.
 *                 If not provided, will create one from AGENT_ALPHA_PRIVATE_KEY env var.
 * @returns The marketId of the created (or existing) market.
 */
export async function runAlpha(
  client?: ClawlogicClient,
  options: RunAlphaOptions = {},
): Promise<`0x${string}`> {
  if (!client) {
    const privateKey = process.env.AGENT_ALPHA_PRIVATE_KEY as Hex;
    if (!privateKey) {
      throw new Error(
        'AGENT_ALPHA_PRIVATE_KEY not set in environment. ' +
          'Please copy .env.example to .env and fill in your private key.',
      );
    }
    client = createAlphaClient(privateKey);
  }

  const address = client.getAddress()!;
  const ensName = process.env.AGENT_ALPHA_ENS_NAME;
  const ensNode = process.env.AGENT_ALPHA_ENS_NODE as Hex | undefined;

  console.log('');
  console.log('================================================================');
  console.log('  Agent Alpha - CLAWLOGIC Prediction Market Agent');
  console.log('================================================================');
  console.log(`  Address: ${address}`);
  console.log(`  Chain:   ${client.config.chainId} (Arbitrum Sepolia)`);
  console.log('================================================================');

  // Check balance
  const balance = await client.getBalance();
  console.log(`  Balance: ${formatEther(balance)} ETH`);

  // ── Phase 1: Register ────────────────────────────────────────────────────

  console.log('\n[Phase 1] Checking agent registration...');
  try {
    const onboarding = await ensureAgentOnboarding(client, {
      name: 'AlphaTrader',
      attestation: '0x',
      ensName: process.env.AGENT_ALPHA_ENS_NAME,
      ensNode: process.env.AGENT_ALPHA_ENS_NODE as Hex | undefined,
      identityMetadataUri: process.env.AGENT_ALPHA_IDENTITY_METADATA_URI,
    });

    if (onboarding.alreadyRegistered) {
      const agent = await client.getAgent(address);
      console.log(`  Already registered as "${agent.name}"`);
    } else {
      console.log(`  Registration complete. TX: ${onboarding.registrationTxHash}`);
      console.log(`  Method: ${onboarding.registrationMethod}`);
    }

    if (onboarding.identityAgentId) {
      const suffix = onboarding.identityMinted ? ' (minted in this run)' : '';
      console.log(`  ERC-8004 ID: ${onboarding.identityAgentId}${suffix}`);
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`  Registration failed: ${msg}`);
    throw error;
  }

  // ── Phase 2: Create Market ───────────────────────────────────────────────

  console.log('\n[Phase 2] Creating prediction market...');

  // Check if there are already markets
  const existingMarkets = await client.getMarketIds();
  let marketId: `0x${string}`;
  let createdNewMarket = false;
  const forceNewMarket =
    options.forceNewMarket ?? process.env.FORCE_NEW_MARKET === 'true';
  const initialMarketLiquidityEth =
    options.initialMarketLiquidityEth ??
    process.env.INITIAL_MARKET_LIQUIDITY_ETH ??
    (forceNewMarket ? '0.01' : '0');
  const initialMarketLiquidity = parseEther(initialMarketLiquidityEth);

  if (!forceNewMarket && existingMarkets.length > 0) {
    console.log(`  Found ${existingMarkets.length} existing market(s)`);
    const latestMarket = await client.getMarket(
      existingMarkets[existingMarkets.length - 1],
    );
    console.log(`  Using existing market: "${latestMarket.description}"`);
    marketId = existingMarkets[existingMarkets.length - 1];
  } else {
    if (forceNewMarket && existingMarkets.length > 0) {
      console.log('  FORCE_NEW_MARKET enabled -- creating a fresh market.');
    }
    const description = 'Will ETH break $4000 this week?';
    console.log(`  Creating market: "${description}"`);

    try {
      const txHash = await client.initializeMarket(
        'yes', // outcome1
        'no', // outcome2
        description,
        0n, // reward (0 for simplicity with mock UMA)
        0n, // requiredBond (0 for simplicity with mock UMA)
        initialMarketLiquidity,
      );
      console.log(`  Market creation TX: ${txHash}`);
      if (initialMarketLiquidity > 0n) {
        console.log(
          `  Seeded initial AMM liquidity: ${initialMarketLiquidityEth} ETH`,
        );
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`  Market creation failed: ${msg}`);
      throw error;
    }

    // Get the new market ID
    const markets = await client.getMarketIds();
    marketId = markets[markets.length - 1];
    console.log(`  Market ID: ${marketId}`);
    createdNewMarket = true;
  }

  try {
    await publishAgentBroadcast({
      type: 'MarketBroadcast',
      agent: 'AlphaTrader',
      agentAddress: address,
      ensName,
      ensNode,
      marketId,
      side: 'yes',
      stakeEth: '0.01',
      confidence: 72,
      reasoning: createdNewMarket
        ? 'Macro + on-chain momentum favor an upside breakout, so I am broadcasting this market with initial capital.'
        : 'This market still has unresolved price discovery and enough uncertainty for a directional position.',
    });
  } catch {
    // Non-fatal: on-chain execution should continue if file broadcast fails.
  }

  // ── Phase 3: Mint Outcome Tokens ─────────────────────────────────────────

  console.log('\n[Phase 3] Minting outcome tokens...');

  const positionBefore = await client.getPositions(marketId, address);
  console.log(
    `  Current position: YES=${formatEther(positionBefore.outcome1Balance)}, ` +
      `NO=${formatEther(positionBefore.outcome2Balance)}`,
  );

  const mintAmount = parseEther('0.01');
  console.log(`  Minting with 0.01 ETH...`);

  try {
    const txHash = await client.mintOutcomeTokens(marketId, mintAmount);
    console.log(`  Mint TX: ${txHash}`);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`  Minting failed: ${msg}`);
    throw error;
  }

  const positionAfter = await client.getPositions(marketId, address);
  console.log(
    `  New position: YES=${formatEther(positionAfter.outcome1Balance)}, ` +
      `NO=${formatEther(positionAfter.outcome2Balance)}`,
  );

  // ── Phase 4: Buy YES tokens (directional bet via CPMM) ────────────────
  if (!options.skipDirectionalBuy) {
    await executeAlphaDirectionalTrade(
      client,
      marketId,
      options.directionalTrade,
    );
  } else {
    console.log('\n[Phase 4] Directional buy skipped by orchestration plan.');
  }

  console.log('\n================================================================');
  console.log('  Agent Alpha: Phases 1-4 complete!');
  console.log(`  Market ID: ${marketId}`);
  console.log('================================================================\n');

  return marketId;
}

// ─────────────────────────────────────────────────────────────────────────────
// Standalone execution
// ─────────────────────────────────────────────────────────────────────────────

const isDirectRun =
  process.argv[1]?.includes('agent-alpha') ?? false;

if (isDirectRun) {
  runAlpha()
    .then((marketId) => {
      console.log(`Done. Market ID: ${marketId}`);
      process.exit(0);
    })
    .catch((error) => {
      console.error('Agent Alpha failed:', error);
      process.exit(1);
    });
}
