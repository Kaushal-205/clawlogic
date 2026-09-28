import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { homedir } from 'node:os';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import type { ClawlogicConfig } from '../types.js';
import { createConfig } from '../config.js';
import { ClawlogicClient } from '../client.js';
import {
  DEFAULT_NETWORK,
  DEFAULT_STATE_PATH,
  NETWORKS,
  ZERO_ADDRESS,
  type NetworkName,
} from './constants.js';

interface PersistedState {
  version: 1;
  privateKey: `0x${string}`;
  address: `0x${string}`;
  createdAt: string;
  /** Network the saved rpcUrl/contracts belong to (absent = arbitrum-sepolia). */
  network?: NetworkName;
  rpcUrl?: string;
  contracts?: Partial<ClawlogicConfig['contracts']>;
}

export interface RuntimeContext {
  client: ClawlogicClient;
  config: ClawlogicConfig;
  address?: `0x${string}`;
  statePath: string;
  createdWallet: boolean;
  state?: PersistedState;
}

export interface RuntimeOptions {
  requireWallet?: boolean;
  autoCreateWallet?: boolean;
}

export async function createRuntime(
  options: RuntimeOptions = {},
): Promise<RuntimeContext> {
  const statePath = resolveStatePath(process.env.CLAWLOGIC_STATE_PATH ?? DEFAULT_STATE_PATH);
  const state = await readState(statePath);
  let privateKey = readPrivateKeyFromEnv();
  let createdWallet = false;

  if (!privateKey && state?.privateKey) {
    privateKey = state.privateKey;
  }

  if (!privateKey && options.requireWallet && options.autoCreateWallet !== false) {
    const generated = generatePrivateKey();
    const address = privateKeyToAccount(generated).address;
    const nextState: PersistedState = {
      version: 1,
      privateKey: generated,
      address,
      createdAt: new Date().toISOString(),
      network: state?.network,
      rpcUrl: state?.rpcUrl,
      contracts: state?.contracts,
    };
    await writeState(statePath, nextState);
    privateKey = generated;
    createdWallet = true;
  }

  if (!privateKey && options.requireWallet) {
    throw new Error(
      'No wallet available. Run `npx @clawlogic/sdk@latest clawlogic-agent init` first.',
    );
  }

  const config = resolveConfig(state);
  const client = new ClawlogicClient(config, privateKey);
  const address = privateKey ? privateKeyToAccount(privateKey).address : state?.address;

  return {
    client,
    config,
    address,
    statePath,
    createdWallet,
    state: state ?? undefined,
  };
}

export function resolveNetwork(value = process.env.CLAWLOGIC_NETWORK): NetworkName {
  const name = value?.trim().toLowerCase() || DEFAULT_NETWORK;
  if (!(name in NETWORKS)) {
    throw new Error(
      `Unknown CLAWLOGIC_NETWORK "${value}". Expected one of: ${Object.keys(NETWORKS).join(', ')}.`,
    );
  }
  return name as NetworkName;
}

function resolveConfig(state: PersistedState | null): ClawlogicConfig {
  const networkName = resolveNetwork();
  const network = NETWORKS[networkName];
  // State saved by older CLI versions has no network and was always testnet.
  const stateMatches = (state?.network ?? DEFAULT_NETWORK) === networkName;
  const saved = stateMatches ? state : null;

  const rpcUrl =
    process.env[network.rpcEnvVar] ??
    process.env.CLAWLOGIC_RPC_URL ??
    saved?.rpcUrl ??
    network.rpcUrl;

  const agentRegistry =
    process.env.AGENT_REGISTRY ??
    saved?.contracts?.agentRegistry ??
    network.contracts.agentRegistry;
  const predictionMarketHook =
    process.env.PREDICTION_MARKET_HOOK ??
    saved?.contracts?.predictionMarketHook ??
    network.contracts.predictionMarketHook;
  const poolManager =
    process.env.V4_POOL_MANAGER ??
    saved?.contracts?.poolManager ??
    network.contracts.poolManager;
  const optimisticOracleV3 =
    process.env.UMA_OOV3 ??
    saved?.contracts?.optimisticOracleV3 ??
    network.contracts.optimisticOracleV3;

  if (agentRegistry === ZERO_ADDRESS || predictionMarketHook === ZERO_ADDRESS) {
    throw new Error(
      `CLAWLOGIC is not configured for ${network.label} yet. ` +
        'Set AGENT_REGISTRY and PREDICTION_MARKET_HOOK to the deployed addresses.',
    );
  }

  return createConfig(
    {
      agentRegistry: agentRegistry as `0x${string}`,
      predictionMarketHook: predictionMarketHook as `0x${string}`,
      poolManager: poolManager as `0x${string}`,
      optimisticOracleV3: optimisticOracleV3 as `0x${string}`,
    },
    network.chainId,
    rpcUrl,
  );
}

function readPrivateKeyFromEnv(): `0x${string}` | undefined {
  const candidate = process.env.AGENT_PRIVATE_KEY?.trim();
  if (!candidate) {
    return undefined;
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(candidate)) {
    throw new Error('AGENT_PRIVATE_KEY must be a 32-byte hex string (0x + 64 hex chars).');
  }
  return candidate as `0x${string}`;
}

async function readState(path: string): Promise<PersistedState | null> {
  try {
    const raw = await readFile(path, 'utf-8');
    const parsed = JSON.parse(raw) as PersistedState;
    if (!parsed.privateKey || !parsed.address) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function writeState(path: string, state: PersistedState): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, JSON.stringify(state, null, 2), { mode: 0o600 });
  await chmod(path, 0o600);
}

function resolveStatePath(path: string): string {
  if (path.startsWith('~/')) {
    return resolve(homedir(), path.slice(2));
  }
  return resolve(path);
}
