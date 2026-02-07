import { formatEther, parseEther } from 'viem';
import type { PositionIntent } from './yellow/types.js';

export interface ClobExecutionPlan {
  mode: 'clob_match' | 'cpmm_fallback';
  matched: boolean;
  reason: string;
  yesAmountEth: string;
  noAmountEth: string;
  clearingPriceBps?: number;
}

function toYesBidBps(intent: PositionIntent): number {
  return intent.outcome === 'yes'
    ? intent.confidenceBps
    : 10000 - intent.confidenceBps;
}

function toNoBidBps(intent: PositionIntent): number {
  return intent.outcome === 'no'
    ? intent.confidenceBps
    : 10000 - intent.confidenceBps;
}

export function buildExecutionPlanFromIntents(
  alphaIntent: PositionIntent,
  betaIntent: PositionIntent,
): ClobExecutionPlan {
  const yesIntent = alphaIntent.outcome === 'yes' ? alphaIntent : betaIntent;
  const noIntent = alphaIntent.outcome === 'no' ? alphaIntent : betaIntent;
  const yesBidBps = toYesBidBps(yesIntent);
  const noAskAsYesBps = 10000 - toNoBidBps(noIntent);
  const crosses = yesBidBps >= noAskAsYesBps;

  const yesAmountWei = parseEther(yesIntent.amount);
  const noAmountWei = parseEther(noIntent.amount);
  const matchedWei = yesAmountWei < noAmountWei ? yesAmountWei : noAmountWei;
  const matchedEth = formatEther(matchedWei);
  const clearingPriceBps = Math.round((yesBidBps + noAskAsYesBps) / 2);

  if (crosses && matchedWei > 0n) {
    return {
      mode: 'clob_match',
      matched: true,
      reason: `crossed intents (yesBid=${yesBidBps}bps, noAsk=${noAskAsYesBps}bps)`,
      yesAmountEth: matchedEth,
      noAmountEth: matchedEth,
      clearingPriceBps,
    };
  }

  // Fallback to CPMM strategy when intents do not cross.
  return {
    mode: 'cpmm_fallback',
    matched: false,
    reason: `no cross (yesBid=${yesBidBps}bps, noAsk=${noAskAsYesBps}bps), fallback to CPMM`,
    yesAmountEth: '0.005',
    noAmountEth: '0.005',
  };
}
