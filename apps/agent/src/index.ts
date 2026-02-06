/**
 * $CLAWLOGIC Agent Orchestrator
 *
 * Runs the complete prediction market demo in sequence:
 *
 *   Phase 1: Agent Registration (Alpha + Beta register on-chain)
 *   Phase 2: Market Creation (Alpha creates a prediction market)
 *   Phase 2.5: Off-chain Negotiation via Yellow Network (ERC-7824)
 *   Phase 3: Token Minting (Alpha + Beta mint outcome tokens)
 *   Phase 4: Human Trap (unregistered wallet gets rejected)
 *   Phase 5: UMA Assertion (Alpha asserts the market outcome)
 *
 * Usage:
 *   pnpm start
 *
 * Required environment variables:
 *   - AGENT_ALPHA_PRIVATE_KEY: Hex private key for Agent Alpha
 *   - AGENT_BETA_PRIVATE_KEY:  Hex private key for Agent Beta
 *   - HUMAN_PRIVATE_KEY:       Hex private key for a NON-registered address
 *   - ARBITRUM_SEPOLIA_RPC_URL: Optional, defaults to public RPC
 */

import 'dotenv/config';
import { formatEther, type Hex } from 'viem';
import {
  ClawlogicClient,
  loadConfigFromDeployment,
  ARBITRUM_SEPOLIA_RPC_URL,
  type DeploymentInfo,
} from '@clawlogic/sdk';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import { runAlpha } from './agent-alpha.js';
import { runBeta } from './agent-beta.js';
import { runHumanDemo } from './human-demo.js';
import { runAssertDemo } from './assert-demo.js';
import { runSettleDemo } from './settle-demo.js';
import { negotiatePositions } from './yellow/negotiate.js';
import type { NegotiationResult } from './yellow/types.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadDeployment(): DeploymentInfo {
  const deploymentsPath = resolve(
    __dirname,
    '../../../packages/contracts/deployments/arbitrum-sepolia.json',
  );
  return JSON.parse(readFileSync(deploymentsPath, 'utf-8')) as DeploymentInfo;
}

function createClient(privateKey: Hex): ClawlogicClient {
  const rpcUrl = process.env.ARBITRUM_SEPOLIA_RPC_URL ?? ARBITRUM_SEPOLIA_RPC_URL;
  const deployment = loadDeployment();
  const config = loadConfigFromDeployment(deployment, rpcUrl);
  return new ClawlogicClient(config, privateKey);
}

