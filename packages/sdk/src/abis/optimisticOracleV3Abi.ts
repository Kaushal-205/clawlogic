/**
 * Minimal ABI for UMA's Optimistic Oracle V3 -- the calls an agent needs to
 * dispute an assertion and to settle one once its liveness window has passed.
 */
export const optimisticOracleV3Abi = [
  {
    type: 'function',
    name: 'getAssertion',
    inputs: [{ name: 'assertionId', type: 'bytes32' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          {
            name: 'escalationManagerSettings',
            type: 'tuple',
            components: [
              { name: 'arbitrateViaEscalationManager', type: 'bool' },
              { name: 'discardOracle', type: 'bool' },
              { name: 'validateDisputers', type: 'bool' },
              { name: 'assertingCaller', type: 'address' },
              { name: 'escalationManager', type: 'address' },
            ],
          },
          { name: 'asserter', type: 'address' },
          { name: 'assertionTime', type: 'uint64' },
          { name: 'settled', type: 'bool' },
          { name: 'currency', type: 'address' },
          { name: 'expirationTime', type: 'uint64' },
          { name: 'settlementResolution', type: 'bool' },
          { name: 'domainId', type: 'bytes32' },
          { name: 'identifier', type: 'bytes32' },
          { name: 'bond', type: 'uint256' },
          { name: 'callbackRecipient', type: 'address' },
          { name: 'disputer', type: 'address' },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'disputeAssertion',
    inputs: [
      { name: 'assertionId', type: 'bytes32' },
      { name: 'disputer', type: 'address' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'settleAssertion',
    inputs: [{ name: 'assertionId', type: 'bytes32' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'getMinimumBond',
    inputs: [{ name: 'currency', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const;
