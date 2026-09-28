/**
 * Generate a fresh TEE attestation quote from the Phala CVM environment.
 *
 * Usage: npx tsx tee-attest.ts [custom-data]
 *
 * Arguments:
 *   custom-data  - Optional hex string to include as user data in the quote.
 *                  Defaults to the agent's public address.
 *
 * Output (stdout): JSON with { success, inTee, quote, publicKey, deriveKey }
 *
 * This script requires the @phala/dstack-sdk package and must be run inside
 * a Phala CVM (Intel TDX) to produce a real attestation. Outside a TEE,
 * it returns { success: true, inTee: false }.
 */

import { privateKeyToAccount } from 'viem/accounts';
import { outputSuccess, outputError, createClient } from './setup.js';

async function main(): Promise<void> {
  const customData = process.argv[2] || undefined;

  // Attempt to load dstack SDK (only available inside Phala CVM)
  let DstackClient: any;
  try {
    const dstack = await import('@phala/dstack-sdk');
    DstackClient = dstack.DstackClient;
  } catch {
    // Not in TEE — return gracefully
    outputSuccess({
      inTee: false,
      quote: null,
      publicKey: null,
      message: 'Not running inside a TEE. Deploy to Phala CVM for real attestation.',
    });
    return;
  }

  try {
    const endpoint = process.env.DSTACK_SIMULATOR_ENDPOINT || undefined;
    const client = new DstackClient(endpoint);

    // Derive a deterministic secp256k1 key from TEE hardware. The derived key
    // is secret material -- only its public key is ever output.
    const keyResult = await client.getKey('/clawlogic/agent/v1');
    const derivedKey = ('0x' + Buffer.from(keyResult.key).toString('hex')) as `0x${string}`;
    // Uncompressed public key without the 0x04 prefix (64 bytes).
    const publicKey = '0x' + privateKeyToAccount(derivedKey).publicKey.slice(4);

    // Use custom data or the derived public key as quote report data (max 64 bytes)
    const userData = customData || publicKey;

    // Generate TDX attestation quote
    const quoteResult = await client.getQuote(Buffer.from(userData.replace(/^0x/, ''), 'hex'));
    const quote = '0x' + String(quoteResult.quote).replace(/^0x/, '');

    // Get agent address for reference
    let agentAddress: string | null = null;
    try {
      const sdkClient = createClient();
      agentAddress = sdkClient.getAddress() ?? null;
    } catch {
      // No private key available — that's fine
    }

    outputSuccess({
      inTee: true,
      quote,
      quoteLength: (quote.length - 2) / 2,
      publicKey,
      agentAddress,
      userData,
      message: 'TEE attestation generated successfully. Submit this quote on-chain for verification.',
    });
  } catch (error) {
    outputError(error);
  }
}

main().catch(outputError);
