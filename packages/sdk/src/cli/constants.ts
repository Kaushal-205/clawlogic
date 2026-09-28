import {
  ARBITRUM_ONE_CHAIN_ID,
  ARBITRUM_ONE_CONFIG,
  ARBITRUM_ONE_RPC_URL,
  ARBITRUM_SEPOLIA_CHAIN_ID,
  ARBITRUM_SEPOLIA_RPC_URL,
} from '../config.js';
import type { ClawlogicConfig } from '../types.js';

export const DEFAULT_STATE_PATH = '~/.config/clawlogic/agent.json';

export const DEFAULT_CONTRACTS = {
  agentRegistry: '0xd0B1864A1da6407A7DE5a08e5f82352b5e230cd3',
  predictionMarketHook: '0xB3C4a85906493f3Cf0d59e891770Bb2e77FA8880',
  poolManager: '0xFB3e0C6F74eB1a21CC1Da29aeC80D2Dfe6C9a317',
  optimisticOracleV3: '0x9023B0bB4E082CDcEdFA2b3671371646f4C5FBFb',
} as const satisfies ClawlogicConfig['contracts'];

export const DEFAULT_CHAIN_ID = ARBITRUM_SEPOLIA_CHAIN_ID;
export const DEFAULT_RPC_URL = ARBITRUM_SEPOLIA_RPC_URL;

export interface NetworkDefaults {
  label: string;
  chainId: number;
  rpcUrl: string;
  /** Env var that overrides the RPC URL for this network specifically. */
  rpcEnvVar: string;
  contracts: ClawlogicConfig['contracts'];
}

/**
 * Networks selectable with `CLAWLOGIC_NETWORK`. Arbitrum Sepolia stays the
 * default until the mainnet deployment addresses are filled in below.
 */
export const NETWORKS = {
  'arbitrum-sepolia': {
    label: 'Arbitrum Sepolia',
    chainId: ARBITRUM_SEPOLIA_CHAIN_ID,
    rpcUrl: ARBITRUM_SEPOLIA_RPC_URL,
    rpcEnvVar: 'ARBITRUM_SEPOLIA_RPC_URL',
    contracts: DEFAULT_CONTRACTS,
  },
  'arbitrum-one': {
    label: 'Arbitrum One',
    chainId: ARBITRUM_ONE_CHAIN_ID,
    rpcUrl: ARBITRUM_ONE_RPC_URL,
    rpcEnvVar: 'ARBITRUM_ONE_RPC_URL',
    contracts: ARBITRUM_ONE_CONFIG.contracts,
  },
} as const satisfies Record<string, NetworkDefaults>;

export type NetworkName = keyof typeof NETWORKS;

export const DEFAULT_NETWORK: NetworkName = 'arbitrum-sepolia';

export const ZERO_ADDRESS =
  '0x0000000000000000000000000000000000000000' as const;

export const NPM_UPGRADE_COMMAND = 'npm install @clawlogic/sdk@latest';
