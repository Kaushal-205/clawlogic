import { describe, it, expect } from 'vitest';
import { ClawlogicClient, ARBITRUM_SEPOLIA_CONFIG } from '../src/index.js';

describe('ClawlogicClient', () => {
  const DUMMY_PRIVATE_KEY =
    '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as `0x${string}`;

  it('should instantiate with config and private key', () => {
    const client = new ClawlogicClient(ARBITRUM_SEPOLIA_CONFIG, DUMMY_PRIVATE_KEY);
    expect(client).toBeDefined();
    expect(client).toBeInstanceOf(ClawlogicClient);
  });

  it('should throw "Not implemented" for stub methods', async () => {
    const client = new ClawlogicClient(ARBITRUM_SEPOLIA_CONFIG, DUMMY_PRIVATE_KEY);

    await expect(client.registerAgent('test', 'attestation')).rejects.toThrow('Not implemented');
    await expect(client.isAgent('0x0000000000000000000000000000000000000000')).rejects.toThrow(
      'Not implemented',
    );
    await expect(client.createMarket('question', 'Yes', 'No')).rejects.toThrow('Not implemented');
    await expect(client.mintOutcomeTokens(1n, 100n)).rejects.toThrow('Not implemented');
    await expect(client.assertMarket(1n, 1)).rejects.toThrow('Not implemented');
    await expect(
      client.disputeAssertion('0x0000000000000000000000000000000000000000000000000000000000000001'),
    ).rejects.toThrow('Not implemented');
    await expect(client.settleMarket(1n)).rejects.toThrow('Not implemented');
    await expect(client.settleOutcomeTokens(1n, 100n)).rejects.toThrow('Not implemented');
    await expect(client.getMarket(1n)).rejects.toThrow('Not implemented');
    await expect(
      client.getPositions(1n, '0x0000000000000000000000000000000000000000'),
    ).rejects.toThrow('Not implemented');
  });
});
