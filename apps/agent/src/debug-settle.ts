/**
 * Debug Settlement - Check OOV3 assertion state and manually settle
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

async function main() {
  const privateKey = process.env.AGENT_ALPHA_PRIVATE_KEY as Hex;
  if (!privateKey) {
    throw new Error('AGENT_ALPHA_PRIVATE_KEY not set');
  }

  const deployment = loadDeployment();
  const rpcUrl = process.env.ARBITRUM_SEPOLIA_RPC_URL ?? ARBITRUM_SEPOLIA_RPC_URL;
  const config = loadConfigFromDeployment(deployment, rpcUrl);
  const client = new ClawlogicClient(config, privateKey);

  const oov3Address = (deployment.contracts.OptimisticOracleV3 ?? '0x0') as `0x${string}`;

  console.log('='.repeat(60));
  console.log('  Debug Settlement Tool');
  console.log('='.repeat(60));

  // Get the assertionId from CLI or find it
  const assertionIdArg = process.argv[2] as `0x${string}` | undefined;

  let assertionId: `0x${string}` | undefined;

  if (assertionIdArg) {
    assertionId = assertionIdArg;
    console.log(`Using provided assertionId: ${assertionId}`);
  } else {
    // Find the latest market with an assertion
    const markets = await client.getMarketIds();
    let found = false;
    for (let i = markets.length - 1; i >= 0; i--) {
      const market = await client.getMarket(markets[i]);
      if (market.assertedOutcomeId !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
        assertionId = market.assertedOutcomeId;
        console.log(`Found assertion on market ${markets[i].slice(0, 18)}...`);
        console.log(`Using assertedOutcomeId: ${assertionId}`);
        found = true;
        break;
      }
    }
    if (!found) {
      console.log('No markets with assertions found.');
      return;
    }
  }

  // Query OOV3 assertion state
  console.log('\nQuerying OOV3 assertion state...');

  if (!assertionId) {
    console.error('No assertionId available to query.');
    return;
  }

  try {
    const assertion = await client.publicClient.readContract({
      address: oov3Address,
      abi: oov3Abi,
      functionName: 'getAssertion',
      args: [assertionId],
    });

    console.log('Assertion details:');
    console.log(`  Asserter: ${assertion.asserter}`);
    console.log(`  Settled: ${assertion.settled}`);
    console.log(`  Resolution: ${assertion.settlementResolution ? 'TRUTHFUL' : 'DISPUTED'}`);
    console.log(`  Callback recipient: ${assertion.callbackRecipient}`);
    console.log(`  Disputer: ${assertion.disputer}`);

    if (!assertion.settled) {
      console.log('\nAssertion not yet settled. Settling now...');
      const wallet = client.walletClient!;
      const hash = await wallet.writeContract({
        address: oov3Address,
        abi: oov3Abi,
        functionName: 'settleAssertion',
        args: [assertionId],
      });
      await client.publicClient.waitForTransactionReceipt({ hash });
      console.log(`  Settlement TX: ${hash}`);
      console.log('  Callback should have been triggered!');
    } else {
      console.log('\nAssertion already settled.');
      console.log('If market is still not resolved, the callback may have failed.');
      console.log('Check that assertionId matches the one stored in s_assertionToMarket mapping.');
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`\nError querying assertion: ${msg}`);
    console.error('\nThis assertionId may not exist in the OOV3 contract.');
    console.error('The market.assertedOutcomeId is the keccak256 hash of the outcome string,');
    console.error('NOT the UMA assertionId. You need the actual assertionId from the');
    console.error('MarketAsserted event.');
  }

  console.log('\n' + '='.repeat(60));
}

main().catch((err) => {
  console.error('Debug failed:', err);
  process.exit(1);
});
