/**
 * ABI for the AgentRegistry contract.
 * Extracted from the Foundry build artifact.
 *
 * Phase 1.1: Includes ENS identity integration (registerAgentWithENS, getAgentByENS,
 * i_ensRegistry, ENSLinked event, ENS-related errors).
 * Phase 1.3: Includes Phala TEE attestation integration (registerAgentWithENSAndTEE,
 * i_validationRegistry, ValidationRegistryNotConfigured error).
 */
export const agentRegistryAbi = [
  {
    type: 'constructor',
    inputs: [
      { name: 'ensRegistry_', type: 'address', internalType: 'contract IENS' },
      { name: 'validationRegistry_', type: 'address', internalType: 'contract IERC8004AgentValidation' },
    ],
    stateMutability: 'nonpayable',
  },
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
          { name: 'ensNode', type: 'bytes32', internalType: 'bytes32' },
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
    name: 'getAgentByENS',
    inputs: [{ name: 'ensNode', type: 'bytes32', internalType: 'bytes32' }],
    outputs: [{ name: '', type: 'address', internalType: 'address' }],
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
    name: 'i_ensRegistry',
    inputs: [],
    outputs: [{ name: '', type: 'address', internalType: 'contract IENS' }],
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
    name: 'registerAgentWithENS',
    inputs: [
      { name: 'name', type: 'string', internalType: 'string' },
      { name: 'attestation', type: 'bytes', internalType: 'bytes' },
      { name: 'ensNode', type: 'bytes32', internalType: 'bytes32' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'registerAgentWithENSAndTEE',
    inputs: [
      { name: 'name', type: 'string', internalType: 'string' },
      { name: 'attestation', type: 'bytes', internalType: 'bytes' },
      { name: 'ensNode', type: 'bytes32', internalType: 'bytes32' },
      { name: 'agentId', type: 'uint256', internalType: 'uint256' },
      { name: 'attestationQuote', type: 'bytes', internalType: 'bytes' },
      { name: 'publicKey', type: 'bytes', internalType: 'bytes' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'i_validationRegistry',
    inputs: [],
    outputs: [{ name: '', type: 'address', internalType: 'contract IERC8004AgentValidation' }],
    stateMutability: 'view',
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
  {
    type: 'event',
    name: 'ENSLinked',
    inputs: [
      { name: 'agent', type: 'address', indexed: true, internalType: 'address' },
      { name: 'ensNode', type: 'bytes32', indexed: true, internalType: 'bytes32' },
      { name: 'name', type: 'string', indexed: false, internalType: 'string' },
    ],
    anonymous: false,
  },
  { type: 'error', name: 'AgentNotFound', inputs: [] },
  { type: 'error', name: 'AlreadyRegistered', inputs: [] },
  { type: 'error', name: 'ENSNodeAlreadyLinked', inputs: [] },
  { type: 'error', name: 'ENSNodeNotLinked', inputs: [] },
  { type: 'error', name: 'ENSNotConfigured', inputs: [] },
  { type: 'error', name: 'EmptyName', inputs: [] },
  { type: 'error', name: 'NotENSOwner', inputs: [] },
  { type: 'error', name: 'ValidationRegistryNotConfigured', inputs: [] },
] as const;
