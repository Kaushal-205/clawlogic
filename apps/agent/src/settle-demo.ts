/**
 * Settle Demo - Complete the prediction market lifecycle
 *
 * This script completes the final two phases:
 * 1. Settle the UMA assertion (call settleAssertion on OOV3)
 *    → triggers assertionResolvedCallback → market resolves
 * 2. Redeem outcome tokens (call settleOutcomeTokens on hook)
 *    → winners receive proportional ETH collateral
 *
 * Usage:
 *   pnpm agent:settle <assertionId>         # Recommended: use assertionId from pnpm agent:assert
 *   pnpm agent:settle                        # Auto-find (requires paid RPC for log scanning)
 *
 * Required environment variables:
 *   - AGENT_ALPHA_PRIVATE_KEY: Hex private key for Agent Alpha (the winner)
 *   - ARBITRUM_SEPOLIA_RPC_URL: Optional, defaults to public RPC
 *
 * Example:
 *   1. Run: pnpm agent:assert
 *   2. Copy the "Assertion ID: 0x..." from output
 *   3. Run: pnpm agent:settle 0x<assertionId>
 */

import 'dotenv/config';
import {
  formatEther,
  decodeEventLog,
  type Hex,
  type Log,
} from 'viem';
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
import { findLatestAssertionIdForMarket } from './assertion-records.js';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));

const ZERO_BYTES32 =
  '0x0000000000000000000000000000000000000000000000000000000000000000' as const;

