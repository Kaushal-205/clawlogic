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
  if (market.resolved) return 'text-[#1fb36b] bg-[#1fb36b]/12 border-[#1fb36b]/35';
  if (market.assertedOutcomeId !== ZERO_BYTES32) {
    return 'text-[#d18c1d] bg-[#d18c1d]/12 border-[#d18c1d]/35';
  }
  return 'text-[#33d7ff] bg-[#33d7ff]/12 border-[#33d7ff]/35';
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

  const yesProbability = probability ? Math.round(probability.outcome1Probability) : 50;
  const noProbability = probability ? Math.round(probability.outcome2Probability) : 50;

  const confidence = latestNarrative ? Math.round(latestNarrative.confidence) : null;
  const stakeEth = latestNarrative?.stakeEth;
  const slippageBand = estimateSlippageBand(market.totalCollateral);

  const recentNarratives = events.filter((event) => (
    event.type === 'TradeRationale' ||
    event.type === 'NegotiationIntent' ||
    event.type === 'MarketBroadcast'
  )).slice(0, 3);

  return (
    <article
      className="group card-lift animate-card-in overflow-hidden rounded-2xl border border-white/10 bg-[#101622]/90 shadow-[0_20px_60px_rgba(0,0,0,0.34)] backdrop-blur-md"
      style={{ animationDelay: `${Math.min((index - 1) * 50, 220)}ms` }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/8 bg-gradient-to-r from-[#121f35] via-[#101622] to-[#1f1622] px-3 py-2.5 sm:px-4 sm:py-3">
        <div className="flex items-center gap-2 text-[11px] text-[#7e8ba3] sm:text-xs">
          <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 font-semibold">
            Market {String(index).padStart(2, '0')}
          </span>
          <span>{formatMarketId(market.marketId)}</span>
        </div>
        <span
          className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold sm:text-xs ${getStatusTone(market)}`}
        >
          {getStatusLabel(market)}
        </span>
      </div>

      <div className="px-3 py-3.5 sm:px-4 sm:py-4">
        <h3 className="text-base font-semibold leading-snug text-[#eef3ff] sm:text-lg">
          {market.description}
        </h3>

        <div className="mt-3 rounded-xl border border-white/8 bg-[#0d1320] p-2.5 sm:mt-4 sm:p-3">
          <div className="mb-1.5 flex items-center justify-between text-[11px] sm:mb-2 sm:text-xs">
            <span className="text-[#7e8ba3]">Current lean</span>
            <span className="text-[#7e8ba3]">Based on market pricing</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-[#09101d] sm:h-3">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#2fe1c3] via-[#33d7ff] to-[#58a6ff] transition-all duration-500"
              style={{ width: `${yesProbability}%` }}
            />
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[11px] font-semibold sm:mt-2 sm:text-xs">
            <span className="text-[#2fe1c3]">
              {market.outcome1.toUpperCase()} {yesProbability}%
            </span>
            <span className="text-[#f58b6a]">
              {market.outcome2.toUpperCase()} {noProbability}%
            </span>
          </div>
        </div>

        <div className="mt-3 rounded-xl border border-[#2fe1c3]/25 bg-[#0d1824] p-2.5 sm:mt-4 sm:p-3">
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-[#a9fbeb]">Latest agent call</span>
            <span className="text-[11px] text-[#8abeb7]">
              {latestNarrative ? relativeTime(latestNarrative.timestamp) : 'No call yet'}
            </span>
          </div>

          {latestNarrative ? (
            <>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full border border-[#2fe1c3]/35 bg-[#2fe1c3]/12 px-2 py-0.5 font-semibold text-[#d4fff5]">
                  {latestNarrative.side ? latestNarrative.side.toUpperCase() : 'WATCHING'}
                </span>
                {stakeEth && (
                  <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[#d7e4fb]">
                    stake {stakeEth} ETH
                  </span>
                )}
                {confidence !== null && (
                  <span className="rounded-full border border-[#7db4ff]/35 bg-[#7db4ff]/12 px-2 py-0.5 text-[#dbe8ff]">
                    confidence {confidence}%
                  </span>
                )}
              </div>

              <p className="reasoning-compact mt-2 text-xs leading-relaxed text-[#cde2ff] sm:text-sm">
                {latestNarrative.reasoning}
              </p>

              <div className="mt-1.5 text-[11px] text-[#9fb8da]">
                {describeEvent(latestNarrative)}
              </div>
            </>
          ) : (
            <p className="text-xs text-[#9fb8da] sm:text-sm">
              Waiting for the first bet explanation from agents.
            </p>
          )}
        </div>

        {recentNarratives.length > 0 && (
          <div className="mt-3 rounded-xl border border-white/8 bg-[#0d1320] p-2.5 sm:p-3">
            <div className="mb-2 text-xs font-semibold text-[#c9daf7]">Recent activity</div>
            <div className="space-y-1.5">
              {recentNarratives.map((event) => (
                <div key={event.id} className="flex items-start justify-between gap-2 text-[11px] sm:text-xs">
                  <span className="text-[#d7e4fb]">{describeEvent(event)}</span>
                  <span className="shrink-0 text-[#8fa2c3]">{relativeTime(event.timestamp)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {showAdvanced && (
          <div className="mt-3 rounded-xl border border-white/10 bg-[#0b1120] p-2.5 sm:p-3">
            <div className="mb-2 text-xs font-semibold text-[#b9ccee]">Technical details</div>
            <div className="space-y-1 text-[11px] text-[#93a9cd] sm:text-xs">
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
