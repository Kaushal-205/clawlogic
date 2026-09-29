import { describe, expect, it } from 'vitest';
import { computeMarketKey, findSimilarMarkets, questionSimilarity } from '../src/index.js';

describe('duplicate market detection', () => {
  it('matches the on-chain key (vector shared with PredictionMarketRevenue.t.sol)', () => {
    expect(computeMarketKey('Will ETH close above $4,000 on 2026-12-31?', 'yes', 'no')).toBe(
      '0xc839be639246d2c604354c054587be09c0629f7979473d2db256b1216c5f8b6a',
    );
    expect(computeMarketKey('Café index up -5.5% by 12:00, (1,000 pts)?\t', 'Up', 'Down.')).toBe(
      '0xb0b4047fb7b05596ce69928c805c5c34ac765be94a52c1ba072bf73ee8c45cab',
    );
  });

  it('ignores case, whitespace, sentence punctuation and outcome order like the contract', () => {
    const key = computeMarketKey('Will ETH close above $4,000 on 2026-12-31?', 'yes', 'no');
    expect(computeMarketKey('  will ETH close above $4,000 on 2026-12-31 ', 'YES', 'No')).toBe(key);
    expect(computeMarketKey('Who wins?', 'Harris', 'Trump')).toBe(computeMarketKey('who wins', 'trump', 'harris'));
  });

  it('keeps symbols that change the meaning', () => {
    expect(computeMarketKey('BTC > $100', 'yes', 'no')).not.toBe(computeMarketKey('BTC < $100', 'yes', 'no'));
    expect(computeMarketKey('Price > $1.50', 'yes', 'no')).not.toBe(
      computeMarketKey('Price > $150', 'yes', 'no'),
    );
    expect(computeMarketKey('btc>$100.', 'YES', 'NO')).toBe(computeMarketKey('BTC > $100', 'yes', 'no'));
  });

  it('rejects identical, reserved and reversed yes/no outcomes', () => {
    expect(() => computeMarketKey('Q?', 'yes', 'YES!')).toThrow(/distinct outcomes/);
    expect(() => computeMarketKey('Q?', 'yes', 'Unresolvable')).toThrow(/reserved/);
    expect(() => computeMarketKey('Q?', 'No', 'Yes')).toThrow(/"yes" first/);
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
