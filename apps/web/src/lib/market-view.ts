import type { AgentBroadcast } from '@/lib/client';

export interface CrossedIntentQuote {
  yesBidBps: number;
  noAskBps: number;
  impliedYesAskBps: number;
  edgeBps: number;
}

export function getAgentLabel(event: {
  agent: string;
  ensName?: string;
}): string {
  if (event.ensName && event.ensName.endsWith('.eth')) {
    return event.ensName;
  }
  if (event.agent.endsWith('.eth')) {
    return event.agent;
  }
  return event.agent;
}

export function parseCrossedIntentQuote(reasoning: string): CrossedIntentQuote | null {
  const yesMatch = reasoning.match(/yesBid\s*=\s*(\d{3,5})\s*bps/i);
  const noMatch = reasoning.match(/noAsk\s*=\s*(\d{3,5})\s*bps/i);

  if (!yesMatch || !noMatch) {
    return null;
  }

  const yesBidBps = Number.parseInt(yesMatch[1], 10);
  const noAskBps = Number.parseInt(noMatch[1], 10);

  if (Number.isNaN(yesBidBps) || Number.isNaN(noAskBps)) {
    return null;
  }

  const impliedYesAskBps = 10_000 - noAskBps;
  const edgeBps = yesBidBps - impliedYesAskBps;

  return {
    yesBidBps,
    noAskBps,
    impliedYesAskBps,
    edgeBps,
  };
}

export function getLatestMarketEvents(
  marketId: `0x${string}`,
  events: AgentBroadcast[],
): AgentBroadcast[] {
  return events
    .filter((item) => item.marketId?.toLowerCase() === marketId.toLowerCase())
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

export function formatMarketId(marketId: `0x${string}`): string {
  return `${marketId.slice(0, 8)}...${marketId.slice(-6)}`;
}

export function formatEthShort(value: bigint): string {
  const eth = Number(value) / 1e18;
  if (eth === 0) return '0';
  if (eth < 0.0001) return '<0.0001';
  if (eth < 0.01) return eth.toFixed(4);
  if (eth < 1) return eth.toFixed(3);
  return eth.toFixed(2);
}

export function relativeTime(timestamp: string): string {
  const now = Date.now();
  const eventTime = new Date(timestamp).getTime();
  const diffSeconds = Math.max(1, Math.floor((now - eventTime) / 1000));

  if (diffSeconds < 60) return `${diffSeconds}s ago`;
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export function estimateSlippageBand(totalCollateral: bigint): 'Low' | 'Medium' | 'High' {
  const eth = Number(totalCollateral) / 1e18;
  if (eth >= 0.5) {
    return 'Low';
  }
  if (eth >= 0.1) {
    return 'Medium';
  }
  return 'High';
}
