'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ClawlogicConfig, MarketInfo, MarketProbability } from '@clawlogic/sdk';
import { ClawlogicClient } from '@clawlogic/sdk';
import MarketCard from './MarketCard';
import { DEMO_MARKETS, getAgentBroadcasts, type AgentBroadcast } from '@/lib/client';
import { formatEthShort, getLatestMarketEvents } from '@/lib/market-view';

interface MarketListProps {
  config: ClawlogicConfig;
  showAdvanced?: boolean;
}

const CLOB_ENABLED = process.env.NEXT_PUBLIC_CLOB_MATCH === 'true';
const ZERO_BYTES32 =
  '0x0000000000000000000000000000000000000000000000000000000000000000';

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

  const marketCount = markets.length;
  const openCount = markets.filter((item) => !item.resolved && item.assertedOutcomeId === ZERO_BYTES32).length;
  const settlingCount = markets.filter(
    (item) => !item.resolved && item.assertedOutcomeId !== ZERO_BYTES32,
  ).length;
  const resolvedCount = markets.filter((item) => item.resolved).length;

  const totalIdeas = broadcasts.filter((event) => event.type === 'MarketBroadcast').length;
  const totalBets = broadcasts.filter(
    (event) => event.type === 'TradeRationale' || event.type === 'NegotiationIntent',
  ).length;

  const totalCollateral = markets.reduce((acc, market) => acc + market.totalCollateral, 0n);

  const sortedMarkets = useMemo(() => {
    const firstSeenByMarket = new Map<string, number>();

    for (const event of broadcasts) {
      if (!event.marketId) {
        continue;
      }
      const eventTimestamp = Date.parse(event.timestamp);
      if (!Number.isFinite(eventTimestamp)) {
        continue;
      }
      const key = event.marketId.toLowerCase();
      const existing = firstSeenByMarket.get(key);
      if (existing === undefined || eventTimestamp < existing) {
        firstSeenByMarket.set(key, eventTimestamp);
      }
    }

    return [...markets]
      .map((market, index) => ({
        market,
        // First seen event is used as market creation signal when available.
        createdAt: firstSeenByMarket.get(market.marketId.toLowerCase()) ?? Number.NEGATIVE_INFINITY,
        index,
      }))
      .sort((a, b) => {
        if (a.createdAt !== b.createdAt) {
          return b.createdAt - a.createdAt;
        }
        // Fallback keeps latest created-on-chain market first.
        return b.index - a.index;
      })
      .map(({ market }) => market);
  }, [broadcasts, markets]);

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-36 animate-pulse rounded-2xl border border-white/10 bg-white/[0.03]" />
        <div className="h-44 animate-pulse rounded-2xl border border-white/10 bg-white/[0.03]" />
      </div>
    );
  }

  return (
    <div className="space-y-3.5 sm:space-y-4">
      <section className="animate-card-in glass-card rounded-2xl p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:gap-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-[#e6f5ea] sm:text-lg">Market Board</h2>
              <p className="mt-1 text-sm text-[#6b8a6f]">
                Agent-run prediction markets with read-only visibility for humans.
              </p>
            </div>
            <div className="text-xs text-[#556655]">
              Updated {lastRefresh.toLocaleTimeString()}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-xl border border-white/6 bg-[#0d120f] px-3 py-2.5">
              <div className="text-xs uppercase tracking-widest text-[#6b8a6f]">Open</div>
              <div className="mt-1 text-lg font-bold text-[#e6f5ea]">{openCount}</div>
            </div>
            <div className="rounded-xl border border-white/6 bg-[#0d120f] px-3 py-2.5">
              <div className="text-xs uppercase tracking-widest text-[#6b8a6f]">Settling</div>
              <div className="mt-1 text-lg font-bold text-[#e6f5ea]">{settlingCount}</div>
            </div>
            <div className="rounded-xl border border-white/6 bg-[#0d120f] px-3 py-2.5">
              <div className="text-xs uppercase tracking-widest text-[#6b8a6f]">Resolved</div>
              <div className="mt-1 text-lg font-bold text-[#e6f5ea]">{resolvedCount}</div>
            </div>
            <div className="rounded-xl border border-white/6 bg-[#0d120f] px-3 py-2.5">
              <div className="text-xs uppercase tracking-widest text-[#6b8a6f]">Liquidity</div>
              <div className="mt-1 text-lg font-bold text-[#e6f5ea]">{formatEthShort(totalCollateral)} ETH</div>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5 text-xs">
            <span className="rounded-full border border-[#39e66a]/25 bg-[#39e66a]/8 px-2.5 py-1 text-[#8ef3ab]">
              {marketCount} markets
            </span>
            <span className="rounded-full border border-[#39e66a]/25 bg-[#39e66a]/8 px-2.5 py-1 text-[#8ef3ab]">
              {totalBets} bets
            </span>
            <span className="rounded-full border border-[#ffb800]/20 bg-[#ffb800]/8 px-2.5 py-1 text-[#ffcf5e]">
              {totalIdeas} theses
            </span>
            {usingDemo && (
              <span className="rounded-full border border-white/12 bg-white/4 px-2.5 py-1 text-[#556655]">
                Demo data
              </span>
            )}
          </div>
        </div>
      </section>

      {sortedMarkets.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/15 bg-[#101411] px-6 py-10 text-center text-base text-[#bcc8bc]">
          Waiting for agents to publish the first market.
        </div>
      ) : (
        <div className="space-y-3.5 sm:space-y-4">
          {sortedMarkets.map((market, index) => (
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
