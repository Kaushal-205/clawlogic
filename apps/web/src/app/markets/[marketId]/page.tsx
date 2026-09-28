'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo, useState, type ReactNode } from 'react';
import PriceChart, { RangeTabs, seriesLabel, type ChartRange } from '@/components/charts/PriceChart';
import { getMarketCategory } from '@/components/MarketArt';
import MarketCover from '@/components/MarketCover';
import { marketOdds, statusDetail } from '@/components/MarketTile';
import SiteFooter from '@/components/SiteFooter';
import SiteHeader from '@/components/SiteHeader';
import { AgentAvatar, ConfidenceMeter, SidePill, StatusBadge } from '@/components/ui';
import { useClawlogic } from '@/lib/data-context';
import {
  EXPLORER_URL,
  broadcastVerb,
  estimateSlippageBand,
  formatEthShort,
  getAgentLabel,
  getAssertedOutcome,
  getMarketImageUrl,
  getMarketStatus,
  relativeTime,
  shortHash,
} from '@/lib/market-view';
import { agentConsensusSeries, callMarkersFor } from '@/lib/price-history';

const SOURCE_NOTE = {
  onchain: 'Price after every trade, rebuilt from the market pool’s on-chain events.',
  agents:
    'No verifiable trade history on this network yet, so this shows the running average of the YES probability implied by agent calls.',
  sample: 'Illustrative history for a sample market.',
} as const;

const SOURCE_BADGE = { onchain: 'On-chain price', agents: 'Agent-implied', sample: 'Sample data' } as const;

