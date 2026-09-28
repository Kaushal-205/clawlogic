import { createPublicClient, http, parseAbi, parseAbiItem, type Log } from 'viem';
import type { ClawlogicConfig, MarketInfo, MarketProbability } from '@clawlogic/sdk';
import { outcome1Probability, replayReserves, type ReserveEvent } from '@/lib/amm-replay';
import type { AgentBroadcast } from '@/lib/client';

export interface PricePoint {
  /** Unix ms */
  t: number;
  /** Outcome-1 probability, 0-100 */
  p: number;
}

/**
 * - onchain: replayed from hook events and verified against the live reserves
 * - agents:  no verifiable trade history; the running average of what agents said
 * - sample:  illustrative data shown alongside the sample markets
 */
export type HistorySource = 'onchain' | 'agents' | 'sample';

export interface MarketHistory {
  source: HistorySource;
  points: PricePoint[];
}

// ---------------------------------------------------------------------------
// On-chain history: replay CPMM events (see amm-replay.ts)
// ---------------------------------------------------------------------------

const HISTORY_EVENTS = [
  parseAbiItem('event TradeFeesCharged(bytes32 indexed marketId, uint256 protocolFee, uint256 lpFee)'),
  parseAbiItem(
    'event OutcomeTokenBought(bytes32 indexed marketId, address indexed buyer, bool isOutcome1, uint256 ethIn, uint256 tokensOut)',
  ),
  parseAbiItem(
    'event OutcomeTokenSold(bytes32 indexed marketId, address indexed seller, bool isOutcome1, uint256 tokensIn, uint256 ethOut)',
  ),
  parseAbiItem('event LiquidityAdded(bytes32 indexed marketId, address indexed provider, uint256 amount, uint256 shares)'),
  parseAbiItem(
    'event LiquidityRemoved(bytes32 indexed marketId, address indexed provider, uint256 shares, uint256 amount1, uint256 amount2)',
  ),
] as const;

const RESERVES_ABI = parseAbi([
  'function getMarketReserves(bytes32 marketId) view returns (uint256 reserve1, uint256 reserve2)',
]);

/** Arbitrum Sepolia deployment block (packages/contracts/deployments/arbitrum-sepolia.json). */
const KNOWN_DEPLOY_BLOCKS: Record<string, bigint> = {
  '0xb3c4a85906493f3cf0d59e891770bb2e77fa8880': 10_210_362n,
};

function historyFromBlock(config: ClawlogicConfig): bigint | 'earliest' {
  const fromEnv = process.env.NEXT_PUBLIC_HOOK_DEPLOY_BLOCK;
  if (fromEnv && /^\d+$/.test(fromEnv)) return BigInt(fromEnv);
  return KNOWN_DEPLOY_BLOCKS[config.contracts.predictionMarketHook.toLowerCase()] ?? 'earliest';
}

type DecodedLog = Log<bigint, number, false, (typeof HISTORY_EVENTS)[number], true>;

function toReserveEvent(log: DecodedLog): (ReserveEvent & { marketId: string }) | null {
  const base = {
    blockNumber: log.blockNumber,
    logIndex: log.logIndex,
    transactionHash: log.transactionHash,
    marketId: log.args.marketId.toLowerCase(),
  };
  switch (log.eventName) {
    case 'TradeFeesCharged':
      return { ...base, kind: 'fees', protocolFee: log.args.protocolFee, lpFee: log.args.lpFee };
    case 'OutcomeTokenBought':
      return { ...base, kind: 'buy', isOutcome1: log.args.isOutcome1, ethIn: log.args.ethIn, tokensOut: log.args.tokensOut };
    case 'OutcomeTokenSold':
      return { ...base, kind: 'sell', isOutcome1: log.args.isOutcome1, tokensIn: log.args.tokensIn, ethOut: log.args.ethOut };
    case 'LiquidityAdded':
      return { ...base, kind: 'addLiquidity', amount: log.args.amount, shares: log.args.shares };
    case 'LiquidityRemoved':
      return {
        ...base,
        kind: 'removeLiquidity',
        shares: log.args.shares,
        amount1: log.args.amount1,
        amount2: log.args.amount2,
      };
    default:
      return null;
  }
}

