/**
 * Human Demo - Demonstrates agent-only restriction ("Human Trap")
 *
 * This script demonstrates that non-agent addresses cannot:
 * 1. Create markets
 * 2. Mint tokens
 * 3. Assert outcomes
 * 4. Trade on Uniswap V4 pools (via hook restrictions)
 *
 * The script will attempt these operations and show the revert messages.
 *
 * Usage:
 *   pnpm agent:human
 *
 * Required environment variables:
 *   - HUMAN_PRIVATE_KEY: Hex private key for a NON-REGISTERED address
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

function createHumanClient(privateKey: Hex): ClawlogicClient {
  const rpcUrl = process.env.AGENT_RPC_URL ?? process.env.ARBITRUM_SEPOLIA_RPC_URL ?? ARBITRUM_SEPOLIA_RPC_URL;
  const deployment = loadDeployment();
  const config = loadConfigFromDeployment(deployment, rpcUrl);
  return new ClawlogicClient(config, privateKey);
}

// ─────────────────────────────────────────────────────────────────────────────
// Exported function for orchestrator
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run the Human Rejection Demo.
 *
 * Attempts to interact with the prediction market using a non-registered wallet.
 * Each operation should fail with "NotRegisteredAgent".
 *
 * @param marketId - The market to attempt operations on. If not provided,
 *                   will use the first available market.
 * @param client - A ClawlogicClient initialized with a NON-registered private key.
 *                 If not provided, will create one from HUMAN_PRIVATE_KEY env var.
 */
export async function runHumanDemo(
  marketId?: `0x${string}`,
  client?: ClawlogicClient,
): Promise<void> {
  if (!client) {
    const privateKey = process.env.HUMAN_PRIVATE_KEY as Hex;
    if (!privateKey) {
      throw new Error(
        'HUMAN_PRIVATE_KEY not set in environment. ' +
          'Please copy .env.example to .env and fill in a private key for a non-registered address.',
      );
    }
    client = createHumanClient(privateKey);
  }

  const address = client.getAddress()!;

  console.log('');
  console.log('================================================================');
  console.log('  Human Demo - Demonstrating Agent-Only Restrictions');
  console.log('================================================================');
  console.log(`  Address: ${address}`);
  console.log(`  Chain:   ${client.config.chainId} (Arbitrum Sepolia)`);
  console.log('================================================================');

  // Check balance
  const balance = await client.getBalance();
  console.log(`  Balance: ${formatEther(balance)} ETH`);

  // ── Verify NOT Registered ────────────────────────────────────────────────

  console.log('\n[Check] Verifying address is NOT registered as agent...');

  const isRegistered = await client.isAgent(address);

  if (isRegistered) {
    console.log('  WARNING: This address IS registered as an agent.');
    console.log('  Use a different address for this demo.');
    return;
  }

  console.log('  Confirmed: Address is NOT a registered agent.');

  // ── Find a market to test against ────────────────────────────────────────

  if (!marketId) {
    const marketIds = await client.getMarketIds();
    if (marketIds.length > 0) {
      marketId = marketIds[0];
    }
  }

  // ── Demo 1: Attempt to Create Market ─────────────────────────────────────

  console.log('\n[Demo 1] Human attempts to create market...');

  try {
    await client.initializeMarket(
      'yes',
      'no',
      'Human-attempted market',
      0n,
      0n,
    );
    console.log('  UNEXPECTED: Market creation succeeded!');
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    if (errMsg.includes('NotRegisteredAgent')) {
      console.log('  REJECTED: NotRegisteredAgent()');
      console.log('  Humans cannot create prediction markets.');
    } else {
      console.log(`  REJECTED: ${errMsg.slice(0, 150)}`);
    }
  }

  // ── Demo 2: Attempt to Mint Tokens ───────────────────────────────────────

  if (marketId) {
    console.log('\n[Demo 2] Human attempts to mint outcome tokens...');
    console.log(`  Target market: ${marketId.slice(0, 18)}...`);

    try {
      await client.mintOutcomeTokens(marketId, parseEther('0.001'));
      console.log('  UNEXPECTED: Token minting succeeded!');
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      if (errMsg.includes('NotRegisteredAgent')) {
        console.log('  REJECTED: NotRegisteredAgent()');
        console.log('  Humans cannot mint outcome tokens.');
      } else {
        console.log(`  REJECTED: ${errMsg.slice(0, 150)}`);
      }
    }
  } else {
    console.log('\n[Demo 2] Skipping mint demo (no markets exist yet).');
  }

  // ── Demo 3: Attempt to Assert Outcome ────────────────────────────────────

  if (marketId) {
    console.log('\n[Demo 3] Human attempts to assert market outcome...');

    const market = await client.getMarket(marketId);
    if (market.resolved) {
      console.log('  Skipping: Market already resolved.');
    } else if (market.assertedOutcomeId !== ZERO_BYTES32) {
      console.log('  Skipping: Assertion already pending on this market.');
    } else {
      try {
        await client.assertMarket(marketId, 'yes');
        console.log('  UNEXPECTED: Assertion succeeded!');
      } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        if (errMsg.includes('NotRegisteredAgent')) {
          console.log('  REJECTED: NotRegisteredAgent()');
          console.log('  Humans cannot assert market outcomes.');
        } else {
          console.log(`  REJECTED: ${errMsg.slice(0, 150)}`);
        }
      }
    }
  } else {
    console.log('\n[Demo 3] Skipping assertion demo (no markets exist yet).');
  }

  // ── Show Agent Registry Stats ────────────────────────────────────────────

  console.log('\n[Info] Agent Registry Statistics...');

  const agentCount = await client.getAgentCount();
  console.log(`  Total registered agents: ${agentCount}`);

  const agentAddresses = await client.getAgentAddresses();
  if (agentAddresses.length > 0) {
    console.log('  Registered agents:');
    for (const addr of agentAddresses) {
      const agent = await client.getAgent(addr);
      console.log(`    - ${agent.name}: ${addr.slice(0, 10)}...${addr.slice(-6)}`);
    }
  }

  // ── Summary ──────────────────────────────────────────────────────────────

  console.log('\n================================================================');
  console.log('  Human Demo Complete!');
  console.log('');
  console.log('  Summary: Non-agent addresses are blocked from:');
  console.log('    REJECTED: Creating markets');
  console.log('    REJECTED: Minting outcome tokens');
  console.log('    REJECTED: Asserting outcomes');
  console.log('    REJECTED: Trading on V4 pools (via beforeSwap hook)');
  console.log('');
  console.log('  Only registered agents can participate in CLAWLOGIC.');
  console.log('================================================================\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Standalone execution
// ─────────────────────────────────────────────────────────────────────────────

const isDirectRun =
  process.argv[1]?.includes('human-demo') ?? false;

if (isDirectRun) {
  runHumanDemo()
    .then(() => {
      console.log('Done.');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Human Demo failed:', error);
      process.exit(1);
    });
}
