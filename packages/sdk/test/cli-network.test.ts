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

  it('defaults to the Arbitrum One deployment', async () => {
    expect(resolveNetwork()).toBe('arbitrum-one');
    const { config } = await createRuntime();
    expect(config.chainId).toBe(42161);
    expect(config.rpcUrl).toBe(ARBITRUM_ONE_CONFIG.rpcUrl);
    expect(config.contracts.agentRegistry).toBe(DEFAULT_CONTRACTS.agentRegistry);
    expect(config.contracts.predictionMarketHook).toBe(
      ARBITRUM_ONE_CONFIG.contracts.predictionMarketHook,
    );
    expect(config.contracts.agentRegistry).not.toMatch(/^0x0{40}$/);
    expect(config.contracts.predictionMarketHook).not.toMatch(/^0x0{40}$/);
  });

  it('rejects unknown networks', () => {
    expect(() => resolveNetwork('mainnet')).toThrow(/Unknown CLAWLOGIC_NETWORK/);
  });

  it('explains that Arbitrum Sepolia is retired', () => {
    expect(() => resolveNetwork('arbitrum-sepolia')).toThrow(/no longer runs on Arbitrum Sepolia/);
  });

  it('keeps the legacy wallet but ignores its testnet rpcUrl/contracts', async () => {
    process.env.ARBITRUM_SEPOLIA_RPC_URL = 'https://sepolia.example.com';
    // State written by CLI versions before 0.2.0 has no `network` and points at Arbitrum Sepolia.
    await writeFile(
      process.env.CLAWLOGIC_STATE_PATH!,
      JSON.stringify({
        version: 1,
        privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
        address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
        createdAt: '2026-01-01T00:00:00.000Z',
        rpcUrl: 'https://sepolia-state.example.com',
        contracts: {
          agentRegistry: '0xd0B1864A1da6407A7DE5a08e5f82352b5e230cd3',
          predictionMarketHook: '0xB3C4a85906493f3Cf0d59e891770Bb2e77FA8880',
          poolManager: '0xFB3e0C6F74eB1a21CC1Da29aeC80D2Dfe6C9a317',
        },
      }),
    );

    const { config, address } = await createRuntime();
    expect(address).toBe('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');
    expect(config.chainId).toBe(42161);
    expect(config.rpcUrl).toBe(ARBITRUM_ONE_CONFIG.rpcUrl);
    expect(config.contracts.agentRegistry).toBe(ARBITRUM_ONE_CONFIG.contracts.agentRegistry);
    expect(config.contracts.predictionMarketHook).toBe(
      ARBITRUM_ONE_CONFIG.contracts.predictionMarketHook,
    );
    expect(config.contracts.poolManager).toBe(ARBITRUM_ONE_CONFIG.contracts.poolManager);
    expect(config.contracts.optimisticOracleV3).toBe(
      ARBITRUM_ONE_CONFIG.contracts.optimisticOracleV3,
    );
  });

  it('lets env vars override the deployed addresses', async () => {
    process.env.AGENT_REGISTRY = MAINNET_REGISTRY;
    process.env.PREDICTION_MARKET_HOOK = MAINNET_HOOK;
    const { config } = await createRuntime();
    expect(config.contracts.agentRegistry).toBe(MAINNET_REGISTRY);
    expect(config.contracts.predictionMarketHook).toBe(MAINNET_HOOK);
  });

  it('honours the network-specific RPC override', async () => {
    process.env.ARBITRUM_ONE_RPC_URL = 'https://arb-mainnet.example.com';
    const { config } = await createRuntime();
    expect(config.rpcUrl).toBe('https://arb-mainnet.example.com');
  });
});
