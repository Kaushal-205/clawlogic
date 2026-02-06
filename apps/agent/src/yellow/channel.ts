/**
 * Yellow Network State Channel Integration (ERC-7824)
 *
 * Uses the Nitrolite SDK (@erc7824/nitrolite) to establish off-chain
 * communication between agents via ClearNode WebSocket connections.
 *
 * Architecture:
 *   1. Agent connects to ClearNode via WebSocket
 *   2. Agent authenticates using ECDSA signature
 *   3. Agent creates/joins an application session for a specific market
 *   4. Agents exchange signed position intents within the session
 *   5. Session is closed after negotiation completes
 *
 * If ClearNode is unreachable, a local simulation fallback is used
 * so the demo can still run without a live WebSocket connection.
 */

import WebSocket from 'ws';
import { type Hex, type Address, keccak256, encodePacked } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import {
  createECDSAMessageSigner,
  createAuthRequestMessage,
  createAuthVerifyMessage,
  createAppSessionMessage,
  createCloseAppSessionMessage,
  createApplicationMessage,
  RPCProtocolVersion,
  type MessageSigner,
  type RPCAppSessionAllocation,
} from '@erc7824/nitrolite';

import {
  type PositionIntent,
  type YellowConfig,
  type YellowSession,
  type YellowAppMessage,
  CLAWLOGIC_PROTOCOL,
  DEFAULT_YELLOW_CONFIG,
} from './types.js';

// ---------------------------------------------------------------------------
// Logging helpers
// ---------------------------------------------------------------------------

const LOG_PREFIX = '[Yellow/ERC-7824]';

function log(msg: string): void {
  console.log(`  ${LOG_PREFIX} ${msg}`);
}

function logError(msg: string): void {
  console.error(`  ${LOG_PREFIX} ERROR: ${msg}`);
}

// ---------------------------------------------------------------------------
// WebSocket Connection to ClearNode
// ---------------------------------------------------------------------------

/**
 * Attempts to connect to Yellow Network's ClearNode via WebSocket.
 * Returns the WebSocket instance or null if connection fails within timeout.
 */
async function connectToClearNode(
  config: YellowConfig,
): Promise<WebSocket | null> {
  return new Promise((resolve) => {
    log(`Connecting to ClearNode: ${config.clearNodeUrl}`);

    const ws = new WebSocket(config.clearNodeUrl);

    const timeout = setTimeout(() => {
      log('Connection timed out.');
      ws.terminate();
      resolve(null);
    }, config.connectionTimeoutMs);

    ws.on('open', () => {
      clearTimeout(timeout);
      log('Connected to ClearNode.');
      resolve(ws);
    });

    ws.on('error', (err: Error) => {
      clearTimeout(timeout);
      log(`Connection failed: ${err.message}`);
      resolve(null);
    });
  });
}

/**
 * Authenticates with ClearNode using ECDSA signature from agent's private key.
 *
 * Auth flow:
 *   1. Send auth_request with agent address, session key, and application info
 *   2. Receive auth_challenge with a challenge message
 *   3. Sign the challenge and send auth_verify
 *   4. Receive auth_verify confirmation
 */
async function authenticateWithClearNode(
  ws: WebSocket,
  privateKey: Hex,
): Promise<boolean> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      log('Authentication timed out.');
      resolve(false);
    }, 10000);

    const signer = createECDSAMessageSigner(privateKey);
    const account = privateKeyToAccount(privateKey);

    const authHandler = async (data: WebSocket.Data) => {
      try {
        const message = JSON.parse(data.toString());

        // Parse the RPC response format: { res: [requestId, method, params, timestamp], sig: [...] }
        if (message.res && Array.isArray(message.res)) {
          const method = message.res[1];

          if (method === 'auth_challenge') {
            log('Received auth challenge, signing verification...');
            // Sign and send auth verification using the Nitrolite SDK
            const verifyMsg = await createAuthVerifyMessage(signer, message);
            ws.send(verifyMsg);
          } else if (method === 'auth_verify') {
            clearTimeout(timeout);
            ws.removeListener('message', authHandler);
            log(`Authenticated as ${account.address.slice(0, 10)}...`);
            resolve(true);
          } else if (method === 'error') {
            clearTimeout(timeout);
            ws.removeListener('message', authHandler);
            const errorParams = message.res[2];
            logError(`Auth error: ${JSON.stringify(errorParams)}`);
            resolve(false);
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        logError(`Auth message parsing error: ${msg}`);
      }
    };

    ws.on('message', authHandler);

    // Initiate auth request with required fields
    createAuthRequestMessage({
      address: account.address,
      session_key: account.address,
      application: CLAWLOGIC_PROTOCOL,
      allowances: [],
      expires_at: BigInt(Math.floor(Date.now() / 1000) + 3600),
      scope: 'prediction-market',
    }).then((authReqMsg) => {
      ws.send(authReqMsg);
    }).catch((err: unknown) => {
      clearTimeout(timeout);
      const msg = err instanceof Error ? err.message : String(err);
      logError(`Failed to create auth request: ${msg}`);
      resolve(false);
    });
  });
}

