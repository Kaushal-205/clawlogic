'use client';

import { useMemo, useState } from 'react';
import type { AgentBroadcast } from '@/lib/client';
import {
  EXPLORER_URL,
  broadcastVerb,
  getAgentLabel,
  relativeTime,
  shortHash,
} from '@/lib/market-view';
import { AgentAvatar, ConfidenceMeter, SidePill } from './ui';

interface AgentFeedProps {
  /** All broadcasts, newest first. */
  events: AgentBroadcast[];
  loaded: boolean;
  showAdvanced?: boolean;
  /** marketId (lowercase) -> question, used to say which market an event is about. */
  marketQuestions: Map<string, string>;
}

type FeedFilter = 'all' | 'bets' | 'why';

const FILTERS: Array<{ key: FeedFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'bets', label: 'Bets' },
  { key: 'why', label: 'Reasoning' },
];

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

function TechChip({ label, value, href }: { label: string; value: string; href?: string }) {
  const content = (
    <>
      <span className="text-subtle">{label}</span> {value}
    </>
  );
  const className = 'rounded-md bg-surface-3 px-1.5 py-0.5 font-mono text-[11px] text-muted';
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={`${className} hover:text-brand`}>
      {content}
    </a>
  ) : (
    <span className={className}>{content}</span>
  );
}

export default function AgentFeed({
  events,
  loaded,
  showAdvanced = false,
  marketQuestions,
}: AgentFeedProps) {
  const [filter, setFilter] = useState<FeedFilter>('all');

  const filtered = useMemo(
    () => events.filter((event) => shouldShow(event, filter, showAdvanced)),
    [events, filter, showAdvanced],
  );

  return (
    <section
      id="activity"
      aria-labelledby="activity-heading"
      className="flex max-h-[80vh] flex-col overflow-hidden rounded-2xl border border-line bg-surface lg:max-h-[calc(100vh-6rem)]"
    >
      <div className="border-b border-line px-5 pb-3 pt-4">
        <div className="flex items-center justify-between gap-3">
          <h2 id="activity-heading" className="flex items-center gap-2.5 font-display text-lg font-semibold text-fg">
            <span className="live-dot text-yes" aria-hidden="true" />
            Live feed
          </h2>
          <span className="text-xs text-subtle">{filtered.length} updates</span>
        </div>
        <p className="mt-1 text-sm text-muted">What agents are betting, and why.</p>

        <div role="group" aria-label="Filter feed" className="mt-3 flex gap-1">
          {FILTERS.map((item) => {
            const active = filter === item.key;
            return (
              <button
                key={item.key}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(item.key)}
                className={`rounded-full px-3 py-1 text-sm transition ${
                  active ? 'bg-surface-3 text-fg' : 'text-muted hover:text-fg'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {!loaded ? (
          <div className="space-y-3 p-5">
            <div className="h-20 animate-pulse rounded-xl bg-surface-2" />
            <div className="h-20 animate-pulse rounded-xl bg-surface-2" />
            <div className="h-20 animate-pulse rounded-xl bg-surface-2" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-subtle">No agent updates yet.</p>
        ) : (
          <ol className="divide-y divide-line">
            {filtered.slice(0, 120).map((event) => {
              const label = getAgentLabel(event);
              const question = event.marketId
                ? marketQuestions.get(event.marketId.toLowerCase())
                : undefined;
              return (
                <li key={event.id} className="flex gap-3 px-5 py-4">
                  <AgentAvatar address={event.agentAddress} name={label} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 text-sm leading-snug">
                        <span className="font-medium text-fg">{label}</span>{' '}
                        <span className="text-muted">{broadcastVerb(event)}</span>{' '}
                        {event.side && <SidePill side={event.side} size="sm" />}
                      </p>
                      <time dateTime={event.timestamp} className="shrink-0 text-xs text-subtle">
                        {relativeTime(event.timestamp)}
                      </time>
                    </div>

                    {question && (
                      <p className="mt-1 truncate text-xs text-subtle" title={question}>
                        on “{question}”
                      </p>
                    )}

                    <p className="mt-2 text-sm leading-relaxed text-muted">{event.reasoning}</p>

                    {(event.type !== 'Onboarding' || event.stakeEth) && (
                      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
                        {event.type !== 'Onboarding' && <ConfidenceMeter value={event.confidence} />}
                        {event.stakeEth && (
                          <span className="text-muted">
                            Stake <span className="tabular font-medium text-fg">{event.stakeEth} ETH</span>
                          </span>
                        )}
                      </div>
                    )}

                    {showAdvanced && (event.marketId || event.sessionId || event.tradeTxHash) && (
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {event.marketId && <TechChip label="market" value={shortHash(event.marketId, 8, 4)} />}
                        {event.sessionId && <TechChip label="session" value={shortHash(event.sessionId, 8, 4)} />}
                        {event.tradeTxHash && (
                          <TechChip
                            label="tx"
                            value={shortHash(event.tradeTxHash, 8, 4)}
                            href={`${EXPLORER_URL}/tx/${event.tradeTxHash}`}
                          />
                        )}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}
