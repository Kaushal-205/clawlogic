'use client';

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
  if (market.assertedOutcomeId !== ZERO_BYTES32) return 'Awaiting final result';
  return 'Open for bets';
}

function getStatusTone(market: MarketInfo): string {
  if (market.resolved) return 'text-[#39e66a] bg-[#39e66a]/12 border-[#39e66a]/35';
  if (market.assertedOutcomeId !== ZERO_BYTES32) {
    return 'text-[#ffb800] bg-[#ffb800]/12 border-[#ffb800]/35';
  }
  return 'text-[#39e66a] bg-[#39e66a]/12 border-[#39e66a]/35';
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

  const confidence = latestNarrative ? Math.round(latestNarrative.confidence) : null;
  const stakeEth = latestNarrative?.stakeEth;
  const slippageBand = estimateSlippageBand(market.totalCollateral);
  const latestSideTone = sideTagTone(latestNarrative?.side);

  const recentNarratives = events.filter((event) => (
    event.type === 'TradeRationale' ||
    event.type === 'NegotiationIntent' ||
    event.type === 'MarketBroadcast'
  )).slice(0, 3);

  return (
    <article
      className="group card-lift animate-card-in overflow-hidden rounded-2xl border border-white/10 bg-[#111111]/90 shadow-[0_20px_60px_rgba(0,0,0,0.34)] backdrop-blur-md"
      style={{ animationDelay: `${Math.min((index - 1) * 50, 220)}ms` }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/8 bg-gradient-to-r from-[#111111] via-[#111111] to-[#111111] px-3 py-2.5 sm:px-4 sm:py-3">
        <div className="flex items-center gap-2 text-xs text-[#bcc8bc] sm:text-sm">
          <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 font-semibold">
            Market {String(index).padStart(2, '0')}
          </span>
          <span>{formatMarketId(market.marketId)}</span>
        </div>
        <span
          className={`rounded-full border px-2 py-0.5 text-xs font-semibold sm:text-sm ${getStatusTone(market)}`}
        >
          {getStatusLabel(market)}
        </span>
      </div>

      <div className="px-3 py-3.5 sm:px-4 sm:py-4">
        <h3 className="text-lg font-semibold leading-snug text-[#39e66a] sm:text-xl">
          {market.description}
        </h3>

        <div className="mt-3 rounded-xl border border-white/8 bg-[#111111] p-2.5 sm:mt-4 sm:p-3">
          <div className="mb-1.5 flex items-center justify-between text-xs sm:mb-2 sm:text-sm">
            <span className="text-[#bcc8bc]">Current lean</span>
            <span className="text-[#bcc8bc]">Based on market pricing</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full border border-white/20 bg-[#0c0c0c]">
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
          <div className="mt-1.5 flex items-center justify-between text-xs font-semibold sm:mt-2 sm:text-sm">
            <span className="rounded-full border border-[#39e66a]/40 bg-[#39e66a]/12 px-2 py-0.5 text-[#8ef3ab]">
              {market.outcome1.toUpperCase()} {yesProbability}%
            </span>
            <span className="rounded-full border border-[#ff6b7d]/40 bg-[#ff6b7d]/12 px-2 py-0.5 text-[#ff9fad]">
              {market.outcome2.toUpperCase()} {noProbability}%
            </span>
          </div>
        </div>

        <div className="mt-3 rounded-xl border border-[#39e66a]/25 bg-[#111111] p-2.5 sm:mt-4 sm:p-3">
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold text-[#39e66a]">Latest agent call</span>
            <span className="text-xs text-[#bcc8bc] sm:text-sm">
              {latestNarrative ? relativeTime(latestNarrative.timestamp) : 'No call yet'}
            </span>
          </div>

          {latestNarrative ? (
            <>
              <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm">
                <span className={`rounded-full border px-2 py-0.5 font-semibold ${latestSideTone}`}>
                  {latestNarrative.side ? latestNarrative.side.toUpperCase() : 'WATCHING'}
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

              <div className="mt-1.5 text-xs text-[#bcc8bc] sm:text-sm">
                {describeEvent(latestNarrative)}
              </div>
            </>
          ) : (
            <p className="text-sm text-[#bcc8bc]">
              Waiting for the first bet explanation from agents.
            </p>
          )}
        </div>

        {recentNarratives.length > 0 && (
          <div className="mt-3 rounded-xl border border-white/8 bg-[#111111] p-2.5 sm:p-3">
            <div className="mb-2 text-sm font-semibold text-[#bcc8bc]">Recent activity</div>
            <div className="space-y-1.5">
              {recentNarratives.map((event) => (
                <div key={event.id} className="flex items-start justify-between gap-2 text-xs sm:text-sm">
                  <span className="text-[#bcc8bc]">{describeEvent(event)}</span>
                  <span className="shrink-0 text-[#bcc8bc]">{relativeTime(event.timestamp)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {showAdvanced && (
          <div className="mt-3 rounded-xl border border-white/10 bg-[#111111] p-2.5 sm:p-3">
            <div className="mb-2 text-sm font-semibold text-[#bcc8bc]">Technical details</div>
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
