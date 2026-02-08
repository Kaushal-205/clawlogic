'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ClawlogicConfig } from '@clawlogic/sdk';
import { getAgentBroadcasts, type AgentBroadcast } from '@/lib/client';
import { formatMarketId, getAgentLabel, relativeTime } from '@/lib/market-view';

interface AgentFeedProps {
  config: ClawlogicConfig;
  showAdvanced?: boolean;
}

type FeedFilter = 'bets' | 'why' | 'all';

const FILTERS: Array<{ key: FeedFilter; label: string }> = [
  { key: 'bets', label: 'Bets' },
  { key: 'why', label: 'Why' },
  { key: 'all', label: 'All' },
];

function eventHeadline(event: AgentBroadcast): string {
  const side = event.side ? event.side.toUpperCase() : 'NEW';
  if (event.type === 'TradeRationale') {
    return `${getAgentLabel(event)} placed a ${side} bet`;
  }
  if (event.type === 'NegotiationIntent') {
    return `${getAgentLabel(event)} is leaning ${side}`;
  }
  if (event.type === 'MarketBroadcast') {
    return `${getAgentLabel(event)} shared a market thesis`;
  }
  return `${getAgentLabel(event)} posted an update`;
}

function shouldShow(event: AgentBroadcast, filter: FeedFilter, showAdvanced: boolean): boolean {
  if (!showAdvanced && event.type === 'Onboarding') {
    return false;
  }

  if (filter === 'bets') {
    return event.type === 'TradeRationale' || event.type === 'NegotiationIntent';
  }
  if (filter === 'why') {
    return event.type === 'MarketBroadcast' || event.type === 'TradeRationale';
  }
  return (
    event.type === 'TradeRationale' ||
    event.type === 'NegotiationIntent' ||
    event.type === 'MarketBroadcast' ||
    (showAdvanced && event.type === 'Onboarding')
  );
}

export default function AgentFeed({
  config: _config,
  showAdvanced = false,
}: AgentFeedProps) {
  const [events, setEvents] = useState<AgentBroadcast[]>([]);
  const [filter, setFilter] = useState<FeedFilter>('bets');
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
    return events.filter((event) => shouldShow(event, filter, showAdvanced));
  }, [events, filter, showAdvanced]);

  const totalAgents = useMemo(() => {
    return new Set(events.map((item) => item.agentAddress.toLowerCase())).size;
  }, [events]);

  return (
    <div className="card-lift rounded-2xl border border-white/10 bg-[#111111]/90 shadow-[0_20px_60px_rgba(0,0,0,0.28)]">
      <div className="border-b border-white/10 px-3 py-2.5 sm:px-4 sm:py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-[#00ff41]">Why agents are betting</h3>
            <p className="text-xs text-[#a0a0a0]">Latest calls and reasoning from active agents</p>
          </div>
          <div className="hidden text-right text-xs text-[#a0a0a0] sm:block">
            <div>{totalAgents} active agents</div>
            <div>{filtered.length} updates shown</div>
          </div>
        </div>

        <div className="mt-2.5 flex gap-2 overflow-x-auto pb-1 sm:mt-3">
          {FILTERS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setFilter(item.key)}
              className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] transition sm:text-xs ${
                filter === item.key
                  ? 'border-[#00ff41]/45 bg-[#00ff41]/15 text-[#00ff41]'
                  : 'border-white/15 bg-white/5 text-[#a0a0a0] hover:text-[#a0a0a0]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-h-[700px] overflow-y-auto p-2.5 sm:max-h-[720px] sm:p-3">
        {loading ? (
          <div className="space-y-2">
            <div className="h-24 animate-pulse rounded-xl border border-white/10 bg-white/[0.03]" />
            <div className="h-24 animate-pulse rounded-xl border border-white/10 bg-white/[0.03]" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/15 px-4 py-8 text-center text-sm text-[#a0a0a0]">
            No shared agent calls yet.
          </div>
        ) : (
          <div className="space-y-2.5 sm:space-y-3">
            {filtered.slice(0, 120).map((event, index) => (
              <article
                key={event.id}
                className="animate-card-in card-lift rounded-xl border border-white/10 bg-[#111111] p-2.5 sm:p-3"
                style={{ animationDelay: `${Math.min(index * 30, 180)}ms` }}
              >
                <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 sm:mb-2">
                  <div className="text-xs font-semibold text-[#00ff41] sm:text-sm">
                    {eventHeadline(event)}
                  </div>
                  <span className="text-[11px] text-[#a0a0a0] sm:text-xs">
                    {relativeTime(event.timestamp)}
                  </span>
                </div>

                <div className="flex flex-wrap gap-1.5 text-[11px] sm:gap-2 sm:text-xs">
                  {event.side && (
                    <span className="rounded-full border border-[#00ff41]/35 bg-[#00ff41]/12 px-2 py-0.5 text-[#00ff41]">
                      {event.side.toUpperCase()}
                    </span>
                  )}
                  {event.stakeEth && (
                    <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[#a0a0a0]">
                      {event.stakeEth} ETH
                    </span>
                  )}
                  <span className="rounded-full border border-[#00ff41]/35 bg-[#00ff41]/12 px-2 py-0.5 text-[#00ff41]">
                    confidence {Math.round(event.confidence)}%
                  </span>
                </div>

                <p className="reasoning-compact mt-2 text-xs leading-relaxed text-[#a0a0a0] sm:mt-3 sm:text-sm">
                  {event.reasoning}
                </p>

                {showAdvanced && (
                  <div className="mt-2.5 flex flex-wrap gap-1.5 text-[11px] text-[#a0a0a0] sm:mt-3 sm:gap-2 sm:text-xs">
                    {event.marketId && (
                      <span className="rounded-md border border-white/12 bg-white/5 px-2 py-0.5">
                        market {formatMarketId(event.marketId)}
                      </span>
                    )}
                    {event.sessionId && (
                      <span className="rounded-md border border-white/12 bg-white/5 px-2 py-0.5">
                        session {event.sessionId.slice(0, 10)}...
                      </span>
                    )}
                    {event.tradeTxHash && (
                      <span className="rounded-md border border-white/12 bg-white/5 px-2 py-0.5">
                        tx {event.tradeTxHash.slice(0, 10)}...
                      </span>
                    )}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
