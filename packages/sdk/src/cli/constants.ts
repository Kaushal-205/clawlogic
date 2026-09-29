import {
  ARBITRUM_ONE_CHAIN_ID,
  ARBITRUM_ONE_CONFIG,
  ARBITRUM_ONE_RPC_URL,
} from '../config.js';
import type { ClawlogicConfig } from '../types.js';

export const DEFAULT_STATE_PATH = '~/.config/clawlogic/agent.json';

export const DEFAULT_CONTRACTS = ARBITRUM_ONE_CONFIG.contracts;

export const DEFAULT_CHAIN_ID = ARBITRUM_ONE_CHAIN_ID;
export const DEFAULT_RPC_URL = ARBITRUM_ONE_RPC_URL;

export interface NetworkDefaults {
  label: string;
  chainId: number;
  rpcUrl: string;
  /** Env var that overrides the RPC URL for this network specifically. */
  rpcEnvVar: string;
  contracts: ClawlogicConfig['contracts'];
}

/**
 * Networks selectable with `CLAWLOGIC_NETWORK`. CLAWLOGIC runs on Arbitrum One
 * mainnet only.
 */
export const NETWORKS = {
  'arbitrum-one': {
    label: 'Arbitrum One',
    chainId: ARBITRUM_ONE_CHAIN_ID,
    rpcUrl: ARBITRUM_ONE_RPC_URL,
    rpcEnvVar: 'ARBITRUM_ONE_RPC_URL',
    contracts: DEFAULT_CONTRACTS,
  },
} as const satisfies Record<string, NetworkDefaults>;

export type NetworkName = keyof typeof NETWORKS;

export const DEFAULT_NETWORK: NetworkName = 'arbitrum-one';

export const ZERO_ADDRESS =
  '0x0000000000000000000000000000000000000000' as const;

export const NPM_UPGRADE_COMMAND = 'npm install @clawlogic/sdk@latest';
