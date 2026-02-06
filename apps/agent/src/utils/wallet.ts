import {
  createWalletClient,
  createPublicClient,
  http,
  formatEther,
  type Hex,
  type WalletClient,
  type PublicClient,
  type Transport,
  type Chain,
  type Account,
} from 'viem';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import { arbitrumSepolia } from 'viem/chains';

export interface WalletSetup {
  account: PrivateKeyAccount;
  walletClient: WalletClient<Transport, Chain, Account>;
  publicClient: PublicClient<Transport, Chain>;
}

/**
 * Creates a wallet and public client from a private key.
 * Used by all agent scripts for consistent wallet initialization.
 */
export function setupWallet(privateKey: Hex, rpcUrl?: string): WalletSetup {
  const url =
    rpcUrl ??
    process.env.ARBITRUM_SEPOLIA_RPC_URL ??
    'https://sepolia-rollup.arbitrum.io/rpc';

  const account = privateKeyToAccount(privateKey);

  const walletClient = createWalletClient({
    account,
    chain: arbitrumSepolia,
    transport: http(url),
  });

  const publicClient = createPublicClient({
    chain: arbitrumSepolia,
    transport: http(url),
  });

  return { account, walletClient, publicClient };
}

/**
 * Logs wallet address and balance for debugging.
 */
export async function logWalletInfo(
  setup: WalletSetup,
  label: string,
): Promise<void> {
  const balance = await setup.publicClient.getBalance({
    address: setup.account.address,
  });
  const ethBalance = formatEther(balance);
  console.log(`  [${label}] Address: ${setup.account.address}`);
  console.log(`  [${label}] Balance: ${ethBalance} ETH`);
}

/**
 * Requires a private key environment variable and returns it, or throws
 * a descriptive error.
 */
export function requirePrivateKey(envVar: string, label: string): Hex {
  const key = process.env[envVar] as Hex | undefined;
  if (!key) {
    throw new Error(
      `${envVar} not set in environment. ` +
        `Please copy .env.example to .env and fill in ${label}'s private key.`,
    );
  }
  return key;
}
