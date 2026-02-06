/**
 * Yellow Network (ERC-7824) Integration Types
 *
 * Types for off-chain agent signaling via Nitrolite state channels.
 * Agents exchange position intents off-chain before committing on-chain.
 */

/**
 * A signed position intent that agents exchange off-chain via Yellow Network.
 * Represents an agent's desired position in a prediction market.
 */
export interface PositionIntent {
  /** The on-chain market ID (bytes32) */
  marketId: `0x${string}`;
  /** Which outcome the agent wants to hold */
  outcome: 'yes' | 'no';
  /** Amount in ETH (as a string for precision) */
  amount: string;
  /** The agent's on-chain address */
  agent: `0x${string}`;
  /** Unix timestamp when the intent was created */
  timestamp: number;
}

/**
 * Result of a negotiation between two agents via Yellow Network.
 */
export interface NegotiationResult {
  /** Alpha's position intent */
  alphaIntent: PositionIntent;
  /** Beta's position intent */
  betaIntent: PositionIntent;
  /** Whether both agents agreed on complementary positions */
  agreed: boolean;
  /** The Yellow Network app session ID (if live session was used) */
  sessionId?: string;
  /** Whether this was a simulated negotiation (no live ClearNode) */
  simulated: boolean;
}

// ---------------------------------------------------------------------------
// Yellow Network Session Types
// ---------------------------------------------------------------------------

/**
 * Configuration for connecting to Yellow Network's ClearNode.
 */
export interface YellowConfig {
  /** ClearNode WebSocket endpoint */
  clearNodeUrl: string;
  /** Connection timeout in milliseconds */
  connectionTimeoutMs: number;
  /** Whether to fall back to local simulation if ClearNode is unreachable */
  enableSimulationFallback: boolean;
}

/**
 * Represents a live Yellow Network app session between two agents.
 */
export interface YellowSession {
  /** The app session ID returned by ClearNode */
  sessionId: string;
  /** Whether the session is currently active */
  active: boolean;
  /** Protocol identifier for this application */
  protocol: string;
  /** Participant addresses */
  participants: [`0x${string}`, `0x${string}`];
  /** Intents exchanged during this session */
  intents: PositionIntent[];
}

/**
 * Message types exchanged within a Yellow Network app session.
 */
export type YellowMessageType =
  | 'position_intent'
  | 'intent_ack'
  | 'negotiation_complete';

/**
 * Application-level message sent within a Yellow Network session.
 */
export interface YellowAppMessage {
  type: YellowMessageType;
  payload: PositionIntent | NegotiationResult;
  sender: `0x${string}`;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default ClearNode WebSocket URL */
export const CLEARNODE_WS_URL = 'wss://clearnet.yellow.com/ws';

/** Protocol identifier for $CLAWLOGIC prediction market signaling */
export const CLAWLOGIC_PROTOCOL = 'clawlogic-prediction-market-v1';

/** Default connection timeout (5 seconds) */
export const DEFAULT_CONNECTION_TIMEOUT_MS = 5000;

/** Default Yellow Network configuration */
export const DEFAULT_YELLOW_CONFIG: YellowConfig = {
  clearNodeUrl: CLEARNODE_WS_URL,
  connectionTimeoutMs: DEFAULT_CONNECTION_TIMEOUT_MS,
  enableSimulationFallback: true,
};
