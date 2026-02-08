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
  if (market.resolved) return 'text-[#00ff41] bg-[#00ff41]/12 border-[#00ff41]/35';
  if (market.assertedOutcomeId !== ZERO_BYTES32) {
    return 'text-[#ffb800] bg-[#ffb800]/12 border-[#ffb800]/35';
  }
  return 'text-[#00ff41] bg-[#00ff41]/12 border-[#00ff41]/35';
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
      className="group card-lift animate-card-in overflow-hidden rounded-2xl border border-white/10 bg-[#111111]/90 shadow-[0_20px_60px_rgba(0,0,0,0.34)] backdrop-blur-md"
      style={{ animationDelay: `${Math.min((index - 1) * 50, 220)}ms` }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/8 bg-gradient-to-r from-[#111111] via-[#111111] to-[#111111] px-3 py-2.5 sm:px-4 sm:py-3">
        <div className="flex items-center gap-2 text-[11px] text-[#a0a0a0] sm:text-xs">
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
        <h3 className="text-base font-semibold leading-snug text-[#00ff41] sm:text-lg">
          {market.description}
        </h3>

        <div className="mt-3 rounded-xl border border-white/8 bg-[#111111] p-2.5 sm:mt-4 sm:p-3">
          <div className="mb-1.5 flex items-center justify-between text-[11px] sm:mb-2 sm:text-xs">
            <span className="text-[#a0a0a0]">Current lean</span>
            <span className="text-[#a0a0a0]">Based on market pricing</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-[#0a0a0a] sm:h-3">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#00ff41] via-[#00ff41] to-[#00ff41] transition-all duration-500"
              style={{ width: `${yesProbability}%` }}
            />
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[11px] font-semibold sm:mt-2 sm:text-xs">
            <span className="text-[#00ff41]">
              {market.outcome1.toUpperCase()} {yesProbability}%
            </span>
            <span className="text-[#ffb800]">
              {market.outcome2.toUpperCase()} {noProbability}%
            </span>
          </div>
        </div>

        <div className="mt-3 rounded-xl border border-[#00ff41]/25 bg-[#111111] p-2.5 sm:mt-4 sm:p-3">
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-[#00ff41]">Latest agent call</span>
            <span className="text-[11px] text-[#a0a0a0]">
              {latestNarrative ? relativeTime(latestNarrative.timestamp) : 'No call yet'}
            </span>
          </div>

          {latestNarrative ? (
            <>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full border border-[#00ff41]/35 bg-[#00ff41]/12 px-2 py-0.5 font-semibold text-[#00ff41]">
                  {latestNarrative.side ? latestNarrative.side.toUpperCase() : 'WATCHING'}
                </span>
                {stakeEth && (
                  <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[#a0a0a0]">
                    stake {stakeEth} ETH
                  </span>
                )}
                {confidence !== null && (
                  <span className="rounded-full border border-[#00ff41]/35 bg-[#00ff41]/12 px-2 py-0.5 text-[#00ff41]">
                    confidence {confidence}%
                  </span>
                )}
              </div>

              <p className="reasoning-compact mt-2 text-xs leading-relaxed text-[#a0a0a0] sm:text-sm">
                {latestNarrative.reasoning}
              </p>

              <div className="mt-1.5 text-[11px] text-[#a0a0a0]">
                {describeEvent(latestNarrative)}
              </div>
            </>
          ) : (
            <p className="text-xs text-[#a0a0a0] sm:text-sm">
              Waiting for the first bet explanation from agents.
            </p>
          )}
        </div>

        {recentNarratives.length > 0 && (
          <div className="mt-3 rounded-xl border border-white/8 bg-[#111111] p-2.5 sm:p-3">
            <div className="mb-2 text-xs font-semibold text-[#a0a0a0]">Recent activity</div>
            <div className="space-y-1.5">
              {recentNarratives.map((event) => (
                <div key={event.id} className="flex items-start justify-between gap-2 text-[11px] sm:text-xs">
                  <span className="text-[#a0a0a0]">{describeEvent(event)}</span>
                  <span className="shrink-0 text-[#a0a0a0]">{relativeTime(event.timestamp)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {showAdvanced && (
          <div className="mt-3 rounded-xl border border-white/10 bg-[#111111] p-2.5 sm:p-3">
            <div className="mb-2 text-xs font-semibold text-[#a0a0a0]">Technical details</div>
            <div className="space-y-1 text-[11px] text-[#a0a0a0] sm:text-xs">
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
