import { encodeAbiParameters, keccak256, toBytes } from 'viem';

/**
 * Duplicate-market helpers.
 *
 * The contract rejects an exact duplicate of an unresolved market (same
 * question after lower-casing and dropping whitespace and sentence
 * punctuation, either outcome order). Symbols that change meaning (`<`, `>`,
 * `$`, `%`, `-`, ...) and `.` `,` `:` between two digits are kept, so
 * "BTC > $1.50" and "BTC < $150" are different markets. `computeMarketKey`
 * mirrors that check off-chain, including its outcome validation.
 *
 * Agents also reword questions ("ETH above $4k by Dec 31?" vs "Will ETH close
 * over 4000 on 2026-12-31"). `findSimilarMarkets` catches those with a token
 * overlap score; markets whose numbers differ (other threshold, other date)
 * are never treated as duplicates.
 */

const DROPPED = new Set([0x3f, 0x21, 0x3b, 0x27, 0x22, 0x60]); // ? ! ; ' " `
const DIGIT_SEPARATORS = new Set([0x2e, 0x2c, 0x3a]); // . , :
const isDigit = (c: number | undefined) => c !== undefined && c >= 0x30 && c <= 0x39;

/** Mirror of PredictionMarketHook._normalize. */
export function normalizeForKey(text: string): Uint8Array {
  const bytes = toBytes(text);
  const out: number[] = [];
  for (let i = 0; i < bytes.length; i++) {
    let c = bytes[i];
    if (c >= 0x41 && c <= 0x5a) {
      c += 32;
    } else if (c <= 0x20 || c === 0x7f || DROPPED.has(c)) {
      continue;
    } else if (DIGIT_SEPARATORS.has(c) && !(isDigit(bytes[i - 1]) && isDigit(bytes[i + 1]))) {
      continue;
    }
    out.push(c);
  }
  return Uint8Array.from(out);
}

const hashOf = (text: string) => keccak256(normalizeForKey(text));
const RESERVED = hashOf('unresolvable');
const YES = hashOf('yes');
const NO = hashOf('no');
const EMPTY = keccak256(new Uint8Array());

/** Off-chain copy of PredictionMarketHook.computeMarketKey (throws where the contract reverts). */
export function computeMarketKey(description: string, outcome1: string, outcome2: string): `0x${string}` {
  const d = normalizeForKey(description);
  let h1 = hashOf(outcome1);
  let h2 = hashOf(outcome2);
  if (d.length === 0 || h1 === h2 || h1 === EMPTY || h2 === EMPTY) {
    throw new Error('Invalid market: description and two distinct outcomes are required.');
  }
  if (h1 === RESERVED || h2 === RESERVED) {
    throw new Error('Invalid market: "Unresolvable" is reserved and cannot be an outcome.');
  }
  if (h1 === NO && h2 === YES) {
    throw new Error('Invalid market: a yes/no market must list "yes" first (outcome1 = yes).');
  }
  if (BigInt(h1) > BigInt(h2)) [h1, h2] = [h2, h1];
  return keccak256(
    encodeAbiParameters(
      [{ type: 'bytes32' }, { type: 'bytes32' }, { type: 'bytes32' }],
      [keccak256(d), h1, h2],
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
