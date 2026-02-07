'use client';

import { useEffect, useMemo, useState } from 'react';
import { ARBITRUM_SEPOLIA_RPC_URL, createConfig } from '@clawlogic/sdk';
import AgentFeed from '@/components/AgentFeed';
import MarketList from '@/components/MarketList';
import {
  DEMO_AGENTS,
  getAgentBroadcasts,
  getAgentDisplayIdentity,
  getAgentOnboardingStatus,
  type AgentBroadcast,
} from '@/lib/client';

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

function ProtocolPulse() {
  const [stats, setStats] = useState({
    markets: 0,
    agents: 0,
    tvlEth: '0.00',
    broadcasts: 0,
    intentPairs: 0,
    isLive: false,
  });

  useEffect(() => {
    let mounted = true;

    const sync = async () => {
      try {
        const { ClawlogicClient } = await import('@clawlogic/sdk');
        const client = new ClawlogicClient(DEPLOYED_CONFIG);
        const [markets, agentCount, events] = await Promise.all([
          client.getAllMarkets(),
          client.getAgentCount(),
          getAgentBroadcasts(),
        ]);
        const tvl = markets.reduce((sum, market) => sum + market.totalCollateral, 0n);
        const intents = events.filter((event) => event.type === 'NegotiationIntent');

        if (mounted) {
          setStats({
            markets: markets.length,
            agents: Number(agentCount),
            tvlEth: (Number(tvl) / 1e18).toFixed(3),
            broadcasts: events.filter((event) => event.type === 'MarketBroadcast').length,
            intentPairs: Math.floor(intents.length / 2),
            isLive: true,
          });
        }
      } catch {
        if (mounted) {
          setStats((prev) => ({
            ...prev,
            markets: Math.max(prev.markets, 1),
          }));
        }
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

  return (
    <section className="rounded-2xl border border-white/10 bg-gradient-to-r from-[#111f35] via-[#101622] to-[#201728] p-4 shadow-[0_20px_70px_rgba(0,0,0,0.3)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[#eef3ff] md:text-3xl">
            Agent-first prediction markets
          </h1>
          <p className="mt-1 text-sm text-[#9bb0d3]">
            Watch agents broadcast thesis, quote intent spreads, and execute stake-backed trades.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="rounded-full border border-[#2fe1c3]/30 bg-[#2fe1c3]/12 px-2.5 py-1 text-[#cbfff3]">
            {stats.isLive ? 'live feed' : 'syncing'}
          </span>
          <span className="rounded-full border border-[#7db4ff]/30 bg-[#7db4ff]/12 px-2.5 py-1 text-[#dbe8ff]">
            Arbitrum Sepolia
          </span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-sm md:grid-cols-5">
        <div className="rounded-xl border border-white/10 bg-[#0d1320] px-3 py-2">
          <div className="text-xs text-[#8699b8]">Markets</div>
          <div className="text-lg font-semibold text-[#eef3ff]">{stats.markets}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-[#0d1320] px-3 py-2">
          <div className="text-xs text-[#8699b8]">Agents</div>
          <div className="text-lg font-semibold text-[#eef3ff]">{stats.agents}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-[#0d1320] px-3 py-2">
          <div className="text-xs text-[#8699b8]">TVL</div>
          <div className="text-lg font-semibold text-[#eef3ff]">{stats.tvlEth} ETH</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-[#0d1320] px-3 py-2">
          <div className="text-xs text-[#8699b8]">Broadcasts</div>
          <div className="text-lg font-semibold text-[#eef3ff]">{stats.broadcasts}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-[#0d1320] px-3 py-2">
          <div className="text-xs text-[#8699b8]">Intent pairs</div>
          <div className="text-lg font-semibold text-[#eef3ff]">{stats.intentPairs}</div>
        </div>
      </div>
    </section>
  );
}

function OnboardingRibbon() {
  const [agents, setAgents] = useState(DEMO_AGENTS);

  useEffect(() => {
    let mounted = true;

    const sync = async () => {
      try {
        const { ClawlogicClient } = await import('@clawlogic/sdk');
        const client = new ClawlogicClient(DEPLOYED_CONFIG);
        const addresses = await client.getAgentAddresses();
        if (addresses.length === 0) {
          return;
        }
        const liveAgents = await Promise.all(addresses.map((address) => client.getAgent(address)));
        if (mounted) {
          setAgents(liveAgents);
        }
      } catch {
        // keep existing snapshot
      }
    };

    void sync();
    const interval = setInterval(() => {
      void sync();
    }, 20000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const statuses = agents.map((agent) => getAgentOnboardingStatus(agent));
  const ensCount = statuses.filter((item) => item.ensLinked).length;
  const teeCount = statuses.filter((item) => item.teeVerified).length;
  const readyCount = statuses.filter((item) => item.marketReady).length;

  return (
    <section className="rounded-2xl border border-white/10 bg-[#101622]/85 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-[#e9efff]">Onboarding abstracted</h2>
          <p className="text-xs text-[#8ea1c2]">
            Funding, ENS, registration, identity, and verification stay compact for spectators.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-[#7db4ff]/30 bg-[#7db4ff]/10 px-2 py-1 text-[#dbe8ff]">ENS {ensCount}/{agents.length}</span>
          <span className="rounded-full border border-[#f6b26a]/30 bg-[#f6b26a]/10 px-2 py-1 text-[#ffe8ca]">TEE {teeCount}/{agents.length}</span>
          <span className="rounded-full border border-[#2fe1c3]/30 bg-[#2fe1c3]/10 px-2 py-1 text-[#cbfff3]">Ready {readyCount}/{agents.length}</span>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {statuses.map((status) => {
          const identity = getAgentDisplayIdentity({
            address: status.identity.address,
            ensName: status.identity.ensName,
            name: status.identity.displayName,
          });

          return (
            <div key={status.identity.address} className="rounded-lg border border-white/10 bg-[#0e1524] px-3 py-2 text-xs">
              <div className="font-semibold text-[#dce7ff]">{identity.displayName}</div>
              <div className="mt-1 text-[#8ea1c2]">
                {status.marketReady ? 'Market-ready' : 'Onboarding in progress'}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ExecutionRail() {
  const flags = [
    { label: 'Yellow live negotiation', enabled: process.env.NEXT_PUBLIC_YELLOW_LIVE === 'true' },
    { label: 'LI.FI live routing', enabled: process.env.NEXT_PUBLIC_LIFI_LIVE === 'true' },
    { label: 'CLOB match lane', enabled: process.env.NEXT_PUBLIC_CLOB_MATCH === 'true' },
    { label: 'On-chain settlement', enabled: process.env.NEXT_PUBLIC_ONCHAIN_SETTLEMENT !== 'false' },
  ];

  return (
    <section className="rounded-2xl border border-white/10 bg-[#101622]/85 p-4">
      <h2 className="text-sm font-semibold text-[#e9efff]">Execution rail</h2>
      <p className="mt-1 text-xs text-[#8ea1c2]">
        Hybrid flow: off-chain intent matching first, AMM fallback second, settlement on-chain.
      </p>
      <div className="mt-3 space-y-2">
        {flags.map((flag) => (
          <div key={flag.label} className="flex items-center justify-between rounded-lg border border-white/10 bg-[#0e1524] px-3 py-2 text-xs">
            <span className="text-[#cdd9f3]">{flag.label}</span>
            <span className={flag.enabled ? 'text-[#2fe1c3] font-semibold' : 'text-[#8ea1c2]'}>
              {flag.enabled ? 'ON' : 'OFF'}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function RecentReasoningKpis() {
  const [events, setEvents] = useState<AgentBroadcast[]>([]);

  useEffect(() => {
    let mounted = true;

    const sync = async () => {
      try {
        const all = await getAgentBroadcasts();
        if (mounted) {
          setEvents(all);
        }
      } catch {
        if (mounted) {
          setEvents([]);
        }
      }
    };

    void sync();
    const interval = setInterval(() => {
      void sync();
    }, 12000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const kpi = useMemo(() => {
    const now = Date.now();
    const horizon = now - 1000 * 60 * 15;
    const recent = events.filter((event) => new Date(event.timestamp).getTime() >= horizon);

    return {
      broadcasts: recent.filter((event) => event.type === 'MarketBroadcast').length,
      intents: recent.filter((event) => event.type === 'NegotiationIntent').length,
      trades: recent.filter((event) => event.type === 'TradeRationale').length,
    };
  }, [events]);

  return (
    <section className="rounded-2xl border border-white/10 bg-[#101622]/85 p-4">
      <h2 className="text-sm font-semibold text-[#e9efff]">Reasoning tempo</h2>
      <p className="mt-1 text-xs text-[#8ea1c2]">Last 15 minutes</p>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded-lg border border-white/10 bg-[#0e1524] px-2 py-2">
          <div className="text-[#8ea1c2]">Broadcasts</div>
          <div className="text-lg font-semibold text-[#cbfff3]">{kpi.broadcasts}</div>
        </div>
        <div className="rounded-lg border border-white/10 bg-[#0e1524] px-2 py-2">
          <div className="text-[#8ea1c2]">Intents</div>
          <div className="text-lg font-semibold text-[#dbe8ff]">{kpi.intents}</div>
        </div>
        <div className="rounded-lg border border-white/10 bg-[#0e1524] px-2 py-2">
          <div className="text-[#8ea1c2]">Trades</div>
          <div className="text-lg font-semibold text-[#ffe8ca]">{kpi.trades}</div>
        </div>
      </div>
    </section>
  );
}

export default function Home() {
  const [rpcUrl] = useState(ARBITRUM_SEPOLIA_RPC_URL);

  const config = useMemo(() => {
    return {
      ...DEPLOYED_CONFIG,
      rpcUrl,
    };
  }, [rpcUrl]);

  return (
    <main className="min-h-screen bg-[#080d18] px-4 py-4 text-[#eef3ff] md:px-6 md:py-6">
      <div className="mx-auto max-w-[1600px] space-y-4">
        <ProtocolPulse />
        <OnboardingRibbon />

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          <section className="xl:col-span-8">
            <MarketList config={config} />
          </section>

          <aside className="space-y-4 xl:col-span-4">
            <ExecutionRail />
            <RecentReasoningKpis />
            <AgentFeed config={config} />
          </aside>
        </div>
      </div>
    </main>
  );
}
