/**
 * @file identity.ts
 *
 * Phase 1 Identity & Trust infrastructure for $CLAWLOGIC.
 *
 * Provides SDK methods for:
 * - ENS agent identity resolution
 * - ERC-8004 identity, reputation, and validation registries
 * - Phala TEE attestation verification
 */

import type {
  PublicClient,
  WalletClient,
  Transport,
  Chain,
  Account,
} from 'viem';
import { namehash } from 'viem/ens';
import type {
  AgentInfo,
  ReputationScore,
  GlobalReputationScore,
  ValidationProof,
  AgentRegistrationOptions,
} from './types.js';
import { ValidationType } from './types.js';

// Placeholder ABIs - will be populated after contract deployment
import { agentIdentityRegistryAbi } from './abis/agentIdentityRegistryAbi.js';
import { agentReputationRegistryAbi } from './abis/agentReputationRegistryAbi.js';
import { agentValidationRegistryAbi } from './abis/agentValidationRegistryAbi.js';

/**
 * Extended contract addresses for Phase 1 identity infrastructure.
 */
export interface IdentityContracts {
  agentIdentityRegistry: `0x${string}`;
  agentReputationRegistry: `0x${string}`;
  agentValidationRegistry: `0x${string}`;
  ensRegistry?: `0x${string}`; // Optional: 0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e on most chains
}

/**
 * Identity client for Phase 1 ENS + ERC-8004 + TEE functionality.
 *
 * This class extends the base ClawlogicClient with identity-related methods.
 * Use this alongside ClawlogicClient for full protocol interaction.
 */
