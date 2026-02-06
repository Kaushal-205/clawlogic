/**
 * Yellow Network Demo - Standalone ERC-7824 State Channel Demo
 *
 * Demonstrates the complete Yellow Network integration flow:
 *   1. Agent Alpha creates an off-chain session for a prediction market
 *   2. Agent Beta joins the session via state channel
 *   3. Agents exchange signed position intents off-chain
 *   4. Both agents agree on complementary positions
 *   5. Session closes, ready for on-chain execution
 *
 * Usage:
 *   pnpm yellow:demo
 *
 * Required environment variables:
 *   - AGENT_ALPHA_PRIVATE_KEY: Hex private key for Agent Alpha
 *   - AGENT_BETA_PRIVATE_KEY:  Hex private key for Agent Beta
 *
 * If ClearNode (wss://clearnet.yellow.com/ws) is unreachable, the demo
 * automatically falls back to a local simulation that demonstrates the
 * same protocol flow.
 */

import 'dotenv/config';
import { type Hex, keccak256, toHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import { negotiatePositions } from './negotiate.js';
import { DEFAULT_YELLOW_CONFIG, CLAWLOGIC_PROTOCOL, type NegotiationResult } from './types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function separator(): void {
  console.log('');
  console.log('  ----------------------------------------------------------------');
  console.log('');
}

// ---------------------------------------------------------------------------
// Demo Runner
// ---------------------------------------------------------------------------

/**
 * Runs the Yellow Network demo end-to-end.
 *
 * @param marketId - Optional market ID. If not provided, generates a demo ID.
 */
export async function runYellowDemo(
  marketId?: `0x${string}`,
): Promise<NegotiationResult> {
  console.log('');
  console.log('  ################################################################');
  console.log('  #                                                              #');
  console.log('  #           Yellow Network Integration (ERC-7824)              #');
  console.log('  #       Off-Chain Agent Signaling via State Channels           #');
  console.log('  #                                                              #');
  console.log('  #   Powered by @erc7824/nitrolite (Nitrolite SDK)              #');
  console.log('  #   ClearNode: wss://clearnet.yellow.com/ws                    #');
  console.log('  #                                                              #');
  console.log('  ################################################################');
  console.log('');

  // Load keys from environment
  const alphaKey = process.env.AGENT_ALPHA_PRIVATE_KEY as Hex | undefined;
  const betaKey = process.env.AGENT_BETA_PRIVATE_KEY as Hex | undefined;

  if (!alphaKey || !betaKey) {
    // Generate deterministic demo keys if env vars are not set
    console.log('  [Setup] No private keys found in environment.');
    console.log('          Using deterministic demo keys for demonstration.');
    console.log('');
  }

  // Use provided keys or deterministic demo keys
  const effectiveAlphaKey: Hex = alphaKey ?? '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
  const effectiveBetaKey: Hex = betaKey ?? '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';

  const alphaAddress = privateKeyToAccount(effectiveAlphaKey).address;
  const betaAddress = privateKeyToAccount(effectiveBetaKey).address;

  // Use provided market ID or generate a demo one
  const effectiveMarketId: `0x${string}` = marketId ??
    keccak256(toHex('demo-market-eth-4000-' + Math.floor(Date.now() / 60000)));

  console.log('  Configuration:');
  console.log(`    Agent Alpha:  ${alphaAddress}`);
  console.log(`    Agent Beta:   ${betaAddress}`);
  console.log(`    Market ID:    ${effectiveMarketId.slice(0, 18)}...`);
  console.log(`    Protocol:     ${CLAWLOGIC_PROTOCOL}`);
  console.log(`    ClearNode:    ${DEFAULT_YELLOW_CONFIG.clearNodeUrl}`);
  console.log(`    Timeout:      ${DEFAULT_YELLOW_CONFIG.connectionTimeoutMs}ms`);
  console.log(`    Sim Fallback: ${DEFAULT_YELLOW_CONFIG.enableSimulationFallback}`);

  separator();

  console.log('  [Phase 1] ERC-7824 State Channel Negotiation');
  console.log('');
  console.log('  The agents will now negotiate positions OFF-CHAIN using');
  console.log('  Yellow Network state channels before committing on-chain.');
  console.log('');
  console.log('  This demonstrates ERC-7824 facilitating state channel');
  console.log('  mechanisms for agent-to-agent communication.');
  console.log('');

  // Run the negotiation
  const result = await negotiatePositions(
    effectiveAlphaKey,
    effectiveBetaKey,
    effectiveMarketId,
    '0.01',
  );

  separator();

  // Display results
  console.log('  [Phase 2] Negotiation Results');
  console.log('');
  console.log(`    Agreed:     ${result.agreed ? 'YES - Both agents reached consensus' : 'NO'}`);
  console.log(`    Session:    ${result.sessionId?.slice(0, 18) ?? '(none)'}...`);
  console.log(`    Mode:       ${result.simulated ? 'Simulated (local)' : 'Live (ClearNode)'}`);
  console.log('');
  console.log('    Alpha Intent:');
  console.log(`      Outcome:  ${result.alphaIntent.outcome.toUpperCase()}`);
  console.log(`      Amount:   ${result.alphaIntent.amount} ETH`);
  console.log(`      Agent:    ${result.alphaIntent.agent.slice(0, 10)}...`);
  console.log('');
  console.log('    Beta Intent:');
  console.log(`      Outcome:  ${result.betaIntent.outcome.toUpperCase()}`);
  console.log(`      Amount:   ${result.betaIntent.amount} ETH`);
  console.log(`      Agent:    ${result.betaIntent.agent.slice(0, 10)}...`);

  separator();

  console.log('  [Phase 3] Ready for On-Chain Execution');
  console.log('');
  console.log('  Off-chain negotiation complete. The agents have agreed on');
  console.log('  complementary positions via Yellow Network state channels.');
  console.log('');
  console.log('  Next steps (on-chain):');
  console.log('    1. Alpha calls mintOutcomeTokens() with 0.01 ETH');
  console.log('    2. Beta calls mintOutcomeTokens() with 0.01 ETH');
  console.log('    3. Agents swap YES/NO tokens on Uniswap V4 pool');
  console.log('    4. Market resolves via UMA OOV3');
  console.log('');
  console.log('  Key Insight:');
  console.log('  Agents negotiated positions OFF-CHAIN via ERC-7824 state');
  console.log('  channels, reducing gas costs and enabling instant signaling.');
  console.log('  Only the final agreed-upon trades are submitted on-chain.');

  console.log('');
  console.log('  ################################################################');
  console.log('  #                                                              #');
  console.log('  #         Yellow Network Demo Complete!                        #');
  console.log('  #                                                              #');
  console.log('  #   ERC-7824 state channels enable agents to signal,           #');
  console.log('  #   negotiate, and agree on positions off-chain before          #');
  console.log('  #   committing capital on-chain. This is the future of         #');
  console.log('  #   agent-to-agent coordination.                               #');
  console.log('  #                                                              #');
  console.log('  ################################################################');
  console.log('');

  return result;
}

// ---------------------------------------------------------------------------
// Standalone execution
// ---------------------------------------------------------------------------

const isDirectRun =
  process.argv[1]?.includes('yellow/demo') ??
  process.argv[1]?.includes('yellow\\demo') ??
  false;

if (isDirectRun) {
  runYellowDemo()
    .then((result) => {
      console.log(`  Demo finished. Agreed: ${result.agreed}, Simulated: ${result.simulated}`);
      process.exit(0);
    })
    .catch((error) => {
      console.error('Yellow Network demo failed:', error);
      process.exit(1);
    });
}
