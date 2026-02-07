import {
  ClawlogicClient,
  agentRegistryAbi,
  agentIdentityRegistryAbi,
} from '@clawlogic/sdk';
import { createWalletClient, http, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { namehash } from 'viem/ens';
import { publishAgentBroadcast } from './broadcast.js';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const;
const ZERO_BYTES32 =
  '0x0000000000000000000000000000000000000000000000000000000000000000' as const;

export interface EnsureAgentOnboardingOptions {
  name: string;
  attestation?: Hex;
  ensNode?: Hex;
  ensName?: string;
  identityMetadataUri?: string;
  identityMinterPrivateKey?: Hex;
}

export interface EnsureAgentOnboardingResult {
  address: `0x${string}`;
  alreadyRegistered: boolean;
  registrationTxHash?: `0x${string}`;
  registrationMethod: 'existing' | 'registerAgent' | 'registerAgentWithENS';
  ensNode: Hex;
  identityAgentId?: bigint;
  identityMinted: boolean;
}

function isConfiguredAddress(address?: `0x${string}`): address is `0x${string}` {
  return Boolean(address && address.toLowerCase() !== ZERO_ADDRESS);
}

function resolveEnsNode(
  ensNode?: Hex,
  ensName?: string,
): Hex {
  if (ensNode) {
    return ensNode;
  }
  if (!ensName) {
    return ZERO_BYTES32;
  }
  return namehash(ensName) as Hex;
}

async function findIdentityAgentId(
  client: ClawlogicClient,
  identityRegistry: `0x${string}`,
  owner: `0x${string}`,
): Promise<bigint | undefined> {
  const balance = await client.publicClient.readContract({
    address: identityRegistry,
    abi: agentIdentityRegistryAbi,
    functionName: 'balanceOf',
    args: [owner],
  }) as bigint;

  if (balance === 0n) {
    return undefined;
  }

  const totalAgents = await client.publicClient.readContract({
    address: identityRegistry,
    abi: agentIdentityRegistryAbi,
    functionName: 'totalAgents',
  }) as bigint;

  for (let id = 1n; id <= totalAgents; id++) {
    try {
      const tokenOwner = await client.publicClient.readContract({
        address: identityRegistry,
        abi: agentIdentityRegistryAbi,
        functionName: 'ownerOf',
        args: [id],
      }) as `0x${string}`;

      if (tokenOwner.toLowerCase() === owner.toLowerCase()) {
        return id;
      }
    } catch {
      // Ignore non-existent IDs in sparse ranges.
    }
  }

  return undefined;
}

async function mintIdentityIfPossible(
  client: ClawlogicClient,
  to: `0x${string}`,
  metadataUri: string,
  minterPrivateKey: Hex | undefined,
): Promise<boolean> {
  const identityRegistry = client.config.contracts.agentIdentityRegistry;
  if (!isConfiguredAddress(identityRegistry) || !minterPrivateKey) {
    return false;
  }

  const minter = privateKeyToAccount(minterPrivateKey);
  const wallet = createWalletClient({
    account: minter,
    chain: client.publicClient.chain,
    transport: http(client.config.rpcUrl),
  });

  const hash = await wallet.writeContract({
    address: identityRegistry,
    abi: agentIdentityRegistryAbi,
    functionName: 'mintAgentIdentity',
    args: [to, metadataUri],
  });

  await client.publicClient.waitForTransactionReceipt({ hash });
  return true;
}

export async function ensureAgentOnboarding(
  client: ClawlogicClient,
  options: EnsureAgentOnboardingOptions,
): Promise<EnsureAgentOnboardingResult> {
  const address = client.getAddress();
  if (!address) {
    throw new Error('Onboarding requires a wallet-backed ClawlogicClient.');
  }

  const attestation = (options.attestation ?? '0x') as Hex;
  const ensNode = resolveEnsNode(options.ensNode, options.ensName);
  const identityRegistry = client.config.contracts.agentIdentityRegistry;

  let identityAgentId = isConfiguredAddress(identityRegistry)
    ? await findIdentityAgentId(client, identityRegistry, address)
    : undefined;
  let identityMinted = false;

  if (!identityAgentId && isConfiguredAddress(identityRegistry)) {
    const metadataUri =
      options.identityMetadataUri ??
      `ipfs://clawlogic/agents/${address.toLowerCase()}`;
    const minterKey =
      options.identityMinterPrivateKey ??
      (process.env.IDENTITY_MINTER_PRIVATE_KEY as Hex | undefined);

    try {
      identityMinted = await mintIdentityIfPossible(
        client,
        address,
        metadataUri,
        minterKey,
      );
      if (identityMinted) {
        identityAgentId = await findIdentityAgentId(client, identityRegistry, address);
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log(`  Identity mint skipped: ${msg}`);
    }
  }

  const alreadyRegistered = await client.isAgent(address);
  if (alreadyRegistered) {
    void publishAgentBroadcast({
      type: 'Onboarding',
      agent: options.name,
      agentAddress: address,
      ensName: options.ensName,
      ensNode: ensNode,
      confidence: 100,
      reasoning:
        'Onboarding check complete: wallet is already registered in AgentRegistry.',
    }).catch(() => undefined);

    return {
      address,
      alreadyRegistered: true,
      registrationMethod: 'existing',
      ensNode,
      identityAgentId,
      identityMinted,
    };
  }

  if (ensNode !== ZERO_BYTES32) {
    if (!client.walletClient) {
      throw new Error('Wallet client is required to register with ENS.');
    }

    const registrationTxHash = await client.walletClient.writeContract({
      address: client.config.contracts.agentRegistry,
      abi: agentRegistryAbi,
      functionName: 'registerAgentWithENS',
      args: [options.name, attestation, ensNode],
    });
    await client.publicClient.waitForTransactionReceipt({ hash: registrationTxHash });
    void publishAgentBroadcast({
      type: 'Onboarding',
      agent: options.name,
      agentAddress: address,
      ensName: options.ensName,
      ensNode: ensNode,
      confidence: 100,
      reasoning:
        ensNode === ZERO_BYTES32
          ? 'Registered as agent using base flow.'
          : 'Registered as agent with ENS-linked identity.',
    }).catch(() => undefined);

    return {
      address,
      alreadyRegistered: false,
      registrationTxHash,
      registrationMethod: 'registerAgentWithENS',
      ensNode,
      identityAgentId,
      identityMinted,
    };
  }

  const registrationTxHash = await client.registerAgent(options.name, attestation);
  void publishAgentBroadcast({
    type: 'Onboarding',
    agent: options.name,
    agentAddress: address,
    ensName: options.ensName,
    ensNode: ensNode,
    confidence: 100,
    reasoning: 'Registered as agent using base flow.',
  }).catch(() => undefined);

  return {
    address,
    alreadyRegistered: false,
    registrationTxHash,
    registrationMethod: 'registerAgent',
    ensNode,
    identityAgentId,
    identityMinted,
  };
}
