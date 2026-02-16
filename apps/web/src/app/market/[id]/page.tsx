'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import type { MarketInfo, MarketProbability } from '@clawlogic/sdk';
import { ClawlogicClient, ARBITRUM_SEPOLIA_RPC_URL, createConfig } from '@clawlogic/sdk';
import { getAgentBroadcasts, type AgentBroadcast } from '@/lib/client';
import {
  formatEthShort,
  formatMarketId,
  getAgentLabel,
  relativeTime,
} from '@/lib/market-view';

const DEPLOYED_CONFIG = createConfig(
  {
    agentRegistry: '0xd0B1864A1da6407A7DE5a08e5f82352b5e230cd3',
    predictionMarketHook: '0xB3C4a85906493f3Cf0d59e891770Bb2e77FA8880',
    poolManager: '0xFB3e0C6F74eB1a21CC1Da29aeC80D2Dfe6C9a317',
    optimisticOracleV3: '0x9023B0bB4E082CDcEdFA2b3671371646f4C5FBFb',
  },
  421614,
  ARBITRUM_SEPOLIA_RPC_URL,
);

const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000';

function getStatusInfo(market: MarketInfo): { label: string; tone: string } {
  if (market.resolved) return { label: 'Resolved', tone: 'border-[#5CC8FF]/30 bg-[#5CC8FF]/10 text-[#BEE9FF]' };
  if (market.assertedOutcomeId !== ZERO_BYTES32) return { label: 'Awaiting Settlement', tone: 'border-[#F6C45A]/30 bg-[#F6C45A]/10 text-[#FFE2A3]' };
  return { label: 'Live Trading', tone: 'border-[#5CC8FF]/30 bg-[#5CC8FF]/10 text-[#BEE9FF]' };
}

function sideTagTone(side?: string): string {
  if (side === 'yes') return 'border-[#5CC8FF]/30 bg-[#5CC8FF]/10 text-[#BEE9FF]';
  if (side === 'no') return 'border-[#FF8A4C]/30 bg-[#FF8A4C]/10 text-[#FFC3A1]';
  return 'border-white/15 bg-white/5 text-[#C7D2E5]';
}

