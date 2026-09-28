import type { MarketInfo } from '@clawlogic/sdk';
import { keccak256, toBytes } from 'viem';
import { DEFAULT_CONFIG, type AgentBroadcast } from '@/lib/client';

const ZERO_BYTES32 =
  '0x0000000000000000000000000000000000000000000000000000000000000000';

export const EXPLORER_URL =
  DEFAULT_CONFIG.chainId === 42161 ? 'https://arbiscan.io' : 'https://sepolia.arbiscan.io';

export type MarketStatus = 'open' | 'resolving' | 'resolved';

export function getMarketStatus(market: MarketInfo): MarketStatus {
  if (market.resolved) return 'resolved';
  if (market.assertedOutcomeId !== ZERO_BYTES32) return 'resolving';
  return 'open';
}

/**
 * Label of the outcome asserted to UMA (the winner once resolved). The hook stores
 * keccak256(bytes(outcome)), so we match it against the market's own labels.
 */
export function getAssertedOutcome(market: MarketInfo): string | null {
  if (market.assertedOutcomeId === ZERO_BYTES32) return null;
  const asserted = market.assertedOutcomeId.toLowerCase();
  for (const label of [market.outcome1, market.outcome2, 'Unresolvable']) {
    if (keccak256(toBytes(label)) === asserted) return label;
  }
  return null;
}

export interface CrossedIntentQuote {
  yesBidBps: number;
  noAskBps: number;
  impliedYesAskBps: number;
  edgeBps: number;
}

export function getAgentLabel(event: {
  agent: string;
  ensName?: string;
  agentAddress?: `0x${string}`;
}): string {
  if (event.ensName && event.ensName.endsWith('.eth')) {
    return event.ensName;
  }
  if (event.agent.endsWith('.eth')) {
    return event.agent;
  }
  if (event.agentAddress) {
    return `${event.agentAddress.slice(0, 6)}...${event.agentAddress.slice(-4)}`;
  }
  return 'Unknown agent';
}

/** Short past-tense action for a broadcast, e.g. "placed a bet". */
export function broadcastVerb(event: AgentBroadcast): string {
  switch (event.type) {
    case 'TradeRationale':
      return 'placed a bet';
    case 'NegotiationIntent':
      return 'signalled an intent';
    case 'MarketBroadcast':
      return 'posted a thesis';
    default:
      return 'joined the network';
  }
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

export function shortHash(value: string, head = 6, tail = 4): string {
  return value.length <= head + tail + 1 ? value : `${value.slice(0, head)}…${value.slice(-tail)}`;
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
  if (diffDays < 7) return `${diffDays}d ago`;

  // Past a week, a calendar date is easier to read than "232d ago".
  const date = new Date(eventTime);
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
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
