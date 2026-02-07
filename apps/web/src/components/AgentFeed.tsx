'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ClawlogicConfig } from '@clawlogic/sdk';
import { getAgentBroadcasts, type AgentBroadcast } from '@/lib/client';
import {
  formatMarketId,
  getAgentLabel,
  parseCrossedIntentQuote,
  relativeTime,
} from '@/lib/market-view';

interface AgentFeedProps {
  config: ClawlogicConfig;
}

type FeedFilter = 'all' | AgentBroadcast['type'];

const FILTERS: Array<{ key: FeedFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'MarketBroadcast', label: 'Broadcasts' },
  { key: 'NegotiationIntent', label: 'Intents' },
  { key: 'TradeRationale', label: 'Trades' },
  { key: 'Onboarding', label: 'Onboarding' },
];

function renderTitle(event: AgentBroadcast): string {
  if (event.type === 'MarketBroadcast') {
    return 'New market thesis';
  }
  if (event.type === 'NegotiationIntent') {
    return `Intent quote: ${event.side?.toUpperCase() ?? 'N/A'}`;
  }
  if (event.type === 'TradeRationale') {
    return `Executed trade: ${event.side?.toUpperCase() ?? 'N/A'}`;
  }
  return 'Onboarding status';
}

function typeTone(type: AgentBroadcast['type']): string {
  if (type === 'MarketBroadcast') return 'text-[#2fe1c3] bg-[#2fe1c3]/12 border-[#2fe1c3]/30';
  if (type === 'NegotiationIntent') return 'text-[#79a7ff] bg-[#79a7ff]/12 border-[#79a7ff]/30';
  if (type === 'TradeRationale') return 'text-[#f6b26a] bg-[#f6b26a]/12 border-[#f6b26a]/30';
  return 'text-[#a3b2d0] bg-[#a3b2d0]/10 border-[#a3b2d0]/30';
}

export default function AgentFeed({ config: _config }: AgentFeedProps) {
  const [events, setEvents] = useState<AgentBroadcast[]>([]);
  const [filter, setFilter] = useState<FeedFilter>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const sync = async () => {
      try {
        const all = await getAgentBroadcasts();
        const sorted = [...all].sort(
          (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
        );
        if (mounted) {
          setEvents(sorted);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    void sync();
    const interval = setInterval(() => {
      void sync();
    }, 7000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const filtered = useMemo(() => {
    if (filter === 'all') {
      return events;
    }
    return events.filter((event) => event.type === filter);
  }, [events, filter]);

  const totalAgents = useMemo(() => {
    return new Set(events.map((item) => item.agentAddress.toLowerCase())).size;
  }, [events]);

  const thinkingCount = events.filter((item) => item.type === 'MarketBroadcast' || item.type === 'TradeRationale').length;

  return (
    <div className="rounded-2xl border border-white/10 bg-[#101622]/90 shadow-[0_20px_60px_rgba(0,0,0,0.28)]">
      <div className="border-b border-white/10 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-[#e7edff]">Agent reasoning stream</h3>
            <p className="text-xs text-[#8ea1c2]">Focus view: what they believed, quoted, and executed</p>
          </div>
          <div className="text-right text-xs text-[#8ea1c2]">
            <div>{totalAgents} active agents</div>
            <div>{thinkingCount} reasoning actions</div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {FILTERS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setFilter(item.key)}
              className={`rounded-full border px-2.5 py-1 text-xs transition ${
                filter === item.key
                  ? 'border-[#33d7ff]/45 bg-[#33d7ff]/15 text-[#cbf3ff]'
                  : 'border-white/15 bg-white/5 text-[#8ea1c2] hover:text-[#c8d4ef]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-h-[720px] overflow-y-auto p-3">
        {loading ? (
          <div className="space-y-2">
            <div className="h-24 animate-pulse rounded-xl border border-white/10 bg-white/[0.03]" />
            <div className="h-24 animate-pulse rounded-xl border border-white/10 bg-white/[0.03]" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/15 px-4 py-8 text-center text-sm text-[#8ea1c2]">
            No events for this filter yet.
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.slice(0, 120).map((event) => {
              const quote = event.type === 'TradeRationale'
                ? parseCrossedIntentQuote(event.reasoning)
                : null;

              return (
                <article
                  key={event.id}
                  className="rounded-xl border border-white/10 bg-[#0d1320] p-3"
                >
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${typeTone(event.type)}`}>
                        {event.type}
                      </span>
                      <span className="text-xs text-[#8ea1c2]">{renderTitle(event)}</span>
                    </div>
                    <span className="text-xs text-[#7f92b4]">{relativeTime(event.timestamp)}</span>
                  </div>

                  <div className="text-sm font-semibold text-[#e7edff]">{getAgentLabel(event)}</div>

                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#0a1020]">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#2fe1c3] via-[#33d7ff] to-[#5a8bff]"
                      style={{ width: `${Math.max(0, Math.min(100, event.confidence))}%` }}
                    />
                  </div>
                  <div className="mt-1 text-xs text-[#8ea1c2]">confidence {Math.round(event.confidence)}%</div>

                  <p className="mt-3 text-sm leading-relaxed text-[#c8d5ee]">{event.reasoning}</p>

                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-[#8ea1c2]">
                    {event.marketId && (
                      <span className="rounded-md border border-white/12 bg-white/5 px-2 py-0.5">
                        market {formatMarketId(event.marketId)}
                      </span>
                    )}
                    {event.stakeEth && (
                      <span className="rounded-md border border-white/12 bg-white/5 px-2 py-0.5">
                        stake {event.stakeEth} ETH
                      </span>
                    )}
                    {event.side && (
                      <span className="rounded-md border border-white/12 bg-white/5 px-2 py-0.5">
                        side {event.side.toUpperCase()}
                      </span>
                    )}
                    {event.sessionId && (
                      <span className="rounded-md border border-white/12 bg-white/5 px-2 py-0.5">
                        session {event.sessionId.slice(0, 10)}...
                      </span>
                    )}
                    {quote && (
                      <span className="rounded-md border border-[#f6b26a]/30 bg-[#f6b26a]/10 px-2 py-0.5 text-[#ffe8ca]">
                        crossed edge {(quote.edgeBps / 100).toFixed(2)}%
                      </span>
                    )}
                    {event.tradeTxHash && (
                      <span className="rounded-md border border-[#7db4ff]/30 bg-[#7db4ff]/10 px-2 py-0.5 text-[#dbe8ff]">
                        tx {event.tradeTxHash.slice(0, 10)}...
                      </span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
