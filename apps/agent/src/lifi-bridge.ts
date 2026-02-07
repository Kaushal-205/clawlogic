/**
 * LI.FI Cross-Chain Bridge Agent
 *
 * Production-focused helpers for:
 * - quoting bridge routes
 * - signing/submitting bridge transactions
 * - persisting bridge execution records
 * - polling bridge delivery status
 */

import 'dotenv/config';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname, resolve } from 'path';
import {
  formatEther,
  formatUnits,
  parseEther,
  type Hex,
} from 'viem';
import {
  bridgeExecute as sdkBridgeExecute,
  bridgeQuote as sdkBridgeQuote,
  bridgeStatus as sdkBridgeStatus,
  type LiFiExecuteResult,
  type LiFiQuoteRequest as SdkLiFiQuoteRequest,
  type LiFiQuoteResponse as SdkLiFiQuoteResponse,
  type LiFiStatusResponse as SdkLiFiStatusResponse,
} from '@clawlogic/sdk';
import { privateKeyToAccount } from 'viem/accounts';

// ─── LI.FI API Types ───────────────────────────────────────────────────────

export type LiFiQuoteRequest = SdkLiFiQuoteRequest;
export type LiFiQuoteResponse = SdkLiFiQuoteResponse;

interface LiFiTokenBalance {
  address: string;
  symbol: string;
  decimals: number;
  amount: string;
  priceUSD: string;
}

export type LiFiStatusResponse = SdkLiFiStatusResponse;

export interface LiFiRouteSuggestion {
  fromChain: string;
  toChain: string;
  tool: string;
  estimatedToAmount: bigint;
  estimatedToAmountMin: bigint;
  executionDurationSec: number;
  gasCostUsd: string;
}

export interface LiFiBridgeExecuteOptions {
  dryRun?: boolean;
  persist?: boolean;
  pollStatus?: boolean;
  maxStatusChecks?: number;
  statusIntervalMs?: number;
}

export type BridgeExecutionState =
  | 'dry-run'
  | 'sent'
  | 'confirmed'
  | 'delivered'
  | 'failed';

