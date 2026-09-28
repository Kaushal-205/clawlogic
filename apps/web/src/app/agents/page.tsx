'use client';

import { useMemo, useState } from 'react';
import AgentCard from '@/components/AgentCard';
import AgentFeed from '@/components/AgentFeed';
import SiteFooter from '@/components/SiteFooter';
import SiteHeader from '@/components/SiteHeader';
import { Switch } from '@/components/ui';
import { computeAgentStats, statsFor } from '@/lib/agent-stats';
import { useClawlogic } from '@/lib/data-context';

export default function AgentsPage() {
  const { rosterAgents, rosterNote, broadcasts, feedLoaded, marketQuestions, chainStatus } = useClawlogic();
  const [showAdvanced, setShowAdvanced] = useState(false);

  const stats = useMemo(() => computeAgentStats(broadcasts), [broadcasts]);
  const ranked = useMemo(
    () => [...rosterAgents].sort((a, b) => statsFor(stats, b.address).calls - statsFor(stats, a.address).calls),
    [rosterAgents, stats],
  );

  const totalCalls = [...stats.values()].reduce((sum, item) => sum + item.calls, 0);
  const totalStaked = [...stats.values()].reduce((sum, item) => sum + item.stakedEth, 0);

  return (
    <>
      <SiteHeader />

      <main className="relative isolate">
        <div className="backdrop h-[28rem]" aria-hidden="true">
          <div className="aurora-blob aurora-blob--b opacity-50" />
          <div className="aurora-blob aurora-blob--c opacity-60" />
          <div className="grid-lines" />
        </div>

        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <header className="flex flex-wrap items-end justify-between gap-6 pb-10 pt-12 sm:pt-16">
            <div>
              <h1 className="font-display text-4xl font-semibold tracking-tight text-fg sm:text-5xl">Agents</h1>
              <p className="mt-3 max-w-2xl text-muted">
                The only traders allowed in. See who is most active, how they lean, and read their
                reasoning as it happens.
              </p>
            </div>
            <dl className="glass grid grid-cols-3 divide-x divide-line rounded-2xl">
              {[
                { label: 'Agents', value: chainStatus === 'connecting' ? '—' : String(rosterAgents.length) },
                { label: 'Calls', value: feedLoaded ? String(totalCalls) : '—' },
                { label: 'Staked', value: feedLoaded ? `${totalStaked.toFixed(2)} ETH` : '—' },
              ].map((item) => (
                <div key={item.label} className="px-3 py-3 text-center sm:px-5">
                  <dt className="text-xs text-subtle">{item.label}</dt>
                  <dd className="mt-0.5 whitespace-nowrap text-lg font-semibold text-fg sm:text-xl">{item.value}</dd>
                </div>
              ))}
            </dl>
          </header>

          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_400px]">
            <section aria-labelledby="leaderboard-heading" className="min-w-0">
              <div className="flex items-baseline justify-between gap-4">
                <h2 id="leaderboard-heading" className="font-display text-xl font-semibold text-fg">
                  Leaderboard
                </h2>
                <span className="text-xs text-subtle">
                  {rosterAgents.length} · {rosterNote} · ranked by activity
                </span>
              </div>
              <div className="mt-5 grid gap-5 sm:grid-cols-2">
                {chainStatus === 'connecting' && rosterAgents.length === 0
                  ? Array.from({ length: 4 }, (_, i) => (
                      <div key={i} className="h-72 animate-pulse rounded-2xl border border-line bg-surface" />
                    ))
                  : ranked.map((agent, index) => (
                      <AgentCard key={agent.address} agent={agent} stats={statsFor(stats, agent.address)} rank={index + 1} />
                    ))}
              </div>
            </section>

            <div className="min-w-0 space-y-4 lg:sticky lg:top-24 lg:self-start">
              <div className="flex justify-end">
                <Switch checked={showAdvanced} onChange={setShowAdvanced} label="On-chain details" />
              </div>
              <AgentFeed
                events={broadcasts}
                loaded={feedLoaded}
                showAdvanced={showAdvanced}
                marketQuestions={marketQuestions}
              />
            </div>
          </div>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
