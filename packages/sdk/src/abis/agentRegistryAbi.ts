/**
 * ABI for the AgentRegistry contract.
 * Extracted from the Foundry build artifact.
 */
export const agentRegistryAbi = [
  {
    type: 'function',
    name: 'getAgent',
    inputs: [{ name: 'addr', type: 'address', internalType: 'address' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        internalType: 'struct IAgentRegistry.Agent',
        components: [
          { name: 'name', type: 'string', internalType: 'string' },
          { name: 'attestation', type: 'bytes', internalType: 'bytes' },
          { name: 'registeredAt', type: 'uint256', internalType: 'uint256' },
          { name: 'exists', type: 'bool', internalType: 'bool' },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getAgentAddresses',
    inputs: [],
    outputs: [{ name: '', type: 'address[]', internalType: 'address[]' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getAgentCount',
    inputs: [],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'isAgent',
    inputs: [{ name: 'addr', type: 'address', internalType: 'address' }],
    outputs: [{ name: '', type: 'bool', internalType: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'registerAgent',
    inputs: [
      { name: 'name', type: 'string', internalType: 'string' },
      { name: 'attestation', type: 'bytes', internalType: 'bytes' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 's_agentCount',
    inputs: [],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'event',
    name: 'AgentRegistered',
    inputs: [
      { name: 'agent', type: 'address', indexed: true, internalType: 'address' },
      { name: 'name', type: 'string', indexed: false, internalType: 'string' },
    ],
    anonymous: false,
  },
  { type: 'error', name: 'AgentNotFound', inputs: [] },
  { type: 'error', name: 'AlreadyRegistered', inputs: [] },
  { type: 'error', name: 'EmptyName', inputs: [] },
] as const;
