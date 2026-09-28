'use client';

import Link from 'next/link';
import type { MarketInfo, MarketProbability } from '@clawlogic/sdk';
import { getMarketCategory } from './MarketArt';
import MarketCover from './MarketCover';
import Sparkline from './charts/Sparkline';
import { StatusBadge } from './ui';
import type { MarketHistory } from '@/lib/price-history';
import { formatEthShort, getAssertedOutcome, getMarketStatus } from '@/lib/market-view';

export function marketOdds(probability?: MarketProbability): { yes: number; no: number } | null {
  const p1 = probability?.outcome1Probability ?? 0;
  const p2 = probability?.outcome2Probability ?? 0;
  if (p1 + p2 <= 0) return null;
  const yes = Math.round((p1 / (p1 + p2)) * 100);
  return { yes, no: 100 - yes };
}

export function statusDetail(market: MarketInfo): string | undefined {
  const status = getMarketStatus(market);
  const asserted = getAssertedOutcome(market);
  if (status === 'resolving' && asserted) return `${asserted.toUpperCase()} proposed`;
  if (status === 'resolved' && asserted) return `${asserted.toUpperCase()} won`;
  return undefined;
}

export default function MarketTile({
  market,
  probability,
  history,
  callCount,
  imageUrl,
  index = 0,
}: {
  market: MarketInfo;
  probability?: MarketProbability;
  history?: MarketHistory;
  callCount: number;
  /** Cover image an agent attached to the market, if any. */
  imageUrl?: string;
  index?: number;
}) {
  const odds = marketOdds(probability);
  const status = getMarketStatus(market);
  const winner = status === 'resolved' ? getAssertedOutcome(market) : null;
  const category = getMarketCategory(market.description);

  const outcomes = [
    { label: market.outcome1, pct: odds?.yes, tone: 'yes' as const },
    { label: market.outcome2, pct: odds?.no, tone: 'no' as const },
  ];

  return (
    <Link
      href={`/markets/${market.marketId}`}
      className="group animate-card-in relative flex flex-col overflow-hidden rounded-2xl border border-line bg-surface transition duration-300 hover:-translate-y-1 hover:border-line-strong hover:shadow-2xl hover:shadow-black/50"
      style={{ animationDelay: `${Math.min(index * 60, 360)}ms` }}
    >
      <div className="relative aspect-[16/8] overflow-hidden">
        <MarketCover
          marketId={market.marketId}
          description={market.description}
          imageUrl={imageUrl}
          className="transition-transform duration-700 ease-out group-hover:scale-[1.05]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/5 to-transparent" />
        <div className="absolute left-3 top-3">
          <StatusBadge status={status} detail={statusDetail(market)} />
        </div>
        <span className="absolute right-3 top-3 rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-medium text-white/85 backdrop-blur">
          {category.label}
        </span>
      </div>

      <div className="relative -mt-4 flex flex-1 flex-col px-4 pb-4 sm:px-5 sm:pb-5">
        <h3 className="line-clamp-2 min-h-[2.75rem] text-pretty font-display text-[17px] font-semibold leading-snug text-fg">
          {market.description}
        </h3>

        <div className="mt-4 flex items-end justify-between gap-4">
          <div className="shrink-0">
            <div className="text-[32px] font-semibold leading-none tracking-tight text-fg">
              {odds ? `${odds.yes}%` : '—'}
            </div>
            <div className="mt-1.5 text-xs text-subtle">
              {odds ? `chance of ${market.outcome1.toUpperCase()}` : 'not priced yet'}
            </div>
          </div>
          <div className="min-w-0 max-w-[58%] flex-1">
            {history && <Sparkline history={history} height={52} />}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          {outcomes.map((outcome) => {
            const won = winner === outcome.label;
            const lost = winner !== null && !won;
            return (
              <div
                key={outcome.tone}
                className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ring-1 ring-inset transition ${
                  outcome.tone === 'yes' ? 'bg-yes/[0.08] ring-yes/20' : 'bg-no/[0.08] ring-no/20'
                } ${lost ? 'opacity-40' : ''}`}
              >
                <span className={`font-semibold uppercase ${outcome.tone === 'yes' ? 'text-yes' : 'text-no'}`}>
                  {outcome.label}
                  {won && <span className="ml-1.5 text-[10px] font-medium normal-case text-fg">✓ won</span>}
                </span>
                <span className="text-fg">{outcome.pct === undefined ? '—' : `${outcome.pct}%`}</span>
              </div>
            );
          })}
        </div>

        <div className="h-4 shrink-0" />
        <div className="mt-auto flex items-center justify-between gap-3 border-t border-line pt-3 text-xs text-subtle">
          <span>
            <span className="text-muted">{formatEthShort(market.totalCollateral)} ETH</span> pooled
          </span>
          <span>
            <span className="text-muted">{callCount}</span> agent {callCount === 1 ? 'call' : 'calls'}
          </span>
        </div>
      </div>
    </Link>
  );
}