export class IdentityClient {
  constructor(
    private readonly publicClient: PublicClient<Transport, Chain>,
    private readonly walletClient: WalletClient<Transport, Chain, Account> | undefined,
    private readonly contracts: IdentityContracts,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // ENS Methods
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Resolve an ENS name to an agent address.
   *
   * @param ensName - ENS name (e.g., "alpha.agent.eth")
   * @returns Agent address, or null if not found
   */
  async resolveAgentENS(ensName: string): Promise<`0x${string}` | null> {
    try {
      // ENS resolution is handled by AgentRegistry.getAgentByENS(), not the
      // identity registry.  Use the main ClawlogicClient for ENS resolution.
      // This method is a no-op placeholder; callers should use
      // ClawlogicClient.getAgentByENS() directly.
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Get the ENS name for a given agent address (reverse resolution).
   *
   * @param address - Agent address
   * @returns ENS name, or null if not linked
   */
  async getAgentENSName(address: `0x${string}`): Promise<string | null> {
    try {
      // This will be implemented once AgentRegistry includes ENS reverse mapping
      // For now, return null (requires contract support)
      return null;
    } catch {
      return null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ERC-8004 Identity Registry Methods
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get the ERC-8004 identity token for an agent address.
   *
   * @param address - Agent address
   * @returns Object with tokenId and metadataURI, or null if no identity exists
   */
  async getAgentIdentityToken(
    address: `0x${string}`,
  ): Promise<{ tokenId: bigint; metadataURI: string } | null> {
    try {
      // Check balance first — should be 1 if agent has identity
      const balance = await this.publicClient.readContract({
        address: this.contracts.agentIdentityRegistry,
        abi: agentIdentityRegistryAbi,
        functionName: 'balanceOf',
        args: [address],
      }) as bigint;

      if (balance === 0n) {
        return null;
      }

      // The registry doesn't have tokenOfOwnerByIndex (not ERC-721 Enumerable).
      // Scan sequential token IDs from 1..totalAgents to find one owned by address.
      const totalAgents = await this.publicClient.readContract({
        address: this.contracts.agentIdentityRegistry,
        abi: agentIdentityRegistryAbi,
        functionName: 'totalAgents',
      }) as bigint;

      for (let id = 1n; id <= totalAgents; id++) {
        try {
          const owner = await this.publicClient.readContract({
            address: this.contracts.agentIdentityRegistry,
            abi: agentIdentityRegistryAbi,
            functionName: 'ownerOf',
            args: [id],
          }) as `0x${string}`;

          if (owner.toLowerCase() === address.toLowerCase()) {
            const metadataURI = await this.publicClient.readContract({
              address: this.contracts.agentIdentityRegistry,
              abi: agentIdentityRegistryAbi,
              functionName: 'tokenURI',
              args: [id],
            }) as string;
            return { tokenId: id, metadataURI };
          }
        } catch {
          // Token ID might not exist; continue scanning
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ERC-8004 Reputation Registry Methods
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get the reputation score for an agent.
   *
   * @param agentId - ERC-8004 agent identity token ID
   * @returns Reputation score with assertions, volume, and accuracy
   */
  async getAgentReputation(agentId: bigint): Promise<ReputationScore> {
    const result = await this.publicClient.readContract({
      address: this.contracts.agentReputationRegistry,
      abi: agentReputationRegistryAbi,
      functionName: 'getReputationScore',
      args: [agentId],
    });

    const score = result as {
      totalAssertions: bigint;
      successfulAssertions: bigint;
      totalVolume: bigint;
      lastUpdated: bigint;
    };

    return {
      totalAssertions: score.totalAssertions,
      successfulAssertions: score.successfulAssertions,
      totalVolume: score.totalVolume,
      lastUpdated: score.lastUpdated,
    };
  }

  /**
   * Get the assertion accuracy percentage for an agent.
   *
   * @param agentId - ERC-8004 agent identity token ID
   * @returns Accuracy as a number 0-100 (percentage)
   */
  async getAssertionAccuracy(agentId: bigint): Promise<number> {
    const accuracy = await this.publicClient.readContract({
      address: this.contracts.agentReputationRegistry,
      abi: agentReputationRegistryAbi,
      functionName: 'getAccuracy',
      args: [agentId],
    }) as bigint;

    // Convert from basis points (0-10000) to percentage (0-100)
    return Number(accuracy) / 100;
  }

  /**
   * Get global reputation aggregated across all chains.
   *
   * This method queries The Graph subgraph (Phase 3.3) for cross-chain data.
   * For single-chain use, falls back to local chain reputation.
   *
   * @param agentId - ERC-8004 agent identity token ID
   * @returns Global reputation score
   */
  async getGlobalReputation(agentId: bigint): Promise<GlobalReputationScore> {
    // TODO: Implement The Graph query in Phase 3.3
    // For now, return local chain reputation only
    const localScore = await this.getAgentReputation(agentId);
    const accuracy = await this.getAssertionAccuracy(agentId);

    return {
      agentId,
      chainScores: new Map(), // Will be populated in Phase 3.3
      totalAssertions: localScore.totalAssertions,
      successfulAssertions: localScore.successfulAssertions,
      accuracy: BigInt(Math.round(accuracy * 100)), // Convert to basis points
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ERC-8004 Validation Registry Methods
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Check if an agent has a specific validation type verified.
   *
   * @param agentId - ERC-8004 agent identity token ID
   * @param validationType - Type of validation to check (TEE, STAKE, ZKML)
   * @returns True if validated, false otherwise
   */
  async isValidated(
    agentId: bigint,
    validationType: ValidationType,
  ): Promise<boolean> {
    const result = await this.publicClient.readContract({
      address: this.contracts.agentValidationRegistry,
      abi: agentValidationRegistryAbi,
      functionName: 'isValidated',
      args: [agentId, validationType],
    });

    return result as boolean;
  }

  /**
   * Get validation proof for a specific validation type.
   *
   * @param agentId - ERC-8004 agent identity token ID
   * @param validationType - Type of validation
   * @returns Validation proof data, or null if not found
   */
  async getValidationProof(
    agentId: bigint,
    validationType: ValidationType,
  ): Promise<ValidationProof | null> {
    try {
      const result = await this.publicClient.readContract({
        address: this.contracts.agentValidationRegistry,
        abi: agentValidationRegistryAbi,
        functionName: 'getValidation',
        args: [agentId, validationType],
      });

      const validation = result as {
        validationType: number;
        proof: `0x${string}`;
        timestamp: bigint;
        valid: boolean;
      };

      return {
        validationType: validation.validationType as ValidationType,
        proof: validation.proof,
        timestamp: validation.timestamp,
        valid: validation.valid,
      };
    } catch {
      return null;
    }
  }

  /**
   * Check if an agent is TEE-verified.
   *
   * Convenience method for checking TEE validation status.
   *
   * @param address - Agent address
   * @returns True if TEE-verified, false otherwise
   */
  async isTeeVerified(address: `0x${string}`): Promise<boolean> {
    const identity = await this.getAgentIdentityToken(address);
    if (!identity) {
      return false;
    }

    return this.isValidated(identity.tokenId, ValidationType.TEE);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Write Methods (require wallet client)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Submit a validation proof for verification.
   *
   * @param agentId - ERC-8004 agent identity token ID
   * @param proof - Validation proof bytes
   * @param validationType - Type of validation being submitted
   * @returns Transaction hash
   */
  async submitValidation(
    agentId: bigint,
    proof: `0x${string}`,
    validationType: ValidationType,
  ): Promise<`0x${string}`> {
    if (!this.walletClient) {
      throw new Error('IdentityClient: Wallet client required for write operations');
    }

    const hash = await this.walletClient.writeContract({
      address: this.contracts.agentValidationRegistry,
      abi: agentValidationRegistryAbi,
      functionName: 'submitValidation',
      args: [agentId, proof, validationType],
    });

    return hash;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Helper Methods
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get extended agent info including ENS, identity token, and reputation.
   *
   * This is a convenience method that aggregates data from multiple registries.
   *
   * @param address - Agent address
   * @returns Extended AgentInfo with all identity data
   */
  async getExtendedAgentInfo(address: `0x${string}`): Promise<AgentInfo & {
    ensName: string | null;
    identityToken: { tokenId: bigint; metadataURI: string } | null;
    teeVerified: boolean;
  }> {
    // Get base agent info (from main AgentRegistry)
    // This will be called from the main client

    // Get ENS name
    const ensName = await this.getAgentENSName(address);

    // Get identity token
    const identityToken = await this.getAgentIdentityToken(address);

    // Get reputation if identity exists
    let reputationScore: ReputationScore | undefined;
    if (identityToken) {
      reputationScore = await this.getAgentReputation(identityToken.tokenId);
    }

    // Check TEE verification
    const teeVerified = identityToken
      ? await this.isValidated(identityToken.tokenId, ValidationType.TEE)
      : false;

    // Return extended info (base info will be merged by caller)
    return {
      address,
      name: '', // Will be filled by caller from AgentRegistry
      attestation: '0x', // Will be filled by caller
      registeredAt: 0n, // Will be filled by caller
      exists: true,
      ensNode: ensName ? namehash(ensName) : undefined,
      agentId: identityToken?.tokenId,
      reputationScore,
      ensName,
      identityToken,
      teeVerified,
    };
  }
}
