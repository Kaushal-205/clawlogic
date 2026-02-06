/**
 * Simplified Settlement - No log scanning needed!
 *
 * This version reads the market state and calls settleAssertion directly
 * using a simpler approach that works with Alchemy free tier.
 */

import 'dotenv/config';
import { formatEther, type Hex, keccak256, toHex } from 'viem';
import {
  ClawlogicClient,
  loadConfigFromDeployment,
  ARBITRUM_SEPOLIA_RPC_URL,
  type DeploymentInfo,
} from '@clawlogic/sdk';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000' as const;

const oov3Abi = [
  {
    type: 'function',
    name: 'settleAssertion',
    inputs: [{ name: 'assertionId', type: 'bytes32' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const;

function loadDeployment(): DeploymentInfo {
  const deploymentsPath = resolve(
    __dirname,
    '../../../packages/contracts/deployments/arbitrum-sepolia.json',
  );
  return JSON.parse(readFileSync(deploymentsPath, 'utf-8')) as DeploymentInfo;
}

/**
 * Brute-force approach: Try common assertion ID patterns
 *
 * Since OOV3 generates assertionIds as keccak256(abi.encode(claim, asserter, counter)),
 * and we know the claim format and asserter, we can try to reconstruct it.
 *
 * For the MockOOV3, it uses: keccak256(abi.encode(claim, asserter, assertionIdCounter))
 */
async function findAssertionIdBruteForce(
  client: ClawlogicClient,
  marketId: `0x${string}`,
  market: any,
): Promise<`0x${string}` | null> {
  console.log('  Attempting to reconstruct assertionId from market data...');

  // Get the asserter from recent agent registrations
  // The most recent agent activity is likely the asserter
  const agents = await client.getAgentAddresses();

  if (agents.length === 0) {
    return null;
  }

  // Try the most recent agents as potential asserters
  const oov3Address = client.config.contracts.optimisticOracleV3;

  for (const asserter of agents.slice(-3)) {
    // Try counter values 1-20 (recent assertions)
    for (let counter = 1; counter <= 20; counter++) {
      // Build the claim string (matches the format in assertMarket)
      const outcome = market.assertedOutcomeId === keccak256(toHex(market.outcome1))
        ? market.outcome1
        : market.outcome2;

      const claim = `Market: ${market.description}. Asserted outcome: ${outcome}.`;

      // Compute the assertionId as the MockOOV3 would
      // Note: This is a simplified approximation
      const testAssertionId = keccak256(
        toHex(`${claim}${asserter}${counter}`)
      ) as `0x${string}`;

      // Check if this assertionId maps back to our market
      try {
        const mappedMarketId = await client.publicClient.readContract({
          address: client.config.contracts.predictionMarketHook,
          abi: [{
            type: 'function',
            name: 's_assertionToMarket',
            inputs: [{ name: '', type: 'bytes32' }],
            outputs: [{ name: '', type: 'bytes32' }],
            stateMutability: 'view',
          }],
          functionName: 's_assertionToMarket',
          args: [testAssertionId],
        });

        if (mappedMarketId === marketId) {
          console.log(`  Found matching assertionId!`);
          return testAssertionId;
        }
      } catch {
        // Not found, continue trying
      }
    }
  }

  return null;
}

async function main() {
  const privateKey = process.env.AGENT_ALPHA_PRIVATE_KEY as Hex;
  if (!privateKey) {
    throw new Error('AGENT_ALPHA_PRIVATE_KEY not set');
  }

  const deployment = loadDeployment();
  const rpcUrl = process.env.ARBITRUM_SEPOLIA_RPC_URL ?? ARBITRUM_SEPOLIA_RPC_URL;
  const config = loadConfigFromDeployment(deployment, rpcUrl);
  const client = new ClawlogicClient(config, privateKey);

  const address = client.getAddress()!;
  const oov3Address = (deployment.contracts.OptimisticOracleV3 ?? '0x0') as `0x${string}`;

  console.log('================================================================');
  console.log('  Simple Settlement (No Log Scanning)');
  console.log('================================================================');
  console.log(`  Settler:   ${address}`);
  console.log(`  OOV3:      ${oov3Address}`);
  console.log('================================================================');

  const balanceBefore = await client.getBalance();
  console.log(`  Balance before: ${formatEther(balanceBefore)} ETH\n`);

  // Find market with active assertion
  const marketIds = await client.getMarketIds();
  let marketId: `0x${string}` | undefined;
  let market: any;

  for (let i = marketIds.length - 1; i >= 0; i--) {
    const m = await client.getMarket(marketIds[i]);
    if (!m.resolved && m.assertedOutcomeId !== ZERO_BYTES32) {
      marketId = marketIds[i];
      market = m;
      console.log(`[Step 1] Found market: "${m.description}"`);
      console.log(`  Market ID: ${marketId}`);
      console.log(`  Resolved: ${m.resolved}`);
      console.log(`  Collateral: ${formatEther(m.totalCollateral)} ETH\n`);
      break;
    }
  }

  if (!marketId || !market) {
    console.log('No markets with active assertions found.');
    return;
  }

  // Get assertionId from CLI arg or try to find it
  const assertionIdArg = process.argv[2] as `0x${string}` | undefined;
  let assertionId: `0x${string}` | null = assertionIdArg ?? null;

  if (!assertionId) {
    console.log('[Step 2] No assertionId provided, trying to reconstruct...');
    assertionId = await findAssertionIdBruteForce(client, marketId, market);

    if (!assertionId) {
      console.log('\n  Could not reconstruct assertionId.');
      console.log('  Please provide it manually:');
      console.log(`  pnpm settle:simple <assertionId>`);
      console.log('\n  Or run "pnpm agent:assert" and copy the assertionId from output.');
      return;
    }
  } else {
    console.log(`[Step 2] Using provided assertionId: ${assertionId}\n`);
  }

  // Settle the assertion on OOV3
  console.log('[Step 3] Settling UMA assertion...');
  try {
    const wallet = client.walletClient!;
    const hash = await wallet.writeContract({
      address: oov3Address,
      abi: oov3Abi,
      functionName: 'settleAssertion',
      args: [assertionId],
    });
    await client.publicClient.waitForTransactionReceipt({ hash });
    console.log(`  Settlement TX: ${hash}`);
    console.log('  ✓ Assertion settled!\n');
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('Already settled')) {
      console.log('  ✓ Assertion already settled.\n');
    } else {
      console.error(`  Settlement failed: ${msg}`);
      return;
    }
  }

  // Check if market is now resolved
  const marketAfter = await client.getMarket(marketId);
  console.log('[Step 4] Market resolution status...');
  console.log(`  Resolved: ${marketAfter.resolved}`);

  if (!marketAfter.resolved) {
    console.log('  ⚠ Market not yet resolved.');
    console.log('  The assertionId may be incorrect.');
    console.log('  Use the assertionId printed by "pnpm agent:assert".\n');
    return;
  }

  // Settle outcome tokens
  console.log('\n[Step 5] Redeeming outcome tokens...');
  const positions = await client.getPositions(marketId, address);
  console.log(`  Position: YES=${formatEther(positions.outcome1Balance)}, NO=${formatEther(positions.outcome2Balance)}`);

  if (positions.outcome1Balance === 0n && positions.outcome2Balance === 0n) {
    console.log('  No tokens to settle.\n');
  } else {
    try {
      const txHash = await client.settleOutcomeTokens(marketId);
      console.log(`  Settle TX: ${txHash}`);
      console.log('  ✓ Tokens redeemed!\n');
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('NoTokensToSettle')) {
        console.log('  No winning tokens (you held the losing side).\n');
      } else {
        console.error(`  Settlement failed: ${msg}\n`);
      }
    }
  }

  const balanceAfter = await client.getBalance();
  const diff = balanceAfter - balanceBefore;
  console.log('[Summary]');
  console.log(`  Balance after:  ${formatEther(balanceAfter)} ETH`);
  console.log(`  Net change:     ${diff >= 0n ? '+' : ''}${formatEther(diff)} ETH`);
  console.log('\n================================================================');
}

main().catch((err) => {
  console.error('Settlement failed:', err);
  process.exit(1);
});
