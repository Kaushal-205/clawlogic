/**
 * ABI for the PredictionMarketHook contract.
 * Extracted from the Foundry build artifact.
 * Only includes the functions, events, and errors relevant to the SDK
 * (excludes V4 hook callbacks like beforeSwap, afterSwap, etc.).
 */
export const predictionMarketHookAbi = [
  // ── Market Lifecycle Functions ──────────────────────────────────────
  {
    type: 'function',
    name: 'initializeMarket',
    inputs: [
      { name: 'outcome1', type: 'string', internalType: 'string' },
      { name: 'outcome2', type: 'string', internalType: 'string' },
      { name: 'description', type: 'string', internalType: 'string' },
      { name: 'reward', type: 'uint256', internalType: 'uint256' },
      { name: 'requiredBond', type: 'uint256', internalType: 'uint256' },
    ],
    outputs: [{ name: 'marketId', type: 'bytes32', internalType: 'bytes32' }],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    name: 'mintOutcomeTokens',
    inputs: [{ name: 'marketId', type: 'bytes32', internalType: 'bytes32' }],
    outputs: [],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    name: 'assertMarket',
    inputs: [
      { name: 'marketId', type: 'bytes32', internalType: 'bytes32' },
      { name: 'assertedOutcome', type: 'string', internalType: 'string' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'settleOutcomeTokens',
    inputs: [{ name: 'marketId', type: 'bytes32', internalType: 'bytes32' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },

  // ── CPMM Functions ───────────────────────────────────────────────────
  {
    type: 'function',
    name: 'buyOutcomeToken',
    inputs: [
      { name: 'marketId', type: 'bytes32', internalType: 'bytes32' },
      { name: 'isOutcome1', type: 'bool', internalType: 'bool' },
      { name: 'minTokensOut', type: 'uint256', internalType: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    name: 'getMarketProbability',
    inputs: [{ name: 'marketId', type: 'bytes32', internalType: 'bytes32' }],
    outputs: [
      { name: 'prob1Bps', type: 'uint256', internalType: 'uint256' },
      { name: 'prob2Bps', type: 'uint256', internalType: 'uint256' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getMarketReserves',
    inputs: [{ name: 'marketId', type: 'bytes32', internalType: 'bytes32' }],
    outputs: [
      { name: 'reserve1', type: 'uint256', internalType: 'uint256' },
      { name: 'reserve2', type: 'uint256', internalType: 'uint256' },
    ],
    stateMutability: 'view',
  },

  // ── View / Read Functions ──────────────────────────────────────────
  {
    type: 'function',
    name: 'getMarket',
    inputs: [{ name: 'marketId', type: 'bytes32', internalType: 'bytes32' }],
    outputs: [
      { name: 'description', type: 'string', internalType: 'string' },
      { name: 'outcome1', type: 'string', internalType: 'string' },
      { name: 'outcome2', type: 'string', internalType: 'string' },
      { name: 'outcome1Token', type: 'address', internalType: 'address' },
      { name: 'outcome2Token', type: 'address', internalType: 'address' },
      { name: 'reward', type: 'uint256', internalType: 'uint256' },
      { name: 'requiredBond', type: 'uint256', internalType: 'uint256' },
      { name: 'resolved', type: 'bool', internalType: 'bool' },
      { name: 'assertedOutcomeId', type: 'bytes32', internalType: 'bytes32' },
      { name: 'poolId', type: 'bytes32', internalType: 'PoolId' },
      { name: 'totalCollateral', type: 'uint256', internalType: 'uint256' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getMarketIds',
    inputs: [],
    outputs: [{ name: '', type: 'bytes32[]', internalType: 'bytes32[]' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'i_currency',
    inputs: [],
    outputs: [{ name: '', type: 'address', internalType: 'contract IERC20' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'i_defaultIdentifier',
    inputs: [],
    outputs: [{ name: '', type: 'bytes32', internalType: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'i_defaultLiveness',
    inputs: [],
    outputs: [{ name: '', type: 'uint64', internalType: 'uint64' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'i_oo',
    inputs: [],
    outputs: [
      { name: '', type: 'address', internalType: 'contract OptimisticOracleV3Interface' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'i_registry',
    inputs: [],
    outputs: [{ name: '', type: 'address', internalType: 'contract IAgentRegistry' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 's_assertionToMarket',
    inputs: [{ name: '', type: 'bytes32', internalType: 'bytes32' }],
    outputs: [{ name: '', type: 'bytes32', internalType: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 's_marketCount',
    inputs: [],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view',
  },

  // ── Events ─────────────────────────────────────────────────────────
  {
    type: 'event',
    name: 'MarketInitialized',
    inputs: [
      { name: 'marketId', type: 'bytes32', indexed: true, internalType: 'bytes32' },
      { name: 'description', type: 'string', indexed: false, internalType: 'string' },
      { name: 'creator', type: 'address', indexed: true, internalType: 'address' },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'TokensMinted',
    inputs: [
      { name: 'marketId', type: 'bytes32', indexed: true, internalType: 'bytes32' },
      { name: 'agent', type: 'address', indexed: true, internalType: 'address' },
      { name: 'amount', type: 'uint256', indexed: false, internalType: 'uint256' },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'MarketAsserted',
    inputs: [
      { name: 'marketId', type: 'bytes32', indexed: true, internalType: 'bytes32' },
      { name: 'assertedOutcome', type: 'string', indexed: false, internalType: 'string' },
      { name: 'asserter', type: 'address', indexed: true, internalType: 'address' },
      { name: 'assertionId', type: 'bytes32', indexed: false, internalType: 'bytes32' },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'MarketResolved',
    inputs: [
      { name: 'marketId', type: 'bytes32', indexed: true, internalType: 'bytes32' },
      { name: 'outcomeId', type: 'bytes32', indexed: false, internalType: 'bytes32' },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'AssertionFailed',
    inputs: [
      { name: 'marketId', type: 'bytes32', indexed: true, internalType: 'bytes32' },
      { name: 'assertionId', type: 'bytes32', indexed: false, internalType: 'bytes32' },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'AssertionDisputed',
    inputs: [
      { name: 'marketId', type: 'bytes32', indexed: true, internalType: 'bytes32' },
      { name: 'assertionId', type: 'bytes32', indexed: false, internalType: 'bytes32' },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'TokensSettled',
    inputs: [
      { name: 'marketId', type: 'bytes32', indexed: true, internalType: 'bytes32' },
      { name: 'agent', type: 'address', indexed: true, internalType: 'address' },
      { name: 'payout', type: 'uint256', indexed: false, internalType: 'uint256' },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'OutcomeTokenBought',
    inputs: [
      { name: 'marketId', type: 'bytes32', indexed: true, internalType: 'bytes32' },
      { name: 'buyer', type: 'address', indexed: true, internalType: 'address' },
      { name: 'isOutcome1', type: 'bool', indexed: false, internalType: 'bool' },
      { name: 'ethIn', type: 'uint256', indexed: false, internalType: 'uint256' },
      { name: 'tokensOut', type: 'uint256', indexed: false, internalType: 'uint256' },
    ],
    anonymous: false,
  },

  // ── Errors ─────────────────────────────────────────────────────────
  { type: 'error', name: 'ActiveAssertionExists', inputs: [] },
  { type: 'error', name: 'EthTransferFailed', inputs: [] },
  { type: 'error', name: 'HookNotImplemented', inputs: [] },
  { type: 'error', name: 'InvalidOutcome', inputs: [] },
  { type: 'error', name: 'MarketAlreadyResolved', inputs: [] },
  { type: 'error', name: 'MarketNotFound', inputs: [] },
  { type: 'error', name: 'MarketNotResolved', inputs: [] },
  { type: 'error', name: 'NoTokensToSettle', inputs: [] },
  { type: 'error', name: 'NotPoolManager', inputs: [] },
  { type: 'error', name: 'NotRegisteredAgent', inputs: [] },
  { type: 'error', name: 'OnlyOracle', inputs: [] },
  {
    type: 'error',
    name: 'SafeERC20FailedOperation',
    inputs: [{ name: 'token', type: 'address', internalType: 'address' }],
  },
  { type: 'error', name: 'InsufficientOutput', inputs: [] },
  { type: 'error', name: 'ZeroMintAmount', inputs: [] },
] as const;
