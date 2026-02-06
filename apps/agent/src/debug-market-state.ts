/**
 * Debug Market State - Check assertion-to-market mapping
 *
 * This script helps diagnose settlement issues by:
 * 1. Checking the market state
 * 2. Finding the assertionId from s_assertionToMarket mapping
 * 3. Checking if the assertion exists on OOV3
 * 4. Verifying callback execution
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

const hookAbi = [
  {
    type: 'function',
    name: 's_assertionToMarket',
    inputs: [{ name: '', type: 'bytes32' }],
    outputs: [{ name: '', type: 'bytes32' }],
    stateMutability: 'view',
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

  const oov3Address = config.contracts.optimisticOracleV3;
  const hookAddress = config.contracts.predictionMarketHook;

  console.log('================================================================');
  console.log('  Debug Market State');
  console.log('================================================================');
  console.log(`  Hook:  ${hookAddress}`);
  console.log(`  OOV3:  ${oov3Address}`);
  console.log('================================================================\n');

  // Get all markets
  const marketIds = await client.getMarketIds();
  console.log(`Found ${marketIds.length} markets\n`);

  for (const marketId of marketIds) {
    const market = await client.getMarket(marketId);

    console.log(`Market ID: ${marketId}`);
    console.log(`  Description: "${market.description}"`);
    console.log(`  Resolved: ${market.resolved}`);
    console.log(`  Asserted Outcome ID: ${market.assertedOutcomeId}`);
    console.log(`  Collateral: ${formatEther(market.totalCollateral)} ETH`);

    if (market.assertedOutcomeId === '0x0000000000000000000000000000000000000000000000000000000000000000') {
      console.log('  Status: No assertion yet\n');
      continue;
    }

    // Try to find the assertionId by scanning recent logs
    console.log('  Scanning for MarketAsserted event...');

    try {
      const currentBlock = await client.publicClient.getBlockNumber();
      const fromBlock = currentBlock > 5000n ? currentBlock - 5000n : 0n;

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
        fromBlock,
        toBlock: currentBlock,
      });

      if (logs.length > 0) {
        const latestLog = logs[logs.length - 1];
        const assertionId = (latestLog.args as any).assertionId;
        console.log(`  ✓ Found AssertionId: ${assertionId}`);

        // Check this assertionId on OOV3
        console.log('  Checking OOV3 assertion state...');
        const assertion = await client.publicClient.readContract({
          address: oov3Address,
          abi: oov3Abi,
          functionName: 'getAssertion',
          args: [assertionId],
        });

        console.log(`    Settled: ${assertion.settled}`);
        console.log(`    Resolution: ${assertion.settlementResolution}`);
        console.log(`    Callback Recipient: ${assertion.callbackRecipient}`);
        console.log(`    Asserter: ${assertion.asserter}`);
        console.log(`    Expiration: ${new Date(Number(assertion.expirationTime) * 1000).toISOString()}`);

        // Check the mapping
        console.log('  Checking s_assertionToMarket mapping...');
        const mappedMarketId = await client.publicClient.readContract({
          address: hookAddress,
          abi: hookAbi,
          functionName: 's_assertionToMarket',
          args: [assertionId],
        });

        console.log(`    Maps to: ${mappedMarketId}`);
        console.log(`    Match: ${mappedMarketId.toLowerCase() === marketId.toLowerCase() ? '✓' : '✗'}`);

        if (assertion.settled && !market.resolved) {
          console.log('\n  ⚠️  ISSUE DETECTED:');
          console.log('      Assertion is settled on OOV3, but market is not resolved.');
          console.log('      The assertionResolvedCallback may have failed.');
          console.log(`\n  To manually trigger resolution, use:`);
          console.log(`      pnpm agent:settle ${assertionId}`);
        }
      } else {
        console.log('  ✗ No MarketAsserted event found in recent blocks');
        console.log('    The assertion may be older than 5000 blocks');
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log(`  ✗ Log scan failed: ${msg}`);
    }

    console.log('');
  }

  console.log('================================================================');
}

main().catch((err) => {
  console.error('Debug failed:', err);
  process.exit(1);
});
