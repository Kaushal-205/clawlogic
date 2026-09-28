/**
 * ABI for the PredictionMarketHook contract.
 * Generated from the Foundry build artifact
 * (packages/contracts/out/PredictionMarketHook.sol/PredictionMarketHook.json).
 * Excludes the V4 hook callbacks (beforeSwap, afterSwap, ...) and the constructor.
 */
export const predictionMarketHookAbi = [
  {
    type: 'function',
    name: 'BPS',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'uint256',
        internalType: 'uint256'
      }
    ],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'MAX_MARKET_CREATION_FEE',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'uint256',
        internalType: 'uint256'
      }
    ],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'MAX_TOTAL_FEE_BPS',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'uint256',
        internalType: 'uint256'
      }
    ],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'acceptOwnership',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    type: 'function',
    name: 'addLiquidity',
    inputs: [
      {
        name: 'marketId',
        type: 'bytes32',
        internalType: 'bytes32'
      }
    ],
    outputs: [
      {
        name: 'shares',
        type: 'uint256',
        internalType: 'uint256'
      }
    ],
    stateMutability: 'payable'
  },
  {
    type: 'function',
    name: 'assertMarket',
    inputs: [
      {
        name: 'marketId',
        type: 'bytes32',
        internalType: 'bytes32'
      },
      {
        name: 'assertedOutcome',
        type: 'string',
        internalType: 'string'
      }
    ],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    type: 'function',
    name: 'assertionDisputedCallback',
    inputs: [
      {
        name: 'assertionId',
        type: 'bytes32',
        internalType: 'bytes32'
      }
    ],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    type: 'function',
    name: 'assertionResolvedCallback',
    inputs: [
      {
        name: 'assertionId',
        type: 'bytes32',
        internalType: 'bytes32'
      },
      {
        name: 'assertedTruthfully',
        type: 'bool',
        internalType: 'bool'
      }
    ],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    type: 'function',
    name: 'buyOutcomeToken',
    inputs: [
      {
        name: 'marketId',
        type: 'bytes32',
        internalType: 'bytes32'
      },
      {
        name: 'isOutcome1',
        type: 'bool',
        internalType: 'bool'
      },
      {
        name: 'minTokensOut',
        type: 'uint256',
        internalType: 'uint256'
      }
    ],
    outputs: [],
    stateMutability: 'payable'
  },
  {
    type: 'function',
    name: 'computeMarketKey',
    inputs: [
      {
        name: 'description',
        type: 'string',
        internalType: 'string'
      },
      {
        name: 'outcome1',
        type: 'string',
        internalType: 'string'
      },
      {
        name: 'outcome2',
        type: 'string',
        internalType: 'string'
      }
    ],
    outputs: [
      {
        name: '',
        type: 'bytes32',
        internalType: 'bytes32'
      }
    ],
    stateMutability: 'pure'
  },
  {
    type: 'function',
    name: 'createMarket',
    inputs: [
      {
        name: 'outcome1',
        type: 'string',
        internalType: 'string'
      },
      {
        name: 'outcome2',
        type: 'string',
        internalType: 'string'
      },
      {
        name: 'description',
        type: 'string',
        internalType: 'string'
      },
      {
        name: 'reward',
        type: 'uint256',
        internalType: 'uint256'
      },
      {
        name: 'requiredBond',
        type: 'uint256',
        internalType: 'uint256'
      },
      {
        name: 'closeTime',
        type: 'uint64',
        internalType: 'uint64'
      }
    ],
    outputs: [
      {
        name: 'marketId',
        type: 'bytes32',
        internalType: 'bytes32'
      }
    ],
    stateMutability: 'payable'
  },
  {
    type: 'function',
    name: 'getAssertionBond',
    inputs: [
      {
        name: 'marketId',
        type: 'bytes32',
        internalType: 'bytes32'
      }
    ],
    outputs: [
      {
        name: '',
        type: 'uint256',
        internalType: 'uint256'
      }
    ],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'getMarket',
    inputs: [
      {
        name: 'marketId',
        type: 'bytes32',
        internalType: 'bytes32'
      }
    ],
    outputs: [
      {
        name: 'description',
        type: 'string',
        internalType: 'string'
      },
      {
        name: 'outcome1',
        type: 'string',
        internalType: 'string'
      },
      {
        name: 'outcome2',
        type: 'string',
        internalType: 'string'
      },
      {
        name: 'outcome1Token',
        type: 'address',
        internalType: 'address'
      },
      {
        name: 'outcome2Token',
        type: 'address',
        internalType: 'address'
      },
      {
        name: 'reward',
        type: 'uint256',
        internalType: 'uint256'
      },
      {
        name: 'requiredBond',
        type: 'uint256',
        internalType: 'uint256'
      },
      {
        name: 'resolved',
        type: 'bool',
        internalType: 'bool'
      },
      {
        name: 'assertedOutcomeId',
        type: 'bytes32',
        internalType: 'bytes32'
      },
      {
        name: 'poolId',
        type: 'bytes32',
        internalType: 'PoolId'
      },
      {
        name: 'totalCollateral',
        type: 'uint256',
        internalType: 'uint256'
      }
    ],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'getMarketIdByQuestion',
    inputs: [
      {
        name: 'description',
        type: 'string',
        internalType: 'string'
      },
      {
        name: 'outcome1',
        type: 'string',
        internalType: 'string'
      },
      {
        name: 'outcome2',
        type: 'string',
        internalType: 'string'
      }
    ],
    outputs: [
      {
        name: '',
        type: 'bytes32',
        internalType: 'bytes32'
      }
    ],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'getMarketIds',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'bytes32[]',
        internalType: 'bytes32[]'
      }
    ],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'getMarketInfo',
    inputs: [
      {
        name: 'marketId',
        type: 'bytes32',
        internalType: 'bytes32'
      }
    ],
    outputs: [
      {
        name: 'creator',
        type: 'address',
        internalType: 'address'
      },
      {
        name: 'closeTime',
        type: 'uint64',
        internalType: 'uint64'
      },
      {
        name: 'activeAssertionId',
        type: 'bytes32',
        internalType: 'bytes32'
      },
      {
        name: 'totalLpShares',
        type: 'uint256',
        internalType: 'uint256'
      },
      {
        name: 'marketKey',
        type: 'bytes32',
        internalType: 'bytes32'
      },
      {
        name: 'tradingOpen',
        type: 'bool',
        internalType: 'bool'
      }
    ],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'getMarketProbability',
    inputs: [
      {
        name: 'marketId',
        type: 'bytes32',
        internalType: 'bytes32'
      }
    ],
    outputs: [
      {
        name: 'prob1Bps',
        type: 'uint256',
        internalType: 'uint256'
      },
      {
        name: 'prob2Bps',
        type: 'uint256',
        internalType: 'uint256'
      }
    ],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'getMarketReserves',
    inputs: [
      {
        name: 'marketId',
        type: 'bytes32',
        internalType: 'bytes32'
      }
    ],
    outputs: [
      {
        name: 'reserve1',
        type: 'uint256',
        internalType: 'uint256'
      },
      {
        name: 'reserve2',
        type: 'uint256',
        internalType: 'uint256'
      }
    ],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'i_currency',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'address',
        internalType: 'contract IERC20'
      }
    ],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'i_defaultIdentifier',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'bytes32',
        internalType: 'bytes32'
      }
    ],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'i_defaultLiveness',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'uint64',
        internalType: 'uint64'
      }
    ],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'i_oo',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'address',
        internalType: 'contract OptimisticOracleV3Interface'
      }
    ],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'i_registry',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'address',
        internalType: 'contract IAgentRegistry'
      }
    ],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'initializeMarket',
    inputs: [
      {
        name: 'outcome1',
        type: 'string',
        internalType: 'string'
      },
      {
        name: 'outcome2',
        type: 'string',
        internalType: 'string'
      },
      {
        name: 'description',
        type: 'string',
        internalType: 'string'
      },
      {
        name: 'reward',
        type: 'uint256',
        internalType: 'uint256'
      },
      {
        name: 'requiredBond',
        type: 'uint256',
        internalType: 'uint256'
      }
    ],
    outputs: [
      {
        name: 'marketId',
        type: 'bytes32',
        internalType: 'bytes32'
      }
    ],
    stateMutability: 'payable'
  },
  {
    type: 'function',
    name: 'isEligibleAgent',
    inputs: [
      {
        name: 'account',
        type: 'address',
        internalType: 'address'
      }
    ],
    outputs: [
      {
        name: '',
        type: 'bool',
        internalType: 'bool'
      }
    ],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'mergeOutcomeTokens',
    inputs: [
      {
        name: 'marketId',
        type: 'bytes32',
        internalType: 'bytes32'
      },
      {
        name: 'amount',
        type: 'uint256',
        internalType: 'uint256'
      }
    ],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    type: 'function',
    name: 'mintOutcomeTokens',
    inputs: [
      {
        name: 'marketId',
        type: 'bytes32',
        internalType: 'bytes32'
      }
    ],
    outputs: [],
    stateMutability: 'payable'
  },
  {
    type: 'function',
    name: 'owner',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'address',
        internalType: 'address'
      }
    ],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'pendingOwner',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'address',
        internalType: 'address'
      }
    ],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'poolManager',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'address',
        internalType: 'contract IPoolManager'
      }
    ],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'quoteBuy',
    inputs: [
      {
        name: 'marketId',
        type: 'bytes32',
        internalType: 'bytes32'
      },
      {
        name: 'isOutcome1',
        type: 'bool',
        internalType: 'bool'
      },
      {
        name: 'ethIn',
        type: 'uint256',
        internalType: 'uint256'
      }
    ],
    outputs: [
      {
        name: 'tokensOut',
        type: 'uint256',
        internalType: 'uint256'
      },
      {
        name: 'protocolFee',
        type: 'uint256',
        internalType: 'uint256'
      },
      {
        name: 'lpFee',
        type: 'uint256',
        internalType: 'uint256'
      }
    ],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'quoteSell',
    inputs: [
      {
        name: 'marketId',
        type: 'bytes32',
        internalType: 'bytes32'
      },
      {
        name: 'isOutcome1',
        type: 'bool',
        internalType: 'bool'
      },
      {
        name: 'tokensIn',
        type: 'uint256',
        internalType: 'uint256'
      }
    ],
    outputs: [
      {
        name: 'ethOut',
        type: 'uint256',
        internalType: 'uint256'
      },
      {
        name: 'protocolFee',
        type: 'uint256',
        internalType: 'uint256'
      },
      {
        name: 'lpFee',
        type: 'uint256',
        internalType: 'uint256'
      }
    ],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'removeLiquidity',
    inputs: [
      {
        name: 'marketId',
        type: 'bytes32',
        internalType: 'bytes32'
      },
      {
        name: 'shares',
        type: 'uint256',
        internalType: 'uint256'
      }
    ],
    outputs: [
      {
        name: 'amount1',
        type: 'uint256',
        internalType: 'uint256'
      },
      {
        name: 'amount2',
        type: 'uint256',
        internalType: 'uint256'
      }
    ],
    stateMutability: 'nonpayable'
  },
  {
    type: 'function',
    name: 'renounceOwnership',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    type: 'function',
    name: 's_activeMarketByKey',
    inputs: [
      {
        name: '',
        type: 'bytes32',
        internalType: 'bytes32'
      }
    ],
    outputs: [
      {
        name: '',
        type: 'bytes32',
        internalType: 'bytes32'
      }
    ],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 's_assertionToMarket',
    inputs: [
      {
        name: '',
        type: 'bytes32',
        internalType: 'bytes32'
      }
    ],
    outputs: [
      {
        name: '',
        type: 'bytes32',
        internalType: 'bytes32'
      }
    ],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 's_erc8004IdentityRegistry',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'address',
        internalType: 'contract IERC8004IdentityBalance'
      }
    ],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 's_lpFeeBps',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'uint256',
        internalType: 'uint256'
      }
    ],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 's_lpShares',
    inputs: [
      {
        name: '',
        type: 'bytes32',
        internalType: 'bytes32'
      },
      {
        name: '',
        type: 'address',
        internalType: 'address'
      }
    ],
    outputs: [
      {
        name: '',
        type: 'uint256',
        internalType: 'uint256'
      }
    ],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 's_marketCount',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'uint256',
        internalType: 'uint256'
      }
    ],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 's_marketCreationFee',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'uint256',
        internalType: 'uint256'
      }
    ],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 's_paused',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'bool',
        internalType: 'bool'
      }
    ],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 's_protocolFeeBps',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'uint256',
        internalType: 'uint256'
      }
    ],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 's_protocolFeesAccrued',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'uint256',
        internalType: 'uint256'
      }
    ],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 's_treasury',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'address',
        internalType: 'address'
      }
    ],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'sellOutcomeToken',
    inputs: [
      {
        name: 'marketId',
        type: 'bytes32',
        internalType: 'bytes32'
      },
      {
        name: 'isOutcome1',
        type: 'bool',
        internalType: 'bool'
      },
      {
        name: 'tokensIn',
        type: 'uint256',
        internalType: 'uint256'
      },
      {
        name: 'minEthOut',
        type: 'uint256',
        internalType: 'uint256'
      }
    ],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    type: 'function',
    name: 'setErc8004IdentityRegistry',
    inputs: [
      {
        name: 'registry',
        type: 'address',
        internalType: 'address'
      }
    ],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    type: 'function',
    name: 'setFees',
    inputs: [
      {
        name: 'protocolFeeBps',
        type: 'uint256',
        internalType: 'uint256'
      },
      {
        name: 'lpFeeBps',
        type: 'uint256',
        internalType: 'uint256'
      }
    ],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    type: 'function',
    name: 'setMarketCreationFee',
    inputs: [
      {
        name: 'fee',
        type: 'uint256',
        internalType: 'uint256'
      }
    ],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    type: 'function',
    name: 'setPaused',
    inputs: [
      {
        name: 'paused',
        type: 'bool',
        internalType: 'bool'
      }
    ],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    type: 'function',
    name: 'setTreasury',
    inputs: [
      {
        name: 'treasury',
        type: 'address',
        internalType: 'address'
      }
    ],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    type: 'function',
    name: 'settleOutcomeTokens',
    inputs: [
      {
        name: 'marketId',
        type: 'bytes32',
        internalType: 'bytes32'
      }
    ],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    type: 'function',
    name: 'transferOwnership',
    inputs: [
      {
        name: 'newOwner',
        type: 'address',
        internalType: 'address'
      }
    ],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    type: 'function',
    name: 'withdrawProtocolFees',
    inputs: [],
    outputs: [
      {
        name: 'amount',
        type: 'uint256',
        internalType: 'uint256'
      }
    ],
    stateMutability: 'nonpayable'
  },
  {
    type: 'event',
    name: 'AssertionDisputed',
    inputs: [
      {
        name: 'marketId',
        type: 'bytes32',
        indexed: true,
        internalType: 'bytes32'
      },
      {
        name: 'assertionId',
        type: 'bytes32',
        indexed: false,
        internalType: 'bytes32'
      }
    ],
    anonymous: false
  },
  {
    type: 'event',
    name: 'AssertionFailed',
    inputs: [
      {
        name: 'marketId',
        type: 'bytes32',
        indexed: true,
        internalType: 'bytes32'
      },
      {
        name: 'assertionId',
        type: 'bytes32',
        indexed: false,
        internalType: 'bytes32'
      }
    ],
    anonymous: false
  },
  {
    type: 'event',
    name: 'Erc8004IdentityRegistryUpdated',
    inputs: [
      {
        name: 'registry',
        type: 'address',
        indexed: false,
        internalType: 'address'
      }
    ],
    anonymous: false
  },
  {
    type: 'event',
    name: 'FeesUpdated',
    inputs: [
      {
        name: 'protocolFeeBps',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256'
      },
      {
        name: 'lpFeeBps',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256'
      }
    ],
    anonymous: false
  },
  {
    type: 'event',
    name: 'LiquidityAdded',
    inputs: [
      {
        name: 'marketId',
        type: 'bytes32',
        indexed: true,
        internalType: 'bytes32'
      },
      {
        name: 'provider',
        type: 'address',
        indexed: true,
        internalType: 'address'
      },
      {
        name: 'amount',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256'
      },
      {
        name: 'shares',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256'
      }
    ],
    anonymous: false
  },
  {
    type: 'event',
    name: 'LiquidityRemoved',
    inputs: [
      {
        name: 'marketId',
        type: 'bytes32',
        indexed: true,
        internalType: 'bytes32'
      },
      {
        name: 'provider',
        type: 'address',
        indexed: true,
        internalType: 'address'
      },
      {
        name: 'shares',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256'
      },
      {
        name: 'amount1',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256'
      },
      {
        name: 'amount2',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256'
      }
    ],
    anonymous: false
  },
  {
    type: 'event',
    name: 'MarketAsserted',
    inputs: [
      {
        name: 'marketId',
        type: 'bytes32',
        indexed: true,
        internalType: 'bytes32'
      },
      {
        name: 'assertedOutcome',
        type: 'string',
        indexed: false,
        internalType: 'string'
      },
      {
        name: 'asserter',
        type: 'address',
        indexed: true,
        internalType: 'address'
      },
      {
        name: 'assertionId',
        type: 'bytes32',
        indexed: false,
        internalType: 'bytes32'
      }
    ],
    anonymous: false
  },
  {
    type: 'event',
    name: 'MarketConfigured',
    inputs: [
      {
        name: 'marketId',
        type: 'bytes32',
        indexed: true,
        internalType: 'bytes32'
      },
      {
        name: 'creator',
        type: 'address',
        indexed: true,
        internalType: 'address'
      },
      {
        name: 'closeTime',
        type: 'uint64',
        indexed: false,
        internalType: 'uint64'
      },
      {
        name: 'marketKey',
        type: 'bytes32',
        indexed: false,
        internalType: 'bytes32'
      },
      {
        name: 'creationFee',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256'
      }
    ],
    anonymous: false
  },
  {
    type: 'event',
    name: 'MarketCreationFeeUpdated',
    inputs: [
      {
        name: 'fee',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256'
      }
    ],
    anonymous: false
  },
  {
    type: 'event',
    name: 'MarketInitialized',
    inputs: [
      {
        name: 'marketId',
        type: 'bytes32',
        indexed: true,
        internalType: 'bytes32'
      },
      {
        name: 'description',
        type: 'string',
        indexed: false,
        internalType: 'string'
      },
      {
        name: 'creator',
        type: 'address',
        indexed: true,
        internalType: 'address'
      }
    ],
    anonymous: false
  },
  {
    type: 'event',
    name: 'MarketResolved',
    inputs: [
      {
        name: 'marketId',
        type: 'bytes32',
        indexed: true,
        internalType: 'bytes32'
      },
      {
        name: 'outcomeId',
        type: 'bytes32',
        indexed: false,
        internalType: 'bytes32'
      }
    ],
    anonymous: false
  },
  {
    type: 'event',
    name: 'OutcomeTokenBought',
    inputs: [
      {
        name: 'marketId',
        type: 'bytes32',
        indexed: true,
        internalType: 'bytes32'
      },
      {
        name: 'buyer',
        type: 'address',
        indexed: true,
        internalType: 'address'
      },
      {
        name: 'isOutcome1',
        type: 'bool',
        indexed: false,
        internalType: 'bool'
      },
      {
        name: 'ethIn',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256'
      },
      {
        name: 'tokensOut',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256'
      }
    ],
    anonymous: false
  },
  {
    type: 'event',
    name: 'OutcomeTokenSold',
    inputs: [
      {
        name: 'marketId',
        type: 'bytes32',
        indexed: true,
        internalType: 'bytes32'
      },
      {
        name: 'seller',
        type: 'address',
        indexed: true,
        internalType: 'address'
      },
      {
        name: 'isOutcome1',
        type: 'bool',
        indexed: false,
        internalType: 'bool'
      },
      {
        name: 'tokensIn',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256'
      },
      {
        name: 'ethOut',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256'
      }
    ],
    anonymous: false
  },
  {
    type: 'event',
    name: 'OwnershipTransferStarted',
    inputs: [
      {
        name: 'previousOwner',
        type: 'address',
        indexed: true,
        internalType: 'address'
      },
      {
        name: 'newOwner',
        type: 'address',
        indexed: true,
        internalType: 'address'
      }
    ],
    anonymous: false
  },
  {
    type: 'event',
    name: 'OwnershipTransferred',
    inputs: [
      {
        name: 'previousOwner',
        type: 'address',
        indexed: true,
        internalType: 'address'
      },
      {
        name: 'newOwner',
        type: 'address',
        indexed: true,
        internalType: 'address'
      }
    ],
    anonymous: false
  },
  {
    type: 'event',
    name: 'PausedUpdated',
    inputs: [
      {
        name: 'paused',
        type: 'bool',
        indexed: false,
        internalType: 'bool'
      }
    ],
    anonymous: false
  },
  {
    type: 'event',
    name: 'ProtocolFeesWithdrawn',
    inputs: [
      {
        name: 'treasury',
        type: 'address',
        indexed: true,
        internalType: 'address'
      },
      {
        name: 'amount',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256'
      }
    ],
    anonymous: false
  },
  {
    type: 'event',
    name: 'TokensMerged',
    inputs: [
      {
        name: 'marketId',
        type: 'bytes32',
        indexed: true,
        internalType: 'bytes32'
      },
      {
        name: 'agent',
        type: 'address',
        indexed: true,
        internalType: 'address'
      },
      {
        name: 'amount',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256'
      }
    ],
    anonymous: false
  },
  {
    type: 'event',
    name: 'TokensMinted',
    inputs: [
      {
        name: 'marketId',
        type: 'bytes32',
        indexed: true,
        internalType: 'bytes32'
      },
      {
        name: 'agent',
        type: 'address',
        indexed: true,
        internalType: 'address'
      },
      {
        name: 'amount',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256'
      }
    ],
    anonymous: false
  },
  {
    type: 'event',
    name: 'TokensSettled',
    inputs: [
      {
        name: 'marketId',
        type: 'bytes32',
        indexed: true,
        internalType: 'bytes32'
      },
      {
        name: 'agent',
        type: 'address',
        indexed: true,
        internalType: 'address'
      },
      {
        name: 'payout',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256'
      }
    ],
    anonymous: false
  },
  {
    type: 'event',
    name: 'TradeFeesCharged',
    inputs: [
      {
        name: 'marketId',
        type: 'bytes32',
        indexed: true,
        internalType: 'bytes32'
      },
      {
        name: 'protocolFee',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256'
      },
      {
        name: 'lpFee',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256'
      }
    ],
    anonymous: false
  },
  {
    type: 'event',
    name: 'TreasuryUpdated',
    inputs: [
      {
        name: 'treasury',
        type: 'address',
        indexed: false,
        internalType: 'address'
      }
    ],
    anonymous: false
  },
  {
    type: 'error',
    name: 'ActiveAssertionExists',
    inputs: []
  },
  {
    type: 'error',
    name: 'AssertionPending',
    inputs: []
  },
  {
    type: 'error',
    name: 'DuplicateMarket',
    inputs: [
      {
        name: 'existingMarketId',
        type: 'bytes32',
        internalType: 'bytes32'
      }
    ]
  },
  {
    type: 'error',
    name: 'EthTransferFailed',
    inputs: []
  },
  {
    type: 'error',
    name: 'FeeTooHigh',
    inputs: []
  },
  {
    type: 'error',
    name: 'HookNotImplemented',
    inputs: []
  },
  {
    type: 'error',
    name: 'InsufficientCreationFee',
    inputs: []
  },
  {
    type: 'error',
    name: 'InsufficientOutput',
    inputs: []
  },
  {
    type: 'error',
    name: 'InsufficientShares',
    inputs: []
  },
  {
    type: 'error',
    name: 'InvalidCloseTime',
    inputs: []
  },
  {
    type: 'error',
    name: 'InvalidMarketParams',
    inputs: []
  },
  {
    type: 'error',
    name: 'InvalidOutcome',
    inputs: []
  },
  {
    type: 'error',
    name: 'MarketAlreadyResolved',
    inputs: []
  },
  {
    type: 'error',
    name: 'MarketNotFound',
    inputs: []
  },
  {
    type: 'error',
    name: 'MarketNotResolved',
    inputs: []
  },
  {
    type: 'error',
    name: 'NoLiquidity',
    inputs: []
  },
  {
    type: 'error',
    name: 'NoTokensToSettle',
    inputs: []
  },
  {
    type: 'error',
    name: 'NotPoolManager',
    inputs: []
  },
  {
    type: 'error',
    name: 'NotRegisteredAgent',
    inputs: []
  },
  {
    type: 'error',
    name: 'OnlyOracle',
    inputs: []
  },
  {
    type: 'error',
    name: 'OwnableInvalidOwner',
    inputs: [
      {
        name: 'owner',
        type: 'address',
        internalType: 'address'
      }
    ]
  },
  {
    type: 'error',
    name: 'OwnableUnauthorizedAccount',
    inputs: [
      {
        name: 'account',
        type: 'address',
        internalType: 'address'
      }
    ]
  },
  {
    type: 'error',
    name: 'ProtocolPaused',
    inputs: []
  },
  {
    type: 'error',
    name: 'ReentrancyGuardReentrantCall',
    inputs: []
  },
  {
    type: 'error',
    name: 'SafeERC20FailedOperation',
    inputs: [
      {
        name: 'token',
        type: 'address',
        internalType: 'address'
      }
    ]
  },
  {
    type: 'error',
    name: 'TradingClosed',
    inputs: []
  },
  {
    type: 'error',
    name: 'ZeroAddress',
    inputs: []
  },
  {
    type: 'error',
    name: 'ZeroMintAmount',
    inputs: []
  }
] as const;
