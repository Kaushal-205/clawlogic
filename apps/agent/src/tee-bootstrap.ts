/**
 * TEE Bootstrap Script for Phala CVM Deployment
 *
 * Runs at container startup inside a Phala CVM (Intel TDX) to:
 *   1. Detect TEE environment (dstack socket availability)
 *   2. Get TEE attestation quote via @phala/dstack-sdk
 *   3. Derive a deterministic wallet key from TEE hardware
 *   4. Register the agent on-chain with TEE attestation proof
 *   5. Hand off to the OpenClaw agent process
 *
 * Environment variables:
 *   AGENT_PRIVATE_KEY          - Fallback private key (used outside TEE)
 *   AGENT_NAME                 - Human-readable agent name (default: "CVM-Agent")
 *   ARBITRUM_SEPOLIA_RPC_URL   - RPC endpoint
 *   AGENT_REGISTRY             - AgentRegistry contract address
 *   AGENT_VALIDATION_REGISTRY  - (optional) AgentValidationRegistry for on-chain TEE verification
 *   AGENT_IDENTITY_ID          - (optional) ERC-8004 identity ID owned by AGENT_PRIVATE_KEY
 *   PREDICTION_MARKET_HOOK     - PredictionMarketHook contract address
 *   V4_POOL_MANAGER            - PoolManager address
 *   DSTACK_SIMULATOR_ENDPOINT  - (optional) dstack simulator for local testing
 */

import { spawn } from 'child_process';
import { createPublicClient, createWalletClient, http, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arbitrumSepolia } from 'viem/chains';
import 'dotenv/config';
import { agentRegistryAbi, agentValidationRegistryAbi } from '@clawlogic/sdk';

// ─── Types ──────────────────────────────────────────────────────────────────

interface TeeBootstrapResult {
  inTee: boolean;
  address: `0x${string}`;
  attestationQuote: Hex | null;
  publicKey: Hex | null;
  /** TEE-derived secret key; kept in memory only to sign the identity binding. */
  teeKey: Hex | null;
  registered: boolean;
  txHash: Hex | null;
}

// ─── TEE Detection & Attestation ────────────────────────────────────────────

/**
 * Attempt to load the Phala dstack SDK and generate a TEE attestation quote.
 * Returns null values if not running inside a TEE.
 */
async function getTeeAttestation(): Promise<{
  quote: Hex;
  publicKey: Hex;
  teeKey: Hex;
} | null> {
  try {
    // Dynamic import — @phala/dstack-sdk is only available inside Phala CVM
    const { DstackClient } = await import('@phala/dstack-sdk');

    const endpoint = process.env.DSTACK_SIMULATOR_ENDPOINT || undefined;
    const client = new DstackClient(endpoint);

    // Derive a deterministic secp256k1 key from the TEE hardware. The derived
    // key is secret material -- only its public key ever leaves the enclave.
    const keyResult = await client.getKey('/clawlogic/agent/v1');
    const derivedKey = ('0x' + Buffer.from(keyResult.key).toString('hex')) as Hex;
    // Uncompressed public key without the 0x04 prefix: exactly 64 bytes, the
    // maximum TDX report_data size, so the quote binds to this key.
    const publicKey = ('0x' + privateKeyToAccount(derivedKey).publicKey.slice(4)) as Hex;

    // Generate attestation quote with the public key as report data
    const quoteResult = await client.getQuote(Buffer.from(publicKey.slice(2), 'hex'));
    // dstack returns the quote as a hex string; normalize to a 0x-prefixed Hex.
    const quote = ('0x' + quoteResult.quote.replace(/^0x/, '')) as Hex;

    console.log('[tee-bootstrap] TEE attestation obtained successfully');
    console.log(`[tee-bootstrap]   Quote length: ${quote.length / 2 - 1} bytes`);
    console.log(`[tee-bootstrap]   Public key: ${publicKey.slice(0, 20)}...`);

    return { quote, publicKey, teeKey: derivedKey };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log(`[tee-bootstrap] Not in TEE environment (${msg})`);
    return null;
  }
}

// ─── On-Chain Registration ──────────────────────────────────────────────────

