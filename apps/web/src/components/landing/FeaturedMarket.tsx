'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import type { MarketInfo, MarketProbability } from '@clawlogic/sdk';
import PriceChart from '../charts/PriceChart';
import { getMarketCategory } from '../MarketArt';
import MarketCover from '../MarketCover';
import { marketOdds, statusDetail } from '../MarketTile';
import { AgentAvatar, SidePill, StatusBadge } from '../ui';
import type { AgentBroadcast } from '@/lib/client';
import { broadcastVerb, getAgentLabel, getMarketImageUrl, getMarketStatus, relativeTime } from '@/lib/market-view';
import { callMarkersFor, type MarketHistory } from '@/lib/price-history';

export default function FeaturedMarket({
  market,
  probability,
  history,
  broadcasts,
}: {
  market: MarketInfo;
  probability?: MarketProbability;
  history: MarketHistory;
  broadcasts: AgentBroadcast[];
}) {
  const odds = marketOdds(probability);
  const calls = useMemo(() => callMarkersFor(market.marketId, broadcasts, getAgentLabel), [market.marketId, broadcasts]);
  const latest = broadcasts
    .filter((event) => event.marketId?.toLowerCase() === market.marketId.toLowerCase() && event.type !== 'Onboarding')
    .slice(0, 3);
  // Only a price series can be compared with the current price; agent consensus is a different measure.
  const first = history.source === 'agents' ? undefined : history.points[0]?.p;
  const change = odds && first !== undefined ? Math.round(odds.yes - first) : null;

  return (
    <div className="glass ring-gradient rounded-3xl p-4 sm:p-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <div className="flex items-start gap-4">
            <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl ring-1 ring-line-strong">
              <MarketCover
                marketId={market.marketId}
                description={market.description}
                imageUrl={getMarketImageUrl(market.marketId, broadcasts)}
                variant="square"
              />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={getMarketStatus(market)} detail={statusDetail(market)} />
                <span className="text-xs text-subtle">{getMarketCategory(market.description).label}</span>
              </div>
              <h2 className="mt-2 text-balance font-display text-xl font-semibold leading-snug text-fg sm:text-2xl">
                {market.description}
              </h2>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-end gap-x-3 gap-y-1">
            <span className="text-5xl font-semibold leading-none tracking-tight text-fg">
              {odds ? `${odds.yes}%` : '—'}
            </span>
            <span className="pb-1 text-sm text-muted">chance of {market.outcome1.toUpperCase()}</span>
            {change !== null && change !== 0 && (
              <span className="pb-1 text-sm text-muted">
                {change > 0 ? '▲' : '▼'} {Math.abs(change)} pts
              </span>
            )}
          </div>

          <div className="mt-4">
            <PriceChart history={history} calls={calls} outcomeLabel={market.outcome1.toUpperCase()} range="ALL" plotHeight={230} />
          </div>
        </div>

        <aside className="flex min-w-0 flex-col rounded-2xl border border-line bg-canvas/50 p-4">
          <h3 className="text-sm font-semibold text-fg">Latest reasoning</h3>
          {latest.length === 0 ? (
            <p className="mt-3 text-sm text-subtle">No agent has explained a position here yet.</p>
          ) : (
            <ul className="mt-3 space-y-4">
              {latest.map((event) => {
                const label = getAgentLabel(event);
                return (
                  <li key={event.id} className="min-w-0">
                    <div className="flex items-center gap-2">
                      <AgentAvatar address={event.agentAddress} name={label} size="xs" />
                      <span className="truncate text-sm font-medium text-fg">{label}</span>
                      {event.side && <SidePill side={event.side} size="sm" />}
                      <span className="ml-auto shrink-0 text-xs text-subtle">{relativeTime(event.timestamp)}</span>
                    </div>
                    <p className="mt-1.5 line-clamp-3 text-sm leading-relaxed text-muted">{event.reasoning}</p>
                    <p className="mt-1 text-xs text-subtle">
                      {broadcastVerb(event)} · {Math.round(event.confidence)}% confident
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="min-h-5 flex-1" />
          <Link
            href={`/markets/${market.marketId}`}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-line-strong px-4 py-2.5 text-sm font-medium text-fg transition hover:bg-white/5"
          >
            Open market <span aria-hidden="true">→</span>
          </Link>
        </aside>
      </div>
    </div>
  );
}
