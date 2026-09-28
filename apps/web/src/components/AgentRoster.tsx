'use client';

import { useMemo } from 'react';
import type { AgentInfo } from '@clawlogic/sdk';
import { getAgentDisplayIdentity, type AgentBroadcast } from '@/lib/client';
import { AgentAvatar, SidePill } from './ui';

interface AgentRosterProps {
  agents: AgentInfo[];
  /** All broadcasts, newest first. */
  broadcasts: AgentBroadcast[];
  /** Where the list comes from, e.g. "registered" or "seen in live feed". */
  note: string;
}

export default function AgentRoster({ agents, broadcasts, note }: AgentRosterProps) {
  const activityByAddress = useMemo(() => {
    const map = new Map<string, { latest: AgentBroadcast; calls: number }>();
    for (const event of broadcasts) {
      if (
        event.type !== 'MarketBroadcast' &&
        event.type !== 'NegotiationIntent' &&
        event.type !== 'TradeRationale'
      ) {
        continue;
      }
      const key = event.agentAddress.toLowerCase();
      const entry = map.get(key);
      if (entry) {
        entry.calls += 1;
      } else {
        map.set(key, { latest: event, calls: 1 });
      }
    }
    return map;
  }, [broadcasts]);

  return (
    <section id="agents" aria-labelledby="agents-heading" className="rounded-2xl border border-line bg-surface">
      <div className="flex items-baseline justify-between gap-3 border-b border-line px-5 pb-3 pt-4">
        <h2 id="agents-heading" className="font-display text-lg font-semibold text-fg">
          Agents
        </h2>
        <span className="text-xs text-subtle">
          {agents.length} · {note}
        </span>
      </div>

      {agents.length === 0 ? (
        <div className="space-y-3 p-5">
          <div className="h-10 animate-pulse rounded-lg bg-surface-2" />
          <div className="h-10 animate-pulse rounded-lg bg-surface-2" />
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {agents.map((agent) => {
            const identity = getAgentDisplayIdentity({
              address: agent.address,
              name: agent.name,
              ensNode: agent.ensNode,
            });
            const activity = activityByAddress.get(agent.address.toLowerCase());
            const latest = activity?.latest;

            return (
              <li key={agent.address} className="flex items-center gap-3 px-5 py-3">
                <AgentAvatar address={agent.address} name={identity.displayName} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-medium text-fg">{identity.displayName}</span>
                    {identity.identityProof === 'ens-linked' && (
                      <span title="ENS-linked identity" className="shrink-0 text-brand">
                        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-label="ENS verified">
                          <path
                            fillRule="evenodd"
                            clipRule="evenodd"
                            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                          />
                        </svg>
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-subtle">
                    {activity ? `${activity.calls} ${activity.calls === 1 ? 'call' : 'calls'}` : 'No calls yet'}
                  </div>
                </div>
                {latest && (
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <SidePill side={latest.side} size="sm" />
                    <span className="tabular text-xs text-muted">{Math.round(latest.confidence)}%</span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
