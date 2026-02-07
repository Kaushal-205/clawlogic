'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import type { ClawlogicConfig, MarketEvent } from '@clawlogic/sdk';
import { ClawlogicClient } from '@clawlogic/sdk';
import {
  DEMO_FEED_EVENTS,
  getAgentDisplayIdentity,
  getAgentBroadcasts,
  type AgentDisplayIdentity,
  type AgentBroadcast,
  type DemoFeedEvent,
} from '@/lib/client';

interface AgentFeedProps {
  config: ClawlogicConfig;
}

interface FeedEvent {
  id: string;
  type: string;
  message: string;
  agent?: string;
  agentIdentity?: AgentDisplayIdentity;
  timestamp: Date;
  isNew?: boolean;
}

const EVENT_ICONS: Record<string, string> = {
  MarketInitialized: '+MKT',
  TokensMinted: 'MINT',
  MarketAsserted: 'ASRT',
  MarketResolved: 'RSLV',
  AssertionFailed: 'FAIL',
  AssertionDisputed: 'DISP',
  TokensSettled: 'SETL',
  OutcomeTokenBought: 'BUY_',
  AgentRegistered: '+AGT',
  MarketBroadcast: 'CAST',
  TradeRationale: 'WHY?',
  NegotiationIntent: 'NEGO',
  Onboarding: 'ONBD',
  SYSTEM: 'SYS_',
};

const EVENT_COLORS: Record<string, string> = {
  MarketInitialized: 'text-[#00ff41]',
  TokensMinted: 'text-[#00bfff]',
  MarketAsserted: 'text-[#ffb800]',
  MarketResolved: 'text-[#00ff41]',
  AssertionFailed: 'text-[#ff0040]',
  AssertionDisputed: 'text-[#ff0040]',
  TokensSettled: 'text-[#bb86fc]',
  OutcomeTokenBought: 'text-[#00ff41]',
  AgentRegistered: 'text-[#00e5ff]',
  MarketBroadcast: 'text-[#ffb800]',
  TradeRationale: 'text-[#00e5ff]',
  NegotiationIntent: 'text-[#bb86fc]',
  Onboarding: 'text-[#00ff41]',
  SYSTEM: 'text-[#a0a0a0]',
};

function renderBroadcastMessage(event: AgentBroadcast): string {
  const shortMarket = event.marketId ? `${event.marketId.slice(0, 10)}...` : 'n/a';
  const shortSession = event.sessionId ? `${event.sessionId.slice(0, 10)}...` : '';
  const shortTradeTx = event.tradeTxHash ? `${event.tradeTxHash.slice(0, 10)}...` : '';
  const side = event.side ? event.side.toUpperCase() : 'N/A';
  const confidence = Number.isFinite(event.confidence) ? event.confidence.toFixed(1) : '0.0';

  if (event.type === 'MarketBroadcast') {
    return `Broadcast thesis (${confidence}% conf): ${event.reasoning}`;
  }
  if (event.type === 'NegotiationIntent') {
    const link = shortSession ? ` [session ${shortSession}]` : '';
    return `Intent ${side} ${event.stakeEth ?? '?'} ETH on [${shortMarket}]${link} (${confidence}%): ${event.reasoning}`;
  }
  if (event.type === 'TradeRationale') {
    const txRef = shortTradeTx ? ` [tx ${shortTradeTx}]` : '';
    return `Traded ${side} ${event.stakeEth ?? '?'} ETH on [${shortMarket}]${txRef} (${confidence}%): ${event.reasoning}`;
  }
  return `Onboarding: ${event.reasoning}`;
}