// ---------------------------------------------------------------------------
// Session Management
// ---------------------------------------------------------------------------

/**
 * Creates a new application session on Yellow Network for a specific market.
 * Uses the Nitrolite SDK's createAppSessionMessage to construct a signed
 * session request with ERC-7824 state channel semantics.
 *
 * The app session represents a state channel scoped to a specific prediction
 * market, where two agents negotiate positions off-chain before trading on-chain.
 */
export async function createYellowSession(
  agentPrivateKey: Hex,
  marketId: `0x${string}`,
  partnerAddress: `0x${string}`,
  config: YellowConfig = DEFAULT_YELLOW_CONFIG,
): Promise<YellowSession | null> {
  const account = privateKeyToAccount(agentPrivateKey);
  const signer = createECDSAMessageSigner(agentPrivateKey);

  // Attempt to connect to ClearNode
  const ws = await connectToClearNode(config);

  if (!ws) {
    if (config.enableSimulationFallback) {
      log('ClearNode unreachable -- using local simulation.');
      return null;
    }
    throw new Error('Failed to connect to ClearNode and simulation is disabled.');
  }

  // Authenticate
  const authenticated = await authenticateWithClearNode(ws, agentPrivateKey);
  if (!authenticated) {
    ws.close();
    if (config.enableSimulationFallback) {
      log('Authentication failed -- falling back to local simulation.');
      return null;
    }
    throw new Error('ClearNode authentication failed.');
  }

  // Create app session using Nitrolite SDK
  // The RPCAppDefinition specifies the state channel configuration
  const definition = {
    application: CLAWLOGIC_PROTOCOL,
    protocol: RPCProtocolVersion.NitroRPC_0_2,
    participants: [account.address, partnerAddress] as Hex[],
    weights: [50, 50],
    quorum: 100,
    challenge: 0,
    nonce: Date.now(),
  };

  // Initial allocations for both participants (zero-value signaling session)
  const allocations: RPCAppSessionAllocation[] = [
    {
      participant: account.address as Address,
      asset: 'eth',
      amount: '0',
    },
    {
      participant: partnerAddress as Address,
      asset: 'eth',
      amount: '0',
    },
  ];

  try {
    // createAppSessionMessage expects CreateAppSessionRequestParams:
    // { definition: RPCAppDefinition, allocations: RPCAppSessionAllocation[], session_data?: string }
    const sessionMsg = await createAppSessionMessage(signer, {
      definition,
      allocations,
      session_data: JSON.stringify({ marketId }),
    });

    // Send session creation request to ClearNode
    ws.send(sessionMsg);

    // Wait for session ID response
    const sessionId = await new Promise<string>((resolve, reject) => {
      const sessionTimeout = setTimeout(() => {
        reject(new Error('Session creation timed out'));
      }, 10000);

      ws.once('message', (data: WebSocket.Data) => {
        clearTimeout(sessionTimeout);
        try {
          const response = JSON.parse(data.toString());
          // Response format: { res: [requestId, "create_app_session", { app_session_id: "0x..." }, timestamp] }
          if (response.res && response.res[2]?.app_session_id) {
            resolve(response.res[2].app_session_id);
          } else if (response.res && response.res[1] === 'error') {
            reject(new Error(`Session creation failed: ${JSON.stringify(response.res[2])}`));
          } else {
            // Use a deterministic session ID based on market + participants
            const fallbackId = keccak256(
              encodePacked(
                ['bytes32', 'address', 'address'],
                [marketId, account.address, partnerAddress],
              ),
            );
            resolve(fallbackId);
          }
        } catch {
          reject(new Error('Failed to parse session response'));
        }
      });
    });

    log(`Session created: ${sessionId.slice(0, 18)}...`);

    const session: YellowSession = {
      sessionId,
      active: true,
      protocol: CLAWLOGIC_PROTOCOL,
      participants: [account.address, partnerAddress],
      intents: [],
    };

    // Store WebSocket and signer for later use within this session
    (session as any)._ws = ws;
    (session as any)._signer = signer;

    return session;
  } catch (err: unknown) {
    ws.close();
    const msg = err instanceof Error ? err.message : String(err);
    logError(`Session creation failed: ${msg}`);
    if (config.enableSimulationFallback) {
      log('Falling back to local simulation.');
      return null;
    }
    throw err;
  }
}

