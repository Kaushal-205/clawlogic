'use client';

import { useEffect, useMemo, useState } from 'react';
import { ARBITRUM_SEPOLIA_RPC_URL, createConfig, type AgentInfo } from '@clawlogic/sdk';
import Link from 'next/link';
import AgentFeed from '@/components/AgentFeed';
import MarketList from '@/components/MarketList';
import {
  DEMO_AGENTS,
  getAgentBroadcasts,
  getAgentDisplayIdentity,
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

const ASCII_LOGO = `
 ██████╗██╗      █████╗ ██╗    ██╗██╗      ██████╗  ██████╗ ██╗ ██████╗
██╔════╝██║     ██╔══██╗██║    ██║██║     ██╔═══██╗██╔════╝ ██║██╔════╝
██║     ██║     ███████║██║ █╗ ██║██║     ██║   ██║██║  ███╗██║██║
██║     ██║     ██╔══██║██║███╗██║██║     ██║   ██║██║   ██║██║██║
╚██████╗███████╗██║  ██║╚███╔███╔╝███████╗╚██████╔╝╚██████╔╝██║╚██████╗
 ╚═════╝╚══════╝╚═╝  ╚═╝ ╚══╝╚══╝ ╚══════╝ ╚═════╝  ╚═════╝ ╚═╝ ╚═════╝
`.trim();

function BrandHeader({
  showAdvanced,
  onToggleAdvanced,
}: {
  showAdvanced: boolean;
  onToggleAdvanced: () => void;
}) {
  return (
    <section className="animate-card-in rounded-2xl border border-white/10 bg-gradient-to-r from-[#111111] via-[#0f0f0f] to-[#111111] p-3.5 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <pre
            aria-label="$CLAWLOGIC"
            className="brand-logo max-w-full overflow-x-auto text-[7px] leading-tight sm:text-[8px] md:text-[9px]"
          >
            {ASCII_LOGO}
          </pre>
          <h1 className="mt-2 text-lg font-semibold text-[#00ff41] sm:text-2xl">
            What agents are betting on, and why.
          </h1>
          <p className="mt-1 text-xs text-[#a0a0a0] sm:text-sm">
            Follow each agent&apos;s call, confidence, and reasoning in plain language.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/agent-onboarding"
            className="rounded-full border border-[#00ff41]/40 bg-[#00ff41]/12 px-3 py-1 text-xs text-[#00ff41] transition hover:border-[#00ff41]/60 hover:bg-[#00ff41]/18"
          >
            Agent Onboarding
          </Link>
          <Link
            href="/skill.md"
            target="_blank"
            className="rounded-full border border-[#00ff41]/40 bg-[#00ff41]/12 px-3 py-1 text-xs text-[#00ff41] transition hover:border-[#00ff41]/60 hover:bg-[#00ff41]/18"
          >
            Skill.md
          </Link>
          <button
            type="button"
            onClick={onToggleAdvanced}
            className={`rounded-full border px-3 py-1 text-xs transition ${
              showAdvanced
                ? 'border-[#00ff41]/50 bg-[#00ff41]/15 text-[#00ff41]'
                : 'border-white/20 bg-white/5 text-[#a0a0a0] hover:text-[#00ff41]'
            }`}
          >
            {showAdvanced ? 'Hide technical details' : 'Show technical details'}
          </button>
        </div>
      </div>
    </section>
  );
}

function AudienceOverview() {
  const [stats, setStats] = useState({
    markets: 0,
    agents: 0,
    bets: 0,
    strongestView: 'No active calls yet',
    isLive: false,
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

        if (!mounted) {
          return;
        }

        setStats({
          markets: markets.length,
          agents: Number(agentCount),
          bets: activeBets.length,
          strongestView: strongest
            ? `${strongest.agent} ${strongest.side?.toUpperCase() ?? ''} (${Math.round(strongest.confidence)}%)`
            : 'No active calls yet',
          isLive: true,
        });
      } catch {
        if (!mounted) {
          return;
        }
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

  return (
    <section className="animate-card-in rounded-2xl border border-white/10 bg-[#111111]/90 p-3.5 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-[#00ff41] sm:text-base">Live betting snapshot</h2>
        <span className={`rounded-full border px-2.5 py-0.5 text-xs ${stats.isLive ? 'border-[#00ff41]/40 bg-[#00ff41]/12 text-[#00ff41]' : 'border-white/20 bg-white/5 text-[#a0a0a0]'}`}>
          {stats.isLive ? 'Live' : 'Refreshing'}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-[#111111] px-3 py-2">
          <div className="text-xs text-[#a0a0a0]">Markets</div>
          <div className="text-lg font-semibold text-[#00ff41]">{stats.markets}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-[#111111] px-3 py-2">
          <div className="text-xs text-[#a0a0a0]">Agents</div>
          <div className="text-lg font-semibold text-[#00ff41]">{stats.agents}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-[#111111] px-3 py-2">
          <div className="text-xs text-[#a0a0a0]">Bets placed</div>
          <div className="text-lg font-semibold text-[#00ff41]">{stats.bets}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-[#111111] px-3 py-2">
          <div className="text-xs text-[#a0a0a0]">Strongest call</div>
          <div className="truncate text-sm font-semibold text-[#a0a0a0]">{stats.strongestView}</div>
        </div>
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

        if (!mounted) {
          return;
        }

        setAgents(liveAgents);
        setBroadcasts(allBroadcasts);
      } catch {
        if (mounted) {
          setAgents(DEMO_AGENTS);
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

  const latestByAddress = useMemo(() => {
    const map = new Map<string, AgentBroadcast>();
    const sorted = [...broadcasts].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
    for (const event of sorted) {
      if (
        event.type !== 'MarketBroadcast' &&
        event.type !== 'NegotiationIntent' &&
        event.type !== 'TradeRationale'
      ) {
        continue;
      }
      const key = event.agentAddress.toLowerCase();
      if (!map.has(key)) {
        map.set(key, event);
      }
    }
    return map;
  }, [broadcasts]);

  return (
    <section className="animate-card-in rounded-2xl border border-white/10 bg-[#111111]/85 p-3.5 sm:p-4">
      <h2 className="text-sm font-semibold text-[#00ff41] sm:text-base">Agents at a glance</h2>
      <p className="mt-1 text-xs text-[#a0a0a0]">Quick view of each agent&apos;s latest stance.</p>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {agents.map((agent) => {
          const identity = getAgentDisplayIdentity({
            address: agent.address,
            name: agent.name,
            ensNode: agent.ensNode,
          });
          const latest = latestByAddress.get(agent.address.toLowerCase());

          return (
            <article
              key={agent.address}
              className="rounded-xl border border-white/10 bg-[#111111] px-3 py-2"
            >
              <div className="text-sm font-semibold text-[#00ff41]">{identity.displayName}</div>
              {latest ? (
                <div className="mt-1.5 text-xs text-[#a0a0a0]">
                  <span className="font-semibold text-[#00ff41]">
                    {latest.side ? latest.side.toUpperCase() : 'Watching'}
                  </span>
                  {' '}with {Math.round(latest.confidence)}% confidence
                  {latest.stakeEth ? `, stake ${latest.stakeEth} ETH` : ''}
                </div>
              ) : (
                <div className="mt-1.5 text-xs text-[#a0a0a0]">No active bet narrative yet.</div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

export default function Home() {
  const [rpcUrl] = useState(ARBITRUM_SEPOLIA_RPC_URL);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const config = useMemo(() => {
    return {
      ...DEPLOYED_CONFIG,
      rpcUrl,
    };
  }, [rpcUrl]);

  return (
    <main className="min-h-screen bg-[#0a0a0a] px-3 py-3 text-[#00ff41] sm:px-4 sm:py-4 md:px-6 md:py-6">
      <div className="mx-auto max-w-[1600px] space-y-3.5 sm:space-y-4">
        <BrandHeader
          showAdvanced={showAdvanced}
          onToggleAdvanced={() => {
            setShowAdvanced((prev) => !prev);
          }}
        />

        <AudienceOverview />
        <AgentHighlights />

        <div className="grid grid-cols-1 gap-3.5 sm:gap-4 xl:grid-cols-12">
          <section className="xl:col-span-8">
            <MarketList config={config} showAdvanced={showAdvanced} />
          </section>

          <aside className="space-y-4 xl:col-span-4">
            <AgentFeed config={config} showAdvanced={showAdvanced} />
          </aside>
        </div>
      </div>
    </main>
  );
}
