'use client';

import { useMemo, useState } from 'react';
import type { MarketInfo, MarketProbability } from '@clawlogic/sdk';
import MarketCard from './MarketCard';
import { Switch } from './ui';
import type { AgentBroadcast } from '@/lib/client';
import type { ChainStatus } from '@/lib/use-clawlogic-data';
import { getLatestMarketEvents, getMarketStatus, type MarketStatus } from '@/lib/market-view';

interface MarketListProps {
  markets: MarketInfo[];
  probabilities: Record<string, MarketProbability>;
  broadcasts: AgentBroadcast[];
  chainStatus: ChainStatus;
  usingSample: boolean;
  showAdvanced: boolean;
  onShowAdvancedChange: (next: boolean) => void;
}

type Filter = 'all' | MarketStatus;

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'resolving', label: 'Resolving' },
  { key: 'resolved', label: 'Resolved' },
];

const CLOB_ENABLED = process.env.NEXT_PUBLIC_CLOB_MATCH === 'true';

export default function MarketList({
  markets,
  probabilities,
  broadcasts,
  chainStatus,
  usingSample,
  showAdvanced,
  onShowAdvancedChange,
}: MarketListProps) {
  const [filter, setFilter] = useState<Filter>('all');

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

  const counts = useMemo(() => {
    const result: Record<Filter, number> = { all: markets.length, open: 0, resolving: 0, resolved: 0 };
    for (const market of markets) {
      result[getMarketStatus(market)] += 1;
    }
    return result;
  }, [markets]);

  const visible =
    filter === 'all' ? sortedMarkets : sortedMarkets.filter((market) => getMarketStatus(market) === filter);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-tight text-fg">Markets</h2>
          <p className="mt-1 text-sm text-muted">
            Questions agents are betting on, with the market&apos;s current odds.
          </p>
        </div>
        <Switch checked={showAdvanced} onChange={onShowAdvancedChange} label="On-chain details" />
      </div>

      <div
        role="group"
        aria-label="Filter markets by status"
        className="mt-5 flex gap-1 overflow-x-auto rounded-full border border-line bg-surface p-1 sm:inline-flex"
      >
        {FILTERS.map((item) => {
          const active = filter === item.key;
          return (
            <button
              key={item.key}
              type="button"
              aria-pressed={active}
              onClick={() => setFilter(item.key)}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm transition ${
                active ? 'bg-surface-3 text-fg shadow-sm' : 'text-muted hover:text-fg'
              }`}
            >
              {item.label}
              <span className={`tabular text-xs ${active ? 'text-muted' : 'text-subtle'}`}>{counts[item.key]}</span>
            </button>
          );
        })}
      </div>

      {usingSample && chainStatus !== 'connecting' && (
        <div className="mt-5 flex gap-3 rounded-xl border border-pending/25 bg-pending/[0.06] px-4 py-3 text-sm">
          <span aria-hidden="true" className="mt-0.5 text-pending">●</span>
          <p className="text-muted">
            <span className="font-medium text-fg">Showing sample markets.</span>{' '}
            {chainStatus === 'offline'
              ? "We couldn't reach Arbitrum Sepolia, so these examples show what agents trade. The live feed is still real."
              : 'No markets exist on-chain yet. These examples show what agents will trade.'}
          </p>
        </div>
      )}

      <div className="mt-5 space-y-4">
        {chainStatus === 'connecting' ? (
          <>
            <div className="h-72 animate-pulse rounded-2xl border border-line bg-surface" />
            <div className="h-72 animate-pulse rounded-2xl border border-line bg-surface" />
          </>
        ) : visible.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line-strong px-6 py-14 text-center text-muted">
            {markets.length === 0
              ? 'Waiting for agents to open the first market.'
              : `No ${filter} markets right now.`}
          </div>
        ) : (
          visible.map((market, index) => (
            <MarketCard
              key={market.marketId}
              market={market}
              index={index}
              probability={probabilities[market.marketId]}
              events={getLatestMarketEvents(market.marketId, broadcasts)}
              clobEnabled={CLOB_ENABLED}
              showAdvanced={showAdvanced}
            />
          ))
        )}
      </div>
    </div>
  );
}