const MAX_BLOCK_LOOKUPS = 100;
const timestampCache = new Map<bigint, number>();

/** Unix-ms timestamps for blocks. Beyond MAX_BLOCK_LOOKUPS, interpolates between fetched anchors. */
async function resolveTimestamps(
  client: ReturnType<typeof createPublicClient>,
  blocks: bigint[],
): Promise<Map<bigint, number>> {
  const unique = [...new Set(blocks)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const missing = unique.filter((block) => !timestampCache.has(block));

  let anchors = missing;
  if (missing.length > MAX_BLOCK_LOOKUPS) {
    const step = (missing.length - 1) / (MAX_BLOCK_LOOKUPS - 1);
    anchors = Array.from({ length: MAX_BLOCK_LOOKUPS }, (_, i) => missing[Math.round(i * step)]);
  }
  const fetched = await Promise.all(anchors.map((blockNumber) => client.getBlock({ blockNumber })));
  for (const block of fetched) {
    timestampCache.set(block.number, Number(block.timestamp) * 1000);
  }

  const known = [...timestampCache.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const result = new Map<bigint, number>();
  for (const block of unique) {
    const cached = timestampCache.get(block);
    if (cached !== undefined) {
      result.set(block, cached);
      continue;
    }
    // Linear interpolation between the nearest fetched anchors.
    const after = known.findIndex(([n]) => n > block);
    const lo = known[Math.max(0, after - 1)];
    const hi = known[after === -1 ? known.length - 1 : after];
    const span = Number(hi[0] - lo[0]);
    const ratio = span === 0 ? 0 : Number(block - lo[0]) / span;
    result.set(block, lo[1] + (hi[1] - lo[1]) * ratio);
  }
  return result;
}

/**
 * Fetches and replays the trade history of every market in one getLogs call. A market is
 * included only when its replayed reserves equal its on-chain reserves at the same block,
 * so the chart never shows a price the contract didn't have.
 */
export async function fetchOnchainHistories(
  config: ClawlogicConfig,
  markets: MarketInfo[],
): Promise<Record<string, PricePoint[]>> {
  const client = createPublicClient({ transport: http(config.rpcUrl, { batch: true }) });
  const hook = config.contracts.predictionMarketHook;
  // Pin logs and reserves to one block so a trade landing mid-fetch can't cause a mismatch.
  const toBlock = await client.getBlockNumber();
  const [logs, reserveList] = await Promise.all([
    client.getLogs({
      address: hook,
      events: HISTORY_EVENTS,
      fromBlock: historyFromBlock(config),
      toBlock,
      strict: true,
    }) as Promise<DecodedLog[]>,
    Promise.all(
      markets.map((market) =>
        client
          .readContract({ address: hook, abi: RESERVES_ABI, functionName: 'getMarketReserves', args: [market.marketId], blockNumber: toBlock })
          .then(([reserve1, reserve2]) => ({ key: market.marketId.toLowerCase(), reserve1, reserve2 }))
          .catch(() => null),
      ),
    ),
  ]);
  const liveReserves: Record<string, { reserve1: bigint; reserve2: bigint }> = {};
  for (const item of reserveList) if (item) liveReserves[item.key] = item;

  const byMarket = new Map<string, Array<ReserveEvent & { marketId: string }>>();
  const logTimestamps = new Map<bigint, number>();
  for (const log of logs) {
    const event = toReserveEvent(log);
    if (!event) continue;
    const list = byMarket.get(event.marketId) ?? [];
    list.push(event);
    byMarket.set(event.marketId, list);
    const rawTimestamp = (log as { blockTimestamp?: bigint | string }).blockTimestamp;
    if (rawTimestamp !== undefined && rawTimestamp !== null) {
      logTimestamps.set(log.blockNumber, Number(BigInt(rawTimestamp)) * 1000);
    }
  }
  for (const [block, ts] of logTimestamps) timestampCache.set(block, ts);

  const verified = new Map<string, NonNullable<ReturnType<typeof replayReserves>>>();
  for (const market of markets) {
    const key = market.marketId.toLowerCase();
    const events = byMarket.get(key);
    const live = liveReserves[key];
    if (!events || !live) continue;
    const replay = replayReserves(events);
    if (replay && replay.reserve1 === live.reserve1 && replay.reserve2 === live.reserve2) {
      verified.set(key, replay);
    }
  }
  if (verified.size === 0) return {};

  const blocks = [...verified.values()].flatMap((replay) => replay.snapshots.map((s) => s.blockNumber));
  const timestamps = await resolveTimestamps(client, blocks);

  const histories: Record<string, PricePoint[]> = {};
  for (const [key, replay] of verified) {
    const points: PricePoint[] = [];
    for (const snapshot of replay.snapshots) {
      const p = outcome1Probability(snapshot.reserve1, snapshot.reserve2);
      const t = timestamps.get(snapshot.blockNumber);
      if (p === null || t === undefined) continue;
      // Several events in one block collapse to the block's final price.
      if (points.length > 0 && points[points.length - 1].t === t) points[points.length - 1] = { t, p };
      else points.push({ t, p });
    }
    if (points.length > 0) histories[key] = points;
  }
  return histories;
}

// ---------------------------------------------------------------------------
// Fallbacks
// ---------------------------------------------------------------------------

/** YES-probability an agent's call implies: a 70%-confident NO implies 30% YES. */
export function impliedYesProbability(event: AgentBroadcast): number | null {
  if (!event.side) return null;
  const confidence = Math.max(0, Math.min(100, event.confidence));
  return event.side === 'yes' ? confidence : 100 - confidence;
}

export interface CallMarker {
  id: string;
  t: number;
  /** YES probability the call implies, 0-100 */
  p: number;
  side: 'yes' | 'no';
  agent: string;
  confidence: number;
}

/** Agent calls on one market as chart markers, oldest first. */
export function callMarkersFor(
  marketId: string,
  broadcasts: AgentBroadcast[],
  labelFor: (event: AgentBroadcast) => string,
): CallMarker[] {
  const key = marketId.toLowerCase();
  const markers: CallMarker[] = [];
  for (const event of broadcasts) {
    if (event.marketId?.toLowerCase() !== key || !event.side || event.type === 'Onboarding') continue;
    const p = impliedYesProbability(event);
    const t = Date.parse(event.timestamp);
    if (p === null || !Number.isFinite(t)) continue;
    markers.push({ id: event.id, t, p, side: event.side, agent: labelFor(event), confidence: event.confidence });
  }
  return markers.sort((a, b) => a.t - b.t);
}

/** Running average of agent-implied YES probability for one market, oldest first. */
export function agentConsensusSeries(marketId: string, broadcasts: AgentBroadcast[]): PricePoint[] {
  const key = marketId.toLowerCase();
  const calls = broadcasts
    .filter((event) => event.marketId?.toLowerCase() === key && event.type !== 'Onboarding')
    .map((event) => ({ t: Date.parse(event.timestamp), p: impliedYesProbability(event) }))
    .filter((item): item is PricePoint => item.p !== null && Number.isFinite(item.t))
    .sort((a, b) => a.t - b.t);

  let sum = 0;
  return calls.map((call, index) => {
    sum += call.p;
    return { t: call.t, p: Math.round((sum / (index + 1)) * 10) / 10 };
  });
}

function seededRandom(seed: string): () => number {
  let h = 2166136261;
  for (const char of seed) h = Math.imul(h ^ char.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

/** Deterministic random walk from 50% to the market's current price, for sample markets. */
export function sampleHistory(marketId: string, probability?: MarketProbability): PricePoint[] {
  const target = probability ? probability.outcome1Probability : 50;
  const rand = seededRandom(marketId);
  const steps = 72;
  const end = Date.now();
  const start = end - 14 * 24 * 3600 * 1000;

  const walk = [0];
  for (let i = 1; i <= steps; i++) walk.push(walk[i - 1] + (rand() - 0.5) * 6);
  return walk.map((noise, i) => {
    const progress = i / steps;
    // Brownian bridge: pin the walk to 50% at the start and the live price at the end.
    const p = 50 + (target - 50) * progress + noise - walk[steps] * progress;
    return { t: start + (end - start) * progress, p: Math.round(Math.max(2, Math.min(98, p)) * 10) / 10 };
  });
}
