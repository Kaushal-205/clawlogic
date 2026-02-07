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
import { formatEther, parseEther, type Hex } from 'viem';
import {
  ClawlogicClient,
  loadConfigFromDeployment,
  ARBITRUM_SEPOLIA_RPC_URL,
  type DeploymentInfo,
} from '@clawlogic/sdk';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import { runAlpha, executeAlphaDirectionalTrade } from './agent-alpha.js';
import { runBeta, executeBetaDirectionalTrade } from './agent-beta.js';
import { runHumanDemo } from './human-demo.js';
import { runAssertDemo } from './assert-demo.js';
import { runSettleDemo } from './settle-demo.js';
import { negotiatePositions } from './yellow/negotiate.js';
import {
  DEFAULT_YELLOW_CONFIG,
  type NegotiationResult,
} from './yellow/types.js';
import {
  bridgeExecute,
  getBestBridgeQuoteToArbitrumSepolia,
  suggestBridgeRoutesToArbitrumSepolia,
} from './lifi-bridge.js';
import { publishAgentBroadcast } from './broadcast.js';
import {
  buildExecutionPlanFromIntents,
  type ClobExecutionPlan,
} from './clob-matcher.js';

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

const CHAIN_NAME: Record<string, string> = {
  '11155111': 'Ethereum Sepolia',
  '11155420': 'Optimism Sepolia',
  '421614': 'Arbitrum Sepolia',
};

interface ExecutionModeFlags {
  strictMode: boolean;
  yellowLive: boolean;
  lifiLive: boolean;
  clobMatch: boolean;
  onchainSettlement: boolean;
}

function boolEnv(name: string, defaultValue: boolean): boolean {
  const value = process.env[name];
  if (value === undefined) {
    return defaultValue;
  }
  return value === 'true' || value === '1';
}

function loadExecutionModeFlags(): ExecutionModeFlags {
  const strictMode = boolEnv('STRICT_DEMO_MODE', false);
  return {
    strictMode,
    yellowLive: boolEnv('YELLOW_LIVE', strictMode),
    lifiLive: boolEnv('LIFI_LIVE', false),
    clobMatch: boolEnv('CLOB_MATCH', false),
    onchainSettlement: boolEnv('ONCHAIN_SETTLEMENT', true),
  };
}

async function waitForDestinationFunding(
  label: string,
  client: ClawlogicClient,
  requiredBalance: bigint,
  maxChecks: number = 10,
  intervalMs: number = 15000,
): Promise<bigint> {
  let balance = await client.getBalance();
  if (balance >= requiredBalance) {
    return balance;
  }

  for (let attempt = 1; attempt <= maxChecks; attempt++) {
    await sleep(intervalMs);
    balance = await client.getBalance();
    console.log(
      `  [Li.Fi] ${label}: post-bridge balance check ${attempt}/${maxChecks}: ${formatEther(balance)} ETH`,
    );
    if (balance >= requiredBalance) {
      return balance;
    }
  }

  return balance;
}

