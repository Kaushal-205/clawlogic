import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { homedir } from 'node:os';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import type { ClawlogicConfig } from '../types.js';
import { createConfig } from '../config.js';
import { ClawlogicClient } from '../client.js';
import {
  DEFAULT_CHAIN_ID,
  DEFAULT_CONTRACTS,
  DEFAULT_RPC_URL,
  DEFAULT_STATE_PATH,
} from './constants.js';

interface PersistedState {
  version: 1;
  privateKey: `0x${string}`;
  address: `0x${string}`;
  createdAt: string;
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

function resolveConfig(state: PersistedState | null): ClawlogicConfig {
  const rpcUrl =
    process.env.ARBITRUM_SEPOLIA_RPC_URL ??
    process.env.CLAWLOGIC_RPC_URL ??
    state?.rpcUrl ??
    DEFAULT_RPC_URL;

  const agentRegistry =
    process.env.AGENT_REGISTRY ??
    state?.contracts?.agentRegistry ??
    DEFAULT_CONTRACTS.agentRegistry;
  const predictionMarketHook =
    process.env.PREDICTION_MARKET_HOOK ??
    state?.contracts?.predictionMarketHook ??
    DEFAULT_CONTRACTS.predictionMarketHook;
  const poolManager =
    process.env.V4_POOL_MANAGER ??
    state?.contracts?.poolManager ??
    DEFAULT_CONTRACTS.poolManager;
  const optimisticOracleV3 =
    process.env.UMA_OOV3 ??
    state?.contracts?.optimisticOracleV3 ??
    DEFAULT_CONTRACTS.optimisticOracleV3;

  return createConfig(
    {
      agentRegistry: agentRegistry as `0x${string}`,
      predictionMarketHook: predictionMarketHook as `0x${string}`,
      poolManager: poolManager as `0x${string}`,
      optimisticOracleV3: optimisticOracleV3 as `0x${string}`,
    },
    DEFAULT_CHAIN_ID,
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
