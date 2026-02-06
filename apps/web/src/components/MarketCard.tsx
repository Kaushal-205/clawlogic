'use client';

import type { MarketInfo } from '@clawlogic/sdk';

interface MarketCardProps {
  market: MarketInfo;
  index: number;
}

const ZERO_BYTES32 =
  '0x0000000000000000000000000000000000000000000000000000000000000000';

export default function MarketCard({ market, index }: MarketCardProps) {
  const formatEth = (wei: bigint) => {
    const eth = Number(wei) / 1e18;
    if (eth === 0) return '0.0000';
    if (eth < 0.0001) return '<0.0001';
    return eth.toFixed(4);
  };

  const getStatus = (): {
    label: string;
    color: string;
    bgColor: string;
    borderColor: string;
    glowClass: string;
  } => {
    if (market.resolved) {
      return {
        label: 'RESOLVED',
        color: 'text-[#00ff41]',
        bgColor: 'bg-[#00ff41]/10',
        borderColor: 'border-[#00ff41]/40',
        glowClass: '',
      };
    }
    if (market.assertedOutcomeId !== ZERO_BYTES32) {
      return {
        label: 'ASSERTED',
        color: 'text-[#ffb800]',
        bgColor: 'bg-[#ffb800]/10',
        borderColor: 'border-[#ffb800]/40',
        glowClass: 'glow-pulse',
      };
    }
    return {
      label: 'ACTIVE',
      color: 'text-[#00ff41]',
      bgColor: 'bg-[#00ff41]/5',
      borderColor: 'border-[#00ff41]/20',
      glowClass: '',
    };
  };

  const status = getStatus();

  // Calculate probabilities (50/50 for now - will be based on AMM pricing later)
  // TODO: When V4 swaps are active, calculate from token prices
  const yesProbability = 50;
  const noProbability = 50;

  return (
    <div
      className={`
        border rounded-sm ${status.borderColor} ${status.bgColor}
        hover:border-[#00ff41]/50 transition-all duration-300
        relative overflow-hidden group
      `}
    >
      {/* Terminal header bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#00ff41]/10 bg-black/40">
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-[#a0a0a0] font-mono">
            MKT-{String(index).padStart(3, '0')}
          </span>
          <span className="text-[10px] text-[#a0a0a0] font-mono opacity-50">
            {market.marketId.slice(0, 10)}...{market.marketId.slice(-6)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`
              text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-sm
              ${status.color} ${status.bgColor} border ${status.borderColor}
            `}
          >
            {status.label}
          </span>
          {!market.resolved && market.assertedOutcomeId === ZERO_BYTES32 && (
            <span className="w-1.5 h-1.5 rounded-full bg-[#00ff41] status-pulse" />
          )}
        </div>
      </div>

      {/* Market question */}
      <div className="px-4 pt-4 pb-3">
        <h3 className="text-base font-medium leading-snug text-[#00ff41] mb-3">
          <span className="text-[#a0a0a0] mr-1">&gt;</span>
          {market.description}
        </h3>

        {/* Probability Bar (Polymarket-style) */}
        {!market.resolved && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[10px] font-mono">
              <span className="text-[#a0a0a0] opacity-70">MARKET PROBABILITY</span>
              <span className="text-[#a0a0a0] opacity-50">
                {market.totalCollateral === 0n ? 'NO LIQUIDITY' : 'EQUAL SPLIT'}
              </span>
            </div>
            <div className="relative h-2 bg-black/50 rounded-sm overflow-hidden border border-[#00ff41]/20">
              <div
                className="absolute left-0 top-0 h-full bg-gradient-to-r from-[#00ff41] to-[#00ff41]/80 transition-all duration-300"
                style={{ width: `${yesProbability}%` }}
              />
              <div
                className="absolute right-0 top-0 h-full bg-gradient-to-l from-[#ff0040] to-[#ff0040]/80 transition-all duration-300"
                style={{ width: `${noProbability}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[11px] font-mono font-bold">
              <div className="flex items-center gap-1.5">
                <span className="text-[#00ff41]">{yesProbability}%</span>
                <span className="text-[#a0a0a0] opacity-60 uppercase text-[9px]">{market.outcome1}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[#a0a0a0] opacity-60 uppercase text-[9px]">{market.outcome2}</span>
                <span className="text-[#ff0040]">{noProbability}%</span>
              </div>
            </div>
          </div>
        )}

        {market.assertedOutcomeId !== ZERO_BYTES32 && !market.resolved && (
          <div className="mt-3 text-[11px] text-[#ffb800] flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#ffb800] status-pulse inline-block" />
            UMA LIVENESS WINDOW ACTIVE -- AGENTS MAY DISPUTE
          </div>
        )}

        {market.resolved && (
          <div className="mt-3 text-[11px] text-[#00ff41] flex items-center gap-2 font-mono">
            <span className="text-[#a0a0a0] opacity-70">FINAL OUTCOME:</span>
            <span className="font-bold uppercase">{market.outcome1}</span>
          </div>
        )}
      </div>

      {/* Outcome columns */}
      <div className="grid grid-cols-2 gap-0 border-t border-[#00ff41]/10">
        {/* Outcome 1 (YES) */}
        <div
          className={`
            p-3 border-r border-[#00ff41]/10 relative
            ${market.resolved && market.assertedOutcomeId !== ZERO_BYTES32
              ? 'bg-[#00ff41]/10'
              : ''
            }
          `}
        >
          <div className="text-[10px] text-[#a0a0a0] mb-1 tracking-wider">
            OUTCOME_1
          </div>
          <div className="text-lg font-bold text-[#00ff41] uppercase tracking-wide">
            {market.outcome1}
          </div>
          <div className="text-[10px] text-[#a0a0a0] mt-1 font-mono truncate">
            {market.outcome1Token.slice(0, 14)}...
          </div>
          {market.resolved && (
            <div className="absolute top-2 right-2 text-[9px] text-[#00ff41] font-bold bg-[#00ff41]/20 px-1.5 py-0.5 rounded-sm">
              WINNER
            </div>
          )}
        </div>

        {/* Outcome 2 (NO) */}
        <div
          className={`
            p-3 relative
            ${market.resolved && market.assertedOutcomeId === ZERO_BYTES32
              ? 'bg-[#ff0040]/10'
              : ''
            }
          `}
        >
          <div className="text-[10px] text-[#a0a0a0] mb-1 tracking-wider">
            OUTCOME_2
          </div>
          <div className="text-lg font-bold text-[#ff0040] uppercase tracking-wide">
            {market.outcome2}
          </div>
          <div className="text-[10px] text-[#a0a0a0] mt-1 font-mono truncate">
            {market.outcome2Token.slice(0, 14)}...
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-0 border-t border-[#00ff41]/10 bg-black/30">
        <div className="p-3 border-r border-[#00ff41]/10">
          <div className="text-[9px] text-[#a0a0a0] tracking-wider mb-0.5">
            COLLATERAL
          </div>
          <div className="text-sm font-bold font-mono text-[#00ff41]">
            {formatEth(market.totalCollateral)} <span className="text-[10px] text-[#a0a0a0]">ETH</span>
          </div>
        </div>
        <div className="p-3 border-r border-[#00ff41]/10">
          <div className="text-[9px] text-[#a0a0a0] tracking-wider mb-0.5">
            REWARD
          </div>
          <div className="text-sm font-bold font-mono text-[#ffb800]">
            {formatEth(market.reward)} <span className="text-[10px] text-[#a0a0a0]">ETH</span>
          </div>
        </div>
        <div className="p-3">
          <div className="text-[9px] text-[#a0a0a0] tracking-wider mb-0.5">
            BOND REQ
          </div>
          <div className="text-sm font-bold font-mono text-[#a0a0a0]">
            {formatEth(market.requiredBond)} <span className="text-[10px] text-[#a0a0a0]">ETH</span>
          </div>
        </div>
      </div>

      {/* Hover scanline effect */}
      <div
        className="
          absolute inset-0 opacity-0 group-hover:opacity-100 pointer-events-none
          transition-opacity duration-500
          bg-gradient-to-b from-transparent via-[#00ff41]/3 to-transparent
        "
        style={{ backgroundSize: '100% 4px' }}
      />
    </div>
  );
}