async function runLiFiFundingPreflight(
  label: string,
  client: ClawlogicClient,
  requiredBalance: bigint,
  privateKey: Hex | undefined,
  mode: ExecutionModeFlags,
): Promise<bigint> {
  const address = client.getAddress();
  if (!address) {
    throw new Error(`${label} wallet address is unavailable for funding preflight.`);
  }
  const currentBalance = await client.getBalance();
  if (currentBalance >= requiredBalance) {
    console.log(`  [Li.Fi] ${label}: balance OK (${formatEther(currentBalance)} ETH)`);
    return currentBalance;
  }

  const deficit = requiredBalance - currentBalance;
  console.log(
    `  [Li.Fi] ${label}: deficit ${formatEther(deficit)} ETH on Arbitrum Sepolia. Fetching bridge routes...`,
  );

  try {
    const routes = await suggestBridgeRoutesToArbitrumSepolia(address, deficit);
    if (routes.length === 0) {
      console.log('  [Li.Fi] No eligible bridge route found (testnet liquidity/API limits).');
      if (mode.strictMode) {
        throw new Error(
          `${label} funding failed in strict mode: no LI.FI route available for deficit ${formatEther(deficit)} ETH.`,
        );
      }
      return currentBalance;
    }

    for (const [index, route] of routes.slice(0, 2).entries()) {
      const fromName = CHAIN_NAME[route.fromChain] ?? route.fromChain;
      const toName = CHAIN_NAME[route.toChain] ?? route.toChain;
      console.log(
        `  [Li.Fi] Route ${index + 1}: ${fromName} -> ${toName} via ${route.tool} | est ${formatEther(route.estimatedToAmount)} ETH | ~${route.executionDurationSec}s | gas $${route.gasCostUsd}`,
      );
    }

    if (!mode.lifiLive) {
      console.log(
        '  [Li.Fi] Live bridge execution is disabled (`LIFI_LIVE=false`). Using quote-only mode.',
      );
      return currentBalance;
    }
    if (!privateKey) {
      throw new Error(
        `${label} funding cannot execute live bridge: missing private key for source transaction signing.`,
      );
    }

    const quote = await getBestBridgeQuoteToArbitrumSepolia(address, deficit);
    if (!quote) {
      throw new Error(`${label} funding failed: unable to fetch executable LI.FI quote.`);
    }

    const execution = await bridgeExecute(quote, privateKey, {
      dryRun: false,
      persist: true,
      pollStatus: true,
      maxStatusChecks: Number(process.env.LIFI_MAX_STATUS_CHECKS ?? '20'),
      statusIntervalMs: Number(process.env.LIFI_STATUS_INTERVAL_MS ?? '15000'),
    });
    console.log(
      `  [Li.Fi] ${label}: source tx ${execution.txHash ?? '(none)'} status ${execution.status}`,
    );

    if (execution.status === 'failed') {
      throw new Error(`${label} bridge failed before destination funding confirmation.`);
    }

    const finalBalance = await waitForDestinationFunding(
      label,
      client,
      requiredBalance,
      Number(process.env.LIFI_BALANCE_CHECKS ?? '10'),
      Number(process.env.LIFI_BALANCE_CHECK_INTERVAL_MS ?? '15000'),
    );
    if (finalBalance < requiredBalance) {
      const remainingDeficit = requiredBalance - finalBalance;
      throw new Error(
        `${label} destination funding still insufficient after bridge: remaining deficit ${formatEther(remainingDeficit)} ETH.`,
      );
    }

    console.log(`  [Li.Fi] ${label}: funding gate satisfied (${formatEther(finalBalance)} ETH).`);
    return finalBalance;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log(`  [Li.Fi] Preflight skipped: ${msg}`);
    if (mode.strictMode || mode.lifiLive) {
      throw error;
    }
    return currentBalance;
  }
}

function defaultExecutionPlan(): ClobExecutionPlan {
  return {
    mode: 'cpmm_fallback',
    matched: false,
    reason: 'default CPMM execution (CLOB disabled or no negotiation result)',
    yesAmountEth: '0.005',
    noAmountEth: '0.005',
  };
}

