import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRuntime, resolveNetwork } from '../src/cli/runtime.js';
import { DEFAULT_CONTRACTS } from '../src/cli/constants.js';
import { ARBITRUM_ONE_CONFIG } from '../src/index.js';

const ENV_KEYS = [
  'CLAWLOGIC_NETWORK',
  'CLAWLOGIC_STATE_PATH',
  'CLAWLOGIC_RPC_URL',
  'ARBITRUM_SEPOLIA_RPC_URL',
  'ARBITRUM_ONE_RPC_URL',
  'AGENT_PRIVATE_KEY',
  'AGENT_REGISTRY',
  'PREDICTION_MARKET_HOOK',
  'V4_POOL_MANAGER',
  'UMA_OOV3',
];

const MAINNET_REGISTRY = '0x1111111111111111111111111111111111111111';
const MAINNET_HOOK = '0x2222222222222222222222222222222222222222';

describe('CLI network selection', () => {
  let saved: Record<string, string | undefined>;
  let dir: string;

  beforeEach(async () => {
    saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
    for (const key of ENV_KEYS) delete process.env[key];
    dir = await mkdtemp(join(tmpdir(), 'clawlogic-cli-'));
    process.env.CLAWLOGIC_STATE_PATH = join(dir, 'agent.json');
  });

  afterEach(async () => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    await rm(dir, { recursive: true, force: true });
  });

  it('defaults to Arbitrum Sepolia with the testnet deployment', async () => {
    expect(resolveNetwork()).toBe('arbitrum-sepolia');
    const { config } = await createRuntime();
    expect(config.chainId).toBe(421614);
    expect(config.contracts.agentRegistry).toBe(DEFAULT_CONTRACTS.agentRegistry);
  });

  it('rejects unknown networks', () => {
    expect(() => resolveNetwork('mainnet')).toThrow(/Unknown CLAWLOGIC_NETWORK/);
  });

  it('refuses Arbitrum One until the protocol addresses are provided', async () => {
    process.env.CLAWLOGIC_NETWORK = 'arbitrum-one';
    await expect(createRuntime()).rejects.toThrow(/not configured for Arbitrum One/);
  });

  it('uses Arbitrum One defaults and ignores testnet-only settings', async () => {
    process.env.CLAWLOGIC_NETWORK = 'arbitrum-one';
    process.env.AGENT_REGISTRY = MAINNET_REGISTRY;
    process.env.PREDICTION_MARKET_HOOK = MAINNET_HOOK;
    process.env.ARBITRUM_SEPOLIA_RPC_URL = 'https://sepolia.example.com';
    // Legacy state (no `network`) belongs to Arbitrum Sepolia.
    await writeFile(
      process.env.CLAWLOGIC_STATE_PATH!,
      JSON.stringify({
        version: 1,
        privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
        address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
        createdAt: '2026-01-01T00:00:00.000Z',
        rpcUrl: 'https://sepolia-state.example.com',
        contracts: { poolManager: DEFAULT_CONTRACTS.poolManager },
      }),
    );

    const { config } = await createRuntime();
    expect(config.chainId).toBe(42161);
    expect(config.rpcUrl).toBe(ARBITRUM_ONE_CONFIG.rpcUrl);
    expect(config.contracts.agentRegistry).toBe(MAINNET_REGISTRY);
    expect(config.contracts.predictionMarketHook).toBe(MAINNET_HOOK);
    expect(config.contracts.poolManager).toBe(ARBITRUM_ONE_CONFIG.contracts.poolManager);
    expect(config.contracts.optimisticOracleV3).toBe(
      ARBITRUM_ONE_CONFIG.contracts.optimisticOracleV3,
    );
  });

  it('honours the network-specific RPC override', async () => {
    process.env.CLAWLOGIC_NETWORK = 'arbitrum-one';
    process.env.AGENT_REGISTRY = MAINNET_REGISTRY;
    process.env.PREDICTION_MARKET_HOOK = MAINNET_HOOK;
    process.env.ARBITRUM_ONE_RPC_URL = 'https://arb-mainnet.example.com';
    const { config } = await createRuntime();
    expect(config.rpcUrl).toBe('https://arb-mainnet.example.com');
  });
});
