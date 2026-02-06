/**
 * Assert Demo - UMA Optimistic Oracle V3 Assertion Flow
 *
 * This script demonstrates the UMA resolution lifecycle:
 * 1. Agent Alpha asserts "yes" as the market outcome
 * 2. A 120-second liveness window begins
 * 3. Other agents can dispute during the window
 * 4. After liveness expires, the assertion is accepted
 *
 * Usage:
 *   pnpm agent:assert
 *
 * Required environment variables:
 *   - AGENT_ALPHA_PRIVATE_KEY: Hex private key for the asserting agent
 *   - ARBITRUM_SEPOLIA_RPC_URL: Optional, defaults to public RPC
 */

import 'dotenv/config';
import { formatEther, decodeEventLog, type Hex } from 'viem';
import {
  ClawlogicClient,
  loadConfigFromDeployment,
  ARBITRUM_SEPOLIA_RPC_URL,
  predictionMarketHookAbi,
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

function createAssertClient(privateKey: Hex): ClawlogicClient {
  const rpcUrl = process.env.ARBITRUM_SEPOLIA_RPC_URL ?? ARBITRUM_SEPOLIA_RPC_URL;
  const deployment = loadDeployment();
  const config = loadConfigFromDeployment(deployment, rpcUrl);
  return new ClawlogicClient(config, privateKey);
}

// ─────────────────────────────────────────────────────────────────────────────
// Exported function for orchestrator
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run the UMA Assertion Demo.
 *
 * Agent Alpha asserts "yes" as the market outcome via UMA OOV3.
 * This triggers a 120-second liveness window during which other agents
 * can dispute the assertion.
 *
 * @param marketId - The market to assert on. If not provided, will find
 *                   the latest unresolved market without an active assertion.
 * @param client - A ClawlogicClient initialized with the asserting agent's key.
 *                 If not provided, will create one from AGENT_ALPHA_PRIVATE_KEY env var.
 */
export async function runAssertDemo(
  marketId?: `0x${string}`,
  client?: ClawlogicClient,
): Promise<void> {
  if (!client) {
    const privateKey = process.env.AGENT_ALPHA_PRIVATE_KEY as Hex;
    if (!privateKey) {
      throw new Error(
        'AGENT_ALPHA_PRIVATE_KEY not set in environment. ' +
          'Please copy .env.example to .env and fill in your private key.',
      );
    }
    client = createAssertClient(privateKey);
  }

  const address = client.getAddress()!;

  console.log('');
  console.log('================================================================');
  console.log('  UMA Assertion Demo - Agent Determines Truth');
  console.log('================================================================');
  console.log(`  Asserter:  ${address}`);
  console.log(`  Chain:     ${client.config.chainId} (Arbitrum Sepolia)`);
  console.log('================================================================');

  // Check balance
  const balance = await client.getBalance();
  console.log(`  Balance: ${formatEther(balance)} ETH`);

  // ── Verify agent is registered ───────────────────────────────────────────

  console.log('\n[Check] Verifying asserter is a registered agent...');

  const isRegistered = await client.isAgent(address);
  if (!isRegistered) {
    console.log('  ERROR: Asserter is not a registered agent.');
    console.log('  Run Agent Alpha first to register.');
    return;
  }

  const agent = await client.getAgent(address);
  console.log(`  Confirmed: Registered as "${agent.name}"`);

  // ── Find market to assert ────────────────────────────────────────────────

  if (!marketId) {
    console.log('\n[Step 1] Finding market to assert...');

    const marketIds = await client.getMarketIds();
    if (marketIds.length === 0) {
      console.log('  No markets found. Create a market first.');
      return;
    }

    // Find the latest unresolved market without an active assertion
    for (let i = marketIds.length - 1; i >= 0; i--) {
      const market = await client.getMarket(marketIds[i]);
      if (!market.resolved && market.assertedOutcomeId === ZERO_BYTES32) {
        marketId = marketIds[i];
        console.log(`  Found market: "${market.description}"`);
        break;
      }
    }

    if (!marketId) {
      // Check if there is already an assertion pending
      for (let i = marketIds.length - 1; i >= 0; i--) {
        const market = await client.getMarket(marketIds[i]);
        if (!market.resolved && market.assertedOutcomeId !== ZERO_BYTES32) {
          console.log(`  Market "${market.description}" already has an active assertion.`);
          console.log(`  Asserted outcome ID: ${market.assertedOutcomeId}`);
          console.log('  Waiting for liveness window to expire...');
          return;
        }
      }

      console.log('  No assertable markets found (all resolved or have active assertions).');
      return;
    }
  } else {
    const market = await client.getMarket(marketId);
    console.log(`\n[Step 1] Using provided market: "${market.description}"`);

    if (market.resolved) {
      console.log('  Market already resolved. Nothing to assert.');
      return;
    }

    if (market.assertedOutcomeId !== ZERO_BYTES32) {
      console.log('  Market already has an active assertion.');
      console.log(`  Asserted outcome ID: ${market.assertedOutcomeId}`);
      return;
    }
  }

  console.log(`  Market ID: ${marketId}`);

  // ── Show market state ────────────────────────────────────────────────────

  console.log('\n[Step 2] Current market state...');
  const market = await client.getMarket(marketId);
  console.log(`  Description:      ${market.description}`);
  console.log(`  Outcome 1 (YES):  ${market.outcome1}`);
  console.log(`  Outcome 2 (NO):   ${market.outcome2}`);
  console.log(`  Resolved:         ${market.resolved}`);
  console.log(`  Total Collateral: ${formatEther(market.totalCollateral)} ETH`);

  // ── Assert "yes" as the outcome ──────────────────────────────────────────

  console.log('\n[Step 3] Asserting "yes" as the market outcome...');
  console.log('  Agent Alpha believes YES is the correct outcome.');
  console.log('  Submitting assertion to UMA Optimistic Oracle V3...');

  let assertionId: `0x${string}` | undefined;

  try {
    const txHash = await client.assertMarket(marketId, 'yes');
    console.log(`  Assertion TX: ${txHash}`);
    console.log('  Assertion submitted successfully!');

    // Extract assertionId from the MarketAsserted event in the receipt
    const receipt = await client.publicClient.getTransactionReceipt({ hash: txHash });
    const marketAssertedEvent = receipt.logs.find((log) => {
      try {
        const decoded = decodeEventLog({
          abi: predictionMarketHookAbi,
          data: log.data,
          topics: log.topics,
        });
        return decoded.eventName === 'MarketAsserted';
      } catch {
        return false;
      }
    });

    if (marketAssertedEvent) {
      const decoded = decodeEventLog({
        abi: predictionMarketHookAbi,
        data: marketAssertedEvent.data,
        topics: marketAssertedEvent.topics,
      });
      assertionId = (decoded.args as any).assertionId;
      console.log(`  Assertion ID: ${assertionId}`);
      console.log('  (Save this for manual settlement if needed)');
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`  Assertion failed: ${msg}`);
    return;
  }

  // ── Liveness window info ─────────────────────────────────────────────────

  console.log('\n[Step 4] UMA OOV3 Liveness Window');
  console.log('  -------------------------------------------------------');
  console.log('  A 120-second (2 minute) liveness window has started.');
  console.log('  During this window, any agent can dispute the assertion');
  console.log('  by posting a counter-bond via UMA OOV3.');
  console.log('');
  console.log('  If NO dispute is filed:');
  console.log('    -> Assertion is accepted');
  console.log('    -> assertionResolvedCallback(true) is called');
  console.log('    -> Market resolves to YES');
  console.log('    -> Winners can call settleOutcomeTokens()');
  console.log('');
  console.log('  If a dispute IS filed:');
  console.log('    -> Escalates to UMA DVM (token holder vote)');
  console.log('    -> Losing side forfeits their bond');
  console.log('  -------------------------------------------------------');

  // ── Verify assertion state ───────────────────────────────────────────────

  console.log('\n[Step 5] Verifying assertion state...');
  const marketAfter = await client.getMarket(marketId);

  if (marketAfter.assertedOutcomeId !== ZERO_BYTES32) {
    console.log('  Assertion is now active on the market.');
    console.log(`  Asserted outcome ID: ${marketAfter.assertedOutcomeId}`);
  } else {
    console.log('  Warning: assertedOutcomeId is still zero.');
    console.log('  The assertion may need a block confirmation.');
  }

  console.log('\n================================================================');
  console.log('  UMA Assertion Demo Complete!');
  console.log('');
  console.log('  Next steps:');
  console.log('    1. Wait 120 seconds for liveness window');
  console.log('    2. Call settleOutcomeTokens() to redeem winnings');
  console.log('    3. Or another agent can dispute during the window');
  console.log('================================================================\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Standalone execution
// ─────────────────────────────────────────────────────────────────────────────

const isDirectRun =
  process.argv[1]?.includes('assert-demo') ?? false;

if (isDirectRun) {
  runAssertDemo()
    .then(() => {
      console.log('Done.');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Assert Demo failed:', error);
      process.exit(1);
    });
}
