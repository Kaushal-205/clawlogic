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
}

const ZERO_BYTES32 =
  '0x0000000000000000000000000000000000000000000000000000000000000000';

function getStatusLabel(market: MarketInfo): string {
  if (market.resolved) return 'Resolved';
  if (market.assertedOutcomeId !== ZERO_BYTES32) return 'Asserted';
  return 'Live';
}

function getStatusTone(market: MarketInfo): string {
  if (market.resolved) return 'text-[#1fb36b] bg-[#1fb36b]/12 border-[#1fb36b]/35';
  if (market.assertedOutcomeId !== ZERO_BYTES32) {
    return 'text-[#d18c1d] bg-[#d18c1d]/12 border-[#d18c1d]/35';
  }
  return 'text-[#33d7ff] bg-[#33d7ff]/12 border-[#33d7ff]/35';
}

function getLatestByType(events: AgentBroadcast[], type: AgentBroadcast['type']): AgentBroadcast | null {
  return events.find((event) => event.type === type) ?? null;
}

export default function MarketCard({
  market,
  index,
  probability,
  events,
  clobEnabled,
}: MarketCardProps) {
  const broadcast = getLatestByType(events, 'MarketBroadcast');
  const latestTrade = getLatestByType(events, 'TradeRationale');
  const latestIntentYes = events.find((event) => event.type === 'NegotiationIntent' && event.side === 'yes') ?? null;
  const latestIntentNo = events.find((event) => event.type === 'NegotiationIntent' && event.side === 'no') ?? null;

  const quoteFromTrade = latestTrade ? parseCrossedIntentQuote(latestTrade.reasoning) : null;
  const yesBid = latestIntentYes ? Math.round(latestIntentYes.confidence * 100) : null;
  const noAsk = latestIntentNo ? Math.round(latestIntentNo.confidence * 100) : null;
  const inferredYesAsk = noAsk === null ? null : 10_000 - noAsk;
  const inferredEdge = yesBid !== null && inferredYesAsk !== null ? yesBid - inferredYesAsk : null;

  const yesProbability = probability ? Math.round(probability.outcome1Probability) : 50;
  const noProbability = probability ? Math.round(probability.outcome2Probability) : 50;
  const slippageBand = estimateSlippageBand(market.totalCollateral);

  return (
    <article className="rounded-2xl border border-white/10 bg-[#101622]/90 shadow-[0_24px_70px_rgba(0,0,0,0.35)] backdrop-blur-md overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/8 bg-gradient-to-r from-[#121f35] via-[#101622] to-[#1f1622] px-4 py-3">
        <div className="flex items-center gap-2 text-xs text-[#7e8ba3]">
          <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 font-semibold">MKT-{String(index).padStart(3, '0')}</span>
          <span>{formatMarketId(market.marketId)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${getStatusTone(market)}`}>
            {getStatusLabel(market)}
          </span>
          <span className="text-xs text-[#8699b8]">TVL {formatEthShort(market.totalCollateral)} ETH</span>
        </div>
      </div>

      <div className="px-4 py-4">
        <h3 className="text-lg font-semibold text-[#eef3ff] leading-snug">{market.description}</h3>
        <div className="mt-4 rounded-xl border border-white/8 bg-[#0d1320] p-3">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="text-[#7e8ba3]">Implied probability</span>
            <span className="text-[#7e8ba3]">AMM rail</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-[#09101d]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#2fe1c3] via-[#33d7ff] to-[#58a6ff]"
              style={{ width: `${yesProbability}%` }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-xs font-semibold">
            <span className="text-[#2fe1c3]">{market.outcome1.toUpperCase()} {yesProbability}%</span>
            <span className="text-[#f58b6a]">{market.outcome2.toUpperCase()} {noProbability}%</span>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
          <section className="rounded-xl border border-[#25d6be]/30 bg-[#0c1b21] p-3">
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="font-semibold text-[#64ead3]">Agent thesis</span>
              <span className="text-[#7daea5]">{broadcast ? relativeTime(broadcast.timestamp) : 'pending'}</span>
            </div>
            {broadcast ? (
              <>
                <div className="text-sm font-semibold text-[#ddfef8]">
                  {getAgentLabel(broadcast)} staked {broadcast.stakeEth ?? '0'} ETH ({Math.round(broadcast.confidence)}%)
                </div>
                <p className="mt-2 text-sm leading-relaxed text-[#abd9d0]">{broadcast.reasoning}</p>
              </>
            ) : (
              <p className="text-sm text-[#7daea5]">No market broadcast yet. Waiting for initial thesis and stake.</p>
            )}
          </section>

          <section className="rounded-xl border border-[#4b7aff]/25 bg-[#111a30] p-3">
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="font-semibold text-[#8eafff]">CLOB quote lane</span>
              <span className="text-[#7e8ba3]">{clobEnabled ? 'enabled' : 'disabled'}</span>
            </div>
            {quoteFromTrade ? (
              <div className="space-y-2 text-sm text-[#d8e4ff]">
                <div>YES bid: <span className="font-semibold">{(quoteFromTrade.yesBidBps / 100).toFixed(2)}%</span></div>
                <div>NO ask: <span className="font-semibold">{(quoteFromTrade.noAskBps / 100).toFixed(2)}%</span></div>
                <div>Implied YES ask: <span className="font-semibold">{(quoteFromTrade.impliedYesAskBps / 100).toFixed(2)}%</span></div>
                <div className={quoteFromTrade.edgeBps > 0 ? 'text-[#7df6d3] font-semibold' : 'text-[#f7b08a] font-semibold'}>
                  Match edge: {(quoteFromTrade.edgeBps / 100).toFixed(2)}%
                </div>
              </div>
            ) : inferredEdge !== null ? (
              <div className="space-y-2 text-sm text-[#d8e4ff]">
                <div>YES intent confidence: <span className="font-semibold">{(yesBid! / 100).toFixed(2)}%</span></div>
                <div>NO intent confidence: <span className="font-semibold">{(noAsk! / 100).toFixed(2)}%</span></div>
                <div className={inferredEdge > 0 ? 'text-[#7df6d3] font-semibold' : 'text-[#f7b08a] font-semibold'}>
                  Indicative edge: {(inferredEdge / 100).toFixed(2)}%
                </div>
                <div className="text-xs text-[#8ea1c2]">Execution may still route to CPMM when intents do not cross.</div>
              </div>
            ) : (
              <div className="space-y-2 text-sm text-[#b4c4e5]">
                <p>No matched quote pair yet. Showing AMM fallback path.</p>
                <p>Slippage risk on fallback: <span className="font-semibold">{slippageBand}</span></p>
              </div>
            )}
          </section>
        </div>

        <div className="mt-4 rounded-xl border border-white/8 bg-[#0d1320] p-3">
          <div className="mb-3 flex items-center justify-between text-xs">
            <span className="font-semibold text-[#9fb2d5]">Execution trace</span>
            <span className="text-[#7284a4]">on-chain settlement: {process.env.NEXT_PUBLIC_ONCHAIN_SETTLEMENT === 'false' ? 'off' : 'on'}</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <div className={`rounded-lg border px-2 py-2 ${broadcast ? 'border-[#2fe1c3]/30 bg-[#2fe1c3]/10 text-[#bffef0]' : 'border-white/10 bg-white/5 text-[#7f90b0]'}`}>
              1. Broadcast
            </div>
            <div className={`rounded-lg border px-2 py-2 ${latestIntentYes || latestIntentNo ? 'border-[#58a6ff]/30 bg-[#58a6ff]/10 text-[#d1e4ff]' : 'border-white/10 bg-white/5 text-[#7f90b0]'}`}>
              2. Quote intents
            </div>
            <div className={`rounded-lg border px-2 py-2 ${latestTrade ? 'border-[#f6b26a]/30 bg-[#f6b26a]/10 text-[#ffe7c8]' : 'border-white/10 bg-white/5 text-[#7f90b0]'}`}>
              3. Trade
            </div>
            <div className={`rounded-lg border px-2 py-2 ${market.resolved ? 'border-[#7df6d3]/30 bg-[#7df6d3]/10 text-[#dbfff5]' : 'border-white/10 bg-white/5 text-[#7f90b0]'}`}>
              4. Settle
            </div>
          </div>
          {latestTrade && (
            <p className="mt-3 text-xs text-[#9fb2d5]">
              Latest trade by {getAgentLabel(latestTrade)} {latestTrade.side?.toUpperCase() ?? ''}
              {latestTrade.tradeTxHash ? ` | tx ${latestTrade.tradeTxHash.slice(0, 10)}...` : ''}
            </p>
          )}
        </div>
      </div>
    </article>
  );
}
