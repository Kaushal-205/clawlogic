/**
 * Fresh Demo - Complete lifecycle with a new market
 *
 * This script runs the full prediction market lifecycle from scratch:
 * 1. Create a NEW market
 * 2. Mint tokens
 * 3. Assert outcome (capture assertionId)
 * 4. Wait for liveness
 * 5. Settle assertion
 * 6. Redeem tokens
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

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadDeployment(): DeploymentInfo {
  const deploymentsPath = resolve(
    __dirname,
    '../../../packages/contracts/deployments/arbitrum-sepolia.json',
  );
  return JSON.parse(readFileSync(deploymentsPath, 'utf-8')) as DeploymentInfo;
}

const oov3Abi = [
  {
    type: 'function',
    name: 'settleAssertion',
    inputs: [{ name: 'assertionId', type: 'bytes32' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const;

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
  const oov3Address = config.contracts.optimisticOracleV3;

  console.log('================================================================');
  console.log('  Fresh Demo - Complete Prediction Market Lifecycle');
  console.log('================================================================');
  console.log(`  Agent:  ${address}`);
  console.log(`  OOV3:   ${oov3Address}`);
  console.log('================================================================\n');

  const balanceStart = await client.getBalance();
  console.log(`Starting balance: ${formatEther(balanceStart)} ETH\n`);

  // Step 1: Verify agent is registered
  console.log('[Step 1] Verifying agent registration...');
  const isAgent = await client.isAgent(address);
  if (!isAgent) {
    console.log('  Agent not registered. Registering now...');
    const txHash = await client.registerAgent('FreshDemoAgent', '0x');
    console.log(`  Registration TX: ${txHash}`);
  } else {
    console.log('  ✓ Agent already registered');
  }

  // Step 2: Create a NEW market
  console.log('\n[Step 2] Creating a fresh market...');
  const timestamp = Date.now();
  const description = `Demo market ${timestamp} - Will this resolve to YES?`;

  const marketId = await client.initializeMarket(
    'yes',
    'no',
    description,
    0n, // no reward
    0n, // no bond requirement
  );

  console.log(`  ✓ Market created: ${marketId}`);
  console.log(`  Description: "${description}"`);

  // Step 3: Mint tokens
  console.log('\n[Step 3] Minting outcome tokens...');
  const mintAmount = '0.01'; // 0.01 ETH
  const txHash = await client.mintOutcomeTokens(marketId, mintAmount);
  console.log(`  ✓ Minted ${mintAmount} ETH worth of tokens`);
  console.log(`  TX: ${txHash}`);

  // Step 4: Assert outcome
  console.log('\n[Step 4] Asserting outcome "yes"...');
  const assertTxHash = await client.assertMarket(marketId, 'yes');
  console.log(`  TX: ${assertTxHash}`);

  // Extract assertionId from transaction receipt
  console.log('  Extracting assertionId from receipt...');
  const receipt = await client.publicClient.getTransactionReceipt({
    hash: assertTxHash,
  });

  let assertionId: Hex | null = null;
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi: predictionMarketHookAbi,
        data: log.data,
        topics: log.topics,
      });

      if (decoded.eventName === 'MarketAsserted') {
        assertionId = (decoded.args as any).assertionId;
        console.log(`  ✓ Captured assertionId: ${assertionId}`);
        break;
      }
    } catch {
      // Not the event we're looking for
    }
  }

  if (!assertionId) {
    console.log('  ✗ Failed to extract assertionId from receipt');
    console.log('  Check the transaction on Arbiscan to get the assertionId manually.');
    return;
  }

  // Step 5: Wait for liveness (120 seconds in production, but we can try to settle immediately for demo)
  console.log('\n[Step 5] Waiting for liveness window...');
  console.log('  In production, wait 120 seconds. For demo, trying to settle now...');

  // Small delay to ensure tx is mined
  await new Promise((resolve) => setTimeout(resolve, 5000));

  // Step 6: Settle assertion
  console.log('\n[Step 6] Settling UMA assertion...');
  try {
    const wallet = client.walletClient!;
    const settleHash = await wallet.writeContract({
      address: oov3Address,
      abi: oov3Abi,
      functionName: 'settleAssertion',
      args: [assertionId],
    });

    console.log(`  TX: ${settleHash}`);
    const settleReceipt = await client.publicClient.waitForTransactionReceipt({
      hash: settleHash,
    });
    console.log(`  ✓ Assertion settled (status: ${settleReceipt.status})`);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('liveness')) {
      console.log('  ⏳ Liveness window not expired yet. Wait 120 seconds and try:');
      console.log(`     pnpm agent:settle ${assertionId}`);
      console.log('\n  Save this assertionId for later!');
      return;
    } else if (msg.includes('Already settled')) {
      console.log('  ✓ Assertion already settled');
    } else {
      console.log(`  ✗ Settlement failed: ${msg}`);
      return;
    }
  }

  // Step 7: Verify market is resolved
  console.log('\n[Step 7] Verifying market resolution...');
  const marketAfter = await client.getMarket(marketId);
  console.log(`  Market resolved: ${marketAfter.resolved}`);

  if (!marketAfter.resolved) {
    console.log('  ⚠️  Market not resolved yet. The callback may need time to execute.');
    console.log(`     Try again in a few seconds with:`);
    console.log(`     pnpm agent:settle ${assertionId}`);
    return;
  }

  // Step 8: Settle outcome tokens
  console.log('\n[Step 8] Redeeming outcome tokens...');
  const positions = await client.getPositions(marketId, address);
  console.log(`  Position: YES=${formatEther(positions.outcome1Balance)}, NO=${formatEther(positions.outcome2Balance)}`);

  if (positions.outcome1Balance === 0n && positions.outcome2Balance === 0n) {
    console.log('  No tokens to settle');
  } else {
    try {
      const redeemTxHash = await client.settleOutcomeTokens(marketId);
      console.log(`  ✓ Tokens redeemed: ${redeemTxHash}`);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log(`  ✗ Redemption failed: ${msg}`);
    }
  }

  // Final balance
  const balanceEnd = await client.getBalance();
  const diff = balanceEnd - balanceStart;
  console.log(`\n================================================================`);
  console.log(`  Starting balance: ${formatEther(balanceStart)} ETH`);
  console.log(`  Ending balance:   ${formatEther(balanceEnd)} ETH`);
  console.log(`  Net change:       ${diff >= 0n ? '+' : ''}${formatEther(diff)} ETH`);
  console.log(`================================================================\n`);

  console.log('✓ Fresh demo complete!');
  console.log(`\nMarket ID: ${marketId}`);
  console.log(`Assertion ID: ${assertionId}`);
}

main().catch((err) => {
  console.error('Fresh demo failed:', err);
  process.exit(1);
});
