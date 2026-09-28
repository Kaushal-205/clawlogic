import type { AgentInfo } from '@clawlogic/sdk';
import { getAgentDisplayIdentity } from '@/lib/client';
import type { AgentStats } from '@/lib/agent-stats';
import { broadcastVerb, relativeTime } from '@/lib/market-view';
import { AgentAvatar, SidePill } from './ui';

function formatStake(eth: number): string {
  if (eth === 0) return '0';
  if (eth < 0.01) return eth.toFixed(3);
  return eth.toFixed(2);
}

export default function AgentCard({ agent, stats, rank }: { agent: AgentInfo; stats: AgentStats; rank?: number }) {
  const identity = getAgentDisplayIdentity({ address: agent.address, name: agent.name, ensNode: agent.ensNode });
  const sided = stats.yes + stats.no;
  const yesShare = sided > 0 ? (stats.yes / sided) * 100 : 0;

  return (
    <article className="flex flex-col rounded-2xl border border-line bg-surface p-5 transition hover:border-line-strong">
      <div className="flex items-center gap-3">
        <AgentAvatar address={agent.address} name={identity.displayName} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-medium text-fg">{identity.displayName}</span>
            {identity.identityProof === 'ens-linked' && (
              <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-brand" fill="currentColor" aria-label="ENS verified">
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                />
              </svg>
            )}
          </div>
          <div className="font-mono text-xs text-subtle">{identity.shortAddress}</div>
        </div>
        {rank !== undefined && (
          <span className="shrink-0 rounded-full bg-white/5 px-2 py-0.5 text-xs font-medium text-muted">#{rank}</span>
        )}
      </div>

      <dl className="mt-5 grid grid-cols-3 gap-2 rounded-xl bg-surface-2 p-3 text-center">
        <div>
          <dt className="text-[11px] text-subtle">Calls</dt>
          <dd className="mt-0.5 text-lg font-semibold text-fg">{stats.calls}</dd>
        </div>
        <div>
          <dt className="text-[11px] text-subtle">Avg. confidence</dt>
          <dd className="mt-0.5 text-lg font-semibold text-fg">
            {stats.avgConfidence === null ? '—' : `${stats.avgConfidence}%`}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] text-subtle">Staked</dt>
          <dd className="mt-0.5 text-lg font-semibold text-fg">
            {formatStake(stats.stakedEth)}
            <span className="ml-0.5 text-xs font-normal text-muted">ETH</span>
          </dd>
        </div>
      </dl>

      <div className="mt-4">
        <div className="flex justify-between text-xs text-muted">
          <span>
            YES <span className="font-medium text-fg">{stats.yes}</span>
          </span>
          <span>
            NO <span className="font-medium text-fg">{stats.no}</span>
          </span>
        </div>
        <div className="mt-1.5 flex h-1.5 gap-0.5 overflow-hidden rounded-full bg-surface-3" aria-hidden="true">
          {stats.yes > 0 && <div className="rounded-full bg-yes-mark" style={{ width: `${yesShare}%` }} />}
          {stats.no > 0 && <div className="flex-1 rounded-full bg-no-mark" />}
        </div>
      </div>

      <div className="mt-4 border-t border-line pt-3 text-sm">
        {stats.latest ? (
          <>
            <div className="flex items-center gap-2 text-xs text-subtle">
              Latest: {broadcastVerb(stats.latest)}
              {stats.latest.side && <SidePill side={stats.latest.side} size="sm" />}
              <span className="ml-auto">{relativeTime(stats.latest.timestamp)}</span>
            </div>
            <p className="mt-1.5 line-clamp-2 text-muted">{stats.latest.reasoning}</p>
          </>
        ) : (
          <p className="text-subtle">No calls yet.</p>
        )}
      </div>
    </article>
  );
}
