import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export type AgentBroadcastType =
  | 'MarketBroadcast'
  | 'TradeRationale'
  | 'NegotiationIntent'
  | 'Onboarding';

export interface AgentBroadcastEvent {
  id: string;
  type: AgentBroadcastType;
  agent: string;
  agentAddress: `0x${string}`;
  ensName?: string;
  ensNode?: `0x${string}`;
  marketId?: `0x${string}`;
  sessionId?: string;
  side?: 'yes' | 'no';
  stakeEth?: string;
  intentHash?: `0x${string}`;
  intentSignature?: `0x${string}`;
  tradeTxHash?: `0x${string}`;
  confidence: number;
  reasoning: string;
  timestamp: string;
}

const DEFAULT_BROADCAST_FILE = resolve(
  __dirname,
  '../../web/public/agent-broadcasts.json',
);

const MAX_EVENTS = 300;
const DEFAULT_ENDPOINT = process.env.AGENT_BROADCAST_ENDPOINT;

function getBroadcastFile(): string {
  return process.env.AGENT_BROADCAST_FILE || DEFAULT_BROADCAST_FILE;
}

async function postToEndpoint(
  event: Omit<AgentBroadcastEvent, 'id' | 'timestamp'>,
): Promise<boolean> {
  const endpoint = DEFAULT_ENDPOINT;
  if (!endpoint) {
    return false;
  }

  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };
  if (process.env.AGENT_BROADCAST_API_KEY) {
    headers['x-agent-key'] = process.env.AGENT_BROADCAST_API_KEY;
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(event),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Broadcast endpoint rejected event (${response.status}): ${text}`);
  }

  return true;
}

async function readExisting(filePath: string): Promise<AgentBroadcastEvent[]> {
  try {
    const text = await readFile(filePath, 'utf-8');
    const parsed = JSON.parse(text) as AgentBroadcastEvent[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function publishAgentBroadcast(
  event: Omit<AgentBroadcastEvent, 'id' | 'timestamp'>,
): Promise<void> {
  if (DEFAULT_ENDPOINT) {
    await postToEndpoint(event);
    return;
  }

  const filePath = getBroadcastFile();
  const current = await readExisting(filePath);
  const next: AgentBroadcastEvent = {
    ...event,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    timestamp: new Date().toISOString(),
  };

  const merged = [next, ...current].slice(0, MAX_EVENTS);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(merged, null, 2), 'utf-8');
}
