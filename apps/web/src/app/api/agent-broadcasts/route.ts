import { promises as fs } from 'fs';
import { dirname, resolve } from 'path';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

type BroadcastType =
  | 'MarketBroadcast'
  | 'TradeRationale'
  | 'NegotiationIntent'
  | 'Onboarding';

interface AgentBroadcastEvent {
  id: string;
  type: BroadcastType;
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

interface IncomingBroadcast {
  type: BroadcastType;
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
}

const LOCAL_FILE = resolve(process.cwd(), 'public/agent-broadcasts.json');
const KV_KEY = process.env.AGENT_BROADCAST_KV_KEY ?? 'clawlogic:agent_broadcasts';
const MAX_EVENTS = 300;

function hasKvConfig(): boolean {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

function toApiEvent(payload: IncomingBroadcast): AgentBroadcastEvent {
  return {
    ...payload,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    timestamp: new Date().toISOString(),
  };
}

function isValidPayload(value: unknown): value is IncomingBroadcast {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  const ensNameValid =
    candidate.ensName === undefined || typeof candidate.ensName === 'string';
  const ensNodeValid =
    candidate.ensNode === undefined || typeof candidate.ensNode === 'string';
  const sessionIdValid =
    candidate.sessionId === undefined || typeof candidate.sessionId === 'string';
  const intentHashValid =
    candidate.intentHash === undefined || typeof candidate.intentHash === 'string';
  const intentSignatureValid =
    candidate.intentSignature === undefined || typeof candidate.intentSignature === 'string';
  const tradeTxHashValid =
    candidate.tradeTxHash === undefined || typeof candidate.tradeTxHash === 'string';
  return (
    typeof candidate.type === 'string' &&
    typeof candidate.agent === 'string' &&
    typeof candidate.agentAddress === 'string' &&
    typeof candidate.reasoning === 'string' &&
    typeof candidate.confidence === 'number' &&
    ensNameValid &&
    ensNodeValid &&
    sessionIdValid &&
    intentHashValid &&
    intentSignatureValid &&
    tradeTxHashValid
  );
}

async function kvRequest(path: string): Promise<any> {
  const base = process.env.KV_REST_API_URL!;
  const token = process.env.KV_REST_API_TOKEN!;
  const response = await fetch(`${base}${path}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: 'no-store',
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`KV request failed (${response.status}): ${text}`);
  }
  return response.json();
}

async function readFromKv(): Promise<AgentBroadcastEvent[]> {
  const key = encodeURIComponent(KV_KEY);
  const result = await kvRequest(`/lrange/${key}/0/${MAX_EVENTS - 1}`);
  const items = Array.isArray(result?.result) ? result.result : [];
  const parsed: AgentBroadcastEvent[] = [];
  for (const raw of items) {
    if (typeof raw !== 'string') {
      continue;
    }
    try {
      parsed.push(JSON.parse(raw) as AgentBroadcastEvent);
    } catch {
      // Skip malformed entries.
    }
  }
  return parsed;
}

async function writeToKv(event: AgentBroadcastEvent): Promise<void> {
  const key = encodeURIComponent(KV_KEY);
  const payload = encodeURIComponent(JSON.stringify(event));
  await kvRequest(`/lpush/${key}/${payload}`);
  await kvRequest(`/ltrim/${key}/0/${MAX_EVENTS - 1}`);
}

async function readFromLocalFile(): Promise<AgentBroadcastEvent[]> {
  try {
    const text = await fs.readFile(LOCAL_FILE, 'utf-8');
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? (parsed as AgentBroadcastEvent[]) : [];
  } catch {
    return [];
  }
}

async function writeToLocalFile(event: AgentBroadcastEvent): Promise<void> {
  const current = await readFromLocalFile();
  const next = [event, ...current].slice(0, MAX_EVENTS);
  await fs.mkdir(dirname(LOCAL_FILE), { recursive: true });
  await fs.writeFile(LOCAL_FILE, JSON.stringify(next, null, 2), 'utf-8');
}

export async function GET(): Promise<Response> {
  try {
    const events = hasKvConfig()
      ? await readFromKv()
      : await readFromLocalFile();
    return NextResponse.json(events);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: 'Failed to load broadcasts', details: msg },
      { status: 500 },
    );
  }
}

export async function POST(request: Request): Promise<Response> {
  const requiredKey = process.env.AGENT_BROADCAST_API_KEY;
  if (requiredKey) {
    const key = request.headers.get('x-agent-key');
    if (!key || key !== requiredKey) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!isValidPayload(payload)) {
    return NextResponse.json({ error: 'Invalid broadcast payload' }, { status: 400 });
  }

  const event = toApiEvent(payload);

  try {
    if (hasKvConfig()) {
      await writeToKv(event);
    } else {
      await writeToLocalFile(event);
    }
    return NextResponse.json({ ok: true, event });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: 'Failed to persist broadcast', details: msg },
      { status: 500 },
    );
  }
}