export interface LiFiBridgeExecutionRecord {
  id: string;
  fromChain: string;
  toChain: string;
  tool: string;
  fromAddress: `0x${string}`;
  txHash?: `0x${string}`;
  receiveTxHash?: `0x${string}`;
  status: BridgeExecutionState;
  statusDetail?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const LIFI_API = 'https://li.quest/v1';
export const NATIVE_TOKEN = '0x0000000000000000000000000000000000000000';
const DEFAULT_STATE_FILE = resolve(process.cwd(), '.clawlogic/lifi-bridges.json');

export const CHAINS = {
  ARBITRUM_SEPOLIA: '421614',
  ETHEREUM_SEPOLIA: '11155111',
  OPTIMISM_SEPOLIA: '11155420',
  ARBITRUM: '42161',
  ETHEREUM: '1',
  OPTIMISM: '10',
  POLYGON: '137',
};

// ─── LI.FI API Helpers ─────────────────────────────────────────────────────

async function lifiGet<T>(
  endpoint: string,
  params: Record<string, string | number | bigint | boolean>,
): Promise<T> {
  const url = new URL(`${LIFI_API}${endpoint}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }

  const response = await fetch(url.toString(), {
    headers: { accept: 'application/json' },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`LI.FI API error (${response.status}): ${text}`);
  }

  return response.json() as Promise<T>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function nowIso(): string {
  return new Date().toISOString();
}

function bridgeStateFilePath(): string {
  return process.env.LIFI_STATE_FILE ?? DEFAULT_STATE_FILE;
}

async function readBridgeState(): Promise<LiFiBridgeExecutionRecord[]> {
  const filePath = bridgeStateFilePath();
  try {
    const text = await readFile(filePath, 'utf-8');
    const parsed = JSON.parse(text) as LiFiBridgeExecutionRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeBridgeState(records: LiFiBridgeExecutionRecord[]): Promise<void> {
  const filePath = bridgeStateFilePath();
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(records, null, 2), 'utf-8');
}

async function upsertBridgeRecord(
  id: string,
  updater: (current?: LiFiBridgeExecutionRecord) => LiFiBridgeExecutionRecord,
): Promise<LiFiBridgeExecutionRecord> {
  const records = await readBridgeState();
  const index = records.findIndex((record) => record.id === id);
  const next = updater(index >= 0 ? records[index] : undefined);
  if (index >= 0) {
    records[index] = next;
  } else {
    records.unshift(next);
  }
  await writeBridgeState(records.slice(0, 500));
  return next;
}

function normalizedBridgeName(tool: string): string {
  return tool.toLowerCase().replace(/\s+/g, '-');
}

function resolveRpcUrlForChain(chainId: number): string {
  const rpcByChain: Record<number, string | undefined> = {
    1: process.env.ETHEREUM_RPC_URL,
    10: process.env.OPTIMISM_RPC_URL,
    137: process.env.POLYGON_RPC_URL,
    42161: process.env.ARBITRUM_RPC_URL,
    11155111: process.env.ETHEREUM_SEPOLIA_RPC_URL,
    11155420: process.env.OPTIMISM_SEPOLIA_RPC_URL,
    421614:
      process.env.ARBITRUM_SEPOLIA_RPC_URL ??
      'https://sepolia-rollup.arbitrum.io/rpc',
  };
  const fallbackByChain: Record<number, string | undefined> = {
    1: 'https://rpc.ankr.com/eth',
    10: 'https://mainnet.optimism.io',
    137: 'https://polygon-rpc.com',
    42161: 'https://arb1.arbitrum.io/rpc',
    11155111: 'https://rpc.sepolia.org',
    11155420: 'https://sepolia.optimism.io',
    421614: 'https://sepolia-rollup.arbitrum.io/rpc',
  };
  const rpcUrl = rpcByChain[chainId] ?? fallbackByChain[chainId];
  if (!rpcUrl) {
    throw new Error(
      `No RPC URL configured for chain ${chainId}. Set an env var for this source chain.`,
    );
  }
  return rpcUrl;
}

function statusToExecutionState(status: LiFiStatusResponse): BridgeExecutionState {
  const normalizedStatus = status.status.toLowerCase();
  const normalizedSubstatus = (status.substatus ?? '').toLowerCase();
  if (
    normalizedStatus.includes('failed') ||
    normalizedSubstatus.includes('failed') ||
    normalizedSubstatus.includes('reverted')
  ) {
    return 'failed';
  }
  if (
    normalizedStatus.includes('done') ||
    normalizedStatus.includes('complete') ||
    normalizedSubstatus.includes('completed')
  ) {
    return 'delivered';
  }
  return 'confirmed';
}

// ─── Public LI.FI wrappers ─────────────────────────────────────────────────

export async function bridgeQuote(request: LiFiQuoteRequest): Promise<LiFiQuoteResponse> {
  return sdkBridgeQuote(request);
}

export async function getQuote(
  fromChain: string,
  toChain: string,
  fromToken: string,
  toToken: string,
  amount: string,
  address: string,
): Promise<LiFiQuoteResponse | null> {
  console.log('\n[DECIDE] Getting LI.FI quote...');
  console.log(`  Route: Chain ${fromChain} -> Chain ${toChain}`);
  console.log(`  Amount: ${amount} wei`);

  try {
    const quote = await bridgeQuote({
      fromChain,
      toChain,
      fromToken,
      toToken,
      fromAmount: amount,
      fromAddress: address,
    });

    const toAmount = formatEther(BigInt(quote.estimate.toAmount));
    const duration = quote.estimate.executionDuration;
    const gasCost = quote.estimate.gasCosts?.[0]?.amountUSD || '0';

    console.log(`  Tool: ${quote.tool}`);
    console.log(`  Estimated receive: ${toAmount} ETH`);
    console.log(`  Duration: ~${duration}s`);
    console.log(`  Gas cost: $${gasCost}`);

    return quote;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  Quote failed: ${msg}`);
    return null;
  }
}

/**
 * Step 1: Monitor — Check agent balances across chains
 */
