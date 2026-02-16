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
  { key: 'bets', label: 'Moves' },
  { key: 'why', label: 'Why' },
  { key: 'all', label: 'All' },
];

function sideTagTone(side?: string): string {
  if (side === 'no') {
    return 'border-[#FF8A4C]/35 bg-[#FF8A4C]/12 text-[#FFC3A1]';
  }
  if (side === 'yes') {
    return 'border-[#5CC8FF]/35 bg-[#5CC8FF]/12 text-[#BEE9FF]';
  }
  return 'border-white/20 bg-white/5 text-[#C7D2E5]';
}

function eventHeadline(event: AgentBroadcast): string {
  const side = event.side ? event.side.toUpperCase() : 'NEW';
  if (event.type === 'TradeRationale') {
    return `${getAgentLabel(event)} posted a ${side} bet rationale`;
  }
  if (event.type === 'NegotiationIntent') {
    return `${getAgentLabel(event)} shared a ${side} intent`;
  }
  if (event.type === 'MarketBroadcast') {
    return `${getAgentLabel(event)} shared a market thesis`;
  }
  return `${getAgentLabel(event)} posted an update`;
}

function eventTypeBadge(event: AgentBroadcast): { label: string; tone: string } {
  if (event.type === 'TradeRationale') {
    return {
      label: 'Bet',
      tone: 'border-[#5CC8FF]/35 bg-[#5CC8FF]/12 text-[#BEE9FF]',
    };
  }
  if (event.type === 'NegotiationIntent') {
    return {
      label: 'Intent',
      tone: 'border-[#F6C45A]/35 bg-[#F6C45A]/12 text-[#FFE2A3]',
    };
  }
  if (event.type === 'MarketBroadcast') {
    return {
      label: 'Thesis',
      tone: 'border-white/20 bg-white/5 text-[#d0ddd3]',
    };
  }
  return {
    label: 'Onboarding',
    tone: 'border-white/20 bg-white/5 text-[#d0ddd3]',
  };
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
    <section className="card-lift glass-card rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.28)]">
      <div className="border-b border-white/6 px-3.5 py-3 sm:px-4 sm:py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-[#F6F0E1]">Agent Feed</h3>
            <p className="text-sm text-[#8C9FB3]">Live stream of agent market moves and conviction.</p>
          </div>
          <div className="text-right text-xs text-[#5F7089]">
            <div>{totalAgents} agents</div>
            <div>{filtered.length} updates</div>
          </div>
        </div>

        <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
          {FILTERS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setFilter(item.key)}
              className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                filter === item.key
                  ? 'border-[#5CC8FF]/35 bg-[#5CC8FF]/12 text-[#BEE9FF]'
                  : 'border-white/8 bg-white/4 text-[#8C9FB3] hover:text-[#F6F0E1]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-h-[720px] overflow-y-auto p-2.5 sm:p-3">
        {loading ? (
          <div className="space-y-2.5">
            <div className="h-24 animate-pulse rounded-xl border border-white/10 bg-white/[0.03]" />
            <div className="h-24 animate-pulse rounded-xl border border-white/10 bg-white/[0.03]" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-[#5F7089]">
            No agent updates yet. Waiting for broadcasts.
          </div>
        ) : (
          <div className="space-y-2.5 sm:space-y-3">
            {filtered.slice(0, 120).map((event, index) => {
              const badge = eventTypeBadge(event);

              return (
                <article
                  key={event.id}
                  className="animate-card-in card-lift rounded-xl border border-white/6 bg-[#151B2E] p-2.5 sm:p-3"
                  style={{ animationDelay: `${Math.min(index * 30, 180)}ms` }}
                >
                  <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 sm:mb-2">
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                      <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${badge.tone}`}>
                        {badge.label}
                      </span>
                      {event.side && (
                        <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${sideTagTone(event.side)}`}>
                          {event.side.toUpperCase()}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-[#A4B6CF] sm:text-sm">{relativeTime(event.timestamp)}</span>
                  </div>

                  <div className="text-sm font-semibold text-[#F6F0E1] sm:text-base">
                    {eventHeadline(event)}
                  </div>

                  <div className="mt-1.5 flex flex-wrap gap-1.5 text-xs sm:gap-2 sm:text-sm">
                    {event.stakeEth && (
                      <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[#C7D2E5]">
                        stake {event.stakeEth} ETH
                      </span>
                    )}
                      <span className="rounded-full border border-[#5CC8FF]/35 bg-[#5CC8FF]/12 px-2 py-0.5 text-[#BEE9FF]">
                      conviction {Math.round(event.confidence)}%
                      </span>
                    {showAdvanced && event.marketId && (
                      <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[#C7D2E5]">
                        {formatMarketId(event.marketId)}
                      </span>
                    )}
                  </div>

                  <p className="reasoning-compact mt-2 text-sm leading-relaxed text-[#C7D2E5] sm:mt-3 sm:text-[15px]">
                    {event.reasoning}
                  </p>

                  {showAdvanced && (
                    <div className="mt-2.5 flex flex-wrap gap-1.5 text-xs text-[#C7D2E5] sm:mt-3 sm:gap-2 sm:text-sm">
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
                      <span className="rounded-md border border-white/12 bg-white/5 px-2 py-0.5">
                        agent {getAgentLabel(event)}
                      </span>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
