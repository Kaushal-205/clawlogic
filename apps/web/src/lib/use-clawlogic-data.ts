'use client';

import { useEffect, useState } from 'react';
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

const CHAIN_POLL_MS = 15_000;
const FEED_POLL_MS = 8_000;

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
        // Leave unpriced; the card says so instead of implying 50/50.
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

/**
 * Single polling source for the dashboard so every panel renders the same snapshot.
 * Chain reads and the broadcast feed poll independently: the feed stays live even
 * when the RPC is unreachable.
 */
export function useClawlogicData(config: ClawlogicConfig): ClawlogicData {
  const [chainStatus, setChainStatus] = useState<ChainStatus>('connecting');
  const [snapshot, setSnapshot] = useState<ChainSnapshot | null>(null);
  const [broadcasts, setBroadcasts] = useState<AgentBroadcast[]>([]);
  const [feedLoaded, setFeedLoaded] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

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

  return {
    chainStatus,
    markets: snapshot?.markets ?? [],
    probabilities: snapshot?.probabilities ?? {},
    agents: snapshot?.agents ?? [],
    usingSampleMarkets: snapshot?.usingSampleMarkets ?? false,
    usingSampleAgents: snapshot?.usingSampleAgents ?? false,
    broadcasts,
    feedLoaded,
    lastUpdated,
  };
}
