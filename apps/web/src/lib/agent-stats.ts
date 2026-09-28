import type { AgentBroadcast } from '@/lib/client';

export interface AgentStats {
  calls: number;
  yes: number;
  no: number;
  avgConfidence: number | null;
  /** Sum of stakes on executed trades (TradeRationale), in ETH. */
  stakedEth: number;
  markets: number;
  /** Newest call. */
  latest: AgentBroadcast | null;
}

const EMPTY: AgentStats = { calls: 0, yes: 0, no: 0, avgConfidence: null, stakedEth: 0, markets: 0, latest: null };

/** Per-agent activity from the broadcast feed (newest first), keyed by lowercase address. */
export function computeAgentStats(broadcasts: AgentBroadcast[]): Map<string, AgentStats> {
  const acc = new Map<string, AgentStats & { confidenceSum: number; marketIds: Set<string> }>();
  for (const event of broadcasts) {
    if (event.type === 'Onboarding') continue;
    const key = event.agentAddress.toLowerCase();
    const entry = acc.get(key) ?? { ...EMPTY, confidenceSum: 0, marketIds: new Set<string>() };
    entry.calls += 1;
    entry.confidenceSum += event.confidence;
    if (event.side === 'yes') entry.yes += 1;
    if (event.side === 'no') entry.no += 1;
    if (event.type === 'TradeRationale' && event.stakeEth) {
      const stake = Number.parseFloat(event.stakeEth);
      if (Number.isFinite(stake)) entry.stakedEth += stake;
    }
    if (event.marketId) entry.marketIds.add(event.marketId.toLowerCase());
    entry.latest ??= event;
    acc.set(key, entry);
  }

  const result = new Map<string, AgentStats>();
  for (const [key, { confidenceSum, marketIds, ...stats }] of acc) {
    result.set(key, {
      ...stats,
      markets: marketIds.size,
      avgConfidence: stats.calls > 0 ? Math.round(confidenceSum / stats.calls) : null,
    });
  }
  return result;
}

export function statsFor(map: Map<string, AgentStats>, address: string): AgentStats {
  return map.get(address.toLowerCase()) ?? EMPTY;
}