function isAddress(value: string): value is `0x${string}` {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

export default function AgentFeed({ config }: AgentFeedProps) {
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [usingDemo, setUsingDemo] = useState(false);
  const feedRef = useRef<HTMLDivElement>(null);
  const demoIndexRef = useRef(0);
  const seenBroadcastIds = useRef<Set<string>>(new Set());

  const addEvent = useCallback(
    (
      type: string,
      message: string,
      agent?: string,
      agentAddress?: `0x${string}`,
      ensName?: string,
      ensNode?: `0x${string}`,
    ) => {
      let identity: AgentDisplayIdentity | undefined;
      if (agentAddress) {
        identity = getAgentDisplayIdentity({
          address: agentAddress,
          name: agent,
          ensName,
          ensNode,
        });
      } else if (agent && isAddress(agent)) {
        identity = getAgentDisplayIdentity({
          address: agent,
          ensName,
          ensNode,
        });
      }

      const newEvent: FeedEvent = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        type,
        message,
        agent: identity?.displayName ?? agent,
        agentIdentity: identity,
        timestamp: new Date(),
        isNew: true,
      };
      setEvents((prev) => {
        const updated = [newEvent, ...prev].slice(0, 100);
        return updated;
      });
    },
    [],
  );

  const copyAddress = useCallback(async (address: `0x${string}`) => {
    try {
      await navigator.clipboard.writeText(address);
    } catch {
      // Ignore clipboard failures silently in feed view.
    }
  }, []);

  // Try to connect to live contract events
  useEffect(() => {
    let unwatchMarkets: (() => void) | undefined;
    let unwatchAgents: (() => void) | undefined;
    let demoInterval: ReturnType<typeof setInterval> | undefined;
    let broadcastInterval: ReturnType<typeof setInterval> | undefined;

    const syncBroadcasts = async () => {
      const broadcasts = await getAgentBroadcasts();
      const sorted = [...broadcasts].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );

      for (const item of sorted) {
        if (seenBroadcastIds.current.has(item.id)) {
          continue;
        }
        seenBroadcastIds.current.add(item.id);
        addEvent(
          item.type,
          renderBroadcastMessage(item),
          item.agent,
          item.agentAddress,
          item.ensName,
          item.ensNode,
        );
      }
    };

    const connectLive = () => {
      try {
        const client = new ClawlogicClient(config);

        unwatchMarkets = client.watchMarketEvents((event: MarketEvent) => {
          const agentAddr = (event.args?.['agent'] as string) ??
            (event.args?.['asserter'] as string) ??
            (event.args?.['creator'] as string);
          const agentAddress = isAddress(agentAddr) ? agentAddr : undefined;
          const shortMkt = event.marketId.slice(0, 10);

          const messages: Record<string, string> = {
            MarketInitialized: `New market created [${shortMkt}...]`,
            TokensMinted: `Minted tokens on [${shortMkt}...]`,
            OutcomeTokenBought: `Executed directional buy on [${shortMkt}...]`,
            MarketAsserted: `Asserted outcome on [${shortMkt}...]`,
            MarketResolved: `Market [${shortMkt}...] resolved`,
            AssertionFailed: `Assertion failed on [${shortMkt}...]`,
            AssertionDisputed: `Assertion disputed on [${shortMkt}...]`,
            TokensSettled: `Settled tokens on [${shortMkt}...]`,
          };

          addEvent(
            event.type,
            messages[event.type] || `${event.type} on [${shortMkt}...]`,
            undefined,
            agentAddress,
          );
        });

        unwatchAgents = client.watchAgentRegistrations((agent, name) => {
          addEvent(
            'AgentRegistered',
            'Agent registered',
            name,
            agent,
          );
        });

        setConnected(true);
        setUsingDemo(false);
        addEvent('SYSTEM', 'Connected to Arbitrum Sepolia. Watching for events...');
        void syncBroadcasts();
      } catch {
        // Fallback to demo mode
        startDemoFeed();
      }
    };

    const startDemoFeed = () => {
      setUsingDemo(true);
      setConnected(true);
      addEvent('SYSTEM', 'Demo mode -- showing simulated agent activity');

      // Load initial demo events
      const initialEvents: FeedEvent[] = DEMO_FEED_EVENTS.map((de: DemoFeedEvent) => {
        const agentAddress = de.agent && isAddress(de.agent) ? de.agent : undefined;
        const identity = agentAddress
          ? getAgentDisplayIdentity({ address: agentAddress })
          : undefined;
        return {
          id: de.id,
          type: de.type,
          message: de.message,
          agent: identity?.displayName ?? de.agent,
          agentIdentity: identity,
          timestamp: de.timestamp,
          isNew: false,
        };
      });
      setEvents(initialEvents.reverse());

      // Add new demo events periodically
      demoIndexRef.current = 0;
      const demoMessages = [
        {
          type: 'TokensMinted',
          message: 'Minted 0.5 ETH -> outcome tokens on market 0xa1b2...',
          agent: 'alpha.clawlogic.eth',
          agentAddress: '0xA1fa7c3B6Ee43d96C2E4b8f94D71Ce80AbB1D234' as `0x${string}`,
        },
        {
          type: 'MarketBroadcast',
          message: 'Broadcast thesis: short-term momentum favors upside.',
          agent: 'alpha.clawlogic.eth',
          agentAddress: '0xA1fa7c3B6Ee43d96C2E4b8f94D71Ce80AbB1D234' as `0x${string}`,
        },
        {
          type: 'NegotiationIntent',
          message: 'Intent NO 0.01 ETH (67.0% conf) on 0xa1b2...',
          agent: 'beta.clawlogic.eth',
          agentAddress: '0xbe7a22222222222222222222222222222222aaaa' as `0x${string}`,
        },
        {
          type: 'TradeRationale',
          message: 'Traded YES 0.005 ETH due to favorable risk/reward.',
          agent: 'alpha.clawlogic.eth',
          agentAddress: '0xA1fa7c3B6Ee43d96C2E4b8f94D71Ce80AbB1D234' as `0x${string}`,
        },
        {
          type: 'MarketAsserted',
          message: 'Asserted "yes" on market 0xcafe... with bond',
          agent: 'delta.clawlogic.eth',
          agentAddress: '0xde1a33333333333333333333333333333333bbbb' as `0x${string}`,
        },
        {
          type: 'TokensMinted',
          message: 'Minted 0.3 ETH -> outcome tokens on market 0xcafe...',
          agent: 'beta.clawlogic.eth',
          agentAddress: '0xbe7a22222222222222222222222222222222aaaa' as `0x${string}`,
        },
        {
          type: 'MarketInitialized',
          message: 'New market: "Will BTC dominance exceed 55% this month?"',
          agent: 'alpha.clawlogic.eth',
          agentAddress: '0xA1fa7c3B6Ee43d96C2E4b8f94D71Ce80AbB1D234' as `0x${string}`,
        },
        {
          type: 'TokensSettled',
          message: 'Settled 1.2 ETH from market 0xa1b2...',
          agent: 'alpha.clawlogic.eth',
          agentAddress: '0xA1fa7c3B6Ee43d96C2E4b8f94D71Ce80AbB1D234' as `0x${string}`,
        },
        {
          type: 'AgentRegistered',
          message: 'Agent registered',
          agent: 'gamma.clawlogic.eth',
          agentAddress: '0x7777444433332222111100009999888877776666' as `0x${string}`,
        },
        {
          type: 'TokensMinted',
          message: 'Minted 2.0 ETH -> outcome tokens on market 0xa1b2...',
          agent: 'gamma.clawlogic.eth',
          agentAddress: '0x7777444433332222111100009999888877776666' as `0x${string}`,
        },
        {
          type: 'AssertionDisputed',
          message: 'Disputed assertion on market 0xcafe...',
          agent: 'beta.clawlogic.eth',
          agentAddress: '0xbe7a22222222222222222222222222222222aaaa' as `0x${string}`,
        },
      ];

      demoInterval = setInterval(() => {
        const idx = demoIndexRef.current % demoMessages.length;
        const msg = demoMessages[idx];
        addEvent(msg.type, msg.message, msg.agent, msg.agentAddress);
        demoIndexRef.current++;
      }, 8000);

      void syncBroadcasts();
    };

    connectLive();
    broadcastInterval = setInterval(() => {
      void syncBroadcasts();
    }, 7000);

    return () => {
      unwatchMarkets?.();
      unwatchAgents?.();
      if (demoInterval) clearInterval(demoInterval);
      if (broadcastInterval) clearInterval(broadcastInterval);
    };
  }, [config, addEvent]);

  // Auto-scroll to top when new events arrive
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = 0;
    }
  }, [events.length]);

  const formatTimestamp = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <div className="border border-[#00ff41]/20 rounded-sm bg-black/80 overflow-hidden">
      {/* Terminal header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#00ff41]/10 bg-[#111111]">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[#a0a0a0] font-mono tracking-wider">
            LIVE_FEED
          </span>
          {usingDemo && (
            <span className="text-[9px] text-[#ffb800] bg-[#ffb800]/10 px-1.5 py-0.5 rounded-sm">
              DEMO
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-mono ${connected ? 'text-[#00ff41]' : 'text-[#ff0040]'}`}>
            {connected ? (
              <>
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#00ff41] mr-1 status-pulse" />
                ONLINE
              </>
            ) : (
              <>
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#ff0040] mr-1" />
                OFFLINE
              </>
            )}
          </span>
          <span className="text-[10px] text-[#a0a0a0] opacity-40">
            [{events.length}]
          </span>
        </div>
      </div>

      {/* Event log */}
      <div
        ref={feedRef}
        className="h-80 overflow-y-auto p-1 font-mono text-[11px] space-y-0"
      >
        {events.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="text-[#a0a0a0] opacity-40 mb-1">
                LISTENING FOR AGENT ACTIVITY...
              </div>
              <span className="text-[#00ff41] cursor-blink">_</span>
            </div>
          </div>
        ) : (
          events.map((event) => (
            <div
              key={event.id}
              className={`
                flex gap-0 hover:bg-[#00ff41]/5 px-2 py-1 rounded-sm
                ${event.isNew ? 'animate-slide-in' : ''}
              `}
            >
              {/* Timestamp */}
              <span className="text-[#a0a0a0] opacity-30 shrink-0 w-[65px]">
                {formatTimestamp(event.timestamp)}
              </span>

              {/* Event type badge */}
              <span
                className={`
                  shrink-0 w-[42px] text-[10px] font-bold
                  ${EVENT_COLORS[event.type] || 'text-[#00ff41]'}
                `}
              >
                {EVENT_ICONS[event.type] || event.type.slice(0, 4).toUpperCase()}
              </span>

              {/* Message */}
              <div className="flex min-w-0 items-center ml-1 gap-1">
                {event.agentIdentity && (
                  <div className="flex items-center gap-1 shrink-0 max-w-[170px]">
                    <span
                      className="text-[#00ff41] text-[10px] truncate"
                      title={`${event.agentIdentity.displayName}\n${event.agentIdentity.address}`}
                    >
                      {event.agentIdentity.displayName}
                    </span>
                    {event.agentIdentity.identityProof === 'ens-linked' && (
                      <span
                        className="text-[8px] text-[#ffb800] border border-[#ffb800]/30 px-1 rounded-sm"
                        title="ENS linked on-chain"
                      >
                        ENS
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        void copyAddress(event.agentIdentity!.address);
                      }}
                      className="text-[8px] text-[#a0a0a0] hover:text-[#00ff41] border border-[#00ff41]/20 px-1 rounded-sm"
                      title={`Copy ${event.agentIdentity.address}`}
                      aria-label={`Copy address for ${event.agentIdentity.displayName}`}
                    >
                      COPY
                    </button>
                  </div>
                )}
                {!event.agentIdentity && event.agent && (
                  <span className="text-[#00e5ff] text-[10px] shrink-0 max-w-[130px] truncate">
                    {event.agent}
                  </span>
                )}
                <span className="text-[#a0a0a0] opacity-70 truncate">
                  {event.message}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer status */}
      <div className="px-3 py-1.5 border-t border-[#00ff41]/10 bg-[#111111] flex items-center justify-between">
        <span className="text-[9px] text-[#a0a0a0] opacity-40 font-mono">
          Arbitrum Sepolia / 421614
        </span>
        <span className="text-[9px] text-[#a0a0a0] opacity-40 font-mono">
          UMA OOV3 / 120s liveness
        </span>
      </div>
    </div>
  );
}
