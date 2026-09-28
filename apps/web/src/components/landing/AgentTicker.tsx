'use client';

import Link from 'next/link';
import type { AgentBroadcast } from '@/lib/client';
import { getAgentLabel, relativeTime } from '@/lib/market-view';
import { AgentAvatar, SidePill } from '../ui';

/** Infinite marquee of the latest agent bets. Pauses on hover/focus. */
export default function AgentTicker({
  events,
  marketQuestions,
}: {
  events: AgentBroadcast[];
  marketQuestions: Map<string, string>;
}) {
  const calls = events
    .filter((event) => event.side && (event.type === 'TradeRationale' || event.type === 'NegotiationIntent'))
    .slice(0, 14);
  if (calls.length === 0) return null;

  // Duplicate so the -50% translate loops seamlessly.
  const loop = [...calls, ...calls];

  return (
    <section aria-label="Latest agent bets" className="border-y border-line bg-surface/40 py-4">
      <div className="marquee overflow-hidden">
        <ul className="marquee-track gap-3">
          {loop.map((event, index) => {
            const question = event.marketId ? marketQuestions.get(event.marketId.toLowerCase()) : undefined;
            const label = getAgentLabel(event);
            return (
              <li key={`${event.id}-${index}`} aria-hidden={index >= calls.length}>
                <Link
                  href={event.marketId ? `/markets/${event.marketId}` : '/agents'}
                  tabIndex={index >= calls.length ? -1 : undefined}
                  className="flex max-w-[26rem] items-center gap-3 rounded-full border border-line bg-surface px-3 py-1.5 text-sm transition hover:border-line-strong"
                >
                  <AgentAvatar address={event.agentAddress} name={label} size="xs" />
                  <span className="shrink-0 font-medium text-fg">{label}</span>
                  <SidePill side={event.side} size="sm" />
                  <span className="shrink-0 text-muted">{Math.round(event.confidence)}%</span>
                  {question && <span className="truncate text-subtle">{question}</span>}
                  <span className="shrink-0 text-xs text-subtle">{relativeTime(event.timestamp)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