function enforceIntentTradeInvariants(
  negotiationResult: NegotiationResult | null,
  alphaTradeTxHash: `0x${string}` | null,
  betaTradeTxHash: `0x${string}` | null,
  mode: ExecutionModeFlags,
): void {
  const strictLinkRequired = mode.strictMode || mode.yellowLive;
  if (!strictLinkRequired) {
    return;
  }
  if (!negotiationResult) {
    throw new Error('Strict mode requires a completed negotiation result.');
  }
  if (!negotiationResult.sessionId) {
    throw new Error('Strict mode requires negotiation sessionId for trade linkage.');
  }
  if (negotiationResult.alphaIntent.outcome !== 'yes') {
    throw new Error(
      `Alpha intent outcome mismatch: expected YES, got ${negotiationResult.alphaIntent.outcome}.`,
    );
  }
  if (negotiationResult.betaIntent.outcome !== 'no') {
    throw new Error(
      `Beta intent outcome mismatch: expected NO, got ${negotiationResult.betaIntent.outcome}.`,
    );
  }
  if (!alphaTradeTxHash) {
    throw new Error(
      'Strict mode invariant failed: Alpha intent did not produce a linked trade tx hash.',
    );
  }
  if (!betaTradeTxHash) {
    throw new Error(
      'Strict mode invariant failed: Beta intent did not produce a linked trade tx hash.',
    );
  }
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

  const executionMode = loadExecutionModeFlags();
  console.log('[Setup] Execution mode flags:');
  console.log(`  strict_mode:        ${executionMode.strictMode}`);
  console.log(`  yellow_live:        ${executionMode.yellowLive}`);
  console.log(`  lifi_live:          ${executionMode.lifiLive}`);
  console.log(`  clob_match:         ${executionMode.clobMatch}`);
  console.log(`  onchain_settlement: ${executionMode.onchainSettlement}`);

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

  const alphaMin = parseEther('0.03');
  const betaMin = parseEther('0.03');
  const humanMin = parseEther('0.01');
  let alphaReadyBalance = alphaBalance;
  let betaReadyBalance = betaBalance;
  let humanReadyBalance = humanBalance;

  if (process.env.ENABLE_LIFI_PREFLIGHT !== 'false') {
    console.log('');
    console.log('[Setup] Li.Fi Funding Preflight:');

    alphaReadyBalance = await runLiFiFundingPreflight(
      'Alpha',
      alphaClient,
      alphaMin,
      alphaKey,
      executionMode,
    );
    betaReadyBalance = await runLiFiFundingPreflight(
      'Beta',
      betaClient,
      betaMin,
      betaKey,
      executionMode,
    );
    humanReadyBalance = await runLiFiFundingPreflight(
      'Human',
      humanClient,
      humanMin,
      humanKey,
      executionMode,
    );
  }

  if (alphaReadyBalance === 0n || betaReadyBalance === 0n) {
    console.error('');
    console.error('WARNING: Agent wallets have 0 ETH.');
    console.error('Fund them with testnet ETH from a faucet before running the demo.');
    console.error('Faucet: https://www.alchemy.com/faucets/arbitrum-sepolia');
  }

  const enforceFundingGate = process.env.DISABLE_FUNDING_GATE !== 'true';
  if (enforceFundingGate) {
    if (alphaReadyBalance < alphaMin) {
      throw new Error(
        `Funding gate blocked Alpha actions: have ${formatEther(alphaReadyBalance)} ETH, require ${formatEther(alphaMin)} ETH.`,
      );
    }
    if (betaReadyBalance < betaMin) {
      throw new Error(
        `Funding gate blocked Beta actions: have ${formatEther(betaReadyBalance)} ETH, require ${formatEther(betaMin)} ETH.`,
      );
    }
    if (humanReadyBalance < humanMin) {
      console.log(
        `  [Li.Fi] Human funding below target (${formatEther(humanReadyBalance)} ETH). Human trap may fail due to insufficient gas.`,
      );
    }
  }

  // =========================================================================
  // Phase 1 + 2 + 3: Agent Alpha (Register + Create Market + Mint)
  // =========================================================================

  separator();
  console.log('>>> PHASE 1-3: Agent Alpha registers, creates market, mints tokens');
  separator();

  let marketId: `0x${string}`;

  try {
    marketId = await runAlpha(alphaClient, {
      skipDirectionalBuy: true,
    });
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
      {
        ...DEFAULT_YELLOW_CONFIG,
        enableSimulationFallback: !executionMode.yellowLive,
      },
    );

    if (executionMode.yellowLive && negotiationResult.simulated) {
      throw new Error(
        'Yellow live mode is enabled, but negotiation ran in simulation mode.',
      );
    }

    console.log('');
    console.log('[Orchestrator] Yellow Network negotiation complete.');
    console.log(`  Agreed: ${negotiationResult.agreed}`);
    console.log(`  Mode:   ${negotiationResult.simulated ? 'Simulated' : 'Live (ClearNode)'}`);
    console.log(`  Alpha wants: ${negotiationResult.alphaIntent.outcome.toUpperCase()} @ ${negotiationResult.alphaIntent.amount} ETH`);
    console.log(`  Beta wants:  ${negotiationResult.betaIntent.outcome.toUpperCase()} @ ${negotiationResult.betaIntent.amount} ETH`);
    console.log(`  Alpha reason: ${negotiationResult.alphaIntent.reasoning}`);
    console.log(`  Beta reason:  ${negotiationResult.betaIntent.reasoning}`);
    if (negotiationResult.transcriptPath) {
      console.log(`  Transcript: ${negotiationResult.transcriptPath}`);
    }

    await Promise.all([
      publishAgentBroadcast({
        type: 'NegotiationIntent',
        agent: 'AlphaTrader',
        agentAddress: negotiationResult.alphaIntent.agent,
        ensName: process.env.AGENT_ALPHA_ENS_NAME,
        ensNode: process.env.AGENT_ALPHA_ENS_NODE as Hex | undefined,
        marketId,
        sessionId: negotiationResult.sessionId,
        side: negotiationResult.alphaIntent.outcome,
        stakeEth: negotiationResult.alphaIntent.amount,
        intentHash: negotiationResult.alphaIntent.intentHash,
        intentSignature: negotiationResult.alphaIntent.signature,
        confidence: negotiationResult.alphaIntent.confidenceBps / 100,
        reasoning: negotiationResult.alphaIntent.reasoning,
      }),
      publishAgentBroadcast({
        type: 'NegotiationIntent',
        agent: 'BetaAnalyst',
        agentAddress: negotiationResult.betaIntent.agent,
        ensName: process.env.AGENT_BETA_ENS_NAME,
        ensNode: process.env.AGENT_BETA_ENS_NODE as Hex | undefined,
        marketId,
        sessionId: negotiationResult.sessionId,
        side: negotiationResult.betaIntent.outcome,
        stakeEth: negotiationResult.betaIntent.amount,
        intentHash: negotiationResult.betaIntent.intentHash,
        intentSignature: negotiationResult.betaIntent.signature,
        confidence: negotiationResult.betaIntent.confidenceBps / 100,
        reasoning: negotiationResult.betaIntent.reasoning,
      }),
    ]).catch(() => undefined);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`\nYellow Network negotiation failed: ${msg}`);
    if (executionMode.strictMode || executionMode.yellowLive) {
      throw error;
    }
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
    await runBeta(marketId, betaClient, {
      skipDirectionalBuy: true,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`\nAgent Beta failed: ${msg}`);
    console.error('Continuing with demo (Beta failure is non-fatal).');
  }

  // Brief pause
  await sleep(2000);

  // =========================================================================
  // Phase 3.5: Hybrid Trade Execution (CLOB match -> on-chain settlement rail)
  // =========================================================================

  separator();
  console.log('>>> PHASE 3.5: Hybrid execution (CLOB match with CPMM fallback)');
  separator();

  let executionPlan = defaultExecutionPlan();
  if (negotiationResult && executionMode.clobMatch) {
    executionPlan = buildExecutionPlanFromIntents(
      negotiationResult.alphaIntent,
      negotiationResult.betaIntent,
    );
  } else if (negotiationResult) {
    executionPlan = {
      ...defaultExecutionPlan(),
      reason: 'negotiation completed, but CLOB mode disabled; using CPMM fallback',
    };
  }

  console.log(`[Execution] Mode: ${executionPlan.mode}`);
  console.log(`[Execution] Matched: ${executionPlan.matched}`);
  console.log(`[Execution] Reason: ${executionPlan.reason}`);
  console.log(
    `[Execution] Planned volume: YES ${executionPlan.yesAmountEth} ETH / NO ${executionPlan.noAmountEth} ETH`,
  );
  if (executionPlan.clearingPriceBps !== undefined) {
    console.log(`[Execution] CLOB clearing price: ${(executionPlan.clearingPriceBps / 100).toFixed(2)}% YES`);
  }

  process.env.NEGOTIATION_SESSION_ID = negotiationResult?.sessionId;
  process.env.REQUIRE_NEGOTIATION_LINK =
    executionMode.yellowLive || executionMode.strictMode ? 'true' : 'false';

  let alphaTradeTxHash: `0x${string}` | null = null;
  let betaTradeTxHash: `0x${string}` | null = null;

  try {
    alphaTradeTxHash = await executeAlphaDirectionalTrade(alphaClient, marketId, {
      amountEth: executionPlan.yesAmountEth,
      sessionId: negotiationResult?.sessionId,
      confidence: 74,
      requireSessionLink: executionMode.yellowLive || executionMode.strictMode,
      reasoning:
        executionPlan.mode === 'clob_match'
          ? `Executing YES leg from matched off-chain intents (${executionPlan.reason}).`
          : 'Executing YES leg on CPMM fallback due to missing/uncrossed CLOB intents.',
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`\nAlpha directional trade failed: ${msg}`);
    if (executionMode.strictMode || executionMode.yellowLive) {
      throw error;
    }
  }

  try {
    betaTradeTxHash = await executeBetaDirectionalTrade(betaClient, marketId, {
      amountEth: executionPlan.noAmountEth,
      sessionId: negotiationResult?.sessionId,
      confidence: 66,
      requireSessionLink: executionMode.yellowLive || executionMode.strictMode,
      reasoning:
        executionPlan.mode === 'clob_match'
          ? `Executing NO leg from matched off-chain intents (${executionPlan.reason}).`
          : 'Executing NO leg on CPMM fallback due to missing/uncrossed CLOB intents.',
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`\nBeta directional trade failed: ${msg}`);
    if (executionMode.strictMode || executionMode.yellowLive) {
      throw error;
    }
  }

  enforceIntentTradeInvariants(
    negotiationResult,
    alphaTradeTxHash,
    betaTradeTxHash,
    executionMode,
  );

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
  console.log(`  3.5 Hybrid execution used: ${executionPlan.mode}`);
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
    console.log(`  Alpha Thesis: ${negotiationResult.alphaIntent.reasoning}`);
    console.log(`  Beta Intent:  ${negotiationResult.betaIntent.outcome.toUpperCase()} @ ${negotiationResult.betaIntent.amount} ETH`);
    console.log(`  Beta Thesis:  ${negotiationResult.betaIntent.reasoning}`);
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