async function checkBalancesAcrossChains(address: string): Promise<void> {
  console.log('\n[MONITOR] Checking balances across chains...');

  const chains = [
    { id: CHAINS.ARBITRUM, name: 'Arbitrum' },
    { id: CHAINS.ETHEREUM, name: 'Ethereum' },
    { id: CHAINS.OPTIMISM, name: 'Optimism' },
    { id: CHAINS.POLYGON, name: 'Polygon' },
  ];

  for (const chain of chains) {
    try {
      const balances = await lifiGet<{ tokens: Record<string, LiFiTokenBalance[]> }>(
        '/balances',
        { address, chains: chain.id },
      );

      const tokens = balances.tokens?.[chain.id] || [];
      const nonZero = tokens.filter((token) => BigInt(token.amount) > 0n);

      if (nonZero.length > 0) {
        console.log(`  ${chain.name} (${chain.id}):`);
        for (const token of nonZero) {
          const formatted = formatUnits(BigInt(token.amount), token.decimals);
          console.log(`    ${token.symbol}: ${formatted} ($${token.priceUSD})`);
        }
      } else {
        console.log(`  ${chain.name}: no balances`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  ${chain.name}: error (${msg.slice(0, 50)})`);
    }
  }
}

export async function suggestBridgeRoutesToArbitrumSepolia(
  address: `0x${string}`,
  amountWei: bigint,
): Promise<LiFiRouteSuggestion[]> {
  const routes: LiFiRouteSuggestion[] = [];
  const amount = amountWei.toString();

  const [ethToArb, opToArb] = await Promise.all([
    getQuote(
      CHAINS.ETHEREUM_SEPOLIA,
      CHAINS.ARBITRUM_SEPOLIA,
      NATIVE_TOKEN,
      NATIVE_TOKEN,
      amount,
      address,
    ),
    getQuote(
      CHAINS.OPTIMISM_SEPOLIA,
      CHAINS.ARBITRUM_SEPOLIA,
      NATIVE_TOKEN,
      NATIVE_TOKEN,
      amount,
      address,
    ),
  ]);

  const quotes = [
    { fromChain: CHAINS.ETHEREUM_SEPOLIA, quote: ethToArb },
    { fromChain: CHAINS.OPTIMISM_SEPOLIA, quote: opToArb },
  ];

  for (const entry of quotes) {
    if (!entry.quote) {
      continue;
    }
    routes.push({
      fromChain: entry.fromChain,
      toChain: CHAINS.ARBITRUM_SEPOLIA,
      tool: entry.quote.tool,
      estimatedToAmount: BigInt(entry.quote.estimate.toAmount),
      estimatedToAmountMin: BigInt(entry.quote.estimate.toAmountMin),
      executionDurationSec: entry.quote.estimate.executionDuration,
      gasCostUsd: entry.quote.estimate.gasCosts?.[0]?.amountUSD ?? '0',
    });
  }

  return routes.sort((a, b) => {
    if (a.estimatedToAmount === b.estimatedToAmount) {
      return 0;
    }
    return a.estimatedToAmount > b.estimatedToAmount ? -1 : 1;
  });
}

export async function getBestBridgeQuoteToArbitrumSepolia(
  address: `0x${string}`,
  amountWei: bigint,
): Promise<LiFiQuoteResponse | null> {
  const amount = amountWei.toString();
  const [ethToArb, opToArb] = await Promise.all([
    getQuote(
      CHAINS.ETHEREUM_SEPOLIA,
      CHAINS.ARBITRUM_SEPOLIA,
      NATIVE_TOKEN,
      NATIVE_TOKEN,
      amount,
      address,
    ),
    getQuote(
      CHAINS.OPTIMISM_SEPOLIA,
      CHAINS.ARBITRUM_SEPOLIA,
      NATIVE_TOKEN,
      NATIVE_TOKEN,
      amount,
      address,
    ),
  ]);

  if (!ethToArb && !opToArb) {
    return null;
  }
  if (!ethToArb) {
    return opToArb;
  }
  if (!opToArb) {
    return ethToArb;
  }

  const ethOut = BigInt(ethToArb.estimate.toAmount);
  const opOut = BigInt(opToArb.estimate.toAmount);
  return ethOut >= opOut ? ethToArb : opToArb;
}

/**
 * Step 4: Track — Check bridge status
 */
export async function checkBridgeStatus(
  txHash: string,
  fromChain: string,
  toChain: string,
  bridge?: string,
): Promise<LiFiStatusResponse | null> {
  console.log(`\n[TRACK] Checking bridge status for ${txHash.slice(0, 18)}...`);

  const params: Record<string, string> = {
    txHash,
    fromChain,
    toChain,
  };
  if (bridge) {
    params.bridge = normalizedBridgeName(bridge);
  }

  try {
    const status = await sdkBridgeStatus({
      txHash: params.txHash,
      fromChain: params.fromChain,
      toChain: params.toChain,
      bridge: params.bridge,
    });
    console.log(`  Status: ${status.status}`);
    console.log(`  Substatus: ${status.substatus || 'N/A'}`);
    if (status.receiving?.txHash) {
      console.log(`  Receive TX: ${status.receiving.txHash}`);
    }
    return status;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  Status check: ${msg.slice(0, 120)}`);
    return null;
  }
}

async function pollBridgeStatus(
  record: LiFiBridgeExecutionRecord,
  quote: LiFiQuoteResponse,
  maxChecks: number,
  intervalMs: number,
): Promise<LiFiBridgeExecutionRecord> {
  let latestRecord = record;

  for (let attempt = 1; attempt <= maxChecks; attempt++) {
    if (!latestRecord.txHash) {
      break;
    }
    const status = await checkBridgeStatus(
      latestRecord.txHash,
      String(quote.action.fromChainId),
      String(quote.action.toChainId),
      quote.tool,
    );
    if (!status) {
      await sleep(intervalMs);
      continue;
    }

    const nextStatus = statusToExecutionState(status);
    latestRecord = await upsertBridgeRecord(record.id, (current) => ({
      ...(current ?? record),
      status: nextStatus,
      statusDetail: `${status.status}:${status.substatus ?? ''}`.replace(/:$/, ''),
      receiveTxHash: status.receiving?.txHash as `0x${string}` | undefined,
      updatedAt: nowIso(),
    }));

    if (nextStatus === 'delivered' || nextStatus === 'failed') {
      return latestRecord;
    }
    await sleep(intervalMs);
  }

  return latestRecord;
}

/**
 * Step 3: Execute — Bridge funds via LI.FI
 */
export async function bridgeExecute(
  quote: LiFiQuoteResponse,
  privateKey: Hex,
  options: LiFiBridgeExecuteOptions = {},
): Promise<LiFiBridgeExecutionRecord> {
  const dryRun = options.dryRun ?? false;
  const persist = options.persist ?? true;
  const pollStatus = options.pollStatus ?? true;
  const maxStatusChecks = options.maxStatusChecks ?? 20;
  const statusIntervalMs = options.statusIntervalMs ?? 15000;
  const fromAddress = privateKeyToAccount(privateKey).address;

  const createdAt = nowIso();
  const baseRecord: LiFiBridgeExecutionRecord = {
    id: quote.id || `bridge-${Date.now()}`,
    fromChain: String(quote.action.fromChainId),
    toChain: String(quote.action.toChainId),
    tool: quote.tool,
    fromAddress,
    status: dryRun ? 'dry-run' : 'sent',
    createdAt,
    updatedAt: createdAt,
  };

  console.log(`\n[EXECUTE] Bridging via ${quote.tool}...`);

  if (!quote.transactionRequest) {
    throw new Error('Quote does not include transactionRequest; cannot execute bridge.');
  }

  if (dryRun) {
    console.log('  Dry-run enabled. Transaction was not submitted.');
    if (persist) {
      await upsertBridgeRecord(baseRecord.id, () => baseRecord);
    }
    return baseRecord;
  }

  const txRequest = quote.transactionRequest;
  const rpcUrl = resolveRpcUrlForChain(txRequest.chainId);
  const execution: LiFiExecuteResult = await sdkBridgeExecute({
    quote,
    privateKey,
    rpcUrl,
  });
  const txHash = execution.txHash;

  let currentRecord: LiFiBridgeExecutionRecord = {
    ...baseRecord,
    txHash,
    status: 'sent',
    updatedAt: nowIso(),
  };
  console.log(`  Source TX submitted: ${txHash}`);

  if (persist) {
    currentRecord = await upsertBridgeRecord(baseRecord.id, () => currentRecord);
  }

  currentRecord = {
    ...currentRecord,
    status: execution.receiptStatus === 'success' ? 'confirmed' : 'failed',
    statusDetail: `source_receipt:${execution.receiptStatus}`,
    updatedAt: nowIso(),
  };
  console.log(`  Source TX receipt: ${execution.receiptStatus}`);

  if (persist) {
    currentRecord = await upsertBridgeRecord(baseRecord.id, (existing) => ({
      ...(existing ?? currentRecord),
      ...currentRecord,
    }));
  }

  if (
    pollStatus &&
    currentRecord.status !== 'failed'
  ) {
    currentRecord = await pollBridgeStatus(
      currentRecord,
      quote,
      maxStatusChecks,
      statusIntervalMs,
    );
  }

  return currentRecord;
}

export async function getLatestBridgeRecord(
  fromAddress?: `0x${string}`,
): Promise<LiFiBridgeExecutionRecord | null> {
  const records = await readBridgeState();
  if (!fromAddress) {
    return records[0] ?? null;
  }
  const target = fromAddress.toLowerCase();
  const found = records.find((record) => record.fromAddress.toLowerCase() === target);
  return found ?? null;
}

// ─── Full Agent Strategy Loop ───────────────────────────────────────────────

async function runAgentStrategy(): Promise<void> {
  const privateKey = process.env.AGENT_PRIVATE_KEY as Hex;
  if (!privateKey) {
    throw new Error('AGENT_PRIVATE_KEY not set');
  }

  const account = privateKeyToAccount(privateKey);
  const address = account.address;

  console.log('═══════════════════════════════════════════════════════');
  console.log('  $CLAWLOGIC x LI.FI — Cross-Chain Agent Strategy');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Agent: ${address}`);
  console.log('');

  const command = process.argv[2] || 'full';

  switch (command) {
    case 'quote': {
      await getQuote(
        CHAINS.ETHEREUM,
        CHAINS.ARBITRUM,
        NATIVE_TOKEN,
        NATIVE_TOKEN,
        parseEther('0.1').toString(),
        address,
      );
      break;
    }

    case 'status': {
      const txHash = process.argv[3];
      if (!txHash) {
        console.error('Usage: lifi-bridge.ts status <txHash>');
        process.exit(1);
      }
      await checkBridgeStatus(txHash, CHAINS.ETHEREUM, CHAINS.ARBITRUM);
      break;
    }

    case 'full':
    default: {
      console.log('Running full cross-chain strategy loop...');
      console.log('');

      await checkBalancesAcrossChains(address);

      console.log('\n--- Decision Phase ---');
      console.log('Strategy: Bridge ETH from best-priced chain to Arbitrum');

      const quoteEthToArb = await getQuote(
        CHAINS.ETHEREUM,
        CHAINS.ARBITRUM,
        NATIVE_TOKEN,
        NATIVE_TOKEN,
        parseEther('0.1').toString(),
        address,
      );

      const quoteOptToArb = await getQuote(
        CHAINS.OPTIMISM,
        CHAINS.ARBITRUM,
        NATIVE_TOKEN,
        NATIVE_TOKEN,
        parseEther('0.1').toString(),
        address,
      );

      console.log('\n--- Route Comparison ---');
      if (quoteEthToArb && quoteOptToArb) {
        const ethAmount = BigInt(quoteEthToArb.estimate.toAmount);
        const optAmount = BigInt(quoteOptToArb.estimate.toAmount);
        const best = ethAmount > optAmount ? 'Ethereum' : 'Optimism';
        console.log(`  Best route: ${best} -> Arbitrum (higher output)`);
      } else if (quoteEthToArb) {
        console.log('  Best route: Ethereum -> Arbitrum (only available)');
      } else if (quoteOptToArb) {
        console.log('  Best route: Optimism -> Arbitrum (only available)');
      } else {
        console.log('  No routes available - agent will use existing Arbitrum balance');
      }

      const selectedQuote = quoteEthToArb || quoteOptToArb;
      if (selectedQuote) {
        const liveExecution = process.env.LIFI_EXECUTE === 'true';
        const record = await bridgeExecute(selectedQuote, privateKey, {
          dryRun: !liveExecution,
          persist: true,
          pollStatus: liveExecution,
        });
        console.log(`  Bridge execution status: ${record.status}`);
      }

      console.log('\n--- Post-Bridge ---');
      console.log('Agent would now:');
      console.log('  1. Wait for bridge completion (~60-120s)');
      console.log('  2. mintOutcomeTokens() on PredictionMarketHook');
      console.log('  3. Trade on V4 pool based on LLM analysis');
      console.log('  4. After settlement, bridge profits back via LI.FI');

      console.log('');
      console.log('═══════════════════════════════════════════════════════');
      console.log('  Strategy loop complete');
      console.log('═══════════════════════════════════════════════════════');
      break;
    }
  }
}

// ─── Entry Point ────────────────────────────────────────────────────────────

const isDirectRun = process.argv[1]?.includes('lifi-bridge') ?? false;

if (isDirectRun) {
  runAgentStrategy().catch((err) => {
    console.error('LI.FI bridge agent failed:', err);
    process.exit(1);
  });
}
