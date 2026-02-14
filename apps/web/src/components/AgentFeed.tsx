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
  { key: 'why', label: 'Rationales' },
  { key: 'all', label: 'All' },
];

function sideTagTone(side?: string): string {
  if (side === 'no') {
    return 'border-[#ff6b7d]/35 bg-[#ff6b7d]/12 text-[#ff9fad]';
  }
  if (side === 'yes') {
    return 'border-[#39e66a]/35 bg-[#39e66a]/12 text-[#8ef3ab]';
  }
  return 'border-white/20 bg-white/5 text-[#bcc8bc]';
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
      tone: 'border-[#39e66a]/35 bg-[#39e66a]/12 text-[#8ef3ab]',
    };
  }
  if (event.type === 'NegotiationIntent') {
    return {
      label: 'Intent',
      tone: 'border-[#ffb800]/35 bg-[#ffb800]/12 text-[#ffcf5e]',
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
            <h3 className="text-base font-semibold text-[#e6f5ea]">Agent Feed</h3>
            <p className="text-sm text-[#6b8a6f]">Live stream of betting rationale and intents.</p>
          </div>
          <div className="text-right text-xs text-[#556655]">
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
                  ? 'border-[#39e66a]/35 bg-[#39e66a]/12 text-[#8ef3ab]'
                  : 'border-white/8 bg-white/4 text-[#6b8a6f] hover:text-[#e6f5ea]'
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
          <div className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-[#556655]">
            No agent updates yet. Waiting for broadcasts.
          </div>
        ) : (
          <div className="space-y-2.5 sm:space-y-3">
            {filtered.slice(0, 120).map((event, index) => {
              const badge = eventTypeBadge(event);

              return (
                <article
                  key={event.id}
                  className="animate-card-in card-lift rounded-xl border border-white/6 bg-[#0d120f] p-2.5 sm:p-3"
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
                    <span className="text-xs text-[#9bb19f] sm:text-sm">{relativeTime(event.timestamp)}</span>
                  </div>

                  <div className="text-sm font-semibold text-[#e6f5ea] sm:text-base">
                    {eventHeadline(event)}
                  </div>

                  <div className="mt-1.5 flex flex-wrap gap-1.5 text-xs sm:gap-2 sm:text-sm">
                    {event.stakeEth && (
                      <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[#bcc8bc]">
                        stake {event.stakeEth} ETH
                      </span>
                    )}
                    <span className="rounded-full border border-[#39e66a]/35 bg-[#39e66a]/12 px-2 py-0.5 text-[#8ef3ab]">
                      confidence {Math.round(event.confidence)}%
                    </span>
                    {event.marketId && (
                      <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[#bcc8bc]">
                        {formatMarketId(event.marketId)}
                      </span>
                    )}
                  </div>

                  <p className="reasoning-compact mt-2 text-sm leading-relaxed text-[#bcc8bc] sm:mt-3 sm:text-[15px]">
                    {event.reasoning}
                  </p>

                  {showAdvanced && (
                    <div className="mt-2.5 flex flex-wrap gap-1.5 text-xs text-[#bcc8bc] sm:mt-3 sm:gap-2 sm:text-sm">
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
