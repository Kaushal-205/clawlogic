'use client';

import Link from 'next/link';
import type { AgentBroadcast } from '@/lib/client';
import type { MarketInfo, MarketProbability } from '@clawlogic/sdk';
import {
  estimateSlippageBand,
  formatEthShort,
  getAgentLabel,
  parseCrossedIntentQuote,
  relativeTime,
} from '@/lib/market-view';

interface MarketCardProps {
  market: MarketInfo;
  index: number;
  probability?: MarketProbability;
  events: AgentBroadcast[];
  clobEnabled: boolean;
  showAdvanced?: boolean;
  imageSrc: string;
}

const ZERO_BYTES32 =
  '0x0000000000000000000000000000000000000000000000000000000000000000';

function getStatusLabel(market: MarketInfo): string {
  if (market.resolved) return 'Resolved';
  if (market.assertedOutcomeId !== ZERO_BYTES32) return 'Awaiting settlement';
  return 'Live';
}

function getStatusTone(market: MarketInfo): string {
  if (market.resolved) return 'text-[var(--cl-accent-soft)] bg-[var(--cl-accent)]/12 border-[var(--cl-accent)]/35';
  if (market.assertedOutcomeId !== ZERO_BYTES32) {
    return 'text-[var(--cl-warn-soft)] bg-[var(--cl-warn)]/12 border-[var(--cl-warn)]/35';
  }
  return 'text-[var(--cl-accent-soft)] bg-[var(--cl-accent)]/12 border-[var(--cl-accent)]/35';
}

function getLatestByType(
  events: AgentBroadcast[],
  type: AgentBroadcast['type'],
): AgentBroadcast | null {
  return events.find((event) => event.type === type) ?? null;
}

function getLatestNarrative(events: AgentBroadcast[]): AgentBroadcast | null {
  return (
    events.find((event) => event.type === 'TradeRationale') ??
    events.find((event) => event.type === 'NegotiationIntent') ??
    events.find((event) => event.type === 'MarketBroadcast') ??
    null
  );
}

function describeEvent(event: AgentBroadcast): string {
  if (event.type === 'TradeRationale') {
    return `${getAgentLabel(event)} placed a ${event.side?.toUpperCase() ?? 'new'} bet`;
  }
  if (event.type === 'NegotiationIntent') {
    return `${getAgentLabel(event)} shared a ${event.side?.toUpperCase() ?? 'new'} intent`;
  }
  return `${getAgentLabel(event)} posted a market view`;
}

function sideTagTone(side?: string): string {
  if (side === 'no') {
    return 'border-[var(--cl-negative)]/35 bg-[var(--cl-negative)]/12 text-[var(--cl-negative-soft)]';
  }
  if (side === 'yes') {
    return 'border-[var(--cl-accent)]/35 bg-[var(--cl-accent)]/12 text-[var(--cl-accent-soft)]';
  }
  return 'border-white/20 bg-white/5 text-[var(--cl-text-secondary)]';
}

