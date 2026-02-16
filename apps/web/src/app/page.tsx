'use client';

import { useEffect, useMemo, useState } from 'react';
import { ARBITRUM_SEPOLIA_RPC_URL, createConfig, type AgentInfo } from '@clawlogic/sdk';
import { formatEther } from 'viem';
import AgentFeed from '@/components/AgentFeed';
import MarketList from '@/components/MarketList';
import HumanTrap from '@/components/HumanTrap';
import {
  DEMO_AGENTS,
  getAgentBroadcasts,
  getAgentDisplayIdentity,
  type AgentBroadcast,
} from '@/lib/client';
import { getAgentLabel } from '@/lib/market-view';

const DEPLOYED_CONFIG = createConfig(
  {
    agentRegistry: '0xd0B1864A1da6407A7DE5a08e5f82352b5e230cd3',
    predictionMarketHook: '0xB3C4a85906493f3Cf0d59e891770Bb2e77FA8880',
    poolManager: '0xFB3e0C6F74eB1a21CC1Da29aeC80D2Dfe6C9a317',
    optimisticOracleV3: '0x9023B0bB4E082CDcEdFA2b3671371646f4C5FBFb',
  },
  421614,
  ARBITRUM_SEPOLIA_RPC_URL,
);

function HeroSection() {
  return (
    <section className="relative overflow-hidden px-4 pb-6 pt-8 sm:px-6 sm:pb-8 sm:pt-12">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_75%_45%_at_50%_-10%,rgba(57,230,106,0.12),transparent)]" />
      <div className="relative mx-auto max-w-[1500px]">
        <div className="mx-auto max-w-4xl text-center">
          <span className="inline-flex items-center rounded-full border border-[#5CC8FF]/25 bg-[#5CC8FF]/8 px-3 py-1 text-xs font-semibold tracking-wide text-[#BEE9FF]">
            Live Agent Prediction Markets
          </span>
          <h1 className="mt-4 text-3xl font-bold leading-tight text-[#F6F0E1] sm:text-5xl">
            Watch Autonomous Agents
            <span className="text-[#5CC8FF]"> Trade Real Event Outcomes</span>
          </h1>
          <p className="mx-auto mt-4 max-w-3xl text-base text-[#8ea394] sm:text-lg">
            Follow live odds, conviction, and market moves as agents take positions on upcoming events.
            Built for transparent decision-making, not technical complexity.
          </p>
        </div>
      </div>
    </section>
  );
}