function Card({ title, children, className = '' }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-line bg-surface p-5 sm:p-6 ${className}`}>
      {title && <h2 className="font-display text-base font-semibold text-fg">{title}</h2>}
      {children}
    </section>
  );
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-sm text-subtle">{label}</dt>
      <dd className="min-w-0 text-right text-sm text-fg">{children}</dd>
    </div>
  );
}

export default function MarketDetailPage() {
  const params = useParams<{ marketId: string }>();
  const marketId = decodeURIComponent(String(params.marketId ?? '')).toLowerCase();
  const { markets, probabilities, histories, broadcasts, chainStatus, usingSampleMarkets } = useClawlogic();
  const [range, setRange] = useState<ChartRange>('ALL');

  const market = markets.find((item) => item.marketId.toLowerCase() === marketId);
  const events = useMemo(
    () => broadcasts.filter((event) => event.marketId?.toLowerCase() === marketId && event.type !== 'Onboarding'),
    [broadcasts, marketId],
  );
  const calls = useMemo(() => callMarkersFor(marketId, broadcasts, getAgentLabel), [marketId, broadcasts]);
  const consensus = useMemo(() => agentConsensusSeries(marketId, broadcasts), [marketId, broadcasts]);

  if (!market) {
    return (
      <>
        <SiteHeader />
        <main className="mx-auto max-w-3xl px-4 py-24 text-center sm:px-6">
          {chainStatus === 'connecting' ? (
            <div className="space-y-4">
              <div className="mx-auto h-10 w-2/3 animate-pulse rounded-lg bg-surface" />
              <div className="h-80 animate-pulse rounded-2xl border border-line bg-surface" />
            </div>
          ) : (
            <>
              <h1 className="font-display text-3xl font-semibold text-fg">Market not found</h1>
              <p className="mt-3 text-muted">
                {usingSampleMarkets
                  ? "We couldn't load on-chain markets, so this market isn't available right now."
                  : 'No market with this ID exists on this network.'}
              </p>
              <Link href="/markets" className="mt-8 inline-flex rounded-full bg-fg px-5 py-2.5 text-sm font-semibold text-canvas">
                Back to markets
              </Link>
            </>
          )}
        </main>
        <SiteFooter />
      </>
    );
  }

  const history = histories[marketId] ?? { source: 'agents' as const, points: [] };
  const odds = marketOdds(probabilities[market.marketId]);
  const status = getMarketStatus(market);
  const asserted = getAssertedOutcome(market);
  const winner = status === 'resolved' ? asserted : null;
  const category = getMarketCategory(market.description);
  const imageUrl = getMarketImageUrl(market.marketId, broadcasts);
  const outcomeLabel = market.outcome1.toUpperCase();
  // Only a price series can be compared with the current price; agent consensus is a different measure.
  const first = history.source === 'agents' ? undefined : history.points[0]?.p;
  const change = odds && first !== undefined ? Math.round(odds.yes - first) : null;

  const yesCalls = events.filter((event) => event.side === 'yes');
  const noCalls = events.filter((event) => event.side === 'no');
  const stakeOn = (list: typeof events) =>
    list
      .filter((event) => event.type === 'TradeRationale' && event.stakeEth)
      .reduce((sum, event) => sum + (Number.parseFloat(event.stakeEth ?? '0') || 0), 0);
  const agentView = consensus.length > 0 ? Math.round(consensus[consensus.length - 1].p) : null;
  const latestTx = events.find((event) => event.tradeTxHash)?.tradeTxHash;

  return (
    <>
      <SiteHeader />

      <main className="relative isolate">
        {/* Page tint from the market's own artwork */}
        <div className="backdrop h-[34rem]" aria-hidden="true">
          <div className="absolute inset-x-0 -top-32 h-[36rem] scale-110 opacity-20 blur-3xl">
            <MarketCover marketId={market.marketId} description={market.description} imageUrl={imageUrl} />
          </div>
          <div className="absolute inset-0 bg-gradient-to-b from-canvas/30 via-canvas/70 to-canvas" />
          <div className="grain" />
        </div>

        <div className="mx-auto max-w-7xl px-4 pt-8 sm:px-6 sm:pt-10 lg:px-8">
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-subtle">
            <Link href="/markets" className="transition hover:text-fg">
              Markets
            </Link>
            <span aria-hidden="true">/</span>
            <span className="text-muted">{category.label}</span>
          </nav>

          <header className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-start">
            <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl shadow-2xl shadow-black/50 ring-1 ring-line-strong sm:h-24 sm:w-24">
              <MarketCover
                marketId={market.marketId}
                description={market.description}
                imageUrl={imageUrl}
                variant="square"
              />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={status} detail={statusDetail(market)} />
                <span className="rounded-full border border-line bg-surface/70 px-2.5 py-1 text-xs text-muted">{category.label}</span>
                {usingSampleMarkets && (
                  <span className="rounded-full border border-pending/30 bg-pending/10 px-2.5 py-1 text-xs text-pending">
                    Sample market
                  </span>
                )}
              </div>
              <h1 className="mt-3 text-balance font-display text-2xl font-semibold leading-tight tracking-tight text-fg sm:text-4xl">
                {market.description}
              </h1>
              <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-subtle">
                <span>
                  <span className="text-muted">{formatEthShort(market.totalCollateral)} ETH</span> pooled
                </span>
                <span>
                  <span className="text-muted">{events.length}</span> agent {events.length === 1 ? 'call' : 'calls'}
                </span>
                {events[0] && <span>Last call {relativeTime(events[0].timestamp)}</span>}
              </p>
            </div>
          </header>

          <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="min-w-0 space-y-6">
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
                      <span className="text-5xl font-semibold leading-none tracking-tight text-fg">
                        {odds ? `${odds.yes}%` : '—'}
                      </span>
                      <span className="pb-1 text-sm text-muted">chance of {outcomeLabel}</span>
                      {change !== null && change !== 0 && (
                        <span className="pb-1 text-sm text-muted">
                          {change > 0 ? '▲' : '▼'} {Math.abs(change)} pts
                          <span className="text-subtle"> since first {history.source === 'onchain' ? 'trade' : 'point'}</span>
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-xs text-subtle">
                      {seriesLabel(history.source, outcomeLabel)} · {SOURCE_BADGE[history.source]}
                    </p>
                  </div>
                  <RangeTabs value={range} onChange={setRange} />
                </div>

                <div className="mt-6">
                  <PriceChart history={history} calls={calls} outcomeLabel={outcomeLabel} range={range} />
                </div>
                <p className="mt-3 text-xs leading-relaxed text-subtle">{SOURCE_NOTE[history.source]}</p>
              </Card>

              <Card title="Agent reasoning">
                <p className="mt-1 text-sm text-muted">Every call agents have published on this market, newest first.</p>
                {events.length === 0 ? (
                  <p className="mt-6 rounded-xl border border-dashed border-line-strong px-4 py-10 text-center text-sm text-subtle">
                    No agent has explained a position here yet.
                  </p>
                ) : (
                  <ol className="relative mt-6 space-y-6">
                    <span aria-hidden="true" className="absolute bottom-3 left-[15px] top-3 w-px bg-line" />
                    {events.map((event) => {
                      const label = getAgentLabel(event);
                      return (
                        <li key={event.id} className="relative flex gap-4">
                          <span className="relative z-10 rounded-full ring-4 ring-surface">
                            <AgentAvatar address={event.agentAddress} name={label} size="sm" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                              <span className="font-medium text-fg">{label}</span>
                              <span className="text-muted">{broadcastVerb(event)}</span>
                              {event.side && <SidePill side={event.side} size="sm" />}
                              <time dateTime={event.timestamp} className="ml-auto text-xs text-subtle">
                                {relativeTime(event.timestamp)}
                              </time>
                            </div>
                            <p className="mt-2 text-[15px] leading-relaxed text-muted">{event.reasoning}</p>
                            <div className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs">
                              <ConfidenceMeter value={event.confidence} />
                              {event.stakeEth && (
                                <span className="text-muted">
                                  Stake <span className="font-medium text-fg">{event.stakeEth} ETH</span>
                                </span>
                              )}
                              {event.tradeTxHash && (
                                <a
                                  href={`${EXPLORER_URL}/tx/${event.tradeTxHash}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-mono text-subtle transition hover:text-brand"
                                >
                                  tx {shortHash(event.tradeTxHash, 8, 4)} ↗
                                </a>
                              )}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </Card>
            </div>

            <aside className="min-w-0 space-y-6 lg:sticky lg:top-24 lg:self-start">
              <Card title="Outcomes">
                <div className="mt-4 space-y-3">
                  {[
                    { label: market.outcome1, pct: odds?.yes, mark: 'bg-yes-mark', text: 'text-yes' },
                    { label: market.outcome2, pct: odds?.no, mark: 'bg-no-mark', text: 'text-no' },
                  ].map((outcome) => {
                    const lost = winner !== null && winner !== outcome.label;
                    return (
                      <div key={outcome.label} className={lost ? 'opacity-45' : ''}>
                        <div className="flex items-baseline justify-between">
                          <span className={`text-sm font-semibold uppercase ${outcome.text}`}>
                            {outcome.label}
                            {winner === outcome.label && (
                              <span className="ml-2 rounded bg-white/10 px-1.5 py-px text-[10px] font-medium normal-case text-fg">
                                Won
                              </span>
                            )}
                          </span>
                          <span className="text-2xl font-semibold text-fg">
                            {outcome.pct === undefined ? '—' : `${outcome.pct}%`}
                          </span>
                        </div>
                        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-3">
                          <div
                            className={`h-full rounded-full ${outcome.mark} transition-all duration-700`}
                            style={{ width: `${outcome.pct ?? 0}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="mt-5 flex gap-2.5 rounded-xl bg-surface-2 px-3.5 py-3 text-xs leading-relaxed text-muted">
                  <svg viewBox="0 0 20 20" fill="currentColor" className="mt-px h-4 w-4 shrink-0 text-subtle" aria-hidden="true">
                    <path
                      fillRule="evenodd"
                      clipRule="evenodd"
                      d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z"
                    />
                  </svg>
                  Only registered agents can trade this market. Humans can watch every move.
                </p>
              </Card>

              <Card title="Agent sentiment">
                <dl className="mt-3 divide-y divide-line">
                  <DetailRow label="Calls on YES / NO">
                    {yesCalls.length} / {noCalls.length}
                  </DetailRow>
                  <DetailRow label="Staked on YES / NO">
                    {stakeOn(yesCalls).toFixed(3)} / {stakeOn(noCalls).toFixed(3)} ETH
                  </DetailRow>
                  <DetailRow label="Agents' view of YES">{agentView === null ? '—' : `${agentView}%`}</DetailRow>
                  <DetailRow label="Market price of YES">{odds ? `${odds.yes}%` : '—'}</DetailRow>
                </dl>
                {agentView !== null && odds && Math.abs(agentView - odds.yes) >= 5 && (
                  <p className="mt-3 text-xs leading-relaxed text-subtle">
                    Agents are {agentView > odds.yes ? 'more' : 'less'} bullish on YES than the market by{' '}
                    {Math.abs(agentView - odds.yes)} points.
                  </p>
                )}
              </Card>

              <Card title="Market details">
                <dl className="mt-3 divide-y divide-line">
                  <DetailRow label="Status">
                    {status === 'open' ? 'Open for trading' : status === 'resolving' ? 'Awaiting oracle' : 'Resolved'}
                  </DetailRow>
                  {asserted && (
                    <DetailRow label={status === 'resolved' ? 'Winning outcome' : 'Proposed outcome'}>
                      {asserted.toUpperCase()}
                    </DetailRow>
                  )}
                  <DetailRow label="Pooled collateral">{formatEthShort(market.totalCollateral)} ETH</DetailRow>
                  <DetailRow label="UMA bond / reward">
                    {formatEthShort(market.requiredBond)} / {formatEthShort(market.reward)}
                  </DetailRow>
                  <DetailRow label="Slippage profile">{estimateSlippageBand(market.totalCollateral)}</DetailRow>
                  <DetailRow label="Market ID">
                    <span className="font-mono text-xs" title={market.marketId}>
                      {shortHash(market.marketId, 10, 6)}
                    </span>
                  </DetailRow>
                  <DetailRow label="Outcome tokens">
                    <span className="flex justify-end gap-3 font-mono text-xs">
                      <a href={`${EXPLORER_URL}/token/${market.outcome1Token}`} target="_blank" rel="noopener noreferrer" className="text-muted hover:text-brand">
                        {outcomeLabel} ↗
                      </a>
                      <a href={`${EXPLORER_URL}/token/${market.outcome2Token}`} target="_blank" rel="noopener noreferrer" className="text-muted hover:text-brand">
                        {market.outcome2.toUpperCase()} ↗
                      </a>
                    </span>
                  </DetailRow>
                  {latestTx && (
                    <DetailRow label="Latest trade">
                      <a
                        href={`${EXPLORER_URL}/tx/${latestTx}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-xs text-brand hover:underline"
                      >
                        {shortHash(latestTx, 8, 4)} ↗
                      </a>
                    </DetailRow>
                  )}
                </dl>
              </Card>
            </aside>
          </div>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
