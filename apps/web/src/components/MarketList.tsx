'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ClawlogicConfig, MarketInfo, MarketProbability } from '@clawlogic/sdk';
import { ClawlogicClient } from '@clawlogic/sdk';
import MarketCard from './MarketCard';
import { DEMO_MARKETS, getAgentBroadcasts, type AgentBroadcast } from '@/lib/client';
import { getLatestMarketEvents } from '@/lib/market-view';

interface MarketListProps {
  config: ClawlogicConfig;
}

const CLOB_ENABLED = process.env.NEXT_PUBLIC_CLOB_MATCH === 'true';

export default function MarketList({ config }: MarketListProps) {
  const [markets, setMarkets] = useState<MarketInfo[]>([]);
  const [probabilities, setProbabilities] = useState<Record<string, MarketProbability>>({});
  const [broadcasts, setBroadcasts] = useState<AgentBroadcast[]>([]);
  const [loading, setLoading] = useState(true);
  const [usingDemo, setUsingDemo] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const fetchMarkets = useCallback(async () => {
    try {
      const client = new ClawlogicClient(config);
      const [allMarkets, allBroadcasts] = await Promise.all([
        client.getAllMarkets(),
        getAgentBroadcasts(),
      ]);

      setMarkets(allMarkets.length > 0 ? allMarkets : DEMO_MARKETS);
      setUsingDemo(allMarkets.length === 0);
      setBroadcasts(allBroadcasts);

      const targetMarkets = allMarkets.length > 0 ? allMarkets : DEMO_MARKETS;
      const nextProbabilities: Record<string, MarketProbability> = {};
      await Promise.all(
        targetMarkets.map(async (market) => {
          try {
            nextProbabilities[market.marketId] = await client.getMarketProbability(market.marketId);
          } catch {
            nextProbabilities[market.marketId] = {
              outcome1Probability: 50,
              outcome2Probability: 50,
            };
          }
        }),
      );

      setProbabilities(nextProbabilities);
      setLastRefresh(new Date());
    } catch {
      setMarkets(DEMO_MARKETS);
      setUsingDemo(true);
      setLastRefresh(new Date());
      setProbabilities({});
      try {
        setBroadcasts(await getAgentBroadcasts());
      } catch {
        setBroadcasts([]);
      }
    } finally {
      setLoading(false);
    }
  }, [config]);

  useEffect(() => {
    void fetchMarkets();
    const interval = setInterval(() => {
      void fetchMarkets();
    }, 12000);
    return () => clearInterval(interval);
  }, [fetchMarkets]);

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-32 animate-pulse rounded-2xl border border-white/10 bg-white/[0.03]" />
        <div className="h-32 animate-pulse rounded-2xl border border-white/10 bg-white/[0.03]" />
      </div>
    );
  }

  const marketCount = markets.length;
  const liveCount = markets.filter((item) => !item.resolved).length;
  const totalBroadcasts = broadcasts.filter((event) => event.type === 'MarketBroadcast').length;
  const totalTrades = broadcasts.filter((event) => event.type === 'TradeRationale').length;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-gradient-to-r from-[#101b2d] via-[#0f1420] to-[#1a1423] p-4 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-[#33d7ff]/30 bg-[#33d7ff]/12 px-3 py-1 text-xs font-semibold text-[#b8ecff]">
              {marketCount} markets
            </span>
            <span className="rounded-full border border-[#2fe1c3]/30 bg-[#2fe1c3]/12 px-3 py-1 text-xs font-semibold text-[#cbfff3]">
              {liveCount} live
            </span>
            <span className="rounded-full border border-[#f6b26a]/30 bg-[#f6b26a]/12 px-3 py-1 text-xs font-semibold text-[#ffe8ca]">
              {totalBroadcasts} theses
            </span>
            <span className="rounded-full border border-[#8ea4ff]/30 bg-[#8ea4ff]/12 px-3 py-1 text-xs font-semibold text-[#dee5ff]">
              {totalTrades} rationale trades
            </span>
          </div>
          <div className="text-xs text-[#8ea1c2]">
            {usingDemo ? 'demo data' : 'on-chain + broadcast feed'} | updated {lastRefresh.toLocaleTimeString()}
          </div>
        </div>
      </div>

      {markets.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/15 bg-[#101622]/80 px-6 py-10 text-center text-sm text-[#8ea1c2]">
          Waiting for the first market broadcast.
        </div>
      ) : (
        <div className="space-y-4">
          {markets.map((market, index) => (
            <MarketCard
              key={market.marketId}
              market={market}
              index={index + 1}
              probability={probabilities[market.marketId]}
              events={getLatestMarketEvents(market.marketId, broadcasts)}
              clobEnabled={CLOB_ENABLED}
            />
          ))}
        </div>
      )}
    </div>
  );
}