export default function MarketCard({
  market,
  index,
  probability,
  events,
  clobEnabled,
  showAdvanced = false,
  imageSrc,
}: MarketCardProps) {
  const latestNarrative = getLatestNarrative(events);
  const latestTrade = getLatestByType(events, 'TradeRationale');
  const latestIntentYes =
    events.find((event) => event.type === 'NegotiationIntent' && event.side === 'yes') ?? null;
  const latestIntentNo =
    events.find((event) => event.type === 'NegotiationIntent' && event.side === 'no') ?? null;

  const quoteFromTrade = latestTrade ? parseCrossedIntentQuote(latestTrade.reasoning) : null;
  const yesBid = latestIntentYes ? Math.round(latestIntentYes.confidence * 100) : null;
  const noAsk = latestIntentNo ? Math.round(latestIntentNo.confidence * 100) : null;
  const inferredYesAsk = noAsk === null ? null : 10_000 - noAsk;
  const inferredEdge =
    yesBid !== null && inferredYesAsk !== null ? yesBid - inferredYesAsk : null;

  const rawYesProbability = probability ? probability.outcome1Probability : 50;
  const rawNoProbability = probability ? probability.outcome2Probability : 50;
  const totalProbability = rawYesProbability + rawNoProbability || 100;
  const yesWeight = Math.max(0, Math.min(100, (rawYesProbability / totalProbability) * 100));
  const noWeight = Math.max(0, Math.min(100, (rawNoProbability / totalProbability) * 100));
  const yesProbability = Math.round(yesWeight);
  const noProbability = Math.round(noWeight);

  const yesPrice = `${yesProbability}c`;
  const noPrice = `${noProbability}c`;

  const confidence = latestNarrative ? Math.round(latestNarrative.confidence) : null;
  const stakeEth = latestNarrative?.stakeEth;
  const slippageBand = estimateSlippageBand(market.totalCollateral);
  const latestSideTone = sideTagTone(latestNarrative?.side);

  const recentNarratives = events
    .filter(
      (event) =>
        event.type === 'TradeRationale' ||
        event.type === 'NegotiationIntent' ||
        event.type === 'MarketBroadcast',
    )
    .slice(0, 4);

  const spread = Math.abs(yesProbability - noProbability);
  const leanText =
    yesProbability === noProbability
      ? 'Market is split'
      : yesProbability > noProbability
        ? `${market.outcome1.toUpperCase()} leads by ${spread} pts`
        : `${market.outcome2.toUpperCase()} leads by ${spread} pts`;

  return (
    <article
      className="group card-lift animate-card-in overflow-hidden rounded-2xl border border-white/8 bg-[var(--cl-surface-1)] shadow-[0_20px_60px_rgba(0,0,0,0.34)]"
      style={{ animationDelay: `${Math.min((index - 1) * 50, 220)}ms` }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/6 bg-[var(--cl-surface-2)] px-3 py-2.5 sm:px-4 sm:py-3">
        <div className="flex items-center gap-2 text-xs text-[var(--cl-text-subtle)] sm:text-sm">
          <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 font-semibold text-[#dbe8de]">
            Market {String(index).padStart(2, '0')}
          </span>
          {showAdvanced && (
            <Link
              href={`/market/${market.marketId}`}
              className="transition hover:text-[var(--cl-accent)]"
            >
              {`${market.marketId.slice(0, 6)}...${market.marketId.slice(-4)}`}
            </Link>
          )}
        </div>
        <span
          className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold sm:text-sm ${getStatusTone(market)}`}
        >
          {getStatusLabel(market)}
        </span>
      </div>

      <div className="space-y-3 p-3.5 sm:space-y-4 sm:p-4">
        <Link href={`/market/${market.marketId}`} className="block overflow-hidden rounded-xl border border-white/10">
          <img
            src={imageSrc}
            alt={`Market profile for ${market.description}`}
            className="h-40 w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            loading="lazy"
          />
        </Link>

        <div>
          <Link href={`/market/${market.marketId}`} className="block transition-colors hover:text-[var(--cl-accent)]">
            <h3 className="text-lg font-semibold leading-snug text-[var(--cl-text-primary)] sm:text-xl group-hover:text-[var(--cl-accent)] transition-colors">
              {market.description}
            </h3>
          </Link>
          <p className="mt-1 text-xs text-[var(--cl-text-muted)] sm:text-sm">
            Live pricing snapshot. Liquidity {formatEthShort(market.totalCollateral)} ETH.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
          <div className="rounded-xl border border-[var(--cl-accent)]/30 bg-[var(--cl-accent)]/10 p-2.5 sm:p-3">
            <div className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--cl-accent-soft)]">
              {market.outcome1.toUpperCase()}
            </div>
            <div className="mt-1 text-2xl font-semibold leading-none text-[var(--cl-text-primary)] sm:text-[28px]">
              {yesPrice}
            </div>
            <div className="mt-1 text-xs text-[var(--cl-text-muted)]">Implied probability {yesProbability}%</div>
          </div>
          <div className="rounded-xl border border-[var(--cl-negative)]/30 bg-[var(--cl-negative)]/10 p-2.5 sm:p-3">
            <div className="text-xs font-semibold uppercase tracking-[0.08em] text-[#ffb1bd]">
              {market.outcome2.toUpperCase()}
            </div>
            <div className="mt-1 text-2xl font-semibold leading-none text-[var(--cl-text-primary)] sm:text-[28px]">
              {noPrice}
            </div>
            <div className="mt-1 text-xs text-[var(--cl-text-muted)]">Implied probability {noProbability}%</div>
          </div>
        </div>

        <div>
          <div className="h-2 overflow-hidden rounded-full border border-white/15 bg-[var(--cl-surface-3)]">
            <div className="flex h-full w-full">
              <div
                className="h-full bg-gradient-to-r from-[#2E8FFF] via-[var(--cl-accent)] to-[#7CD8FF] transition-all duration-500"
                style={{ width: `${yesWeight}%` }}
              />
              <div
                className="h-full border-l border-[#160b0f] bg-gradient-to-r from-[#D96A3A] via-[#FF9D6A] to-[var(--cl-negative)] transition-all duration-500"
                style={{ width: `${noWeight}%` }}
              />
            </div>
          </div>
          <div className="mt-1.5 text-xs font-medium text-[var(--cl-text-muted)] sm:text-sm">{leanText}</div>
        </div>

        <div className="rounded-xl border border-white/10 bg-[var(--cl-surface-2)] p-2.5 sm:p-3">
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold text-[var(--cl-text-primary)]">Latest agent call</span>
            <span className="text-xs text-[var(--cl-text-muted)] sm:text-sm">
              {latestNarrative ? relativeTime(latestNarrative.timestamp) : 'No call yet'}
            </span>
          </div>

          {latestNarrative ? (
            <>
              <div className="flex flex-wrap items-center gap-1.5 text-xs sm:gap-2 sm:text-sm">
                <span className={`rounded-full border px-2 py-0.5 font-semibold ${latestSideTone}`}>
                  {latestNarrative.side ? latestNarrative.side.toUpperCase() : 'WATCHING'}
                </span>
                <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[var(--cl-text-secondary)]">
                  {getAgentLabel(latestNarrative)}
                </span>
                {stakeEth && (
                  <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[var(--cl-text-secondary)]">
                    stake {stakeEth} ETH
                  </span>
                )}
                {confidence !== null && (
                  <span className="rounded-full border border-[var(--cl-accent)]/35 bg-[var(--cl-accent)]/12 px-2 py-0.5 text-[var(--cl-accent-soft)]">
                    confidence {confidence}%
                  </span>
                )}
              </div>

              <p className="reasoning-compact mt-2 text-sm leading-relaxed text-[var(--cl-text-secondary)] sm:text-[15px]">
                {latestNarrative.reasoning}
              </p>

              <div className="mt-1.5 text-xs text-[var(--cl-text-muted)] sm:text-sm">
                {describeEvent(latestNarrative)}
              </div>
            </>
          ) : (
            <p className="text-sm text-[var(--cl-text-secondary)]">Waiting for the first agent rationale.</p>
          )}
        </div>

        {recentNarratives.length > 0 && (
          <div className="rounded-xl border border-white/10 bg-[var(--cl-surface-2)] p-2.5 sm:p-3">
            <div className="mb-2 text-sm font-semibold text-[var(--cl-text-primary)]">Recent activity</div>
            <div className="space-y-1.5">
              {recentNarratives.map((event) => (
                <div key={event.id} className="flex items-start justify-between gap-2 text-xs sm:text-sm">
                  <span className="text-[var(--cl-text-secondary)]">{describeEvent(event)}</span>
                  <span className="shrink-0 text-[var(--cl-text-muted)]">{relativeTime(event.timestamp)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {showAdvanced && (
          <div className="rounded-xl border border-white/10 bg-[var(--cl-surface-2)] p-2.5 sm:p-3">
            <div className="mb-2 text-sm font-semibold text-[var(--cl-text-primary)]">Technical details</div>
            <div className="space-y-1 text-xs text-[var(--cl-text-secondary)] sm:text-sm">
              <div>Market ID: {market.marketId}</div>
              <div>Total liquidity: {formatEthShort(market.totalCollateral)} ETH</div>
              <div>CLOB matching enabled: {clobEnabled ? 'yes' : 'no'}</div>
              {quoteFromTrade ? (
                <div>
                  Crossed quote edge: {(quoteFromTrade.edgeBps / 100).toFixed(2)}%
                </div>
              ) : inferredEdge !== null ? (
                <div>Indicative intent edge: {(inferredEdge / 100).toFixed(2)}%</div>
              ) : (
                <div>Fallback slippage profile: {slippageBand}</div>
              )}
              {latestTrade?.tradeTxHash && <div>Latest trade tx: {latestTrade.tradeTxHash}</div>}
            </div>
          </div>
        )}
      </div>
    </article>
  );
}
