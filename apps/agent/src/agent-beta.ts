/**
 * Agent Beta - Counter-party agent for prediction market
 *
 * This agent takes the opposing position to Alpha:
 * 1. Register as an agent in AgentRegistry
 * 2. Mint tokens on an existing market (takes opposing position)
 * 3. Monitor assertions and potentially dispute
 *
 * Usage:
 *   pnpm agent:beta
 *
 * Required environment variables:
 *   - AGENT_BETA_PRIVATE_KEY: Hex private key for this agent
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

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));

const ZERO_BYTES32 =
  '0x0000000000000000000000000000000000000000000000000000000000000000' as const;

function loadDeployment(): DeploymentInfo {
  const deploymentsPath = resolve(
    __dirname,
    '../../../packages/contracts/deployments/arbitrum-sepolia.json',
  );
  return JSON.parse(readFileSync(deploymentsPath, 'utf-8')) as DeploymentInfo;
}

function createBetaClient(privateKey: Hex): ClawlogicClient {
  const rpcUrl = process.env.ARBITRUM_SEPOLIA_RPC_URL ?? ARBITRUM_SEPOLIA_RPC_URL;
  const deployment = loadDeployment();
  const config = loadConfigFromDeployment(deployment, rpcUrl);
  return new ClawlogicClient(config, privateKey);
}

// ─────────────────────────────────────────────────────────────────────────────
// Exported functions for orchestrator
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run the full Agent Beta workflow:
 * 1. Register as "BetaAnalyst" (idempotent)
 * 2. Mint outcome tokens on an existing market with 0.01 ETH
 * 3. Monitor for active assertions
 *
 * @param marketId - The market to participate in. If not provided, will find the latest
 *                   unresolved market.
 * @param client - A ClawlogicClient initialized with Beta's private key.
 *                 If not provided, will create one from AGENT_BETA_PRIVATE_KEY env var.
 */
export async function runBeta(
  marketId?: `0x${string}`,
  client?: ClawlogicClient,
): Promise<void> {
  if (!client) {
    const privateKey = process.env.AGENT_BETA_PRIVATE_KEY as Hex;
    if (!privateKey) {
      throw new Error(
        'AGENT_BETA_PRIVATE_KEY not set in environment. ' +
          'Please copy .env.example to .env and fill in your private key.',
      );
    }
    client = createBetaClient(privateKey);
  }

  const address = client.getAddress()!;

  console.log('');
  console.log('================================================================');
  console.log('  Agent Beta - $CLAWLOGIC Counter-Party Agent');
  console.log('================================================================');
  console.log(`  Address: ${address}`);
  console.log(`  Chain:   ${client.config.chainId} (Arbitrum Sepolia)`);
  console.log('================================================================');

  // Check balance
  const balance = await client.getBalance();
  console.log(`  Balance: ${formatEther(balance)} ETH`);

  // ── Phase 1: Register ────────────────────────────────────────────────────

  console.log('\n[Phase 1] Checking agent registration...');

  const isRegistered = await client.isAgent(address);

  if (isRegistered) {
    const agent = await client.getAgent(address);
    console.log(`  Already registered as "${agent.name}"`);
  } else {
    console.log('  Registering as "BetaAnalyst"...');
    try {
      const txHash = await client.registerAgent('BetaAnalyst', '0x');
      console.log(`  Registration complete. TX: ${txHash}`);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`  Registration failed: ${msg}`);
      throw error;
    }
  }

  // ── Phase 2: Find Active Market ──────────────────────────────────────────

  if (!marketId) {
    console.log('\n[Phase 2] Finding active market...');

    const marketIds = await client.getMarketIds();
    if (marketIds.length === 0) {
      console.log('  No markets found. Wait for Agent Alpha to create one.');
      return;
    }

    // Find an unresolved market (check from most recent)
    for (let i = marketIds.length - 1; i >= 0; i--) {
      const market = await client.getMarket(marketIds[i]);
      if (!market.resolved) {
        marketId = marketIds[i];
        console.log(`  Found active market: "${market.description}"`);
        console.log(`  Market ID: ${marketId}`);
        break;
      }
    }

    if (!marketId) {
      console.log('  All markets are resolved. No active trading opportunities.');
      return;
    }
  } else {
    console.log(`\n[Phase 2] Using provided market: ${marketId.slice(0, 18)}...`);
    const market = await client.getMarket(marketId);
    console.log(`  Market: "${market.description}"`);
  }

  // ── Phase 3: Mint Outcome Tokens ─────────────────────────────────────────

  console.log('\n[Phase 3] Taking position (minting outcome tokens)...');

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

  // ── Phase 3b: Buy NO tokens (contrarian bet via CPMM) ─────────────────

  console.log('\n[Phase 3b] Buying NO tokens via AMM (contrarian position)...');

  const buyAmount = parseEther('0.005');
  console.log(`  Buying NO with 0.005 ETH...`);

  try {
    const buyTxHash = await client.buyOutcomeToken(marketId, false, buyAmount);
    console.log(`  Buy TX: ${buyTxHash}`);

    const probability = await client.getMarketProbability(marketId);
    console.log(
      `  Market probability: YES=${probability.outcome1Probability.toFixed(1)}%, ` +
        `NO=${probability.outcome2Probability.toFixed(1)}%`,
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log(`  Buy skipped (no AMM liquidity): ${msg}`);
  }

  // ── Phase 4: Monitor Assertions ──────────────────────────────────────────

  console.log('\n[Phase 4] Monitoring assertions...');

  const market = await client.getMarket(marketId);

  if (market.resolved) {
    console.log('  Market already resolved.');
  } else if (market.assertedOutcomeId === ZERO_BYTES32) {
    console.log('  No active assertion. Waiting for an agent to assert...');
  } else {
    console.log('  Active assertion detected!');
    console.log(`  Asserted outcome ID: ${market.assertedOutcomeId}`);
    console.log('  If you disagree, dispute via UMA OOV3 directly.');
    console.log('  Disputing requires bonding currency (e.g., WETH).');
  }

  console.log('\n================================================================');
  console.log('  Agent Beta: Workflow complete!');
  console.log('================================================================\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Standalone execution
// ─────────────────────────────────────────────────────────────────────────────

const isDirectRun =
  process.argv[1]?.includes('agent-beta') ?? false;

if (isDirectRun) {
  runBeta()
    .then(() => {
      console.log('Done.');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Agent Beta failed:', error);
      process.exit(1);
    });
}
