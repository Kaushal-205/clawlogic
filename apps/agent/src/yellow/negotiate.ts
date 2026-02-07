/**
 * Yellow Network Negotiation Protocol
 *
 * Orchestrates off-chain position negotiation between two agents
 * using Yellow Network state channels (ERC-7824).
 *
 * Flow:
 *   1. Alpha creates an app session for a specific market
 *   2. Beta joins the session
 *   3. Alpha sends "I want YES at 0.01 ETH"
 *   4. Beta sends "I want NO at 0.01 ETH"
 *   5. Both agree (complementary positions), session closes
 *   6. Returns NegotiationResult for on-chain execution
 *
 * If ClearNode is unreachable, the entire negotiation is simulated locally.
 */

import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname, resolve } from 'path';
import { type Hex, encodePacked, keccak256, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import {
  type PositionIntent,
  type NegotiationResult,
  type YellowConfig,
  DEFAULT_YELLOW_CONFIG,
} from './types.js';

import {
  createYellowSession,
  joinYellowSession,
  sendPositionIntent,
  closeSession,
} from './channel.js';

// ---------------------------------------------------------------------------
// Logging helpers
// ---------------------------------------------------------------------------

const LOG_PREFIX = '[Yellow/Negotiate]';
const DEFAULT_TRANSCRIPT_FILE = resolve(
  process.cwd(),
  '.clawlogic/yellow-negotiations.json',
);

function log(msg: string): void {
  console.log(`  ${LOG_PREFIX} ${msg}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

interface TranscriptRecord {
  sessionId?: string;
  simulated: boolean;
  marketId: `0x${string}`;
  agreed: boolean;
  alphaIntent: PositionIntent;
  betaIntent: PositionIntent;
  recordedAt: string;
}

function transcriptPath(): string {
  return process.env.YELLOW_TRANSCRIPT_FILE ?? DEFAULT_TRANSCRIPT_FILE;
}

async function readTranscripts(): Promise<TranscriptRecord[]> {
  try {
    const text = await readFile(transcriptPath(), 'utf-8');
    const parsed = JSON.parse(text) as TranscriptRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function appendTranscript(record: TranscriptRecord): Promise<string> {
  const filePath = transcriptPath();
  const existing = await readTranscripts();
  const next = [record, ...existing].slice(0, 200);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(next, null, 2), 'utf-8');
  return filePath;
}

async function signIntent(
  privateKey: Hex,
  intent: PositionIntent,
): Promise<PositionIntent> {
  const account = privateKeyToAccount(privateKey);
  const intentHash = keccak256(
    encodePacked(
      ['bytes32', 'address', 'uint8', 'uint256', 'uint32', 'uint64'],
      [
        intent.marketId,
        intent.agent,
        intent.outcome === 'yes' ? 1 : 0,
        parseEther(intent.amount),
        intent.confidenceBps,
        BigInt(intent.timestamp),
      ],
    ),
  );
  const signature = await account.signMessage({
    message: { raw: intentHash },
  });

  return {
    ...intent,
    intentHash,
    signature,
  };
}

// ---------------------------------------------------------------------------
// Local Simulation
// ---------------------------------------------------------------------------

/**
 * Simulates the negotiation process locally when ClearNode is unreachable.
 * This produces the same NegotiationResult structure as a live negotiation,
 * but without actual WebSocket communication.
 *
 * The simulation demonstrates the concept:
 * - Alpha wants YES at a given price
 * - Beta wants NO at the same price (complementary)
 * - Both agree, producing a valid NegotiationResult
 */
async function simulateNegotiation(
  alphaPrivateKey: Hex,
  betaPrivateKey: Hex,
  alphaAddress: `0x${string}`,
  betaAddress: `0x${string}`,
  marketId: `0x${string}`,
  amount: string = '0.01',
): Promise<NegotiationResult> {
  const simulatedSessionId = keccak256(
    encodePacked(
      ['bytes32', 'address', 'address', 'uint256'],
      [marketId, alphaAddress, betaAddress, BigInt(Date.now())],
    ),
  );

  log('--- Simulation Mode (ClearNode unavailable) ---');
  log('Simulating ERC-7824 state channel negotiation...');
  log('');

  // Step 1: Alpha creates session
  log(`[Step 1] Alpha creates app session on Yellow Network`);
  log(`  Protocol: clawlogic-prediction-market-v1`);
  log(`  Market:   ${marketId.slice(0, 18)}...`);
  log(`  Session:  ${simulatedSessionId.slice(0, 18)}...`);
  await sleep(500);

  // Step 2: Beta joins session
  log(`[Step 2] Beta joins the session`);
  log(`  Participants: [${alphaAddress.slice(0, 10)}..., ${betaAddress.slice(0, 10)}...]`);
  await sleep(500);

  // Step 3: Alpha sends position intent
  const alphaIntent = await signIntent(alphaPrivateKey, {
    marketId,
    outcome: 'yes',
    amount,
    agent: alphaAddress,
    reasoning:
      'Momentum + macro trend signals imply higher probability of upside realization.',
    confidenceBps: 7200,
    timestamp: Date.now(),
  });

  log(`[Step 3] Alpha sends position intent via state channel`);
  log(`  Intent: YES @ ${amount} ETH`);
  log(`  Confidence: ${(alphaIntent.confidenceBps / 100).toFixed(2)}%`);
  log(`  Signed by: ${alphaAddress.slice(0, 10)}...`);
  await sleep(500);

  // Step 4: Beta sends complementary position intent
  const betaIntent = await signIntent(betaPrivateKey, {
    marketId,
    outcome: 'no',
    amount,
    agent: betaAddress,
    reasoning:
      'Contrarian mean-reversion model indicates downside risk is currently underpriced.',
    confidenceBps: 6700,
    timestamp: Date.now(),
  });

  log(`[Step 4] Beta sends position intent via state channel`);
  log(`  Intent: NO @ ${amount} ETH`);
  log(`  Confidence: ${(betaIntent.confidenceBps / 100).toFixed(2)}%`);
  log(`  Signed by: ${betaAddress.slice(0, 10)}...`);
  await sleep(500);

  // Step 5: Both agree
  log(`[Step 5] Intents are complementary -- agents AGREE`);
  log(`  Alpha: YES @ ${amount} ETH`);
  log(`  Beta:  NO  @ ${amount} ETH`);
  log(`  Total liquidity: ${(parseFloat(amount) * 2).toFixed(4)} ETH`);
  await sleep(300);

  // Step 6: Session closes
  log(`[Step 6] Closing state channel session`);
  log(`  Session ${simulatedSessionId.slice(0, 18)}... closed.`);
  log('');
  log('--- Simulation Complete ---');

  return {
    alphaIntent,
    betaIntent,
    agreed: true,
    sessionId: simulatedSessionId,
    simulated: true,
  };
}

// ---------------------------------------------------------------------------
// Live Negotiation
// ---------------------------------------------------------------------------

/**
 * Performs a live negotiation via Yellow Network ClearNode.
 * Creates a session, exchanges intents, and returns the result.
 */
async function liveNegotiation(
  alphaPrivateKey: Hex,
  betaPrivateKey: Hex,
  alphaAddress: `0x${string}`,
  betaAddress: `0x${string}`,
  marketId: `0x${string}`,
  amount: string,
  config: YellowConfig,
): Promise<NegotiationResult> {
  log('--- Live Mode (ClearNode connected) ---');
  log('');

  // Step 1: Alpha creates session
  log('[Step 1] Alpha creates app session on Yellow Network');
  const alphaSession = await createYellowSession(
    alphaPrivateKey,
    marketId,
    betaAddress,
    config,
  );

  if (!alphaSession) {
    // Fallback to simulation if session creation fails
    log('Session creation returned null -- falling back to simulation.');
    return simulateNegotiation(
      alphaPrivateKey,
      betaPrivateKey,
      alphaAddress,
      betaAddress,
      marketId,
      amount,
    );
  }

  // Step 2: Beta joins session
  log('[Step 2] Beta joins the session');
  const betaSession = await joinYellowSession(
    betaPrivateKey,
    alphaSession.sessionId,
    config,
  );

  if (!betaSession) {
    await closeSession(alphaSession);
    log('Beta join failed -- falling back to simulation.');
    return simulateNegotiation(
      alphaPrivateKey,
      betaPrivateKey,
      alphaAddress,
      betaAddress,
      marketId,
      amount,
    );
  }

  // Step 3: Alpha sends position intent
  const alphaIntent = await signIntent(alphaPrivateKey, {
    marketId,
    outcome: 'yes',
    amount,
    agent: alphaAddress,
    reasoning:
      'Momentum + macro trend signals imply higher probability of upside realization.',
    confidenceBps: 7200,
    timestamp: Date.now(),
  });

  log('[Step 3] Alpha sends position intent via state channel');
  log(`  Intent: YES @ ${amount} ETH`);
  log(`  Confidence: ${(alphaIntent.confidenceBps / 100).toFixed(2)}%`);
  await sendPositionIntent(alphaSession, alphaIntent);
  await sleep(300);

  // Step 4: Beta sends complementary position intent
  const betaIntent = await signIntent(betaPrivateKey, {
    marketId,
    outcome: 'no',
    amount,
    agent: betaAddress,
    reasoning:
      'Contrarian mean-reversion model indicates downside risk is currently underpriced.',
    confidenceBps: 6700,
    timestamp: Date.now(),
  });

  log('[Step 4] Beta sends position intent via state channel');
  log(`  Intent: NO @ ${amount} ETH`);
  log(`  Confidence: ${(betaIntent.confidenceBps / 100).toFixed(2)}%`);
  await sendPositionIntent(betaSession, betaIntent);
  await sleep(300);

  // Step 5: Verify agreement
  log('[Step 5] Intents are complementary -- agents AGREE');
  log(`  Alpha: YES @ ${amount} ETH`);
  log(`  Beta:  NO  @ ${amount} ETH`);

  // Step 6: Close sessions
  log('[Step 6] Closing state channel sessions');
  await closeSession(alphaSession);
  await closeSession(betaSession);

  log('');
  log('--- Live Negotiation Complete ---');

  return {
    alphaIntent,
    betaIntent,
    agreed: true,
    sessionId: alphaSession.sessionId,
    simulated: false,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Orchestrates a complete position negotiation between two agents
 * via Yellow Network (ERC-7824 state channels).
 *
 * This is the main entry point for the Yellow Network integration.
 * It handles both live ClearNode connections and local simulation fallback.
 *
 * @param alphaPrivateKey - Private key for Agent Alpha (hex)
 * @param betaPrivateKey - Private key for Agent Beta (hex)
 * @param marketId - The on-chain market ID to negotiate positions for
 * @param amount - ETH amount each agent will commit (default: '0.01')
 * @param config - Yellow Network configuration (optional)
 * @returns NegotiationResult with both agents' intents and agreement status
 */
export async function negotiatePositions(
  alphaPrivateKey: Hex,
  betaPrivateKey: Hex,
  marketId: `0x${string}`,
  amount: string = '0.01',
  config: YellowConfig = DEFAULT_YELLOW_CONFIG,
): Promise<NegotiationResult> {
  const alphaAddress = privateKeyToAccount(alphaPrivateKey).address as `0x${string}`;
  const betaAddress = privateKeyToAccount(betaPrivateKey).address as `0x${string}`;

  log('Starting off-chain position negotiation via Yellow Network');
  log(`  Alpha:  ${alphaAddress.slice(0, 10)}...`);
  log(`  Beta:   ${betaAddress.slice(0, 10)}...`);
  log(`  Market: ${marketId.slice(0, 18)}...`);
  log(`  Amount: ${amount} ETH each`);
  log('');

  try {
    // Attempt live negotiation first
    const result = await liveNegotiation(
      alphaPrivateKey,
      betaPrivateKey,
      alphaAddress,
      betaAddress,
      marketId,
      amount,
      config,
    );
    const transcriptPath = await appendTranscript({
      sessionId: result.sessionId,
      simulated: result.simulated,
      marketId,
      agreed: result.agreed,
      alphaIntent: result.alphaIntent,
      betaIntent: result.betaIntent,
      recordedAt: new Date().toISOString(),
    });
    return {
      ...result,
      transcriptPath,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`Live negotiation failed: ${msg}`);

    if (config.enableSimulationFallback) {
      log('Falling back to local simulation...');
      const result = await simulateNegotiation(
        alphaPrivateKey,
        betaPrivateKey,
        alphaAddress,
        betaAddress,
        marketId,
        amount,
      );
      const transcriptPath = await appendTranscript({
        sessionId: result.sessionId,
        simulated: result.simulated,
        marketId,
        agreed: result.agreed,
        alphaIntent: result.alphaIntent,
        betaIntent: result.betaIntent,
        recordedAt: new Date().toISOString(),
      });
      return {
        ...result,
        transcriptPath,
      };
    }

    throw err;
  }
}
