'use client';

import { useEffect, useState, useCallback } from 'react';
import type { MarketInfo, ClawlogicConfig } from '@clawlogic/sdk';
import { ClawlogicClient } from '@clawlogic/sdk';
import MarketCard from './MarketCard';
import { DEMO_MARKETS } from '@/lib/client';

interface MarketListProps {
  config: ClawlogicConfig;
}

export default function MarketList({ config }: MarketListProps) {
  const [markets, setMarkets] = useState<MarketInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usingDemo, setUsingDemo] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const fetchMarkets = useCallback(async () => {
    try {
      const client = new ClawlogicClient(config);
      const allMarkets = await client.getAllMarkets();
      setMarkets(allMarkets);
      setUsingDemo(false);
      setError(null);
      setLastRefresh(new Date());
    } catch {
      // Fallback to demo data
      setMarkets(DEMO_MARKETS);
      setUsingDemo(true);
      setError(null);
      setLastRefresh(new Date());
    } finally {
      setLoading(false);
    }
  }, [config]);

  useEffect(() => {
    fetchMarkets();
    const interval = setInterval(fetchMarkets, 15000);
    return () => clearInterval(interval);
  }, [fetchMarkets]);

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="text-[11px] text-[#a0a0a0] font-mono flex items-center gap-2">
          <span className="inline-block w-2 h-2 bg-[#ffb800] rounded-full status-pulse" />
          FETCHING MARKET DATA...
        </div>
        {[1, 2].map((i) => (
          <div key={i} className="border border-[#00ff41]/10 rounded-sm bg-black/30 overflow-hidden">
            <div className="h-8 bg-[#00ff41]/5 border-b border-[#00ff41]/10" />
            <div className="p-4 space-y-3">
              <div className="h-4 bg-[#00ff41]/5 rounded w-3/4" />
              <div className="grid grid-cols-2 gap-2">
                <div className="h-16 bg-[#00ff41]/5 rounded" />
                <div className="h-16 bg-[#00ff41]/5 rounded" />
              </div>
              <div className="h-8 bg-[#00ff41]/5 rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  const activeCount = markets.filter((m) => !m.resolved).length;
  const resolvedCount = markets.filter((m) => m.resolved).length;
  const totalCollateral = markets.reduce((sum, m) => sum + m.totalCollateral, 0n);
  const totalCollateralEth = (Number(totalCollateral) / 1e18).toFixed(4);

  return (
    <div className="space-y-4">
      {/* Status bar */}
      <div className="flex items-center justify-between text-[11px] font-mono">
        <div className="flex items-center gap-4">
          <span className="text-[#a0a0a0]">
            TOTAL: <span className="text-[#00ff41]">{markets.length}</span>
          </span>
          <span className="text-[#a0a0a0]">
            ACTIVE: <span className="text-[#00ff41]">{activeCount}</span>
          </span>
          <span className="text-[#a0a0a0]">
            RESOLVED: <span className="text-[#ffb800]">{resolvedCount}</span>
          </span>
          <span className="text-[#a0a0a0]">
            TVL: <span className="text-[#00ff41]">{totalCollateralEth} ETH</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          {usingDemo && (
            <span className="text-[10px] text-[#ffb800] bg-[#ffb800]/10 px-2 py-0.5 rounded-sm border border-[#ffb800]/20">
              DEMO DATA
            </span>
          )}
          <span className="text-[#a0a0a0] opacity-50">
            {lastRefresh.toLocaleTimeString()}
          </span>
        </div>
      </div>

      {/* Markets */}
      {markets.length === 0 ? (
        <div className="border border-dashed border-[#00ff41]/20 rounded-sm p-12 text-center bg-black/30">
          <div className="text-[#a0a0a0] text-sm mb-2 font-mono">
            <span className="text-[#00ff41] mr-2">&gt;</span>
            NO ACTIVE MARKETS
          </div>
          <div className="text-[11px] text-[#a0a0a0] opacity-50 font-mono">
            AWAITING AGENT DEPLOYMENT...
            <span className="cursor-blink ml-1">_</span>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {markets.map((market, i) => (
            <MarketCard key={market.marketId} market={market} index={i + 1} />
          ))}
        </div>
      )}

      {error && (
        <div className="text-[11px] text-[#ff0040] font-mono mt-2">
          // ERROR: {error}
        </div>
      )}
    </div>
  );
}
