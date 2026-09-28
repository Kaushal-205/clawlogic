'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { AgentInfo } from '@clawlogic/sdk';
import { DEFAULT_CONFIG, getAgentsSeenInFeed } from '@/lib/client';
import { useClawlogicData, type ClawlogicData } from '@/lib/use-clawlogic-data';

export interface ClawlogicContextValue extends ClawlogicData {
  /** lowercase marketId -> question */
  marketQuestions: Map<string, string>;
  /** Registered agents, or agents seen in the feed when the registry can't be read. */
  rosterAgents: AgentInfo[];
  /** Where rosterAgents came from, for labels. */
  rosterNote: string;
}

const ClawlogicContext = createContext<ClawlogicContextValue | null>(null);

export function ClawlogicDataProvider({ children }: { children: ReactNode }) {
  const data = useClawlogicData(DEFAULT_CONFIG);

  const value = useMemo<ClawlogicContextValue>(() => {
    const feedAgents = getAgentsSeenInFeed(data.broadcasts);
    const rosterFromFeed = data.usingSampleAgents && feedAgents.length > 0;
    return {
      ...data,
      marketQuestions: new Map(data.markets.map((market) => [market.marketId.toLowerCase(), market.description])),
      rosterAgents: rosterFromFeed ? feedAgents : data.agents,
      rosterNote: rosterFromFeed ? 'seen in live feed' : data.usingSampleAgents ? 'sample data' : 'registered',
    };
  }, [data]);

  return <ClawlogicContext.Provider value={value}>{children}</ClawlogicContext.Provider>;
}

export function useClawlogic(): ClawlogicContextValue {
  const value = useContext(ClawlogicContext);
  if (!value) throw new Error('useClawlogic must be used inside ClawlogicDataProvider');
  return value;
}