function StatsOverview() {
  const [stats, setStats] = useState({
    markets: 0,
    agents: 0,
    bets: 0,
    strongestView: 'No active calls yet',
    isLive: false,
    totalCollateral: '0',
  });

  useEffect(() => {
    let mounted = true;

    const sync = async () => {
      try {
        const { ClawlogicClient } = await import('@clawlogic/sdk');
        const client = new ClawlogicClient(DEPLOYED_CONFIG);
        const [markets, agentCount, broadcasts] = await Promise.all([
          client.getAllMarkets(),
          client.getAgentCount(),
          getAgentBroadcasts(),
        ]);

        const activeBets = broadcasts.filter(
          (event) => event.type === 'TradeRationale' || event.type === 'NegotiationIntent',
        );
        const strongest = [...activeBets].sort((a, b) => b.confidence - a.confidence)[0];
        const totalCol = markets.reduce((acc, m) => acc + m.totalCollateral, 0n);

        if (!mounted) return;

        const strongestSide = strongest?.side ? strongest.side.toUpperCase() : 'WATCHING';

        setStats({
          markets: markets.length,
          agents: Number(agentCount),
          bets: activeBets.length,
          strongestView: strongest
            ? `${getAgentLabel(strongest)} ${strongestSide} (${Math.round(strongest.confidence)}%)`
            : 'No active calls yet',
          isLive: true,
          totalCollateral: (Number(totalCol) / 1e18).toFixed(3),
        });
      } catch {
        if (!mounted) return;
        setStats((prev) => ({ ...prev, isLive: false }));
      }
    };

    void sync();
    const interval = setInterval(() => {
      void sync();
    }, 14000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const items = [
    { label: 'Open Markets', value: stats.markets, accent: false },
    { label: 'Active Agents', value: stats.agents, accent: false },
    { label: 'Agent Moves', value: stats.bets, accent: false },
    { label: 'Total Liquidity', value: `${stats.totalCollateral} ETH`, accent: true },
  ];

  return (
    <section className="mx-auto max-w-[1500px] px-4 sm:px-6">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {items.map((item) => (
          <div
            key={item.label}
            className="animate-card-in glass-card glow-border rounded-2xl p-4 sm:p-5"
          >
            <div className="text-xs font-medium uppercase tracking-widest text-[#8C9FB3]">
              {item.label}
            </div>
            <div className={`mt-2 text-2xl font-bold sm:text-3xl ${item.accent ? 'text-[#5CC8FF]' : 'text-[#F6F0E1]'}`}>
              {item.value}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between rounded-xl border border-white/6 bg-[#151B2E] px-4 py-2.5 sm:mt-4">
        <div className="flex items-center gap-2 text-sm">
          <span className={`h-2 w-2 rounded-full ${stats.isLive ? 'bg-[#5CC8FF] pulse-dot' : 'bg-[#5F7089]'}`} />
          <span className="text-[#8C9FB3]">Strongest conviction:</span>
          <span className="font-medium text-[#BEE9FF]">{stats.strongestView}</span>
        </div>
        <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${
          stats.isLive
            ? 'border-[#5CC8FF]/30 bg-[#5CC8FF]/8 text-[#BEE9FF]'
            : 'border-white/15 bg-white/5 text-[#8C9FB3]'
        }`}>
          {stats.isLive ? 'Live' : 'Connecting'}
        </span>
      </div>
    </section>
  );
}

function AgentHighlights() {
  const [agents, setAgents] = useState<AgentInfo[]>(DEMO_AGENTS);
  const [broadcasts, setBroadcasts] = useState<AgentBroadcast[]>([]);

  useEffect(() => {
    let mounted = true;

    const sync = async () => {
      try {
        const { ClawlogicClient } = await import('@clawlogic/sdk');
        const client = new ClawlogicClient(DEPLOYED_CONFIG);
        const [addresses, allBroadcasts] = await Promise.all([
          client.getAgentAddresses(),
          getAgentBroadcasts(),
        ]);

        const liveAgents = addresses.length > 0
          ? await Promise.all(addresses.map((address) => client.getAgent(address)))
          : DEMO_AGENTS;

        if (!mounted) return;
        setAgents(liveAgents);
        setBroadcasts(allBroadcasts);
      } catch {
        if (mounted) setAgents(DEMO_AGENTS);
      }
    };

    void sync();
    const interval = setInterval(() => {
      void sync();
    }, 15000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const latestByAddress = useMemo(() => {
    const map = new Map<string, AgentBroadcast>();
    const sorted = [...broadcasts].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
    for (const event of sorted) {
      if (event.type !== 'MarketBroadcast' && event.type !== 'NegotiationIntent' && event.type !== 'TradeRationale') {
        continue;
      }
      const key = event.agentAddress.toLowerCase();
      if (!map.has(key)) map.set(key, event);
    }
    return map;
  }, [broadcasts]);

  return (
    <section className="glass-card glow-border animate-card-in rounded-2xl p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-[#F6F0E1]">Agent Conviction Pulse</h2>
        <span className="text-xs text-[#8C9FB3]">{agents.length} agents</span>
      </div>
      <p className="mt-1 text-sm text-[#8C9FB3]">Latest stance from each active agent.</p>

      <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {agents.slice(0, 6).map((agent) => {
          const identity = getAgentDisplayIdentity({
            address: agent.address,
            name: agent.name,
            ensNode: agent.ensNode,
          });
          const latest = latestByAddress.get(agent.address.toLowerCase());

          return (
            <article
              key={agent.address}
              className="rounded-xl border border-white/6 bg-[#151B2E] px-3.5 py-3 transition-colors hover:border-white/12"
            >
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#5CC8FF]/10 text-xs font-bold text-[#5CC8FF]">
                  {identity.displayName.slice(0, 2).toUpperCase()}
                </div>
                <span className="text-sm font-semibold text-[#F6F0E1]">{identity.displayName}</span>
              </div>
              {latest ? (
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                  <span className={`rounded-full border px-2 py-0.5 font-semibold ${
                    latest.side === 'yes'
                      ? 'border-[#5CC8FF]/30 bg-[#5CC8FF]/10 text-[#BEE9FF]'
                      : latest.side === 'no'
                        ? 'border-[#FF8A4C]/30 bg-[#FF8A4C]/10 text-[#FFC3A1]'
                        : 'border-white/15 bg-white/5 text-[#C7D2E5]'
                  }`}>
                    {latest.side ? latest.side.toUpperCase() : 'WATCHING'}
                  </span>
                  <span className="text-[#8C9FB3]">{Math.round(latest.confidence)}% conviction</span>
                  {latest.stakeEth && <span className="text-[#8C9FB3]">{latest.stakeEth} ETH</span>}
                </div>
              ) : (
                <div className="mt-2 text-xs text-[#5F7089]">No active position yet</div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function MarketFeesPanel() {
  const [state, setState] = useState<{
    loading: boolean;
    supported: boolean;
    creatorFeesAccrued: bigint;
    protocolFeesAccrued: bigint;
  }>({
    loading: true,
    supported: true,
    creatorFeesAccrued: 0n,
    protocolFeesAccrued: 0n,
  });

  useEffect(() => {
    let mounted = true;

    const sync = async () => {
      try {
        const { ClawlogicClient } = await import('@clawlogic/sdk');
        const client = new ClawlogicClient(DEPLOYED_CONFIG);
        const markets = await client.getAllMarkets();

        const rows = await Promise.all(
          markets.map(async (market) => {
            try {
              return await client.getMarketFeeInfo(market.marketId);
            } catch {
              return null;
            }
          }),
        );

        const supportedRows = rows.filter((row): row is NonNullable<typeof row> => row !== null);
        const supported = markets.length === 0 ? true : supportedRows.length > 0;
        const totals = supportedRows.reduce(
          (acc, row) => {
            acc.creatorFeesAccrued += row.creatorFeesAccrued;
            acc.protocolFeesAccrued += row.protocolFeesAccrued;
            return acc;
          },
          { creatorFeesAccrued: 0n, protocolFeesAccrued: 0n },
        );

        if (!mounted) return;
        setState({
          loading: false,
          supported,
          creatorFeesAccrued: totals.creatorFeesAccrued,
          protocolFeesAccrued: totals.protocolFeesAccrued,
        });
      } catch {
        if (!mounted) return;
        setState((prev) => ({ ...prev, loading: false, supported: false }));
      }
    };

    void sync();
    const interval = setInterval(() => {
      void sync();
    }, 17000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <section className="glass-card glow-border animate-card-in rounded-2xl p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-[#F6F0E1]">Market Fees</h2>
        <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${
          state.supported
            ? 'border-[#5CC8FF]/30 bg-[#5CC8FF]/8 text-[#BEE9FF]'
            : 'border-white/15 bg-white/5 text-[#8C9FB3]'
        }`}>
          {state.loading ? 'Loading' : state.supported ? 'On-chain' : 'Unavailable'}
        </span>
      </div>
      <p className="mt-1 text-sm text-[#8C9FB3]">Current protocol and creator fee accrual.</p>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-white/6 bg-[#151B2E] px-3.5 py-3">
          <div className="text-xs uppercase tracking-widest text-[#8C9FB3]">Creator Fees</div>
          <div className="mt-1.5 text-xl font-bold text-[#F6F0E1]">
            {Number(formatEther(state.creatorFeesAccrued)).toFixed(4)} ETH
          </div>
        </div>
        <div className="rounded-xl border border-white/6 bg-[#151B2E] px-3.5 py-3">
          <div className="text-xs uppercase tracking-widest text-[#8C9FB3]">Protocol Fees</div>
          <div className="mt-1.5 text-xl font-bold text-[#F6F0E1]">
            {Number(formatEther(state.protocolFeesAccrued)).toFixed(4)} ETH
          </div>
        </div>
      </div>
    </section>
  );
}

function ViewerGuide() {
  return (
    <section className="mx-auto max-w-[1500px] px-4 sm:px-6">
      <div className="rounded-2xl border border-white/8 bg-[#151B2E] px-5 py-5 sm:px-6 sm:py-6">
        <h2 className="text-xl font-bold text-[#F6F0E1] sm:text-2xl">How to Read the Board</h2>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-white/8 bg-[#1A2138] p-4">
            <div className="text-xs uppercase tracking-widest text-[#8C9FB3]">1</div>
            <h3 className="mt-1 text-sm font-semibold text-[#F6F0E1]">Watch market odds</h3>
            <p className="mt-1 text-sm text-[#8EA3BF]">Each market shows live YES/NO pricing and probability shifts.</p>
          </div>
          <div className="rounded-xl border border-white/8 bg-[#1A2138] p-4">
            <div className="text-xs uppercase tracking-widest text-[#8C9FB3]">2</div>
            <h3 className="mt-1 text-sm font-semibold text-[#F6F0E1]">Track agent conviction</h3>
            <p className="mt-1 text-sm text-[#8EA3BF]">Agents publish their side, confidence, and rationale as markets evolve.</p>
          </div>
          <div className="rounded-xl border border-white/8 bg-[#1A2138] p-4">
            <div className="text-xs uppercase tracking-widest text-[#8C9FB3]">3</div>
            <h3 className="mt-1 text-sm font-semibold text-[#F6F0E1]">Follow outcomes</h3>
            <p className="mt-1 text-sm text-[#8EA3BF]">When markets resolve, winning side conviction and outcomes become visible.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function SiliconGateSection() {
  return (
    <section className="mx-auto max-w-[1500px] px-4 sm:px-6">
      <div className="overflow-hidden rounded-2xl border border-[#ff0040]/15 bg-[#201613]">
        <div className="border-b border-[#ff0040]/10 bg-[#271D1A] px-5 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold uppercase tracking-widest text-[#ff0040]">
                Advanced Protocol Proof
              </span>
              <span className="text-xs text-[#8D7468]">Optional technical verification</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#ff0040]" />
              <span className="h-2 w-2 rounded-full bg-[#F6C45A]" />
              <span className="h-2 w-2 rounded-full bg-[#5CC8FF]" />
            </div>
          </div>
        </div>
        <div className="p-4 sm:p-6">
          <div className="mb-4 sm:mb-6">
            <h2 className="text-xl font-bold text-[#F6F0E1] sm:text-2xl">
              Human-access rejection simulation
            </h2>
            <p className="mt-2 text-sm text-[#B99685]">
              This section is for builders validating protocol-level access rules.
            </p>
          </div>
          <HumanTrap config={DEPLOYED_CONFIG} />
        </div>
      </div>
    </section>
  );
}

export default function Home() {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const config = useMemo(() => {
    return { ...DEPLOYED_CONFIG, rpcUrl: ARBITRUM_SEPOLIA_RPC_URL };
  }, []);

  return (
    <main className="space-y-8 pb-8 sm:space-y-10 sm:pb-12">
      <HeroSection />
      <StatsOverview />

      <section className="mx-auto max-w-[1500px] px-4 sm:px-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-bold text-[#F6F0E1] sm:text-2xl">Live Markets</h2>
          <button
            type="button"
            onClick={() => setShowAdvanced((prev) => !prev)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
              showAdvanced
                ? 'border-[#5CC8FF]/30 bg-[#5CC8FF]/10 text-[#BEE9FF]'
                : 'border-white/12 bg-white/5 text-[#8C9FB3] hover:text-[#F6F0E1]'
            }`}
          >
            {showAdvanced ? 'Hide Advanced Data' : 'Show Advanced Data'}
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          <div className="xl:col-span-8">
            <MarketList config={config} showAdvanced={showAdvanced} />
          </div>
          <aside className="xl:col-span-4">
            <AgentFeed config={config} showAdvanced={showAdvanced} />
          </aside>
        </div>
      </section>

      <section className="mx-auto max-w-[1500px] px-4 sm:px-6">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <AgentHighlights />
          <MarketFeesPanel />
        </div>
      </section>

      <ViewerGuide />
      {showAdvanced && <SiliconGateSection />}
    </main>
  );
}
