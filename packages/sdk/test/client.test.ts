import { describe, it, expect } from 'vitest';
import { ClawlogicClient, ARBITRUM_SEPOLIA_CONFIG, createConfig } from '../src/index.js';

describe('ClawlogicClient', () => {
  const DUMMY_PRIVATE_KEY =
    '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as `0x${string}`;

  it('should instantiate with config and private key', () => {
    const client = new ClawlogicClient(ARBITRUM_SEPOLIA_CONFIG, DUMMY_PRIVATE_KEY);
    expect(client).toBeDefined();
    expect(client).toBeInstanceOf(ClawlogicClient);
  });

  it('should instantiate without private key (read-only mode)', () => {
    const client = new ClawlogicClient(ARBITRUM_SEPOLIA_CONFIG);
    expect(client).toBeDefined();
    expect(client).toBeInstanceOf(ClawlogicClient);
    expect(client.walletClient).toBeUndefined();
  });

  it('should create config with custom RPC', () => {
    const customConfig = createConfig(
      {
        agentRegistry: '0x1234567890123456789012345678901234567890',
        predictionMarketHook: '0x1234567890123456789012345678901234567890',
        poolManager: '0x1234567890123456789012345678901234567890',
        optimisticOracleV3: '0x1234567890123456789012345678901234567890',
      },
      421614,
      'https://custom-rpc.example.com',
    );

    expect(customConfig.chainId).toBe(421614);
    expect(customConfig.rpcUrl).toBe('https://custom-rpc.example.com');
  });

  it('should have public client for read operations', () => {
    const client = new ClawlogicClient(ARBITRUM_SEPOLIA_CONFIG);
    expect(client.publicClient).toBeDefined();
  });

  it('should have wallet client when private key provided', () => {
    const client = new ClawlogicClient(ARBITRUM_SEPOLIA_CONFIG, DUMMY_PRIVATE_KEY);
    expect(client.walletClient).toBeDefined();
  });

  it('should expose getAddress method', () => {
    const client = new ClawlogicClient(ARBITRUM_SEPOLIA_CONFIG, DUMMY_PRIVATE_KEY);
    const address = client.getAddress();
    expect(address).toBeDefined();
    expect(address).toMatch(/^0x[a-fA-F0-9]{40}$/);
  });
});
