'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ClawlogicClient,
  type AgentInfo,
  type ClawlogicConfig,
  type MarketInfo,
  type MarketProbability,
} from '@clawlogic/sdk';
import {
  DEMO_AGENTS,
  DEMO_MARKETS,
  DEMO_PROBABILITIES,
  getAgentBroadcasts,
  type AgentBroadcast,
} from '@/lib/client';
import {
  agentConsensusSeries,
  fetchOnchainHistories,
  sampleHistory,
  type MarketHistory,
  type PricePoint,
} from '@/lib/price-history';

const CHAIN_POLL_MS = 15_000;
const FEED_POLL_MS = 8_000;
/** History is refetched when any market trades, or at least this often. */
const HISTORY_MAX_AGE_MS = 5 * 60_000;

export type ChainStatus = 'connecting' | 'live' | 'offline';

export interface ClawlogicData {
  chainStatus: ChainStatus;
  markets: MarketInfo[];
  /** Keyed by marketId. Missing entries mean the market has no price yet. */
  probabilities: Record<string, MarketProbability>;
  agents: AgentInfo[];
  /** True when markets/agents are sample data rather than on-chain state. */
  usingSampleMarkets: boolean;
  usingSampleAgents: boolean;
  /** Newest first. */
  broadcasts: AgentBroadcast[];
  feedLoaded: boolean;
  lastUpdated: Date | null;
  /** Keyed by lowercase marketId. */
  histories: Record<string, MarketHistory>;
}

interface ChainSnapshot {
  markets: MarketInfo[];
  probabilities: Record<string, MarketProbability>;
  agents: AgentInfo[];
  usingSampleMarkets: boolean;
  usingSampleAgents: boolean;
}

const SAMPLE_SNAPSHOT: ChainSnapshot = {
  markets: DEMO_MARKETS,
  probabilities: DEMO_PROBABILITIES,
  agents: DEMO_AGENTS,
  usingSampleMarkets: true,
  usingSampleAgents: true,
};

async function readChain(client: ClawlogicClient): Promise<ChainSnapshot> {
  const [markets, addresses] = await Promise.all([
    client.getAllMarkets(),
    client.getAgentAddresses(),
  ]);
  const agents = await Promise.all(addresses.map((address) => client.getAgent(address)));

  const probabilities: Record<string, MarketProbability> = {};
  await Promise.all(
    markets.map(async (market) => {
      try {
        probabilities[market.marketId] = await client.getMarketProbability(market.marketId);
      } catch {
        // Leave unpriced; the UI says so instead of implying 50/50.
      }
    }),
  );

  const usingSampleMarkets = markets.length === 0;
  const usingSampleAgents = agents.length === 0;
  return {
    markets: usingSampleMarkets ? DEMO_MARKETS : markets,
    probabilities: usingSampleMarkets ? DEMO_PROBABILITIES : probabilities,
    agents: usingSampleAgents ? DEMO_AGENTS : agents,
    usingSampleMarkets,
    usingSampleAgents,
  };
}

function byNewest(a: AgentBroadcast, b: AgentBroadcast): number {
  return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
}

/** Changes whenever a trade or liquidity change touches any market (price or collateral moves). */
function activitySignature(snapshot: ChainSnapshot): string {
  return snapshot.markets
    .map((market) => {
      const p = snapshot.probabilities[market.marketId];
      return `${market.marketId}:${market.totalCollateral}:${p?.outcome1Probability ?? '-'}`;
    })
    .join('|');
}

/**
 * Single polling source for the whole app (mounted once in ClawlogicDataProvider) so every
 * page renders the same snapshot. Chain reads, the broadcast feed, and price history poll
 * independently: the feed stays live even when the RPC is unreachable.
 */
export function useClawlogicData(config: ClawlogicConfig): ClawlogicData {
  const [chainStatus, setChainStatus] = useState<ChainStatus>('connecting');
  const [snapshot, setSnapshot] = useState<ChainSnapshot | null>(null);
  const [broadcasts, setBroadcasts] = useState<AgentBroadcast[]>([]);
  const [feedLoaded, setFeedLoaded] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [onchainHistories, setOnchainHistories] = useState<Record<string, PricePoint[]>>({});
  const historyFetch = useRef<{ signature: string; at: number; inFlight: boolean }>({
    signature: '',
    at: 0,
    inFlight: false,
  });

  useEffect(() => {
    let mounted = true;
    const client = new ClawlogicClient(config);

    const sync = async () => {
      try {
        const next = await readChain(client);
        if (!mounted) return;
        setSnapshot(next);
        setChainStatus('live');
        setLastUpdated(new Date());
      } catch {
        if (!mounted) return;
        // Keep the last good on-chain snapshot; only fall back to samples if we never had one.
        setSnapshot((prev) => prev ?? SAMPLE_SNAPSHOT);
        setChainStatus('offline');
      }
    };

    void sync();
    const interval = setInterval(() => void sync(), CHAIN_POLL_MS);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [config]);

  useEffect(() => {
    let mounted = true;

    const sync = async () => {
      const all = await getAgentBroadcasts();
      if (!mounted) return;
      setBroadcasts([...all].sort(byNewest));
      setFeedLoaded(true);
    };

    void sync();
    const interval = setInterval(() => void sync(), FEED_POLL_MS);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  // Price history: refetch only when some market traded (or the history went stale).
  useEffect(() => {
    if (!snapshot || snapshot.usingSampleMarkets || snapshot.markets.length === 0) return;
    const signature = activitySignature(snapshot);
    const state = historyFetch.current;
    const fresh = Date.now() - state.at < HISTORY_MAX_AGE_MS;
    if (state.inFlight || (state.signature === signature && fresh)) return;

    state.inFlight = true;
    fetchOnchainHistories(config, snapshot.markets)
      .then((histories) => {
        setOnchainHistories(histories);
        state.signature = signature;
      })
      .catch(() => {
        // RPC without log/archive support: charts use the agent-implied series instead.
        state.signature = signature;
      })
      .finally(() => {
        state.at = Date.now();
        state.inFlight = false;
      });
  }, [config, snapshot]);

  const markets = snapshot?.markets ?? [];
  const probabilities = snapshot?.probabilities ?? {};
  const usingSampleMarkets = snapshot?.usingSampleMarkets ?? false;

  const histories = useMemo(() => {
    const result: Record<string, MarketHistory> = {};
    for (const market of markets) {
      const key = market.marketId.toLowerCase();
      if (usingSampleMarkets) {
        result[key] = { source: 'sample', points: sampleHistory(market.marketId, probabilities[market.marketId]) };
      } else if (onchainHistories[key]?.length) {
        result[key] = { source: 'onchain', points: onchainHistories[key] };
      } else {
        result[key] = { source: 'agents', points: agentConsensusSeries(market.marketId, broadcasts) };
      }
    }
    return result;
  }, [markets, probabilities, usingSampleMarkets, onchainHistories, broadcasts]);

  return {
    chainStatus,
    markets,
    probabilities,
    agents: snapshot?.agents ?? [],
    usingSampleMarkets,
    usingSampleAgents: snapshot?.usingSampleAgents ?? false,
    broadcasts,
    feedLoaded,
    lastUpdated,
    histories,
  };
}
