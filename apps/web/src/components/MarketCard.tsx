'use client';

import Link from 'next/link';
import type { AgentBroadcast } from '@/lib/client';
import type { MarketInfo, MarketProbability } from '@clawlogic/sdk';
import {
  estimateSlippageBand,
  formatEthShort,
  formatMarketId,
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
}

const ZERO_BYTES32 =
  '0x0000000000000000000000000000000000000000000000000000000000000000';

function getStatusLabel(market: MarketInfo): string {
  if (market.resolved) return 'Resolved';
  if (market.assertedOutcomeId !== ZERO_BYTES32) return 'Awaiting settlement';
  return 'Live';
}

function getStatusTone(market: MarketInfo): string {
  if (market.resolved) return 'text-[#8ef3ab] bg-[#39e66a]/12 border-[#39e66a]/35';
  if (market.assertedOutcomeId !== ZERO_BYTES32) {
    return 'text-[#ffcf5e] bg-[#ffb800]/12 border-[#ffb800]/35';
  }
  return 'text-[#8ef3ab] bg-[#39e66a]/12 border-[#39e66a]/35';
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
    return 'border-[#ff6b7d]/35 bg-[#ff6b7d]/12 text-[#ff9fad]';
  }
  if (side === 'yes') {
    return 'border-[#39e66a]/35 bg-[#39e66a]/12 text-[#8ef3ab]';
  }
  return 'border-white/20 bg-white/5 text-[#bcc8bc]';
}

export default function MarketCard({
  market,
  index,
  probability,
  events,
  clobEnabled,
  showAdvanced = false,
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
      className="group card-lift animate-card-in overflow-hidden rounded-2xl border border-white/8 bg-[#101411] shadow-[0_20px_60px_rgba(0,0,0,0.34)]"
      style={{ animationDelay: `${Math.min((index - 1) * 50, 220)}ms` }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/6 bg-[#0d120f] px-3 py-2.5 sm:px-4 sm:py-3">
        <div className="flex items-center gap-2 text-xs text-[#6b8a6f] sm:text-sm">
          <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 font-semibold text-[#dbe8de]">
            Q{String(index).padStart(2, '0')}
          </span>
          <Link
            href={`/market/${market.marketId}`}
            className="transition hover:text-[#39e66a]"
          >
            {formatMarketId(market.marketId)}
          </Link>
        </div>
        <span
          className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold sm:text-sm ${getStatusTone(market)}`}
        >
          {getStatusLabel(market)}
        </span>
      </div>

      <div className="space-y-3 p-3.5 sm:space-y-4 sm:p-4">
        <div>
          <Link href={`/market/${market.marketId}`} className="block transition-colors hover:text-[#39e66a]">
            <h3 className="text-lg font-semibold leading-snug text-[#e6f5ea] sm:text-xl group-hover:text-[#39e66a] transition-colors">
              {market.description}
            </h3>
          </Link>
          <p className="mt-1 text-xs text-[#9bb19f] sm:text-sm">
            Read-only pricing snapshot. Liquidity {formatEthShort(market.totalCollateral)} ETH.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
          <div className="rounded-xl border border-[#39e66a]/30 bg-[#39e66a]/10 p-2.5 sm:p-3">
            <div className="text-xs font-semibold uppercase tracking-[0.08em] text-[#8ef3ab]">
              {market.outcome1.toUpperCase()}
            </div>
            <div className="mt-1 text-2xl font-semibold leading-none text-[#e6f5ea] sm:text-[28px]">
              {yesPrice}
            </div>
            <div className="mt-1 text-xs text-[#9bb19f]">Implied probability {yesProbability}%</div>
          </div>
          <div className="rounded-xl border border-[#ff6b7d]/30 bg-[#ff6b7d]/10 p-2.5 sm:p-3">
            <div className="text-xs font-semibold uppercase tracking-[0.08em] text-[#ffb1bd]">
              {market.outcome2.toUpperCase()}
            </div>
            <div className="mt-1 text-2xl font-semibold leading-none text-[#e6f5ea] sm:text-[28px]">
              {noPrice}
            </div>
            <div className="mt-1 text-xs text-[#9bb19f]">Implied probability {noProbability}%</div>
          </div>
        </div>

        <div>
          <div className="h-2 overflow-hidden rounded-full border border-white/15 bg-[#0b100d]">
            <div className="flex h-full w-full">
              <div
                className="h-full bg-gradient-to-r from-[#2ea857] via-[#39e66a] to-[#44ef74] transition-all duration-500"
                style={{ width: `${yesWeight}%` }}
              />
              <div
                className="h-full border-l border-[#160b0f] bg-gradient-to-r from-[#a03144] via-[#d4455d] to-[#ff6b7d] transition-all duration-500"
                style={{ width: `${noWeight}%` }}
              />
            </div>
          </div>
          <div className="mt-1.5 text-xs font-medium text-[#9bb19f] sm:text-sm">{leanText}</div>
        </div>

        <div className="rounded-xl border border-white/10 bg-[#0d120f] p-2.5 sm:p-3">
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold text-[#e6f5ea]">Latest agent call</span>
            <span className="text-xs text-[#9bb19f] sm:text-sm">
              {latestNarrative ? relativeTime(latestNarrative.timestamp) : 'No call yet'}
            </span>
          </div>

          {latestNarrative ? (
            <>
              <div className="flex flex-wrap items-center gap-1.5 text-xs sm:gap-2 sm:text-sm">
                <span className={`rounded-full border px-2 py-0.5 font-semibold ${latestSideTone}`}>
                  {latestNarrative.side ? latestNarrative.side.toUpperCase() : 'WATCHING'}
                </span>
                <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[#bcc8bc]">
                  {getAgentLabel(latestNarrative)}
                </span>
                {stakeEth && (
                  <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[#bcc8bc]">
                    stake {stakeEth} ETH
                  </span>
                )}
                {confidence !== null && (
                  <span className="rounded-full border border-[#39e66a]/35 bg-[#39e66a]/12 px-2 py-0.5 text-[#8ef3ab]">
                    confidence {confidence}%
                  </span>
                )}
              </div>

              <p className="reasoning-compact mt-2 text-sm leading-relaxed text-[#bcc8bc] sm:text-[15px]">
                {latestNarrative.reasoning}
              </p>

              <div className="mt-1.5 text-xs text-[#9bb19f] sm:text-sm">
                {describeEvent(latestNarrative)}
              </div>
            </>
          ) : (
            <p className="text-sm text-[#bcc8bc]">Waiting for the first agent rationale.</p>
          )}
        </div>

        {recentNarratives.length > 0 && (
          <div className="rounded-xl border border-white/10 bg-[#0d120f] p-2.5 sm:p-3">
            <div className="mb-2 text-sm font-semibold text-[#e6f5ea]">Recent activity</div>
            <div className="space-y-1.5">
              {recentNarratives.map((event) => (
                <div key={event.id} className="flex items-start justify-between gap-2 text-xs sm:text-sm">
                  <span className="text-[#bcc8bc]">{describeEvent(event)}</span>
                  <span className="shrink-0 text-[#9bb19f]">{relativeTime(event.timestamp)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {showAdvanced && (
          <div className="rounded-xl border border-white/10 bg-[#0d120f] p-2.5 sm:p-3">
            <div className="mb-2 text-sm font-semibold text-[#e6f5ea]">Technical details</div>
            <div className="space-y-1 text-xs text-[#bcc8bc] sm:text-sm">
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
