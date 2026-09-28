/**
 * Rebuilds a market's CPMM reserves from PredictionMarketHook events, so the frontend
 * can chart the real on-chain price after every trade without an archive node.
 *
 * Mirrors the reserve updates in PredictionMarketHook.sol:
 *   buy   minted = ethIn - protocolFee;   rSelf += minted - tokensOut; rOther += minted
 *   sell  burned = ethOut + protocolFee;  rSelf += tokensIn - burned;  rOther -= burned
 *   add   first deposit: both += amount; else both scale by amount / max(r1, r2)
 *   remove r1 -= amount1; r2 -= amount2
 * Each trade emits TradeFeesCharged immediately before OutcomeTokenBought/Sold.
 *
 * Pure and dependency-free so it can be unit tested against a simulation of the contract.
 */

export type ReserveEventData =
  | { kind: 'fees'; protocolFee: bigint; lpFee: bigint }
  | { kind: 'buy'; isOutcome1: boolean; ethIn: bigint; tokensOut: bigint }
  | { kind: 'sell'; isOutcome1: boolean; tokensIn: bigint; ethOut: bigint }
  | { kind: 'addLiquidity'; amount: bigint; shares: bigint }
  | { kind: 'removeLiquidity'; shares: bigint; amount1: bigint; amount2: bigint };

export type ReserveEvent = ReserveEventData & {
  blockNumber: bigint;
  logIndex: number;
  transactionHash?: string;
};

export interface ReserveSnapshot {
  blockNumber: bigint;
  logIndex: number;
  reserve1: bigint;
  reserve2: bigint;
}

export interface ReplayResult {
  snapshots: ReserveSnapshot[];
  reserve1: bigint;
  reserve2: bigint;
}

export function compareEventOrder(
  a: { blockNumber: bigint; logIndex: number },
  b: { blockNumber: bigint; logIndex: number },
): number {
  if (a.blockNumber !== b.blockNumber) return a.blockNumber < b.blockNumber ? -1 : 1;
  return a.logIndex - b.logIndex;
}

/**
 * Replays reserve-changing events in chain order. Returns null when the event stream is
 * inconsistent with the contract (e.g. a deployment with a different AMM), so callers can
 * fall back instead of charting a wrong price.
 */
export function replayReserves(events: ReserveEvent[]): ReplayResult | null {
  const ordered = [...events].sort(compareEventOrder);
  let r1 = 0n;
  let r2 = 0n;
  let totalShares = 0n;
  let pendingProtocolFee: bigint | null = null;
  const snapshots: ReserveSnapshot[] = [];

  for (const event of ordered) {
    switch (event.kind) {
      case 'fees':
        pendingProtocolFee = event.protocolFee;
        continue;
      case 'buy': {
        if (pendingProtocolFee === null) return null;
        const minted = event.ethIn - pendingProtocolFee;
        pendingProtocolFee = null;
        if (event.isOutcome1) {
          r1 = r1 + minted - event.tokensOut;
          r2 = r2 + minted;
        } else {
          r2 = r2 + minted - event.tokensOut;
          r1 = r1 + minted;
        }
        break;
      }
      case 'sell': {
        if (pendingProtocolFee === null) return null;
        const burned = event.ethOut + pendingProtocolFee;
        pendingProtocolFee = null;
        if (event.isOutcome1) {
          r1 = r1 + event.tokensIn - burned;
          r2 = r2 - burned;
        } else {
          r2 = r2 + event.tokensIn - burned;
          r1 = r1 - burned;
        }
        break;
      }
      case 'addLiquidity': {
        if (totalShares === 0n) {
          r1 += event.amount;
          r2 += event.amount;
        } else {
          const poolWeight = r1 > r2 ? r1 : r2;
          if (poolWeight === 0n) return null;
          r1 += (event.amount * r1) / poolWeight;
          r2 += (event.amount * r2) / poolWeight;
        }
        totalShares += event.shares;
        break;
      }
      case 'removeLiquidity':
        r1 -= event.amount1;
        r2 -= event.amount2;
        totalShares -= event.shares;
        break;
    }

    if (r1 < 0n || r2 < 0n || totalShares < 0n) return null;
    snapshots.push({ blockNumber: event.blockNumber, logIndex: event.logIndex, reserve1: r1, reserve2: r2 });
  }

  return { snapshots, reserve1: r1, reserve2: r2 };
}

/** Outcome-1 probability in percent, matching PredictionMarketHook.getMarketProbability. */
export function outcome1Probability(reserve1: bigint, reserve2: bigint): number | null {
  if (reserve1 === 0n || reserve2 === 0n) return null;
  return Number((reserve2 * 10_000n) / (reserve1 + reserve2)) / 100;
}
