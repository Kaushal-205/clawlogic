import {
  createPublicClient,
  createWalletClient,
  http,
  getContract,
  type PublicClient,
  type WalletClient,
  type Transport,
  type Chain,
  type Account,
  type GetContractReturnType,
  type Log,
  type WatchContractEventReturnType,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { namehash } from 'viem/ens';
import type {
  ClawlogicConfig,
  MarketInfo,
  AgentInfo,
  MarketEvent,
  MarketEventCallback,
  MarketProbability,
  MarketReserves,
  MarketFeeInfo,
  ClaimableFees,
  EnsNameInfo,
  EnsRegistrarPricing,
  EnsRegistrarCommitWindow,
  EnsRegistrarAdminState,
} from './types.js';
import { agentRegistryAbi } from './abis/agentRegistryAbi.js';
import { predictionMarketHookAbi } from './abis/predictionMarketHookAbi.js';
import { outcomeTokenAbi } from './abis/outcomeTokenAbi.js';
import { ensPremiumRegistrarAbi } from './abis/ensPremiumRegistrarAbi.js';

// ─────────────────────────────────────────────────────────────────────────────
// Chain definition for Arbitrum Sepolia (in case viem does not export it)
// ─────────────────────────────────────────────────────────────────────────────

const arbitrumSepolia: Chain = {
  id: 421614,
  name: 'Arbitrum Sepolia',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://sepolia-rollup.arbitrum.io/rpc'] },
  },
  blockExplorers: {
    default: { name: 'Arbiscan', url: 'https://sepolia.arbiscan.io' },
  },
  testnet: true,
};

const ZERO_BYTES32 =
  '0x0000000000000000000000000000000000000000000000000000000000000000' as const;
const ZERO_ADDRESS =
  '0x0000000000000000000000000000000000000000' as const;

function isBytes32Hex(value: string): value is `0x${string}` {
  return /^0x[0-9a-fA-F]{64}$/.test(value);
}

