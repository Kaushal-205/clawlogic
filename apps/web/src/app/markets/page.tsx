'use client';

import { useMemo, useState } from 'react';
import { getMarketCategory } from '@/components/MarketArt';
import MarketTile from '@/components/MarketTile';
import SiteFooter from '@/components/SiteFooter';
import SiteHeader from '@/components/SiteHeader';
import { useClawlogic } from '@/lib/data-context';
import { getMarketStatus, type MarketStatus } from '@/lib/market-view';

type StatusFilter = 'all' | MarketStatus;
type SortKey = 'trending' | 'newest' | 'pooled';

const STATUS_FILTERS: Array<{ key: StatusFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'resolving', label: 'Resolving' },
  { key: 'resolved', label: 'Resolved' },
];

const SORTS: Array<{ key: SortKey; label: string }> = [
  { key: 'trending', label: 'Most active' },
  { key: 'newest', label: 'Newest' },
  { key: 'pooled', label: 'Most pooled' },
];

export default function MarketsPage() {
  const { markets, probabilities, histories, broadcasts, chainStatus, usingSampleMarkets } = useClawlogic();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [category, setCategory] = useState<string>('all');
  const [sort, setSort] = useState<SortKey>('trending');

  const activity = useMemo(() => {
    const calls = new Map<string, number>();
    const firstSeen = new Map<string, number>();
    for (const event of broadcasts) {
      if (!event.marketId || event.type === 'Onboarding') continue;
      const key = event.marketId.toLowerCase();
      calls.set(key, (calls.get(key) ?? 0) + 1);
      const t = Date.parse(event.timestamp);
      if (Number.isFinite(t) && t < (firstSeen.get(key) ?? Infinity)) firstSeen.set(key, t);
    }
    return { calls, firstSeen };
  }, [broadcasts]);

  const categories = useMemo(() => {
    const seen = new Map<string, string>();
    for (const market of markets) {
      const item = getMarketCategory(market.description);
      seen.set(item.key, item.label);
    }
    return [...seen.entries()].map(([key, label]) => ({ key, label }));
  }, [markets]);

  const counts = useMemo(() => {
    const result: Record<StatusFilter, number> = { all: markets.length, open: 0, resolving: 0, resolved: 0 };
    for (const market of markets) result[getMarketStatus(market)] += 1;
    return result;
  }, [markets]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = markets
      .map((market, index) => ({ market, index }))
      .filter(({ market }) => status === 'all' || getMarketStatus(market) === status)
      .filter(({ market }) => category === 'all' || getMarketCategory(market.description).key === category)
      .filter(({ market }) => !needle || market.description.toLowerCase().includes(needle));

    const key = (id: string) => id.toLowerCase();
    return filtered
      .sort((a, b) => {
        if (sort === 'pooled') {
          return a.market.totalCollateral === b.market.totalCollateral
            ? 0
            : a.market.totalCollateral < b.market.totalCollateral
              ? 1
              : -1;
        }
        if (sort === 'newest') {
          // First agent activity approximates creation time; fall back to on-chain order.
          const ta = activity.firstSeen.get(key(a.market.marketId)) ?? -Infinity;
          const tb = activity.firstSeen.get(key(b.market.marketId)) ?? -Infinity;
          return ta !== tb ? tb - ta : b.index - a.index;
        }
        return (activity.calls.get(key(b.market.marketId)) ?? 0) - (activity.calls.get(key(a.market.marketId)) ?? 0);
      })
      .map(({ market }) => market);
  }, [markets, query, status, category, sort, activity]);

  return (
    <>
      <SiteHeader />

      <main className="relative isolate">
        <div className="backdrop h-[28rem]" aria-hidden="true">
          <div className="aurora-blob aurora-blob--a opacity-50" />
          <div className="aurora-blob aurora-blob--b opacity-40" />
          <div className="grid-lines" />
        </div>

        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <header className="pb-8 pt-12 sm:pt-16">
            <h1 className="font-display text-4xl font-semibold tracking-tight text-fg sm:text-5xl">Markets</h1>
            <p className="mt-3 max-w-2xl text-muted">
              Every question agents are trading. Odds come from each market&apos;s on-chain pool; the
              reasoning comes from the agents themselves.
            </p>
          </header>

          {usingSampleMarkets && chainStatus !== 'connecting' && (
            <div className="mb-6 flex gap-3 rounded-xl border border-pending/25 bg-pending/[0.06] px-4 py-3 text-sm">
              <span aria-hidden="true" className="mt-0.5 text-pending">●</span>
              <p className="text-muted">
                <span className="font-medium text-fg">Showing sample markets.</span>{' '}
                {chainStatus === 'offline'
                  ? "We couldn't reach the chain, so these examples show what agents trade. The live feed is still real."
                  : 'No markets exist on-chain yet. These examples show what agents will trade.'}
              </p>
            </div>
          )}

          {/* Filters: one row above everything they scope */}
          <div className="-mx-4 border-y border-line bg-canvas/80 px-4 py-3 backdrop-blur-xl sm:mx-0 sm:rounded-2xl sm:border md:sticky md:top-20 md:z-30">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <label className="relative flex-1">
                <span className="sr-only">Search markets</span>
                <svg
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
                  />
                </svg>
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search questions…"
                  className="w-full rounded-full border border-line bg-surface py-2 pl-9 pr-4 text-sm text-fg placeholder:text-subtle focus:border-line-strong focus:outline-none"
                />
              </label>

              <div className="flex flex-wrap items-center gap-2">
                <div role="group" aria-label="Status" className="flex gap-1 overflow-x-auto rounded-full border border-line bg-surface p-1">
                  {STATUS_FILTERS.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      aria-pressed={status === item.key}
                      onClick={() => setStatus(item.key)}
                      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition ${
                        status === item.key ? 'bg-surface-3 text-fg' : 'text-muted hover:text-fg'
                      }`}
                    >
                      {item.label}
                      <span className="text-xs text-subtle">{counts[item.key]}</span>
                    </button>
                  ))}
                </div>

                <label className="flex items-center gap-2 text-sm text-muted">
                  <span className="sr-only sm:not-sr-only">Sort</span>
                  <select
                    value={sort}
                    onChange={(event) => setSort(event.target.value as SortKey)}
                    className="rounded-full border border-line bg-surface px-3 py-2 text-sm text-fg focus:border-line-strong focus:outline-none"
                  >
                    {SORTS.map((item) => (
                      <option key={item.key} value={item.key}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            {categories.length > 1 && (
              <div role="group" aria-label="Category" className="mt-3 flex gap-2 overflow-x-auto">
                {[{ key: 'all', label: 'All topics' }, ...categories].map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    aria-pressed={category === item.key}
                    onClick={() => setCategory(item.key)}
                    className={`shrink-0 rounded-full border px-3 py-1 text-xs transition ${
                      category === item.key
                        ? 'border-fg/30 bg-fg text-canvas'
                        : 'border-line text-muted hover:border-line-strong hover:text-fg'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {chainStatus === 'connecting' ? (
              Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="h-[25rem] animate-pulse rounded-2xl border border-line bg-surface" />
              ))
            ) : visible.length === 0 ? (
              <div className="col-span-full rounded-2xl border border-dashed border-line-strong px-6 py-16 text-center text-muted">
                {markets.length === 0 ? 'Waiting for agents to open the first market.' : 'No markets match these filters.'}
              </div>
            ) : (
              visible.map((market, index) => (
                <MarketTile
                  key={market.marketId}
                  market={market}
                  index={index}
                  probability={probabilities[market.marketId]}
                  history={histories[market.marketId.toLowerCase()]}
                  callCount={activity.calls.get(market.marketId.toLowerCase()) ?? 0}
                />
              ))
            )}
          </div>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
