/**
 * Check Assertion State on OOV3
 */

import 'dotenv/config';
import { type Hex } from 'viem';
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
  {
    type: 'function',
    name: 'assertionResolvedCallback',
    inputs: [
      { name: 'assertionId', type: 'bytes32' },
      { name: 'assertedTruthfully', type: 'bool' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const;

async function main() {
  const assertionId = process.argv[2] as Hex | undefined;
  if (!assertionId) {
    console.log('Usage: pnpm check:assertion <assertionId>');
    return;
  }

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
  console.log('  Check Assertion State');
  console.log('================================================================');
  console.log(`  Assertion ID: ${assertionId}`);
  console.log(`  OOV3:         ${oov3Address}`);
  console.log(`  Hook:         ${hookAddress}`);
  console.log('================================================================\n');

  // Check OOV3 state
  console.log('[1] Checking OOV3 assertion...');
  try {
    const assertion = await client.publicClient.readContract({
      address: oov3Address,
      abi: oov3Abi,
      functionName: 'getAssertion',
      args: [assertionId],
    });

    console.log(`  Asserter:   ${assertion.asserter}`);
    console.log(`  Settled:    ${assertion.settled}`);
    console.log(`  Resolution: ${assertion.settlementResolution ? 'TRUE (assertedTruthfully)' : 'FALSE (disputed)'}`);
    console.log(`  Callback:   ${assertion.callbackRecipient}`);
    console.log(`  Expiration: ${new Date(Number(assertion.expirationTime) * 1000).toISOString()}`);

    if (assertion.asserter === '0x0000000000000000000000000000000000000000') {
      console.log('\n  ⚠️  This assertionId does not exist on OOV3!');
      console.log('     You may have passed the wrong ID.');
      console.log('     The assertedOutcomeId (keccak256 of outcome) is different from the assertionId.\n');
      return;
    }

    // Check mapping
    console.log('\n[2] Checking assertion-to-market mapping...');
    const marketId = await client.publicClient.readContract({
      address: hookAddress,
      abi: hookAbi,
      functionName: 's_assertionToMarket',
      args: [assertionId],
    });

    console.log(`  Maps to Market ID: ${marketId}`);

    if (marketId === '0x0000000000000000000000000000000000000000000000000000000000000000') {
      console.log('  ⚠️  This assertionId is not mapped to any market!');
      console.log('     The assertion may be invalid or from a different contract.\n');
      return;
    }

    // Check market state
    console.log('\n[3] Checking market state...');
    const market = await client.getMarket(marketId);
    console.log(`  Description:         "${market.description}"`);
    console.log(`  Resolved:            ${market.resolved}`);
    console.log(`  Asserted Outcome ID: ${market.assertedOutcomeId}`);

    if (assertion.settled && !market.resolved) {
      console.log('\n  🚨 ISSUE DETECTED: Assertion settled but market not resolved!');
      console.log('     The callback may have failed or not been triggered.\n');
      console.log('  Attempting to manually trigger callback...');

      const wallet = client.walletClient!;
      try {
        const hash = await wallet.writeContract({
          address: hookAddress,
          abi: hookAbi,
          functionName: 'assertionResolvedCallback',
          args: [assertionId, assertion.settlementResolution],
        });

        console.log(`  Transaction: ${hash}`);
        const receipt = await client.publicClient.waitForTransactionReceipt({ hash });
        console.log(`  Status: ${receipt.status === 'success' ? '✓ SUCCESS' : '✗ FAILED'}`);

        if (receipt.status === 'success') {
          const marketAfter = await client.getMarket(marketId);
          console.log(`  Market resolved: ${marketAfter.resolved}`);
        }
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        console.log(`  ✗ Manual callback failed: ${msg}`);
      }
    } else if (market.resolved) {
      console.log('\n  ✓ Market is already resolved. You can settle tokens now:');
      console.log(`    pnpm agent:settle ${assertionId}`);
    } else {
      console.log('\n  ⚠️  Assertion not yet settled. Wait for liveness window to expire.');
      const now = Math.floor(Date.now() / 1000);
      const timeLeft = Number(assertion.expirationTime) - now;
      if (timeLeft > 0) {
        console.log(`     Time remaining: ${Math.floor(timeLeft / 60)} minutes`);
      }
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log(`  ✗ Failed to query OOV3: ${msg}`);
  }

  console.log('\n================================================================');
}

main().catch((err) => {
  console.error('Check failed:', err);
  process.exit(1);
});