// Minimal ABI for OOV3 settleAssertion
const oov3SettleAbi = [
  {
    type: 'function',
    name: 'settleAssertion',
    inputs: [{ name: 'assertionId', type: 'bytes32' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'getAssertion',
    inputs: [{ name: 'assertionId', type: 'bytes32' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          {
            name: 'escalationManagerSettings',
            type: 'tuple',
            components: [
              { name: 'arbitrateViaEscalationManager', type: 'bool' },
              { name: 'discardOracle', type: 'bool' },
              { name: 'validateDisputers', type: 'bool' },
              { name: 'assertingCaller', type: 'address' },
              { name: 'escalationManager', type: 'address' },
            ],
          },
          { name: 'asserter', type: 'address' },
          { name: 'assertionTime', type: 'uint64' },
          { name: 'settled', type: 'bool' },
          { name: 'currency', type: 'address' },
          { name: 'expirationTime', type: 'uint64' },
          { name: 'settlementResolution', type: 'bool' },
          { name: 'domainId', type: 'bytes32' },
          { name: 'identifier', type: 'bytes32' },
          { name: 'bond', type: 'uint256' },
          { name: 'callbackRecipient', type: 'address' },
          { name: 'disputer', type: 'address' },
        ],
      },
    ],
    stateMutability: 'view',
  },
] as const;

function loadDeployment(): DeploymentInfo {
  const deploymentsPath = resolve(
    __dirname,
    '../../../packages/contracts/deployments/arbitrum-sepolia.json',
  );
  return JSON.parse(readFileSync(deploymentsPath, 'utf-8')) as DeploymentInfo;
}

function createClient(privateKey: Hex): ClawlogicClient {
  const rpcUrl = process.env.AGENT_RPC_URL ?? process.env.ARBITRUM_SEPOLIA_RPC_URL ?? ARBITRUM_SEPOLIA_RPC_URL;
  const deployment = loadDeployment();
  const config = loadConfigFromDeployment(deployment, rpcUrl);
  return new ClawlogicClient(config, privateKey);
}

// ─────────────────────────────────────────────────────────────────────────────
// Extract assertionId from MarketAsserted event logs
// ─────────────────────────────────────────────────────────────────────────────

async function findAssertionId(
  client: ClawlogicClient,
  marketId: `0x${string}`,
): Promise<`0x${string}` | null> {
  const hookAddress = client.config.contracts.predictionMarketHook;

  // Scan recent logs for MarketAsserted events
  // Use smaller block range to work with Alchemy free tier (10 block limit)
  const currentBlock = await client.publicClient.getBlockNumber();
  const maxBlocksBack = 2000n; // Reduced from 5000
  const fromBlock = currentBlock > maxBlocksBack ? currentBlock - maxBlocksBack : 0n;
  const blockRange = 1000n; // Scan in 1000-block chunks

  let allLogs: any[] = [];
  let scanFrom = fromBlock;

  // Paginate in chunks to avoid RPC limits
  while (scanFrom <= currentBlock) {
    const scanTo = scanFrom + blockRange > currentBlock ? currentBlock : scanFrom + blockRange;

    try {
      const logs = await client.publicClient.getLogs({
        address: hookAddress,
        event: {
          type: 'event',
          name: 'MarketAsserted',
          inputs: [
            { name: 'marketId', type: 'bytes32', indexed: true },
            { name: 'assertedOutcome', type: 'string', indexed: false },
            { name: 'asserter', type: 'address', indexed: true },
            { name: 'assertionId', type: 'bytes32', indexed: false },
          ],
        },
        args: { marketId },
        fromBlock: scanFrom,
        toBlock: scanTo,
      });

      allLogs.push(...logs);
    } catch (error: unknown) {
      // If still hitting rate limits, try an even smaller range
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('block range')) {
        console.warn(`  Block range too large, trying smaller chunks...`);
        // Skip this chunk and continue
      } else {
        throw error;
      }
    }

    scanFrom = scanTo + 1n;
  }

  if (allLogs.length === 0) {
    return null;
  }

  // Return the most recent assertion for this market
  const latestLog = allLogs[allLogs.length - 1];
  return (latestLog.args as { assertionId?: `0x${string}` }).assertionId ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Exported function for orchestrator
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run the Settlement Demo.
 *
 * 1. Find the assertionId for the given market
 * 2. Call settleAssertion() on OOV3 to trigger resolution callback
 * 3. Call settleOutcomeTokens() on the hook to redeem winnings
 *
 * @param marketId - The market to settle. If not provided, finds the latest
 *                   market with an active assertion.
 * @param client - A ClawlogicClient. If not provided, creates from env vars.
 */
export async function runSettleDemo(
  marketId?: `0x${string}`,
  client?: ClawlogicClient,
  assertionIdArg?: `0x${string}`,
): Promise<void> {
  if (!client) {
    const privateKey = process.env.AGENT_ALPHA_PRIVATE_KEY as Hex;
    if (!privateKey) {
      throw new Error(
        'AGENT_ALPHA_PRIVATE_KEY not set in environment.',
      );
    }
    client = createClient(privateKey);
  }

  const address = client.getAddress()!;
  const deployment = loadDeployment();
  const oov3Address = (deployment.contracts.OptimisticOracleV3 ??
    '0x0000000000000000000000000000000000000000') as `0x${string}`;

  console.log('');
  console.log('================================================================');
  console.log('  Settlement Demo - Resolve Market & Redeem Tokens');
  console.log('================================================================');
  console.log(`  Settler:   ${address}`);
  console.log(`  OOV3:      ${oov3Address}`);
  console.log('================================================================');

  const balanceBefore = await client.getBalance();
  console.log(`  Balance before: ${formatEther(balanceBefore)} ETH`);

  // ── Find market to settle ──────────────────────────────────────────────

  if (!marketId) {
    console.log('\n[Step 1] Finding market with active assertion...');
    const marketIds = await client.getMarketIds();

    for (let i = marketIds.length - 1; i >= 0; i--) {
      const market = await client.getMarket(marketIds[i]);
      if (!market.resolved && market.assertedOutcomeId !== ZERO_BYTES32) {
        marketId = marketIds[i];
        console.log(`  Found: "${market.description}"`);
        console.log(`  Market ID: ${marketId}`);
        break;
      }
    }

    if (!marketId) {
      console.log('  No markets with active assertions found.');
      console.log('  Run the assert demo first.');
      return;
    }
  } else {
    console.log(`\n[Step 1] Using provided market: ${marketId.slice(0, 18)}...`);
  }

  const marketBefore = await client.getMarket(marketId);
  console.log(`  Description:   ${marketBefore.description}`);
  console.log(`  Resolved:      ${marketBefore.resolved}`);
  console.log(`  Asserted ID:   ${marketBefore.assertedOutcomeId.slice(0, 18)}...`);
  console.log(`  Collateral:    ${formatEther(marketBefore.totalCollateral)} ETH`);

  if (marketBefore.resolved) {
    console.log('  Market already resolved — skipping to settlement.');
  } else {
    // ── Step 2: Find assertionId ───────────────────────────────────────

    console.log('\n[Step 2] Getting UMA assertion ID...');

    let assertionId: `0x${string}` | null = assertionIdArg ?? null;

    if (assertionId) {
      console.log(`  Using provided assertionId: ${assertionId}`);
    } else {
      assertionId = await findLatestAssertionIdForMarket(marketId);
      if (assertionId) {
        console.log(`  Found assertionId in local record store: ${assertionId}`);
      } else {
        console.log('  No assertionId provided, scanning logs...');
        console.log('  (Note: This may fail on Alchemy free tier due to block range limits)');

        // Try extracting from event logs (may fail on Alchemy free tier)
        try {
          assertionId = await findAssertionId(client, marketId);
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : String(error);
          if (msg.includes('block range')) {
            console.log('\n  ✗ Log scanning failed: RPC block range limit.');
            console.log('  \n  Please provide the assertionId manually:');
            console.log('  1. Run: pnpm agent:assert');
            console.log('  2. Copy the "Assertion ID: 0x..." from output');
            console.log('  3. Run: pnpm agent:settle 0x<assertionId>');
            return;
          } else {
            throw error;
          }
        }

        if (!assertionId) {
          console.log('\n  ✗ Could not find assertionId in logs.');
          console.log('  \n  Please provide it manually:');
          console.log('  1. Run: pnpm agent:assert');
          console.log('  2. Copy the "Assertion ID: 0x..." from output');
          console.log('  3. Run: pnpm agent:settle 0x<assertionId>');
          return;
        }

        console.log(`  ✓ Found assertionId: ${assertionId}`);
      }
    }

    // ── Step 3: Settle UMA assertion ─────────────────────────────────────

    console.log('\n[Step 3] Settling UMA assertion (triggering callback)...');

    try {
      const wallet = client.walletClient!;
      const hash = await wallet.writeContract({
        address: oov3Address,
        abi: oov3SettleAbi,
        functionName: 'settleAssertion',
        args: [assertionId],
      });
      await client.publicClient.waitForTransactionReceipt({ hash });
      console.log(`  Settlement TX: ${hash}`);
      console.log('  assertionResolvedCallback triggered!');
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('Already settled')) {
        console.log('  Assertion already settled.');
      } else {
        console.error(`  Settlement failed: ${msg}`);
        return;
      }
    }

    // Verify market is now resolved
    const marketAfterResolve = await client.getMarket(marketId);
    console.log(`  Market resolved: ${marketAfterResolve.resolved}`);
  }

  // ── Step 4: Settle outcome tokens ────────────────────────────────────

  console.log('\n[Step 4] Redeeming outcome tokens for ETH...');

  const positions = await client.getPositions(marketId, address);
  console.log(
    `  Position: YES=${formatEther(positions.outcome1Balance)}, ` +
      `NO=${formatEther(positions.outcome2Balance)}`,
  );

  if (positions.outcome1Balance === 0n && positions.outcome2Balance === 0n) {
    console.log('  No tokens to settle.');
  } else {
    try {
      const txHash = await client.settleOutcomeTokens(marketId);
      console.log(`  Settle TX: ${txHash}`);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('NoTokensToSettle')) {
        console.log('  No winning tokens to settle (wrong outcome held).');
      } else {
        console.error(`  Token settlement failed: ${msg}`);
      }
    }
  }

  // ── Final balance ────────────────────────────────────────────────────

  const balanceAfter = await client.getBalance();
  const diff = balanceAfter - balanceBefore;
  console.log(`\n  Balance after:  ${formatEther(balanceAfter)} ETH`);
  console.log(
    `  Net change:     ${diff >= 0n ? '+' : ''}${formatEther(diff)} ETH`,
  );

  console.log('\n================================================================');
  console.log('  Settlement Demo Complete!');
  console.log('');
  console.log('  The full prediction market lifecycle is now complete:');
  console.log('    1. Agent registered');
  console.log('    2. Market created');
  console.log('    3. Tokens minted (collateral deposited)');
  console.log('    4. Outcome asserted via UMA OOV3');
  console.log('    5. Assertion settled (liveness passed)');
  console.log('    6. Winning tokens redeemed for ETH');
  console.log('================================================================\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Standalone execution
// ─────────────────────────────────────────────────────────────────────────────

const isDirectRun =
  process.argv[1]?.includes('settle-demo') ?? false;

if (isDirectRun) {
  // Usage: pnpm agent:settle [assertionId]
  const assertionIdArg = process.argv[2] as `0x${string}` | undefined;

  runSettleDemo(undefined, undefined, assertionIdArg)
    .then(() => {
      console.log('Done.');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Settle Demo failed:', error);
      process.exit(1);
    });
}
