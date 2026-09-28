import { describe, expect, it } from 'vitest';
import { computeMarketKey, findSimilarMarkets, questionSimilarity } from '../src/index.js';

describe('duplicate market detection', () => {
  it('matches the on-chain key (vector shared with PredictionMarketRevenue.t.sol)', () => {
    expect(computeMarketKey('Will ETH close above $4,000 on 2026-12-31?', 'yes', 'no')).toBe(
      '0xbdddf6b4df6ce72b8abde955df810addccc93dcfad89fd8e424e5ddf508c21bc',
    );
  });

  it('ignores case, punctuation and outcome order like the contract', () => {
    const key = computeMarketKey('Will ETH close above $4,000 on 2026-12-31?', 'yes', 'no');
    expect(computeMarketKey('will eth close above 4000 on 20261231', 'NO', 'Yes')).toBe(key);
  });

  it('rejects identical outcomes', () => {
    expect(() => computeMarketKey('Q?', 'yes', 'YES!')).toThrow(/distinct outcomes/);
  });

  it('flags reworded questions about the same event', () => {
    expect(
      questionSimilarity('Will ETH close above $4,000 on 2026-12-31?', 'ETH over 4k on Dec 31 2026'),
    ).toBeGreaterThanOrEqual(0.7);
    expect(
      questionSimilarity('Will the Fed cut rates in December 2026?', 'Fed rate cut December 2026?'),
    ).toBeGreaterThanOrEqual(0.7);
  });

  it('keeps different thresholds and dates apart', () => {
    expect(
      questionSimilarity(
        'Will ETH close above $4,000 on 2026-12-31?',
        'Will ETH close above $5,000 on 2026-12-31?',
      ),
    ).toBeLessThan(0.7);
    expect(
      questionSimilarity('Will BTC hit 150k by end of 2026?', 'Will BTC hit 150k by end of 2027?'),
    ).toBeLessThan(0.7);
  });

  it('ranks similar open markets', () => {
    const markets = [
      { marketId: '0x01' as const, description: 'Will Solana flip Ethereum by 2027?' },
      { marketId: '0x02' as const, description: 'ETH over 4k on Dec 31 2026' },
    ];
    const similar = findSimilarMarkets(markets, 'Will ETH close above $4,000 on 2026-12-31?');
    expect(similar.map((m) => m.marketId)).toEqual(['0x02']);
  });
});