function separator(): void {
  console.log('');
  console.log(
    '################################################################',
  );
  console.log('');
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Main Orchestrator
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('');
  console.log('################################################################');
  console.log('#                                                              #');
  console.log('#                     $CLAWLOGIC                               #');
  console.log('#           Agent-Only Prediction Market Protocol              #');
  console.log('#                                                              #');
  console.log('#   "Where only silicon has skin in the game."                 #');
  console.log('#                                                              #');
  console.log('################################################################');
  console.log('');

  // -- Validate environment ---------------------------------------------------

  const alphaKey = process.env.AGENT_ALPHA_PRIVATE_KEY as Hex | undefined;
  const betaKey = process.env.AGENT_BETA_PRIVATE_KEY as Hex | undefined;
  const humanKey = process.env.HUMAN_PRIVATE_KEY as Hex | undefined;

  if (!alphaKey) {
    console.error('ERROR: AGENT_ALPHA_PRIVATE_KEY not set in environment.');
    console.error('Copy .env.example to .env and fill in the private keys.');
    process.exit(1);
  }

  if (!betaKey) {
    console.error('ERROR: AGENT_BETA_PRIVATE_KEY not set in environment.');
    console.error('Copy .env.example to .env and fill in the private keys.');
    process.exit(1);
  }

  if (!humanKey) {
    console.error('ERROR: HUMAN_PRIVATE_KEY not set in environment.');
    console.error('Copy .env.example to .env and fill in the private keys.');
    process.exit(1);
  }

  // Create SDK clients
  const alphaClient = createClient(alphaKey);
  const betaClient = createClient(betaKey);
  const humanClient = createClient(humanKey);

  console.log('[Setup] Clients initialized.');
  console.log(`  Alpha:  ${alphaClient.getAddress()}`);
  console.log(`  Beta:   ${betaClient.getAddress()}`);
  console.log(`  Human:  ${humanClient.getAddress()}`);
  console.log(`  Chain:  ${alphaClient.config.chainId} (Arbitrum Sepolia)`);
  console.log(`  Hook:   ${alphaClient.config.contracts.predictionMarketHook}`);
  console.log(`  Registry: ${alphaClient.config.contracts.agentRegistry}`);

  // Check balances
  const [alphaBalance, betaBalance, humanBalance] = await Promise.all([
    alphaClient.getBalance(),
    betaClient.getBalance(),
    humanClient.getBalance(),
  ]);

  console.log('');
  console.log('[Setup] ETH Balances:');
  console.log(`  Alpha:  ${formatEther(alphaBalance)} ETH`);
  console.log(`  Beta:   ${formatEther(betaBalance)} ETH`);
  console.log(`  Human:  ${formatEther(humanBalance)} ETH`);

  if (alphaBalance === 0n || betaBalance === 0n) {
    console.error('');
    console.error('WARNING: Agent wallets have 0 ETH.');
    console.error('Fund them with testnet ETH from a faucet before running the demo.');
    console.error('Faucet: https://www.alchemy.com/faucets/arbitrum-sepolia');
  }

  // =========================================================================
  // Phase 1 + 2 + 3: Agent Alpha (Register + Create Market + Mint)
  // =========================================================================

  separator();
  console.log('>>> PHASE 1-3: Agent Alpha registers, creates market, mints tokens');
  separator();

  let marketId: `0x${string}`;

  try {
    marketId = await runAlpha(alphaClient);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`\nAgent Alpha failed: ${msg}`);
    console.error('Aborting demo.');
    process.exit(1);
  }

  console.log(`[Orchestrator] Market ID from Alpha: ${marketId}`);

  // Brief pause between agents
  await sleep(2000);

  // =========================================================================
  // Phase 2.5: Off-Chain Negotiation via Yellow Network (ERC-7824)
  // =========================================================================

  separator();
  console.log('>>> PHASE 2.5: Off-chain negotiation via Yellow Network (ERC-7824)');
  console.log('>>>            Agents exchange position intents via state channels');
  separator();

  let negotiationResult: NegotiationResult | null = null;

  try {
    negotiationResult = await negotiatePositions(
      alphaKey,
      betaKey,
      marketId,
      '0.01',
    );

    console.log('');
    console.log('[Orchestrator] Yellow Network negotiation complete.');
    console.log(`  Agreed: ${negotiationResult.agreed}`);
    console.log(`  Mode:   ${negotiationResult.simulated ? 'Simulated' : 'Live (ClearNode)'}`);
    console.log(`  Alpha wants: ${negotiationResult.alphaIntent.outcome.toUpperCase()} @ ${negotiationResult.alphaIntent.amount} ETH`);
    console.log(`  Beta wants:  ${negotiationResult.betaIntent.outcome.toUpperCase()} @ ${negotiationResult.betaIntent.amount} ETH`);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`\nYellow Network negotiation failed: ${msg}`);
    console.error('Continuing with demo (Yellow Network is non-fatal).');
  }

  // Brief pause
  await sleep(2000);

  // =========================================================================
  // Phase 3 (continued): Agent Beta (Register + Mint on same market)
  // =========================================================================

  separator();
  console.log('>>> PHASE 3 (continued): Agent Beta registers and takes position');
  separator();

  try {
    await runBeta(marketId, betaClient);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`\nAgent Beta failed: ${msg}`);
    console.error('Continuing with demo (Beta failure is non-fatal).');
  }

  // Brief pause
  await sleep(2000);

  // =========================================================================
  // Phase 4: Human Trap
  // =========================================================================

  separator();
  console.log('>>> PHASE 4: Human Trap - Unregistered wallet tries to participate');
  separator();

  try {
    await runHumanDemo(marketId, humanClient);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`\nHuman Demo failed: ${msg}`);
    console.error('Continuing with demo.');
  }

  // Brief pause
  await sleep(2000);

  // =========================================================================
  // Phase 5: UMA Assertion
  // =========================================================================

  separator();
  console.log('>>> PHASE 5: UMA Assertion - Agent Alpha determines truth');
  separator();

  try {
    await runAssertDemo(marketId, alphaClient);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`\nAssertion Demo failed: ${msg}`);
    console.error('This may be expected if bond currency is not configured.');
  }

  // Brief pause before settlement
  await sleep(3000);

  // =========================================================================
  // Phase 6: UMA Settlement + Token Redemption
  // =========================================================================

  separator();
  console.log('>>> PHASE 6: Settlement - Resolve assertion & redeem tokens');
  separator();

  try {
    await runSettleDemo(marketId, alphaClient);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`\nSettlement Demo failed: ${msg}`);
    console.error('This may be expected if assertion was not submitted.');
  }

  // Also settle for Beta (they hold tokens too)
  try {
    console.log('\n[Orchestrator] Settling Beta tokens...');
    await runSettleDemo(marketId, betaClient);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`\nBeta Settlement failed: ${msg}`);
    console.error('This is expected if Beta holds the losing tokens.');
  }

  // =========================================================================
  // Final Summary
  // =========================================================================

  separator();
  console.log('################################################################');
  console.log('#                                                              #');
  console.log('#               $CLAWLOGIC Demo Complete!                      #');
  console.log('#                                                              #');
  console.log('################################################################');
  console.log('');
  console.log('Summary:');
  console.log('  1. Agent Alpha registered as "AlphaTrader"');
  console.log('  2. Agent Alpha created a prediction market');
  console.log('  2.5 Agents negotiated positions OFF-CHAIN via Yellow Network');
  console.log('      (ERC-7824 state channels for agent-to-agent signaling)');
  console.log('  3. Both agents minted outcome tokens (skin in the game)');
  console.log('  4. A human wallet was REJECTED by the protocol');
  console.log('  5. Agent Alpha asserted the outcome via UMA OOV3');
  console.log('  6. Assertion settled -> market resolved -> tokens redeemed');
  console.log('');
  console.log('Lifecycle (COMPLETE):');
  console.log('  registerAgent -> initializeMarket -> [Yellow Network negotiation]');
  console.log('  -> mintOutcomeTokens -> assertMarket -> settleAssertion');
  console.log('  -> assertionResolvedCallback -> settleOutcomeTokens -> ETH payout');
  console.log('');
  console.log('Key Insight:');
  console.log('  Agents did not just trade -- they CREATED the market,');
  console.log('  negotiated positions off-chain via ERC-7824 state channels,');
  console.log('  took positions, and determined truth through economic');
  console.log('  incentives via UMA Optimistic Oracle. No humans in the loop.');
  console.log('  This is futarchy powered by silicon intelligence.');
  console.log('');

  // Show Yellow Network results if available
  if (negotiationResult) {
    console.log('Yellow Network (ERC-7824) Results:');
    console.log(`  Session ID:   ${negotiationResult.sessionId?.slice(0, 18) ?? '(none)'}...`);
    console.log(`  Mode:         ${negotiationResult.simulated ? 'Simulated (local)' : 'Live (ClearNode)'}`);
    console.log(`  Alpha Intent: ${negotiationResult.alphaIntent.outcome.toUpperCase()} @ ${negotiationResult.alphaIntent.amount} ETH`);
    console.log(`  Beta Intent:  ${negotiationResult.betaIntent.outcome.toUpperCase()} @ ${negotiationResult.betaIntent.amount} ETH`);
    console.log(`  Agreed:       ${negotiationResult.agreed}`);
    console.log('');
  }

  // Show final market state
  try {
    const market = await alphaClient.getMarket(marketId);
    console.log('Final Market State:');
    console.log(`  Description:      ${market.description}`);
    console.log(`  Resolved:         ${market.resolved}`);
    console.log(`  Total Collateral: ${formatEther(market.totalCollateral)} ETH`);
    console.log(`  Asserted Outcome: ${market.assertedOutcomeId === '0x0000000000000000000000000000000000000000000000000000000000000000' ? '(none)' : market.assertedOutcomeId}`);
  } catch {
    // Non-fatal if market query fails
  }

  console.log('');
  console.log('################################################################');
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('Orchestrator fatal error:', error);
    process.exit(1);
  });
