'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import type { ClawlogicConfig, MarketEvent } from '@clawlogic/sdk';
import { ClawlogicClient } from '@clawlogic/sdk';
import { DEMO_FEED_EVENTS, type DemoFeedEvent } from '@/lib/client';

interface AgentFeedProps {
  config: ClawlogicConfig;
}

interface FeedEvent {
  id: string;
  type: string;
  message: string;
  agent?: string;
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
  AgentRegistered: '+AGT',
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
  AgentRegistered: 'text-[#00e5ff]',
  SYSTEM: 'text-[#a0a0a0]',
};

export default function AgentFeed({ config }: AgentFeedProps) {
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [usingDemo, setUsingDemo] = useState(false);
  const feedRef = useRef<HTMLDivElement>(null);
  const demoIndexRef = useRef(0);

  const addEvent = useCallback((type: string, message: string, agent?: string) => {
    const newEvent: FeedEvent = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      type,
      message,
      agent,
      timestamp: new Date(),
      isNew: true,
    };
    setEvents((prev) => {
      const updated = [newEvent, ...prev].slice(0, 100);
      return updated;
    });
  }, []);

  // Try to connect to live contract events
  useEffect(() => {
    let unwatchMarkets: (() => void) | undefined;
    let unwatchAgents: (() => void) | undefined;
    let demoInterval: ReturnType<typeof setInterval> | undefined;

    const connectLive = () => {
      try {
        const client = new ClawlogicClient(config);

        unwatchMarkets = client.watchMarketEvents((event: MarketEvent) => {
          const agentAddr = (event.args?.['agent'] as string) ??
            (event.args?.['asserter'] as string) ??
            (event.args?.['creator'] as string);
          const shortAddr = agentAddr ? `${agentAddr.slice(0, 6)}...${agentAddr.slice(-4)}` : '';
          const shortMkt = event.marketId.slice(0, 10);

          const messages: Record<string, string> = {
            MarketInitialized: `New market created [${shortMkt}...]${shortAddr ? ` by ${shortAddr}` : ''}`,
            TokensMinted: `${shortAddr || 'Agent'} minted tokens on [${shortMkt}...]`,
            MarketAsserted: `${shortAddr || 'Agent'} asserted outcome on [${shortMkt}...]`,
            MarketResolved: `Market [${shortMkt}...] resolved`,
            AssertionFailed: `Assertion failed on [${shortMkt}...]`,
            AssertionDisputed: `Assertion disputed on [${shortMkt}...]`,
            TokensSettled: `${shortAddr || 'Agent'} settled tokens on [${shortMkt}...]`,
          };

          addEvent(
            event.type,
            messages[event.type] || `${event.type} on [${shortMkt}...]`,
            shortAddr || undefined,
          );
        });

        unwatchAgents = client.watchAgentRegistrations((agent, name) => {
          const shortAddr = `${agent.slice(0, 6)}...${agent.slice(-4)}`;
          addEvent(
            'AgentRegistered',
            `Agent "${name}" registered (${shortAddr})`,
            shortAddr,
          );
        });

        setConnected(true);
        setUsingDemo(false);
        addEvent('SYSTEM', 'Connected to Arbitrum Sepolia. Watching for events...');
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
      const initialEvents: FeedEvent[] = DEMO_FEED_EVENTS.map((de: DemoFeedEvent) => ({
        id: de.id,
        type: de.type,
        message: de.message,
        agent: de.agent,
        timestamp: de.timestamp,
        isNew: false,
      }));
      setEvents(initialEvents.reverse());

      // Add new demo events periodically
      demoIndexRef.current = 0;
      const demoMessages = [
        { type: 'TokensMinted', message: 'AlphaTrader minted 0.5 ETH -> outcome tokens on market 0xa1b2...', agent: '0xA1fa...D234' },
        { type: 'MarketAsserted', message: 'DeltaOracle asserted "yes" on market 0xcafe... with bond', agent: '0xDelta...3bbb' },
        { type: 'TokensMinted', message: 'BetaContrarian minted 0.3 ETH -> outcome tokens on market 0xcafe...', agent: '0xBeta...aaaa' },
        { type: 'MarketInitialized', message: 'New market: "Will BTC dominance exceed 55% this month?"', agent: '0xA1fa...D234' },
        { type: 'TokensSettled', message: 'AlphaTrader settled 1.2 ETH from market 0xa1b2...', agent: '0xA1fa...D234' },
        { type: 'AgentRegistered', message: 'Agent "GammaScout" registered (0xGamma...4ccc)', agent: '0xGamma...4ccc' },
        { type: 'TokensMinted', message: 'GammaScout minted 2.0 ETH -> outcome tokens on market 0xa1b2...', agent: '0xGamma...4ccc' },
        { type: 'AssertionDisputed', message: 'BetaContrarian disputed assertion on market 0xcafe...', agent: '0xBeta...aaaa' },
      ];

      demoInterval = setInterval(() => {
        const idx = demoIndexRef.current % demoMessages.length;
        const msg = demoMessages[idx];
        addEvent(msg.type, msg.message, msg.agent);
        demoIndexRef.current++;
      }, 8000);
    };

    connectLive();

    return () => {
      unwatchMarkets?.();
      unwatchAgents?.();
      if (demoInterval) clearInterval(demoInterval);
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
              <span className="text-[#a0a0a0] opacity-70 truncate ml-1">
                {event.message}
              </span>
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
