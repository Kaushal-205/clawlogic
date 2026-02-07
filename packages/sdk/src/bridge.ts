import {
  createPublicClient,
  createWalletClient,
  http,
  type Chain,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const LIFI_API = 'https://li.quest/v1';

export interface LiFiQuoteRequest {
  fromChain: string;
  toChain: string;
  fromToken: string;
  toToken: string;
  fromAmount: string;
  fromAddress: string;
}

export interface LiFiQuoteResponse {
  id: string;
  type: string;
  tool: string;
  action: {
    fromChainId: number;
    toChainId: number;
    fromToken: { symbol: string; decimals: number; address: string };
    toToken: { symbol: string; decimals: number; address: string };
    fromAmount: string;
  };
  estimate: {
    toAmount: string;
    toAmountMin: string;
    approvalAddress: string;
    executionDuration: number;
    gasCosts: { amountUSD: string }[];
    feeCosts: { amountUSD: string }[];
  };
  transactionRequest?: {
    to: `0x${string}`;
    data: `0x${string}`;
    value: string;
    gasLimit?: string;
    chainId: number;
  };
}

export interface LiFiStatusRequest {
  txHash: string;
  fromChain: string;
  toChain: string;
  bridge?: string;
}

export interface LiFiStatusResponse {
  status: string;
  substatus?: string;
  sending?: { txHash?: string; amount?: string };
  receiving?: { txHash?: string; amount?: string };
}

export interface LiFiExecuteRequest {
  quote: LiFiQuoteResponse;
  privateKey: Hex;
  rpcUrl?: string;
}

export interface LiFiExecuteResult {
  txHash: `0x${string}`;
  receiptStatus: 'success' | 'reverted';
}

function normalizeBridgeName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-');
}

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

function defaultRpcForChain(chainId: number): string | undefined {
  const byChain: Record<number, string> = {
    1: 'https://rpc.ankr.com/eth',
    10: 'https://mainnet.optimism.io',
    137: 'https://polygon-rpc.com',
    42161: 'https://arb1.arbitrum.io/rpc',
    11155111: 'https://rpc.sepolia.org',
    11155420: 'https://sepolia.optimism.io',
    421614: 'https://sepolia-rollup.arbitrum.io/rpc',
  };
  return byChain[chainId];
}

function toChain(chainId: number, rpcUrl: string): Chain {
  return {
    id: chainId,
    name: `Chain ${chainId}`,
    nativeCurrency: {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18,
    },
    rpcUrls: {
      default: { http: [rpcUrl] },
    },
  };
}

export async function bridgeQuote(
  request: LiFiQuoteRequest,
): Promise<LiFiQuoteResponse> {
  return lifiGet<LiFiQuoteResponse>('/quote', { ...request });
}

export async function bridgeStatus(
  request: LiFiStatusRequest,
): Promise<LiFiStatusResponse> {
  const params: Record<string, string> = {
    txHash: request.txHash,
    fromChain: request.fromChain,
    toChain: request.toChain,
  };
  if (request.bridge) {
    params.bridge = normalizeBridgeName(request.bridge);
  }
  return lifiGet<LiFiStatusResponse>('/status', params);
}

export async function bridgeExecute(
  request: LiFiExecuteRequest,
): Promise<LiFiExecuteResult> {
  const txRequest = request.quote.transactionRequest;
  if (!txRequest) {
    throw new Error('LI.FI quote has no transactionRequest to execute.');
  }

  const rpcUrl = request.rpcUrl ?? defaultRpcForChain(txRequest.chainId);
  if (!rpcUrl) {
    throw new Error(
      `No RPC URL provided for chain ${txRequest.chainId}. Pass rpcUrl explicitly.`,
    );
  }

  const chain = toChain(txRequest.chainId, rpcUrl);
  const account = privateKeyToAccount(request.privateKey);
  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(rpcUrl),
  });
  const publicClient = createPublicClient({
    chain,
    transport: http(rpcUrl),
  });

  const txHash = await walletClient.sendTransaction({
    account,
    to: txRequest.to,
    data: txRequest.data,
    value: BigInt(txRequest.value),
    gas: txRequest.gasLimit ? BigInt(txRequest.gasLimit) : undefined,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  return {
    txHash,
    receiptStatus: receipt.status === 'success' ? 'success' : 'reverted',
  };
}

export const bridge = {
  quote: bridgeQuote,
  status: bridgeStatus,
  execute: bridgeExecute,
};