async function registerAgent(result: TeeBootstrapResult): Promise<TeeBootstrapResult> {
  const rpcUrl = process.env.ARBITRUM_SEPOLIA_RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc';
  const registryAddress = process.env.AGENT_REGISTRY as `0x${string}` | undefined;

  if (!registryAddress) {
    console.log('[tee-bootstrap] AGENT_REGISTRY not set — skipping on-chain registration');
    return result;
  }

  const privateKey = process.env.AGENT_PRIVATE_KEY as Hex | undefined;
  if (!privateKey) {
    console.log('[tee-bootstrap] AGENT_PRIVATE_KEY not set — skipping on-chain registration');
    return result;
  }

  const account = privateKeyToAccount(privateKey);
  result.address = account.address;

  const publicClient = createPublicClient({
    chain: arbitrumSepolia,
    transport: http(rpcUrl),
  });

  const walletClient = createWalletClient({
    account,
    chain: arbitrumSepolia,
    transport: http(rpcUrl),
  });

  // Check if already registered
  const isRegistered = await publicClient.readContract({
    address: registryAddress,
    abi: agentRegistryAbi,
    functionName: 'isAgent',
    args: [account.address],
  });

  if (isRegistered) {
    console.log(`[tee-bootstrap] Agent ${account.address} is already registered`);
    result.registered = true;
  } else {
    const agentName = process.env.AGENT_NAME || 'CVM-Agent';
    const attestationBytes = (result.attestationQuote || '0x') as Hex;

    console.log(`[tee-bootstrap] Registering agent "${agentName}"...`);
    const hash = await walletClient.writeContract({
      address: registryAddress,
      abi: agentRegistryAbi,
      functionName: 'registerAgent',
      args: [agentName, attestationBytes],
    });
    result.txHash = hash;
    console.log(`[tee-bootstrap] Registration tx: ${hash}`);
  }

  // Wait for confirmation
  if (result.txHash) {
    const receipt = await publicClient.waitForTransactionReceipt({ hash: result.txHash });
    console.log(`[tee-bootstrap] Confirmed in block ${receipt.blockNumber} (status: ${receipt.status})`);
    result.registered = receipt.status === 'success';
  }

  // On-chain TEE verification: the TEE key signs a message binding it to this
  // identity (ID, owner, nonce), so the quote cannot certify another identity.
  const validationRegistry = process.env.AGENT_VALIDATION_REGISTRY as `0x${string}` | undefined;
  const identityId = process.env.AGENT_IDENTITY_ID;
  if (result.inTee && result.attestationQuote && result.publicKey && result.teeKey && validationRegistry && identityId) {
    const agentId = BigInt(identityId);
    const digest = await publicClient.readContract({
      address: validationRegistry,
      abi: agentValidationRegistryAbi,
      functionName: 'teeBindingDigest',
      args: [agentId],
    });
    const keySignature = await privateKeyToAccount(result.teeKey).sign({ hash: digest });
    const teeHash = await walletClient.writeContract({
      address: validationRegistry,
      abi: agentValidationRegistryAbi,
      functionName: 'verifyTeeAttestation',
      args: [agentId, result.attestationQuote, result.publicKey, keySignature],
    });
    const teeReceipt = await publicClient.waitForTransactionReceipt({ hash: teeHash });
    console.log(`[tee-bootstrap] TEE verification tx: ${teeHash} (status: ${teeReceipt.status})`);
  }

  return result;
}

// ─── OpenClaw Agent Launch ──────────────────────────────────────────────────

function launchOpenClaw(): void {
  console.log('[tee-bootstrap] Launching OpenClaw agent...');

  const child = spawn('npx', ['openclaw', 'run', '--skill', 'clawlogic-trader'], {
    stdio: 'inherit',
    env: process.env,
  });

  child.on('error', (err) => {
    console.error(`[tee-bootstrap] Failed to start OpenClaw: ${err.message}`);
    // Fall back to running our own agent scripts
    console.log('[tee-bootstrap] Falling back to agent-alpha script...');
    const fallback = spawn('npx', ['tsx', 'src/agent-alpha.ts'], {
      stdio: 'inherit',
      env: process.env,
    });
    fallback.on('exit', (code) => process.exit(code ?? 1));
  });

  child.on('exit', (code) => {
    console.log(`[tee-bootstrap] OpenClaw exited with code ${code}`);
    process.exit(code ?? 0);
  });
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  CLAWLOGIC TEE Bootstrap — Phala CVM Agent Startup');
  console.log('═══════════════════════════════════════════════════════');

  const result: TeeBootstrapResult = {
    inTee: false,
    address: '0x0000000000000000000000000000000000000000',
    attestationQuote: null,
    publicKey: null,
    teeKey: null,
    registered: false,
    txHash: null,
  };

  // Step 1: Detect TEE and get attestation
  const teeData = await getTeeAttestation();
  if (teeData) {
    result.inTee = true;
    result.attestationQuote = teeData.quote;
    result.publicKey = teeData.publicKey;
    result.teeKey = teeData.teeKey;
    console.log('[tee-bootstrap] Running inside TEE (Intel TDX)');
  } else {
    console.log('[tee-bootstrap] Running outside TEE (local/dev mode)');
  }

  // Step 2: Register on-chain
  try {
    await registerAgent(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[tee-bootstrap] Registration failed: ${msg}`);
    console.log('[tee-bootstrap] Continuing without registration...');
  }

  // Step 3: Summary
  console.log('');
  console.log('[tee-bootstrap] Summary:');
  console.log(`  TEE:          ${result.inTee ? 'YES (Intel TDX)' : 'NO (local)'}`);
  console.log(`  Address:      ${result.address}`);
  console.log(`  Registered:   ${result.registered}`);
  console.log(`  TX Hash:      ${result.txHash || 'N/A'}`);
  console.log(`  Attestation:  ${result.attestationQuote ? result.attestationQuote.slice(0, 20) + '...' : 'N/A'}`);
  console.log('');

  // Step 4: Launch OpenClaw agent
  launchOpenClaw();
}

main().catch((err) => {
  console.error('[tee-bootstrap] Fatal error:', err);
  process.exit(1);
});
