/**
 * Create a new prediction market via PredictionMarketHook.createMarket().
 *
 * Usage: npx tsx create-market.ts <outcome1> <outcome2> <description> <resolutionTime> [reward] [bond]
 *
 * Arguments:
 *   outcome1       - Label for outcome 1 (e.g. "yes"). Required. A yes/no market lists "yes" first.
 *   outcome2       - Label for outcome 2 (e.g. "no"). Required. "Unresolvable" is reserved.
 *   description    - Human-readable market question. Required.
 *   resolutionTime - When the answer is known: unix seconds or ISO date. Required.
 *                    Nobody can assert the outcome earlier; trading stops then.
 *   reward         - Bond currency reward for the asserter, in wei. Optional, defaults to "0".
 *   bond           - Minimum bond for assertion, in wei (<= the protocol cap). Optional, defaults to "0".
 *
 * Output (stdout): JSON with success, txHash, and market creation details.
 */

import { createClient, outputSuccess, outputError } from './setup.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length < 4) {
    console.error(JSON.stringify({
      success: false,
      error: 'Usage: create-market.ts <outcome1> <outcome2> <description> <resolutionTime> [reward] [bond]',
    }));
    process.exit(1);
  }

  const outcome1 = args[0];
  const outcome2 = args[1];
  const description = args[2];
  const resolutionTime = /^\d+$/.test(args[3])
    ? BigInt(args[3])
    : BigInt(Math.floor(Date.parse(args[3]) / 1000));
  const reward = BigInt(args[4] ?? '0');
  const requiredBond = BigInt(args[5] ?? '0');

  const client = createClient();

  const txHash = await client.createMarket({
    outcome1,
    outcome2,
    description,
    resolutionTime,
    reward,
    requiredBond,
  });

  // Fetch market IDs to find the newly created one
  const marketIds = await client.getMarketIds();
  const latestMarketId = marketIds.length > 0 ? marketIds[marketIds.length - 1] : null;

  outputSuccess({
    txHash,
    marketId: latestMarketId,
    outcome1,
    outcome2,
    description,
    resolutionTime: resolutionTime.toString(),
    reward: reward.toString(),
    requiredBond: requiredBond.toString(),
    totalMarkets: marketIds.length,
  });
}

main().catch(outputError);
