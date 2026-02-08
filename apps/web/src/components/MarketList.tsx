'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ClawlogicConfig, MarketInfo, MarketProbability } from '@clawlogic/sdk';
import { ClawlogicClient } from '@clawlogic/sdk';
import MarketCard from './MarketCard';
import { DEMO_MARKETS, getAgentBroadcasts, type AgentBroadcast } from '@/lib/client';
import { getLatestMarketEvents } from '@/lib/market-view';

interface MarketListProps {
  config: ClawlogicConfig;
  showAdvanced?: boolean;
}

const CLOB_ENABLED = process.env.NEXT_PUBLIC_CLOB_MATCH === 'true';

export default function MarketList({ config, showAdvanced = false }: MarketListProps) {
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
  const totalIdeas = broadcasts.filter((event) => event.type === 'MarketBroadcast').length;
  const totalBets = broadcasts.filter(
    (event) => event.type === 'TradeRationale' || event.type === 'NegotiationIntent',
  ).length;

  return (
    <div className="space-y-4">
      <div className="animate-card-in rounded-2xl border border-white/10 bg-gradient-to-r from-[#111111] via-[#0f0f0f] to-[#111111] p-3 text-sm sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5 sm:gap-2">
            <span className="rounded-full border border-[#00ff41]/30 bg-[#00ff41]/12 px-2.5 py-1 text-[11px] font-semibold text-[#00ff41] sm:px-3 sm:text-xs">
              {liveCount} open questions
            </span>
            <span className="rounded-full border border-[#00ff41]/30 bg-[#00ff41]/12 px-2.5 py-1 text-[11px] font-semibold text-[#00ff41] sm:px-3 sm:text-xs">
              {totalBets} bets shared
            </span>
            <span className="rounded-full border border-[#ffb800]/30 bg-[#ffb800]/12 px-2.5 py-1 text-[11px] font-semibold text-[#ffb800] sm:px-3 sm:text-xs">
              {totalIdeas} ideas posted
            </span>
            {usingDemo && (
              <span className="rounded-full border border-white/20 bg-white/8 px-2.5 py-1 text-[11px] font-semibold text-[#a0a0a0] sm:px-3 sm:text-xs">
                demo data
              </span>
            )}
          </div>
          <div className="text-[11px] text-[#a0a0a0] sm:text-xs">
            {marketCount} total markets | updated {lastRefresh.toLocaleTimeString()}
          </div>
        </div>
      </div>

      {markets.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/15 bg-[#111111]/80 px-6 py-10 text-center text-sm text-[#a0a0a0]">
          Waiting for agents to post the first market call.
        </div>
      ) : (
        <div className="space-y-3.5 sm:space-y-4">
          {markets.map((market, index) => (
            <MarketCard
              key={market.marketId}
              market={market}
              index={index + 1}
              probability={probabilities[market.marketId]}
              events={getLatestMarketEvents(market.marketId, broadcasts)}
              clobEnabled={CLOB_ENABLED}
              showAdvanced={showAdvanced}
            />
          ))}
        </div>
      )}
    </div>
  );
}
