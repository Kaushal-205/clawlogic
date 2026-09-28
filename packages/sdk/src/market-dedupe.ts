import { encodeAbiParameters, keccak256, toBytes, toHex } from 'viem';

/**
 * Duplicate-market helpers.
 *
 * The contract rejects an exact duplicate of an unresolved market (same
 * question after lower-casing and dropping spaces/punctuation, either outcome
 * order). `computeMarketKey` mirrors that check off-chain.
 *
 * Agents also reword questions ("ETH above $4k by Dec 31?" vs "Will ETH close
 * over 4000 on 2026-12-31"). `findSimilarMarkets` catches those with a token
 * overlap score; markets whose numbers differ (other threshold, other date)
 * are never treated as duplicates.
 */

/** Mirror of PredictionMarketHook._normalize (ASCII letters/digits, lower-cased; non-ASCII kept). */
export function normalizeForKey(text: string): Uint8Array {
  const bytes = toBytes(text);
  const out: number[] = [];
  for (const c of bytes) {
    if (c >= 0x41 && c <= 0x5a) out.push(c + 32);
    else if ((c >= 0x61 && c <= 0x7a) || (c >= 0x30 && c <= 0x39) || c >= 0x80) out.push(c);
  }
  return Uint8Array.from(out);
}

/** Off-chain copy of PredictionMarketHook.computeMarketKey. */
export function computeMarketKey(description: string, outcome1: string, outcome2: string): `0x${string}` {
  const d = normalizeForKey(description);
  let o1 = normalizeForKey(outcome1);
  let o2 = normalizeForKey(outcome2);
  if (d.length === 0 || o1.length === 0 || o2.length === 0 || keccak256(o1) === keccak256(o2)) {
    throw new Error('Invalid market: description and two distinct outcomes are required.');
  }
  if (BigInt(keccak256(o1)) > BigInt(keccak256(o2))) [o1, o2] = [o2, o1];
  return keccak256(
    encodeAbiParameters(
      [{ type: 'bytes' }, { type: 'bytes' }, { type: 'bytes' }],
      [toHex(d), toHex(o1), toHex(o2)],
    ),
  );
}

const STOPWORDS = new Set([
  'a', 'an', 'the', 'will', 'be', 'is', 'are', 'was', 'by', 'on', 'of', 'in', 'to', 'at', 'for',
  'than', 'or', 'and', 'before', 'after', 'end', 'price', 'does', 'do', 'it', 'its', 'this',
  'that', 'any', 'reach', 'hit', 'above', 'over', 'exceed', 'below', 'under', 'close', 'closes',
]);

const MONTHS: Record<string, string> = {
  jan: '1', january: '1', feb: '2', february: '2', mar: '3', march: '3', apr: '4', april: '4',
  may: '5', jun: '6', june: '6', jul: '7', july: '7', aug: '8', august: '8', sep: '9', sept: '9',
  september: '9', oct: '10', october: '10', nov: '11', november: '11', dec: '12', december: '12',
};

interface Tokens {
  words: Set<string>;
  numbers: Set<string>;
}

function tokenize(text: string): Tokens {
  const cleaned = text
    .toLowerCase()
    .replace(/(\d),(?=\d{3}\b)/g, '$1') // 4,000 -> 4000
    .replace(/(\d+(?:\.\d+)?)\s*k\b/g, (_, n: string) => String(Number(n) * 1000)) // 4k -> 4000
    .replace(/(\d+(?:\.\d+)?)\s*m\b/g, (_, n: string) => String(Number(n) * 1_000_000));
  const words = new Set<string>();
  const numbers = new Set<string>();
  for (const raw of cleaned.split(/[^a-z0-9.]+/)) {
    const token = raw.replace(/^\.+|\.+$/g, '');
    if (!token) continue;
    if (/^\d+(\.\d+)?$/.test(token)) {
      numbers.add(String(Number(token)));
    } else if (MONTHS[token]) {
      numbers.add(MONTHS[token]);
    } else if (!STOPWORDS.has(token)) {
      words.add(token.replace(/s$/, ''));
    }
  }
  return { words, numbers };
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let shared = 0;
  for (const x of a) if (b.has(x)) shared++;
  return shared / (a.size + b.size - shared);
}

/**
 * Similarity of two market questions in [0, 1]. Questions whose numbers
 * (prices, dates, years) differ are capped at 0.5 -- they are different bets.
 */
export function questionSimilarity(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  const wordScore = jaccard(ta.words, tb.words);
  const sameNumbers =
    ta.numbers.size === tb.numbers.size && [...ta.numbers].every((n) => tb.numbers.has(n));
  return sameNumbers ? wordScore : Math.min(wordScore, 0.5);
}

export interface SimilarMarket {
  marketId: `0x${string}`;
  description: string;
  similarity: number;
}

/**
 * Candidates at or above `threshold` similarity, most similar first.
 */
export function findSimilarMarkets(
  markets: ReadonlyArray<{ marketId: `0x${string}`; description: string }>,
  description: string,
  threshold = 0.7,
): SimilarMarket[] {
  return markets
    .map((m) => ({
      marketId: m.marketId,
      description: m.description,
      similarity: questionSimilarity(description, m.description),
    }))
    .filter((m) => m.similarity >= threshold)
    .sort((x, y) => y.similarity - x.similarity);
}