function resolveEnsNode(ensNodeOrName: `0x${string}` | string): `0x${string}` {
  if (isBytes32Hex(ensNodeOrName)) {
    return ensNodeOrName;
  }
  return namehash(ensNodeOrName) as `0x${string}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: build a viem Chain object from a config
// ─────────────────────────────────────────────────────────────────────────────

function buildChain(config: ClawlogicConfig): Chain {
  if (config.chainId === 421614) {
    return {
      ...arbitrumSepolia,
      rpcUrls: {
        default: { http: [config.rpcUrl] },
      },
    };
  }
  return {
    id: config.chainId,
    name: `Chain ${config.chainId}`,
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: {
      default: { http: [config.rpcUrl] },
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ClawlogicClient
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Main client for interacting with the CLAWLOGIC protocol.
 *
 * Provides methods for:
 * - Agent registration & lookup (AgentRegistry)
 * - Market creation, minting, assertion & settlement (PredictionMarketHook)
 * - Outcome token balance queries (OutcomeToken ERC-20)
 * - Event watching for real-time market activity
 *
 * Requires a private key for write operations. Read-only operations work
 * without a private key (pass `undefined` and only use read methods).
 */
export class ClawlogicClient {
  /** Protocol configuration (chain, RPC, contract addresses). */
  readonly config: ClawlogicConfig;

  /** viem public client for read operations. */
  readonly publicClient: PublicClient<Transport, Chain>;

  /** viem wallet client for write operations (undefined if read-only). */
  readonly walletClient: WalletClient<Transport, Chain, Account> | undefined;

  /** The account derived from the private key (undefined if read-only). */
  readonly account: Account | undefined;

  /** Typed contract handle for AgentRegistry (read-only). */
  private readonly registryRead: GetContractReturnType<
    typeof agentRegistryAbi,
    PublicClient<Transport, Chain>
  >;

  /** Typed contract handle for PredictionMarketHook (read-only). */
  private readonly hookRead: GetContractReturnType<
    typeof predictionMarketHookAbi,
    PublicClient<Transport, Chain>
  >;

  /**
   * Create a new ClawlogicClient.
   *
   * @param config - Protocol configuration with chain info and contract addresses.
   * @param privateKey - Hex-encoded private key for signing transactions.
   *                     Pass `undefined` for a read-only client.
   */
  constructor(config: ClawlogicConfig, privateKey?: `0x${string}`) {
    this.config = config;

    const chain = buildChain(config);

    this.publicClient = createPublicClient({
      chain,
      transport: http(config.rpcUrl),
    });

    if (privateKey) {
      this.account = privateKeyToAccount(privateKey);
      this.walletClient = createWalletClient({
        account: this.account,
        chain,
        transport: http(config.rpcUrl),
      });
    }

    this.registryRead = getContract({
      address: config.contracts.agentRegistry,
      abi: agentRegistryAbi,
      client: this.publicClient,
    });

    this.hookRead = getContract({
      address: config.contracts.predictionMarketHook,
      abi: predictionMarketHookAbi,
      client: this.publicClient,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Ensure a wallet client is available for write operations.
   * Throws a descriptive error if the client was created in read-only mode.
   */
  private requireWallet(): WalletClient<Transport, Chain, Account> {
    if (!this.walletClient || !this.account) {
      throw new Error(
        'ClawlogicClient: No private key provided. ' +
          'Write operations require a private key in the constructor.',
      );
    }
    return this.walletClient;
  }

  /**
   * Resolve configured ENS premium registrar address.
   */
  private getEnsPremiumRegistrarAddress(): `0x${string}` {
    const addr = this.config.contracts.ensPremiumRegistrar;
    if (!addr || addr === ZERO_ADDRESS) {
      throw new Error(
        'ClawlogicClient: ENS premium registrar is not configured for this network.',
      );
    }
    return addr;
  }

  /**
   * Wait for a transaction receipt and return the transaction hash.
   */
  private async waitForTx(hash: `0x${string}`): Promise<`0x${string}`> {
    await this.publicClient.waitForTransactionReceipt({ hash });
    return hash;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Agent Registry Methods
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Register the caller as an agent in the AgentRegistry.
   *
   * @param name - Human-readable agent name (e.g., "AlphaTrader"). Must be non-empty.
   * @param attestation - TEE attestation bytes (hex-encoded). Defaults to "0x" (empty).
   * @returns Transaction hash of the registration.
   */
  async registerAgent(
    name: string,
    attestation: `0x${string}` = '0x',
  ): Promise<`0x${string}`> {
    const wallet = this.requireWallet();

    const hash = await wallet.writeContract({
      address: this.config.contracts.agentRegistry,
      abi: agentRegistryAbi,
      functionName: 'registerAgent',
      args: [name, attestation],
    });

    return this.waitForTx(hash);
  }

  /**
   * Register the caller as an agent and link an ENS node.
   *
   * @param name - Human-readable agent name.
   * @param ensNodeOrName - ENS namehash (`0x...`) or ENS name (`alpha.clawlogic.eth`).
   * @param attestation - TEE attestation bytes (hex-encoded). Defaults to "0x".
   * @returns Transaction hash of the registration.
   */
  async registerAgentWithENS(
    name: string,
    ensNodeOrName: `0x${string}` | string,
    attestation: `0x${string}` = '0x',
  ): Promise<`0x${string}`> {
    const wallet = this.requireWallet();
    const ensNode = resolveEnsNode(ensNodeOrName);

    const hash = await wallet.writeContract({
      address: this.config.contracts.agentRegistry,
      abi: agentRegistryAbi,
      functionName: 'registerAgentWithENS',
      args: [name, attestation, ensNode],
    });

    return this.waitForTx(hash);
  }

  /**
   * Link an ENS node/name to the caller's existing agent registration.
   *
   * @param ensNodeOrName - ENS namehash (`0x...`) or ENS name (`alpha.clawlogic.eth`).
   * @returns Transaction hash of the link operation.
   */
  async linkAgentENS(ensNodeOrName: `0x${string}` | string): Promise<`0x${string}`> {
    const wallet = this.requireWallet();
    const ensNode = resolveEnsNode(ensNodeOrName);

    const hash = await wallet.writeContract({
      address: this.config.contracts.agentRegistry,
      abi: agentRegistryAbi,
      functionName: 'linkENS',
      args: [ensNode],
    });

    return this.waitForTx(hash);
  }

  /**
   * Check whether an address is a registered agent.
   *
   * @param address - The address to check.
   * @returns True if the address is registered as an agent.
   */
  async isAgent(address: `0x${string}`): Promise<boolean> {
    const result = await this.publicClient.readContract({
      address: this.config.contracts.agentRegistry,
      abi: agentRegistryAbi,
      functionName: 'isAgent',
      args: [address],
    });
    return result as boolean;
  }

  /**
   * Get the full agent info for a registered address.
   *
   * @param address - The agent address to look up.
   * @returns AgentInfo with name, attestation, registeredAt, and exists flag.
   */
  async getAgent(address: `0x${string}`): Promise<AgentInfo> {
    const result = await this.publicClient.readContract({
      address: this.config.contracts.agentRegistry,
      abi: agentRegistryAbi,
      functionName: 'getAgent',
      args: [address],
    });

    // The result is a tuple struct: { name, attestation, registeredAt, exists }
    const agent = result as {
      name: string;
      attestation: `0x${string}`;
      registeredAt: bigint;
      exists: boolean;
      ensNode?: `0x${string}`;
    };

    return {
      address,
      name: agent.name,
      attestation: agent.attestation,
      registeredAt: agent.registeredAt,
      exists: agent.exists,
      ensNode: agent.ensNode && agent.ensNode !== ZERO_BYTES32 ? agent.ensNode : undefined,
    };
  }

  /**
   * Resolve an ENS-linked agent address from ENS namehash or name.
   *
   * @param ensNodeOrName - ENS namehash (`0x...`) or ENS name (`alpha.clawlogic.eth`).
   * @returns The registered agent address linked to the ENS node.
   */
  async getAgentByENS(ensNodeOrName: `0x${string}` | string): Promise<`0x${string}`> {
    const ensNode = resolveEnsNode(ensNodeOrName);
    const result = await this.publicClient.readContract({
      address: this.config.contracts.agentRegistry,
      abi: agentRegistryAbi,
      functionName: 'getAgentByENS',
      args: [ensNode],
    });
    const agent = result as `0x${string}`;
    if (agent.toLowerCase() === ZERO_ADDRESS) {
      throw new Error(`No agent linked to ENS node ${ensNode}`);
    }
    return agent;
  }

  /**
   * Get the total number of registered agents.
   *
   * @returns The agent count as a bigint.
   */
  async getAgentCount(): Promise<bigint> {
    const result = await this.publicClient.readContract({
      address: this.config.contracts.agentRegistry,
      abi: agentRegistryAbi,
      functionName: 'getAgentCount',
    });
    return result as bigint;
  }

  /**
   * Get all registered agent addresses.
   *
   * @returns Array of agent addresses.
   */
  async getAgentAddresses(): Promise<`0x${string}`[]> {
    const result = await this.publicClient.readContract({
      address: this.config.contracts.agentRegistry,
      abi: agentRegistryAbi,
      functionName: 'getAgentAddresses',
    });
    return result as `0x${string}`[];
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Prediction Market Methods (Write)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Create a new prediction market.
   *
   * The caller must be a registered agent. If `reward > 0`, the caller must
   * have previously approved that amount of the bond currency (i_currency)
   * to the PredictionMarketHook contract.
   *
   * @param outcome1 - Label for outcome 1 (e.g., "yes").
   * @param outcome2 - Label for outcome 2 (e.g., "no").
   * @param description - Human-readable market question.
   * @param reward - Amount of bond currency offered as incentive to the asserter.
   * @param requiredBond - Minimum bond required from an asserter.
   * @param initialLiquidityEth - Optional ETH value to seed CPMM reserves at market creation.
   * @returns Transaction hash of the market creation.
   */
  async initializeMarket(
    outcome1: string,
    outcome2: string,
    description: string,
    reward: bigint,
    requiredBond: bigint,
    initialLiquidityEth: bigint = 0n,
  ): Promise<`0x${string}`> {
    const wallet = this.requireWallet();

    const hash = await wallet.writeContract({
      address: this.config.contracts.predictionMarketHook,
      abi: predictionMarketHookAbi,
      functionName: 'initializeMarket',
      args: [outcome1, outcome2, description, reward, requiredBond],
      value: initialLiquidityEth,
    });

    return this.waitForTx(hash);
  }

  /**
   * Deposit ETH collateral to mint equal amounts of both outcome tokens.
   *
   * The caller must be a registered agent. Sends `ethAmount` in wei as
   * msg.value and receives that amount of outcome1Token AND outcome2Token.
   *
   * @param marketId - The market to mint tokens for (bytes32).
   * @param ethAmount - Amount of ETH to deposit as collateral (in wei).
   * @returns Transaction hash of the mint operation.
   */
  async mintOutcomeTokens(
    marketId: `0x${string}`,
    ethAmount: bigint,
  ): Promise<`0x${string}`> {
    const wallet = this.requireWallet();

    const hash = await wallet.writeContract({
      address: this.config.contracts.predictionMarketHook,
      abi: predictionMarketHookAbi,
      functionName: 'mintOutcomeTokens',
      args: [marketId],
      value: ethAmount,
    });

    return this.waitForTx(hash);
  }

  /**
   * Assert the outcome of a market via UMA Optimistic Oracle V3.
   *
   * The caller must be a registered agent. The asserted outcome must exactly
   * match `outcome1`, `outcome2`, or the literal string "Unresolvable".
   * The caller must have approved the required bond amount of `i_currency`
   * to the PredictionMarketHook contract.
   *
   * @param marketId - The market to assert (bytes32).
   * @param assertedOutcome - The outcome string being asserted.
   * @returns Transaction hash of the assertion.
   */
  async assertMarket(
    marketId: `0x${string}`,
    assertedOutcome: string,
  ): Promise<`0x${string}`> {
    const wallet = this.requireWallet();

    const hash = await wallet.writeContract({
      address: this.config.contracts.predictionMarketHook,
      abi: predictionMarketHookAbi,
      functionName: 'assertMarket',
      args: [marketId, assertedOutcome],
    });

    return this.waitForTx(hash);
  }

  /**
   * Redeem winning outcome tokens for proportional ETH collateral.
   *
   * The market must be resolved. The caller's winning tokens are burned and
   * they receive a proportional share of the total collateral.
   *
   * @param marketId - The resolved market (bytes32).
   * @returns Transaction hash of the settlement.
   */
  async settleOutcomeTokens(marketId: `0x${string}`): Promise<`0x${string}`> {
    const wallet = this.requireWallet();

    const hash = await wallet.writeContract({
      address: this.config.contracts.predictionMarketHook,
      abi: predictionMarketHookAbi,
      functionName: 'settleOutcomeTokens',
      args: [marketId],
    });

    return this.waitForTx(hash);
  }

  /**
   * Buy directional outcome tokens via the built-in CPMM.
   *
   * Sends ETH to the contract, which mints both tokens into AMM reserves
   * then releases tokens from the chosen side based on the constant product
   * invariant. This shifts the market probability.
   *
   * @param marketId - The market to trade on (bytes32).
   * @param isOutcome1 - True to buy outcome1 (YES) tokens, false for outcome2 (NO).
   * @param ethAmount - Amount of ETH to spend (in wei).
   * @param minTokensOut - Minimum tokens expected (slippage protection). Defaults to 0.
   * @returns Transaction hash of the buy operation.
   */
  async buyOutcomeToken(
    marketId: `0x${string}`,
    isOutcome1: boolean,
    ethAmount: bigint,
    minTokensOut: bigint = 0n,
  ): Promise<`0x${string}`> {
    const wallet = this.requireWallet();

    const hash = await wallet.writeContract({
      address: this.config.contracts.predictionMarketHook,
      abi: predictionMarketHookAbi,
      functionName: 'buyOutcomeToken',
      args: [marketId, isOutcome1, minTokensOut],
      value: ethAmount,
    });

    return this.waitForTx(hash);
  }

  /**
   * Claim creator fees for a specific market.
   *
   * Caller must be the market creator.
   *
   * @param marketId - Market identifier (bytes32).
   * @returns Transaction hash of the claim.
   */
  async claimCreatorFees(marketId: `0x${string}`): Promise<`0x${string}`> {
    const wallet = this.requireWallet();

    const hash = await wallet.writeContract({
      address: this.config.contracts.predictionMarketHook,
      abi: predictionMarketHookAbi,
      functionName: 'claimCreatorFees',
      args: [marketId],
    });

    return this.waitForTx(hash);
  }

  /**
   * Claim protocol fees for the caller address.
   *
   * @returns Transaction hash of the claim.
   */
  async claimProtocolFees(): Promise<`0x${string}`> {
    const wallet = this.requireWallet();

    const hash = await wallet.writeContract({
      address: this.config.contracts.predictionMarketHook,
      abi: predictionMarketHookAbi,
      functionName: 'claimProtocolFees',
      args: [],
    });

    return this.waitForTx(hash);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Prediction Market Methods (Read)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get full market details for a given marketId.
   *
   * Parses the 11-value tuple returned by PredictionMarketHook.getMarket()
   * into a structured MarketInfo object.
   *
   * @param marketId - The market identifier (bytes32).
   * @returns MarketInfo with all market details.
   */
  async getMarket(marketId: `0x${string}`): Promise<MarketInfo> {
    const result = await this.publicClient.readContract({
      address: this.config.contracts.predictionMarketHook,
      abi: predictionMarketHookAbi,
      functionName: 'getMarket',
      args: [marketId],
    });

    // The result is a tuple of 11 values matching the getMarket return signature.
    const [
      description,
      outcome1,
      outcome2,
      outcome1Token,
      outcome2Token,
      reward,
      requiredBond,
      resolved,
      assertedOutcomeId,
      poolId,
      totalCollateral,
    ] = result as readonly [
      string,
      string,
      string,
      `0x${string}`,
      `0x${string}`,
      bigint,
      bigint,
      boolean,
      `0x${string}`,
      `0x${string}`,
      bigint,
    ];

    return {
      marketId,
      description,
      outcome1,
      outcome2,
      outcome1Token,
      outcome2Token,
      reward,
      requiredBond,
      resolved,
      assertedOutcomeId,
      poolId,
      totalCollateral,
    };
  }

  /**
   * Get all market IDs.
   *
   * @returns Array of all created market IDs (bytes32[]).
   */
  async getMarketIds(): Promise<`0x${string}`[]> {
    const result = await this.publicClient.readContract({
      address: this.config.contracts.predictionMarketHook,
      abi: predictionMarketHookAbi,
      functionName: 'getMarketIds',
    });
    return result as `0x${string}`[];
  }

  /**
   * Get all markets with full details.
   *
   * Calls getMarketIds() then getMarket() for each.
   * For large numbers of markets, consider using getMarketIds() + getMarket()
   * individually with pagination.
   *
   * @returns Array of MarketInfo for all markets.
   */
  async getAllMarkets(): Promise<MarketInfo[]> {
    const ids = await this.getMarketIds();
    const markets = await Promise.all(ids.map((id) => this.getMarket(id)));
    return markets;
  }

  /**
   * Get the implied probability for each outcome in a market.
   *
   * Derived from the CPMM reserve ratios. Returns 50/50 if no AMM
   * liquidity has been seeded.
   *
   * @param marketId - The market identifier (bytes32).
   * @returns MarketProbability with outcome1 and outcome2 percentages (0-100).
   */
  async getMarketProbability(marketId: `0x${string}`): Promise<MarketProbability> {
    const result = await this.publicClient.readContract({
      address: this.config.contracts.predictionMarketHook,
      abi: predictionMarketHookAbi,
      functionName: 'getMarketProbability',
      args: [marketId],
    });

    const [prob1Bps, prob2Bps] = result as [bigint, bigint];

    return {
      outcome1Probability: Number(prob1Bps) / 100,
      outcome2Probability: Number(prob2Bps) / 100,
    };
  }

  /**
   * Get the raw AMM reserves for a market.
   *
   * @param marketId - The market identifier (bytes32).
   * @returns MarketReserves with reserve1 and reserve2 in wei.
   */
  async getMarketReserves(marketId: `0x${string}`): Promise<MarketReserves> {
    const result = await this.publicClient.readContract({
      address: this.config.contracts.predictionMarketHook,
      abi: predictionMarketHookAbi,
      functionName: 'getMarketReserves',
      args: [marketId],
    });

    const [reserve1, reserve2] = result as [bigint, bigint];

    return { reserve1, reserve2 };
  }

  /**
   * Get market-level fee configuration and accrual data.
   *
   * @param marketId - The market identifier (bytes32).
   * @returns MarketFeeInfo with creator, accruals, and fee rates.
   */
  async getMarketFeeInfo(marketId: `0x${string}`): Promise<MarketFeeInfo> {
    const result = await this.publicClient.readContract({
      address: this.config.contracts.predictionMarketHook,
      abi: predictionMarketHookAbi,
      functionName: 'getMarketFeeInfo',
      args: [marketId],
    });

    const [
      creator,
      creatorFeesAccrued,
      protocolFeesAccrued,
      protocolFeeBps,
      creatorFeeBps,
    ] = result as readonly [
      `0x${string}`,
      bigint,
      bigint,
      number,
      number,
    ];

    return {
      creator,
      creatorFeesAccrued,
      protocolFeesAccrued,
      protocolFeeBps,
      creatorFeeBps,
    };
  }

  /**
   * Get claimable creator/protocol fee balances for an account.
   *
   * @param account - Address to query.
   * @returns Claimable creator and protocol fees (wei).
   */
  async getClaimableFees(account: `0x${string}`): Promise<ClaimableFees> {
    const result = await this.publicClient.readContract({
      address: this.config.contracts.predictionMarketHook,
      abi: predictionMarketHookAbi,
      functionName: 'getClaimableFees',
      args: [account],
    });

    const [creatorClaimable, protocolClaimable] = result as [bigint, bigint];
    return { creatorClaimable, protocolClaimable };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ENS Premium Name Methods
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get ENS premium registrar treasury address.
   *
   * @returns Treasury address receiving purchase payments.
   */
  async getEnsRegistrarTreasury(): Promise<`0x${string}`> {
    const address = this.getEnsPremiumRegistrarAddress();
    const result = await this.publicClient.readContract({
      address,
      abi: ensPremiumRegistrarAbi,
      functionName: 's_treasury',
    });
    return result as `0x${string}`;
  }

  /**
   * Get ENS premium registrar pricing tiers.
   *
   * @returns Price tiers for short/medium/long labels.
   */
  async getEnsRegistrarPricing(): Promise<EnsRegistrarPricing> {
    const address = this.getEnsPremiumRegistrarAddress();
    const [shortPrice, mediumPrice, longPrice] = await Promise.all([
      this.publicClient.readContract({
        address,
        abi: ensPremiumRegistrarAbi,
        functionName: 's_shortPrice',
      }),
      this.publicClient.readContract({
        address,
        abi: ensPremiumRegistrarAbi,
        functionName: 's_mediumPrice',
      }),
      this.publicClient.readContract({
        address,
        abi: ensPremiumRegistrarAbi,
        functionName: 's_longPrice',
      }),
    ]);

    return {
      shortPrice: shortPrice as bigint,
      mediumPrice: mediumPrice as bigint,
      longPrice: longPrice as bigint,
    };
  }

  /**
   * Get ENS premium registrar commit-reveal timing configuration.
   *
   * @returns Minimum commit delay and maximum commit age (seconds).
   */
  async getEnsRegistrarCommitWindow(): Promise<EnsRegistrarCommitWindow> {
    const address = this.getEnsPremiumRegistrarAddress();
    const [minDelay, maxAge] = await Promise.all([
      this.publicClient.readContract({
        address,
        abi: ensPremiumRegistrarAbi,
        functionName: 's_commitMinDelay',
      }),
      this.publicClient.readContract({
        address,
        abi: ensPremiumRegistrarAbi,
        functionName: 's_commitMaxAge',
      }),
    ]);

    return {
      minDelay: minDelay as bigint,
      maxAge: maxAge as bigint,
    };
  }

  /**
   * Get ENS premium registrar agent-only mode.
   *
   * @returns True when only registered agents can buy names.
   */
  async getEnsRegistrarAgentOnlyMode(): Promise<boolean> {
    const address = this.getEnsPremiumRegistrarAddress();
    const result = await this.publicClient.readContract({
      address,
      abi: ensPremiumRegistrarAbi,
      functionName: 's_agentOnlyMode',
    });
    return result as boolean;
  }

  /**
   * Get consolidated ENS premium registrar admin/read state.
   *
   * @returns Treasury, pricing, commit window, and agent-only mode.
   */
  async getEnsRegistrarAdminState(): Promise<EnsRegistrarAdminState> {
    const [treasury, pricing, commitWindow, agentOnlyMode] = await Promise.all([
      this.getEnsRegistrarTreasury(),
      this.getEnsRegistrarPricing(),
      this.getEnsRegistrarCommitWindow(),
      this.getEnsRegistrarAgentOnlyMode(),
    ]);

    return {
      treasury,
      pricing,
      commitWindow,
      agentOnlyMode,
    };
  }

  /**
   * Quote USDC purchase price for an ENS premium label.
   *
   * @param label - Label without suffix (e.g. "alpha").
   * @returns Price in token base units (USDC = 6 decimals).
   */
  async quoteEnsName(label: string): Promise<bigint> {
    const address = this.getEnsPremiumRegistrarAddress();
    const result = await this.publicClient.readContract({
      address,
      abi: ensPremiumRegistrarAbi,
      functionName: 'quotePrice',
      args: [label],
    });
    return result as bigint;
  }

  /**
   * Check current ENS premium label availability.
   *
   * @param label - Label without suffix.
   * @returns True if available for purchase.
   */
  async isEnsNameAvailable(label: string): Promise<boolean> {
    const address = this.getEnsPremiumRegistrarAddress();
    const result = await this.publicClient.readContract({
      address,
      abi: ensPremiumRegistrarAbi,
      functionName: 'isNameAvailable',
      args: [label],
    });
    return result as boolean;
  }

  /**
   * Get ENS premium label purchase info.
   *
   * @param label - Label without suffix.
   * @returns Owner/purchase/availability details.
   */
  async getEnsNameInfo(label: string): Promise<EnsNameInfo> {
    const address = this.getEnsPremiumRegistrarAddress();
    const result = await this.publicClient.readContract({
      address,
      abi: ensPremiumRegistrarAbi,
      functionName: 'getLabelInfo',
      args: [label],
    });
    const [owner, purchasedAt, paidPrice, subnode, available] = result as readonly [
      `0x${string}`,
      bigint,
      bigint,
      `0x${string}`,
      boolean,
    ];
    return { owner, purchasedAt, paidPrice, subnode, available };
  }

  /**
   * Compute ENS purchase commitment hash for commit-reveal purchase flow.
   *
   * @param label - Label without suffix.
   * @param secret - Random bytes32 secret.
   * @param buyerOverride - Optional buyer address override.
   * @returns Commitment hash.
   */
  async computeEnsPurchaseCommitment(
    label: string,
    secret: `0x${string}`,
    buyerOverride?: `0x${string}`,
  ): Promise<`0x${string}`> {
    const address = this.getEnsPremiumRegistrarAddress();
    const buyer = buyerOverride ?? (this.account?.address as `0x${string}` | undefined);
    if (!buyer) {
      throw new Error('ClawlogicClient: buyer address unavailable for commitment computation.');
    }

    const labelHash = (await this.publicClient.readContract({
      address,
      abi: ensPremiumRegistrarAbi,
      functionName: 'computeLabelHash',
      args: [label],
    })) as `0x${string}`;

    const commitment = await this.publicClient.readContract({
      address,
      abi: ensPremiumRegistrarAbi,
      functionName: 'computeCommitment',
      args: [buyer, labelHash, secret],
    });
    return commitment as `0x${string}`;
  }

  /**
   * Submit ENS premium purchase commitment.
   *
   * @param commitment - Commit hash from computeEnsPurchaseCommitment().
   * @returns Transaction hash.
   */
  async commitEnsNamePurchase(commitment: `0x${string}`): Promise<`0x${string}`> {
    const wallet = this.requireWallet();
    const address = this.getEnsPremiumRegistrarAddress();
    const hash = await wallet.writeContract({
      address,
      abi: ensPremiumRegistrarAbi,
      functionName: 'commitPurchase',
      args: [commitment],
    });
    return this.waitForTx(hash);
  }

  /**
   * Complete ENS premium label purchase (reveal phase).
   *
   * @param label - Label without suffix.
   * @param secret - Same bytes32 secret used in commitment.
   * @param maxPrice - Max acceptable price in token base units.
   * @returns Transaction hash.
   */
  async buyEnsName(
    label: string,
    secret: `0x${string}`,
    maxPrice: bigint,
  ): Promise<`0x${string}`> {
    const wallet = this.requireWallet();
    const address = this.getEnsPremiumRegistrarAddress();
    const hash = await wallet.writeContract({
      address,
      abi: ensPremiumRegistrarAbi,
      functionName: 'buyName',
      args: [label, secret, maxPrice],
    });
    return this.waitForTx(hash);
  }

  /**
   * Get the total number of created markets.
   *
   * @returns The market count as a bigint.
   */
  async getMarketCount(): Promise<bigint> {
    const result = await this.publicClient.readContract({
      address: this.config.contracts.predictionMarketHook,
      abi: predictionMarketHookAbi,
      functionName: 's_marketCount',
    });
    return result as bigint;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Outcome Token Methods (Read)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get the balance of an outcome token for a given owner.
   *
   * @param tokenAddress - The OutcomeToken contract address.
   * @param ownerAddress - The address to check the balance of.
   * @returns The token balance as a bigint.
   */
  async getOutcomeTokenBalance(
    tokenAddress: `0x${string}`,
    ownerAddress: `0x${string}`,
  ): Promise<bigint> {
    const result = await this.publicClient.readContract({
      address: tokenAddress,
      abi: outcomeTokenAbi,
      functionName: 'balanceOf',
      args: [ownerAddress],
    });
    return result as bigint;
  }

  /**
   * Get the total supply of an outcome token.
   *
   * @param tokenAddress - The OutcomeToken contract address.
   * @returns The total supply as a bigint.
   */
  async getOutcomeTokenTotalSupply(tokenAddress: `0x${string}`): Promise<bigint> {
    const result = await this.publicClient.readContract({
      address: tokenAddress,
      abi: outcomeTokenAbi,
      functionName: 'totalSupply',
    });
    return result as bigint;
  }

  /**
   * Get both outcome token balances for a given agent in a specific market.
   *
   * @param marketId - The market identifier.
   * @param ownerAddress - The address to check balances for.
   * @returns Object with outcome1Balance and outcome2Balance.
   */
  async getPositions(
    marketId: `0x${string}`,
    ownerAddress: `0x${string}`,
  ): Promise<{ outcome1Balance: bigint; outcome2Balance: bigint }> {
    const market = await this.getMarket(marketId);

    const [outcome1Balance, outcome2Balance] = await Promise.all([
      this.getOutcomeTokenBalance(market.outcome1Token, ownerAddress),
      this.getOutcomeTokenBalance(market.outcome2Token, ownerAddress),
    ]);

    return { outcome1Balance, outcome2Balance };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Protocol Info Methods
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get the bond currency address used by the PredictionMarketHook.
   *
   * @returns The ERC-20 bond currency contract address.
   */
  async getBondCurrency(): Promise<`0x${string}`> {
    const result = await this.publicClient.readContract({
      address: this.config.contracts.predictionMarketHook,
      abi: predictionMarketHookAbi,
      functionName: 'i_currency',
    });
    return result as `0x${string}`;
  }

  /**
   * Get the default liveness window for UMA assertions (in seconds).
   *
   * @returns The liveness window as a bigint (seconds).
   */
  async getDefaultLiveness(): Promise<bigint> {
    const result = await this.publicClient.readContract({
      address: this.config.contracts.predictionMarketHook,
      abi: predictionMarketHookAbi,
      functionName: 'i_defaultLiveness',
    });
    return result as bigint;
  }

  /**
   * Get the UMA Optimistic Oracle V3 address used by the hook.
   *
   * @returns The OOV3 contract address.
   */
  async getOracleAddress(): Promise<`0x${string}`> {
    const result = await this.publicClient.readContract({
      address: this.config.contracts.predictionMarketHook,
      abi: predictionMarketHookAbi,
      functionName: 'i_oo',
    });
    return result as `0x${string}`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Event Watching
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Watch for all prediction market events in real time.
   *
   * Subscribes to: MarketInitialized, TokensMinted, MarketAsserted,
   * MarketResolved, AssertionFailed, AssertionDisputed, TokensSettled.
   *
   * @param callback - Function called for each new event.
   * @returns An unwatch function. Call it to stop watching.
   */
  watchMarketEvents(callback: MarketEventCallback): () => void {
    const hookAddress = this.config.contracts.predictionMarketHook;
    const unwatchers: WatchContractEventReturnType[] = [];

    // Helper to create a watcher for a specific event
    const watchEvent = (
      eventName: MarketEvent['type'],
    ) => {
      const unwatch = this.publicClient.watchContractEvent({
        address: hookAddress,
        abi: predictionMarketHookAbi,
        eventName,
        onLogs: (logs: Log[]) => {
          for (const log of logs) {
            const typedLog = log as Log & { args?: Record<string, unknown> };
            const marketId =
              (typedLog.args?.['marketId'] as `0x${string}`) ??
              '0x0000000000000000000000000000000000000000000000000000000000000000';

            callback({
              type: eventName,
              marketId,
              blockNumber: log.blockNumber ?? 0n,
              transactionHash: log.transactionHash ?? ('0x' as `0x${string}`),
              args: (typedLog.args ?? {}) as Record<string, unknown>,
            });
          }
        },
      });
      unwatchers.push(unwatch);
    };

    watchEvent('MarketInitialized');
    watchEvent('TokensMinted');
    watchEvent('MarketAsserted');
    watchEvent('MarketResolved');
    watchEvent('AssertionFailed');
    watchEvent('AssertionDisputed');
    watchEvent('TokensSettled');
    watchEvent('OutcomeTokenBought');

    // Return a single unwatch function that stops all watchers
    return () => {
      for (const unwatch of unwatchers) {
        unwatch();
      }
    };
  }

  /**
   * Watch for AgentRegistered events from the AgentRegistry.
   *
   * @param callback - Function called with (agent address, name) for each registration.
   * @returns An unwatch function. Call it to stop watching.
   */
  watchAgentRegistrations(
    callback: (agent: `0x${string}`, name: string) => void,
  ): () => void {
    return this.publicClient.watchContractEvent({
      address: this.config.contracts.agentRegistry,
      abi: agentRegistryAbi,
      eventName: 'AgentRegistered',
      onLogs: (logs: Log[]) => {
        for (const log of logs) {
          const typedLog = log as Log & { args?: Record<string, unknown> };
          const agent = (typedLog.args?.['agent'] as `0x${string}`) ?? '0x';
          const name = (typedLog.args?.['name'] as string) ?? '';
          callback(agent, name);
        }
      },
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Utility Methods
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get the address of the account associated with this client.
   *
   * @returns The account address, or undefined if read-only.
   */
  getAddress(): `0x${string}` | undefined {
    return this.account?.address;
  }

  /**
   * Get the ETH balance of the connected account.
   *
   * @returns The balance in wei.
   */
  async getBalance(): Promise<bigint> {
    const address = this.getAddress();
    if (!address) {
      throw new Error('ClawlogicClient: No account available (read-only client).');
    }
    return this.publicClient.getBalance({ address });
  }

  /**
   * Get the ETH balance of any address.
   *
   * @param address - The address to check.
   * @returns The balance in wei.
   */
  async getBalanceOf(address: `0x${string}`): Promise<bigint> {
    return this.publicClient.getBalance({ address });
  }
}