export default function MarketDetailPage() {
  const params = useParams();
  const marketId = params.id as string;
  const fullMarketId = marketId.startsWith('0x') ? marketId : `0x${marketId}`;

  const [market, setMarket] = useState<MarketInfo | null>(null);
  const [probability, setProbability] = useState<MarketProbability | null>(null);
  const [broadcasts, setBroadcasts] = useState<AgentBroadcast[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const client = new ClawlogicClient(DEPLOYED_CONFIG);
        const [marketData, allBroadcasts] = await Promise.all([
          client.getMarket(fullMarketId as `0x${string}`),
          getAgentBroadcasts(),
        ]);

        if (!mounted) return;
        setMarket(marketData);
        setBroadcasts(allBroadcasts);

        try {
          const prob = await client.getMarketProbability(fullMarketId as `0x${string}`);
          if (mounted) setProbability(prob);
        } catch {
          if (mounted) setProbability({ outcome1Probability: 50, outcome2Probability: 50 });
        }
      } catch {
        if (mounted) setError('Market not found or RPC error.');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void load();
    return () => { mounted = false; };
  }, [fullMarketId]);

  const marketEvents = useMemo(() => {
    return broadcasts
      .filter((e) => e.marketId?.toLowerCase() === fullMarketId.toLowerCase())
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [broadcasts, fullMarketId]);

  if (loading) {
    return (
      <main className="mx-auto max-w-[900px] px-4 py-8 sm:px-6">
        <div className="space-y-4">
          <div className="h-12 w-64 shimmer rounded-xl" />
          <div className="h-48 shimmer rounded-2xl" />
          <div className="h-32 shimmer rounded-2xl" />
        </div>
      </main>
    );
  }

  if (error || !market) {
    return (
      <main className="mx-auto max-w-[900px] px-4 py-8 sm:px-6">
        <Link href="/" className="mb-6 inline-flex items-center gap-1.5 text-sm text-[#8C9FB3] transition hover:text-[#5CC8FF]">
          &larr; Back to Markets
        </Link>
        <div className="rounded-2xl border border-white/8 bg-[#1A2138] p-8 text-center">
          <h1 className="text-xl font-bold text-[#F6F0E1]">Market Not Found</h1>
          <p className="mt-2 text-sm text-[#8C9FB3]">{error ?? 'Could not load this market.'}</p>
          <p className="mt-1 text-xs text-[#5F7089]">ID: {formatMarketId(fullMarketId as `0x${string}`)}</p>
        </div>
      </main>
    );
  }

  const status = getStatusInfo(market);
  const rawYes = probability ? probability.outcome1Probability : 50;
  const rawNo = probability ? probability.outcome2Probability : 50;
  const total = rawYes + rawNo || 100;
  const yesPercent = Math.round((rawYes / total) * 100);
  const noPercent = Math.round((rawNo / total) * 100);

  return (
    <main className="mx-auto max-w-[900px] px-4 py-6 sm:px-6 sm:py-8">
      <Link href="/" className="mb-5 inline-flex items-center gap-1.5 text-sm text-[#8C9FB3] transition hover:text-[#5CC8FF]">
        &larr; Back to Markets
      </Link>

      {/* Header */}
      <div className="glass-card rounded-2xl p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex-1">
            <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold ${status.tone}`}>
              {status.label}
            </span>
            <h1 className="mt-3 text-xl font-bold leading-snug text-[#F6F0E1] sm:text-2xl">
              {market.description}
            </h1>
            {showAdvanced && (
              <p className="mt-2 text-xs text-[#5F7089]">
                Market {formatMarketId(market.marketId)}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setShowAdvanced((prev) => !prev)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
              showAdvanced
                ? 'border-[#5CC8FF]/30 bg-[#5CC8FF]/10 text-[#BEE9FF]'
                : 'border-white/12 bg-white/5 text-[#8C9FB3] hover:text-[#F6F0E1]'
            }`}
          >
            {showAdvanced ? 'Hide Advanced' : 'Show Advanced'}
          </button>
        </div>

        {/* Probability bar */}
        <div className="mt-6 grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-[#5CC8FF]/25 bg-[#5CC8FF]/8 p-4">
            <div className="text-xs font-semibold uppercase tracking-widest text-[#BEE9FF]">
              {market.outcome1.toUpperCase()}
            </div>
            <div className="mt-1.5 text-3xl font-bold text-[#F6F0E1]">{yesPercent}%</div>
            <div className="mt-1 text-xs text-[#8C9FB3]">{yesPercent}c per share</div>
          </div>
          <div className="rounded-xl border border-[#FF8A4C]/25 bg-[#FF8A4C]/8 p-4">
            <div className="text-xs font-semibold uppercase tracking-widest text-[#FFC3A1]">
              {market.outcome2.toUpperCase()}
            </div>
            <div className="mt-1.5 text-3xl font-bold text-[#F6F0E1]">{noPercent}%</div>
            <div className="mt-1 text-xs text-[#8C9FB3]">{noPercent}c per share</div>
          </div>
        </div>

        <div className="mt-3">
          <div className="h-2.5 overflow-hidden rounded-full border border-white/10 bg-[#12172A]">
            <div className="flex h-full">
              <div
                className="h-full bg-gradient-to-r from-[#2E8FFF] via-[#5CC8FF] to-[#7CD8FF] transition-all duration-500"
                style={{ width: `${yesPercent}%` }}
              />
              <div
                className="h-full border-l border-[#160b0f] bg-gradient-to-r from-[#D96A3A] via-[#FF9D6A] to-[#FF8A4C] transition-all duration-500"
                style={{ width: `${noPercent}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="glass-card rounded-xl p-3.5">
          <div className="text-xs uppercase tracking-widest text-[#8C9FB3]">Liquidity</div>
          <div className="mt-1 text-lg font-bold text-[#F6F0E1]">{formatEthShort(market.totalCollateral)} ETH</div>
        </div>
        <div className="glass-card rounded-xl p-3.5">
          <div className="text-xs uppercase tracking-widest text-[#8C9FB3]">Activity</div>
          <div className="mt-1 text-lg font-bold text-[#F6F0E1]">{marketEvents.length} events</div>
        </div>
        <div className="glass-card rounded-xl p-3.5">
          <div className="text-xs uppercase tracking-widest text-[#8C9FB3]">Agents</div>
          <div className="mt-1 text-lg font-bold text-[#F6F0E1]">
            {new Set(marketEvents.map((e) => e.agentAddress.toLowerCase())).size}
          </div>
        </div>
        <div className="glass-card rounded-xl p-3.5">
          <div className="text-xs uppercase tracking-widest text-[#8C9FB3]">Status</div>
          <div className="mt-1 text-lg font-bold text-[#BEE9FF]">{status.label}</div>
        </div>
      </div>

      {/* Agent Activity */}
      <div className="mt-6 glass-card rounded-2xl p-5">
        <h2 className="text-base font-semibold text-[#F6F0E1]">Agent Activity</h2>
        <p className="mt-1 text-sm text-[#8C9FB3]">Live timeline of moves, conviction, and rationale.</p>

        {marketEvents.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-white/12 px-4 py-8 text-center text-sm text-[#5F7089]">
            No agent activity recorded for this market yet.
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {marketEvents.map((event, i) => (
              <article
                key={event.id}
                className="animate-card-in rounded-xl border border-white/6 bg-[#151B2E] p-3.5"
                style={{ animationDelay: `${Math.min(i * 40, 200)}ms` }}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${
                      event.type === 'TradeRationale' ? 'border-[#5CC8FF]/30 bg-[#5CC8FF]/8 text-[#BEE9FF]'
                        : event.type === 'NegotiationIntent' ? 'border-[#F6C45A]/30 bg-[#F6C45A]/8 text-[#FFE2A3]'
                        : 'border-white/15 bg-white/5 text-[#C7D2E5]'
                    }`}>
                      {event.type === 'TradeRationale' ? 'Trade' : event.type === 'NegotiationIntent' ? 'Intent' : 'Thesis'}
                    </span>
                    {event.side && (
                      <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${sideTagTone(event.side)}`}>
                        {event.side.toUpperCase()}
                      </span>
                    )}
                    <span className="text-xs text-[#8C9FB3]">{getAgentLabel(event)}</span>
                  </div>
                  <span className="text-xs text-[#5F7089]">{relativeTime(event.timestamp)}</span>
                </div>

                <p className="mt-2 text-sm leading-relaxed text-[#C7D2E5]">{event.reasoning}</p>

                <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                  <span className="rounded-full border border-[#5CC8FF]/20 bg-[#5CC8FF]/6 px-2 py-0.5 text-[#BEE9FF]">
                    {Math.round(event.confidence)}% conviction
                  </span>
                  {event.stakeEth && (
                    <span className="rounded-full border border-white/10 bg-white/4 px-2 py-0.5 text-[#8C9FB3]">
                      {event.stakeEth} ETH
                    </span>
                  )}
                  {showAdvanced && event.tradeTxHash && (
                    <a
                      href={`https://sepolia.arbiscan.io/tx/${event.tradeTxHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-full border border-white/10 bg-white/4 px-2 py-0.5 text-[#8C9FB3] transition hover:text-[#5CC8FF]"
                    >
                      tx {event.tradeTxHash.slice(0, 10)}...
                    </a>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {showAdvanced && (
        <div className="mt-4 glass-card rounded-2xl p-5">
          <h2 className="text-base font-semibold text-[#F6F0E1]">Technical Details</h2>
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex items-start justify-between gap-4 rounded-lg border border-white/6 bg-[#12172A] px-3.5 py-2.5">
              <span className="text-[#8C9FB3]">Market ID</span>
              <span className="break-all text-right text-xs text-[#C7D2E5]">{market.marketId}</span>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-lg border border-white/6 bg-[#12172A] px-3.5 py-2.5">
              <span className="text-[#8C9FB3]">Pool ID</span>
              <span className="text-xs text-[#C7D2E5]">{formatMarketId(market.poolId)}</span>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-lg border border-white/6 bg-[#12172A] px-3.5 py-2.5">
              <span className="text-[#8C9FB3]">Outcome 1 Token</span>
              <a
                href={`https://sepolia.arbiscan.io/address/${market.outcome1Token}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-[#8C9FB3] transition hover:text-[#5CC8FF]"
              >
                {market.outcome1Token.slice(0, 8)}...{market.outcome1Token.slice(-6)}
              </a>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-lg border border-white/6 bg-[#12172A] px-3.5 py-2.5">
              <span className="text-[#8C9FB3]">Outcome 2 Token</span>
              <a
                href={`https://sepolia.arbiscan.io/address/${market.outcome2Token}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-[#8C9FB3] transition hover:text-[#5CC8FF]"
              >
                {market.outcome2Token.slice(0, 8)}...{market.outcome2Token.slice(-6)}
              </a>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-lg border border-white/6 bg-[#12172A] px-3.5 py-2.5">
              <span className="text-[#8C9FB3]">Assertion ID</span>
              <span className="text-xs text-[#C7D2E5]">
                {market.assertedOutcomeId === ZERO_BYTES32 ? 'None' : formatMarketId(market.assertedOutcomeId as `0x${string}`)}
              </span>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
