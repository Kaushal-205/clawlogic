/**
 * ENS Subdomain Setup Script
 *
 * Sets up the MockENS registry on Arbitrum Sepolia with:
 *   1. Register "clawlogic.eth" parent domain (deployer owns it)
 *   2. Create "alpha.clawlogic.eth" subdomain -> agent-alpha address
 *   3. Create "beta.clawlogic.eth" subdomain -> agent-beta address
 *   4. Register agents with ENS linkage via registerAgentWithENS()
 *
 * This demonstrates the ENS identity integration for the ENS prize.
 *
 * Usage:
 *   pnpm tsx src/setup-ens.ts
 *
 * Required env vars:
 *   PRIVATE_KEY              - Deployer private key (owns MockENS)
 *   AGENT_ALPHA_PRIVATE_KEY  - Alpha agent private key
 *   AGENT_BETA_PRIVATE_KEY   - Beta agent private key
 */

import 'dotenv/config';
import {
  createPublicClient,
  createWalletClient,
  http,
  namehash,
  keccak256,
  toHex,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arbitrumSepolia } from 'viem/chains';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { agentRegistryAbi } from '@clawlogic/sdk';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── MockENS ABI (minimal) ─────────────────────────────────────────────────
const mockEnsAbi = [
  {
    type: 'function',
    name: 'setOwner',
    inputs: [
      { name: 'node', type: 'bytes32' },
      { name: 'owner_', type: 'address' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'setSubnodeOwner',
    inputs: [
      { name: 'node', type: 'bytes32' },
      { name: 'label', type: 'bytes32' },
      { name: 'owner_', type: 'address' },
    ],
    outputs: [{ name: '', type: 'bytes32' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'owner',
    inputs: [{ name: 'node', type: 'bytes32' }],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
] as const;

// ─── Load deployment ────────────────────────────────────────────────────────

function loadDeployment() {
  const path = resolve(__dirname, '../../../packages/contracts/deployments/arbitrum-sepolia.json');
  return JSON.parse(readFileSync(path, 'utf-8'));
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const deployment = loadDeployment();
  const rpcUrl = process.env.AGENT_RPC_URL || process.env.ARBITRUM_SEPOLIA_RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc';

  const deployerPk = process.env.PRIVATE_KEY as Hex;
  const alphaPk = process.env.AGENT_ALPHA_PRIVATE_KEY as Hex;
  const betaPk = process.env.AGENT_BETA_PRIVATE_KEY as Hex;

  if (!deployerPk) throw new Error('PRIVATE_KEY not set');
  if (!alphaPk) throw new Error('AGENT_ALPHA_PRIVATE_KEY not set');
  if (!betaPk) throw new Error('AGENT_BETA_PRIVATE_KEY not set');

  const deployer = privateKeyToAccount(deployerPk);
  const alpha = privateKeyToAccount(alphaPk);
  const beta = privateKeyToAccount(betaPk);

  const ensRegistry = deployment.contracts.ENSRegistry as Hex;
  const agentRegistry = deployment.contracts.AgentRegistry as Hex;

  console.log('================================================');
  console.log('  CLAWLOGIC ENS Subdomain Setup');
  console.log('================================================');
  console.log(`  ENS Registry:    ${ensRegistry}`);
  console.log(`  Agent Registry:  ${agentRegistry}`);
  console.log(`  Deployer:        ${deployer.address}`);
  console.log(`  Alpha:           ${alpha.address}`);
  console.log(`  Beta:            ${beta.address}`);
  console.log('');

  const publicClient = createPublicClient({
    chain: arbitrumSepolia,
    transport: http(rpcUrl),
  });

  const deployerWallet = createWalletClient({
    account: deployer,
    chain: arbitrumSepolia,
    transport: http(rpcUrl),
  });

  const alphaWallet = createWalletClient({
    account: alpha,
    chain: arbitrumSepolia,
    transport: http(rpcUrl),
  });

  const betaWallet = createWalletClient({
    account: beta,
    chain: arbitrumSepolia,
    transport: http(rpcUrl),
  });

  // ── Step 1: Register "clawlogic.eth" parent domain ────────────────────
  const parentNode = namehash('clawlogic.eth');
  console.log(`[1/6] Registering clawlogic.eth (${parentNode.slice(0, 18)}...)...`);

  const currentOwner = await publicClient.readContract({
    address: ensRegistry,
    abi: mockEnsAbi,
    functionName: 'owner',
    args: [parentNode],
  });

  if (currentOwner === deployer.address) {
    console.log('  Already owned by deployer');
  } else {
    const tx = await deployerWallet.writeContract({
      address: ensRegistry,
      abi: mockEnsAbi,
      functionName: 'setOwner',
      args: [parentNode, deployer.address],
    });
    await publicClient.waitForTransactionReceipt({ hash: tx });
    console.log(`  TX: ${tx}`);
  }

  // ── Step 2: Create alpha.clawlogic.eth subdomain ──────────────────────
  const alphaLabel = keccak256(toHex('alpha'));
  const alphaNode = namehash('alpha.clawlogic.eth');
  console.log(`[2/6] Creating alpha.clawlogic.eth -> ${alpha.address}...`);

  const alphaOwner = await publicClient.readContract({
    address: ensRegistry,
    abi: mockEnsAbi,
    functionName: 'owner',
    args: [alphaNode],
  });

  if (alphaOwner === alpha.address) {
    console.log('  Already assigned');
  } else {
    const tx = await deployerWallet.writeContract({
      address: ensRegistry,
      abi: mockEnsAbi,
      functionName: 'setSubnodeOwner',
      args: [parentNode, alphaLabel, alpha.address],
    });
    await publicClient.waitForTransactionReceipt({ hash: tx });
    console.log(`  TX: ${tx}`);
  }

  // ── Step 3: Create beta.clawlogic.eth subdomain ───────────────────────
  const betaLabel = keccak256(toHex('beta'));
  const betaNode = namehash('beta.clawlogic.eth');
  console.log(`[3/6] Creating beta.clawlogic.eth -> ${beta.address}...`);

  const betaOwner = await publicClient.readContract({
    address: ensRegistry,
    abi: mockEnsAbi,
    functionName: 'owner',
    args: [betaNode],
  });

  if (betaOwner === beta.address) {
    console.log('  Already assigned');
  } else {
    const tx = await deployerWallet.writeContract({
      address: ensRegistry,
      abi: mockEnsAbi,
      functionName: 'setSubnodeOwner',
      args: [parentNode, betaLabel, beta.address],
    });
    await publicClient.waitForTransactionReceipt({ hash: tx });
    console.log(`  TX: ${tx}`);
  }

  // ── Step 4: Register Alpha with ENS ───────────────────────────────────
  console.log(`[4/6] Registering AlphaTrader with ENS linkage...`);

  const alphaRegistered = await publicClient.readContract({
    address: agentRegistry,
    abi: agentRegistryAbi,
    functionName: 'isAgent',
    args: [alpha.address],
  });

  if (alphaRegistered) {
    console.log('  Alpha already registered');
  } else {
    const tx = await alphaWallet.writeContract({
      address: agentRegistry,
      abi: agentRegistryAbi,
      functionName: 'registerAgentWithENS',
      args: ['AlphaTrader', '0x', alphaNode],
    });
    await publicClient.waitForTransactionReceipt({ hash: tx });
    console.log(`  TX: ${tx}`);
  }

  // ── Step 5: Register Beta with ENS ────────────────────────────────────
  console.log(`[5/6] Registering BetaTrader with ENS linkage...`);

  const betaRegistered = await publicClient.readContract({
    address: agentRegistry,
    abi: agentRegistryAbi,
    functionName: 'isAgent',
    args: [beta.address],
  });

  if (betaRegistered) {
    console.log('  Beta already registered');
  } else {
    const tx = await betaWallet.writeContract({
      address: agentRegistry,
      abi: agentRegistryAbi,
      functionName: 'registerAgentWithENS',
      args: ['BetaTrader', '0x', betaNode],
    });
    await publicClient.waitForTransactionReceipt({ hash: tx });
    console.log(`  TX: ${tx}`);
  }

  // ── Step 6: Verify ENS resolution ─────────────────────────────────────
  console.log(`[6/6] Verifying ENS resolution...`);

  const resolvedAlpha = await publicClient.readContract({
    address: agentRegistry,
    abi: agentRegistryAbi,
    functionName: 'getAgentByENS',
    args: [alphaNode],
  });
  console.log(`  alpha.clawlogic.eth -> ${resolvedAlpha}`);

  const resolvedBeta = await publicClient.readContract({
    address: agentRegistry,
    abi: agentRegistryAbi,
    functionName: 'getAgentByENS',
    args: [betaNode],
  });
  console.log(`  beta.clawlogic.eth  -> ${resolvedBeta}`);

  console.log('');
  console.log('================================================');
  console.log('  ENS Setup Complete!');
  console.log('  alpha.clawlogic.eth = AlphaTrader');
  console.log('  beta.clawlogic.eth  = BetaTrader');
  console.log('================================================');
}

main().catch((err) => {
  console.error('ENS setup failed:', err);
  process.exit(1);
});