/**
 * Joins an existing Yellow Network session by connecting to ClearNode
 * and subscribing to the session's messages.
 */
export async function joinYellowSession(
  agentPrivateKey: Hex,
  sessionId: string,
  config: YellowConfig = DEFAULT_YELLOW_CONFIG,
): Promise<YellowSession | null> {
  const account = privateKeyToAccount(agentPrivateKey);

  const ws = await connectToClearNode(config);

  if (!ws) {
    if (config.enableSimulationFallback) {
      log('ClearNode unreachable -- using local simulation for join.');
      return null;
    }
    throw new Error('Failed to connect to ClearNode.');
  }

  const authenticated = await authenticateWithClearNode(ws, agentPrivateKey);
  if (!authenticated) {
    ws.close();
    if (config.enableSimulationFallback) {
      log('Authentication failed -- falling back to local simulation for join.');
      return null;
    }
    throw new Error('ClearNode authentication failed.');
  }

  log(`Joined session: ${sessionId.slice(0, 18)}...`);

  const session: YellowSession = {
    sessionId,
    active: true,
    protocol: CLAWLOGIC_PROTOCOL,
    participants: [account.address as `0x${string}`, '0x0000000000000000000000000000000000000000'],
    intents: [],
  };

  (session as any)._ws = ws;
  (session as any)._signer = createECDSAMessageSigner(agentPrivateKey);

  return session;
}

/**
 * Sends a signed position intent through a Yellow Network session.
 * Uses createApplicationMessage from the Nitrolite SDK to construct
 * a properly signed state channel message.
 */
export async function sendPositionIntent(
  session: YellowSession,
  intent: PositionIntent,
): Promise<void> {
  const ws = (session as any)._ws as WebSocket | undefined;
  const signer = (session as any)._signer as MessageSigner | undefined;

  if (ws && ws.readyState === WebSocket.OPEN && signer) {
    // Send via live ClearNode connection using Nitrolite SDK
    const appMessage: YellowAppMessage = {
      type: 'position_intent',
      payload: intent,
      sender: intent.agent,
    };

    const message = await createApplicationMessage(
      signer,
      session.sessionId as `0x${string}`,
      appMessage,
    );

    ws.send(message);
    log(`Sent intent via ClearNode: ${intent.outcome} @ ${intent.amount} ETH`);
  } else {
    // Session is in simulation mode - intent is stored locally
    log(`Sent intent (simulated): ${intent.outcome} @ ${intent.amount} ETH`);
  }

  session.intents.push(intent);
}

/**
 * Closes a Yellow Network application session.
 * Uses createCloseAppSessionMessage from the Nitrolite SDK.
 */
export async function closeSession(session: YellowSession): Promise<void> {
  const ws = (session as any)._ws as WebSocket | undefined;
  const signer = (session as any)._signer as MessageSigner | undefined;

  if (ws && ws.readyState === WebSocket.OPEN && signer) {
    try {
      // CloseAppSessionRequestParams: { app_session_id, allocations, session_data? }
      const closeMsg = await createCloseAppSessionMessage(signer, {
        app_session_id: session.sessionId as `0x${string}`,
        allocations: session.participants.map((p) => ({
          participant: p as Address,
          asset: 'eth',
          amount: '0',
        })),
      });
      ws.send(closeMsg);

      // Wait briefly for acknowledgment
      await new Promise<void>((resolve) => {
        const closeTimeout = setTimeout(() => {
          resolve();
        }, 2000);

        ws.once('message', () => {
          clearTimeout(closeTimeout);
          resolve();
        });
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logError(`Error closing session: ${msg}`);
    } finally {
      ws.close();
    }
  }

  session.active = false;
  log(`Session closed: ${session.sessionId.slice(0, 18)}...`);
}
