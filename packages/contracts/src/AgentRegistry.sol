// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IAgentRegistry} from "./interfaces/IAgentRegistry.sol";
import {IENS} from "./interfaces/IENS.sol";
import {IERC8004AgentValidation} from "./interfaces/erc8004/IERC8004AgentValidation.sol";

/// @title AgentRegistry
/// @author $CLAWLOGIC Team
/// @notice On-chain identity registry for autonomous AI agents with optional ENS integration.
/// @dev This contract is the "Silicon Gate" of the $CLAWLOGIC protocol.
///      The PredictionMarketHook's `beforeSwap` and `beforeAddLiquidity` hooks
///      call `isAgent()` on this registry to enforce agent-only access to markets.
///
///      For the MVP, registration is permissionless -- any address can register by
///      calling `registerAgent()`. In production, this would require verified TEE
///      attestation data to cryptographically prove the caller is an autonomous agent
///      running inside a Trusted Execution Environment.
///
///      **Phase 1.1 -- ENS Identity Integration:**
///      Agents can optionally link an ENS node (e.g., `alpha.agent.eth`) to their address
///      during registration. ENS ownership is verified on-chain by querying the ENS
///      Registry's `owner()` function. The original `registerAgent()` signature is preserved
///      for backward compatibility; agents that do not need ENS simply call the old function.
///
///      If the ENS registry address is `address(0)` (the default for chains without ENS),
///      all ENS-related operations will revert with `ENSNotConfigured()`.
///
///      **Phase 1.3 -- Phala TEE Attestation Integration:**
///      Agents can optionally provide a TEE attestation quote and public key during ENS
///      registration via `registerAgentWithENSAndTEE()`. If a validation registry is
///      configured and attestation data is provided, the registry will forward the
///      attestation to the `AgentValidationRegistry.verifyTeeAttestation()` function for
///      on-chain verification via the Phala zkDCAP verifier. This provides hardware-verified
///      agent identity. If the validation registry is `address(0)`, TEE operations are
///      skipped gracefully.
contract AgentRegistry is IAgentRegistry {
    // -------------------------------------------------
    // Custom Errors (contract-level, not in interface)
    // -------------------------------------------------

    /// @notice Thrown when an ENS operation is attempted but no ENS registry was configured
    error ENSNotConfigured();

    /// @notice Thrown when a TEE attestation operation is attempted but no validation registry was configured
    error ValidationRegistryNotConfigured();

    // -------------------------------------------------
    // Immutables
    // -------------------------------------------------

    /// @notice The ENS Registry contract used for ownership verification.
    /// @dev Set to address(0) on chains without ENS. All ENS operations will revert in that case.
    IENS public immutable i_ensRegistry;

    /// @notice The ERC-8004 Agent Validation Registry for TEE attestation verification.
    /// @dev Set to address(0) on deployments without ERC-8004 validation support.
    ///      When configured, agents can verify TEE attestations during registration.
    IERC8004AgentValidation public immutable i_validationRegistry;

    // -------------------------------------------------
    // State Variables
    // -------------------------------------------------

    /// @dev Maps agent address to its Agent struct (name, attestation, registeredAt, exists, ensNode)
    mapping(address => Agent) private s_agents;

    /// @dev Maps ENS namehash to the agent address that claimed it. Used for ENS -> address resolution.
    mapping(bytes32 => address) private s_ensNodeToAgent;

    /// @notice The total number of registered agents
    uint256 public s_agentCount;

    /// @dev Array of all registered agent addresses, used for enumeration via getAgentAddresses()
    address[] private s_agentAddresses;

    // -------------------------------------------------
    // Constructor
    // -------------------------------------------------

    /// @notice Deploys the AgentRegistry, optionally binding it to an ENS Registry
    ///         and an ERC-8004 Validation Registry.
    /// @param ensRegistry_ The ENS Registry address. Pass IENS(address(0)) to disable ENS features.
    /// @param validationRegistry_ The ERC-8004 Validation Registry address. Pass
    ///        IERC8004AgentValidation(address(0)) to disable TEE attestation during registration.
    constructor(IENS ensRegistry_, IERC8004AgentValidation validationRegistry_) {
        i_ensRegistry = ensRegistry_;
        i_validationRegistry = validationRegistry_;
    }

    // -------------------------------------------------
    // External Functions
    // -------------------------------------------------

    /// @inheritdoc IAgentRegistry
    /// @dev Backward-compatible registration without ENS linkage. Delegates to the internal
    ///      registration logic with ensNode = bytes32(0).
    function registerAgent(string calldata name, bytes calldata attestation) external {
        _registerAgent(msg.sender, name, attestation, bytes32(0));
    }

    /// @inheritdoc IAgentRegistry
    /// @dev Registration with optional ENS linkage. If `ensNode` is non-zero, verifies that
    ///      the caller owns the node in the ENS registry before linking it.
    function registerAgentWithENS(string calldata name, bytes calldata attestation, bytes32 ensNode) external {
        _registerAgent(msg.sender, name, attestation, ensNode);
    }

    /// @notice Register the caller as an agent with optional ENS linkage and TEE attestation.
    /// @dev Extends `registerAgentWithENS` with Phala TEE attestation verification.
    ///      If `attestationQuote` is non-empty, the validation registry's
    ///      `verifyTeeAttestation()` is called to verify the attestation on-chain.
    ///      The external call to the validation registry happens AFTER all state writes
    ///      in `_registerAgent()`, following the Checks-Effects-Interactions pattern.
    ///
    ///      The `agentId` parameter is the ERC-8004 identity token ID that was minted for
    ///      this agent in the AgentIdentityRegistry. The caller must obtain this ID before
    ///      calling this function (e.g., from the `AgentIdentityMinted` event). The validation
    ///      registry independently verifies that this agentId exists.
    /// @param name Human-readable agent name. Must be non-empty.
    /// @param attestation TEE attestation bytes stored in the Agent struct.
    /// @param ensNode The ENS namehash to link. Pass bytes32(0) for no ENS linkage.
    /// @param agentId The ERC-8004 identity token ID for this agent.
    /// @param attestationQuote The raw Intel SGX DCAP attestation quote. Pass empty bytes
    ///        to skip TEE verification.
    /// @param publicKey The public key expected to be embedded in the attestation quote.
    function registerAgentWithENSAndTEE(
        string calldata name,
        bytes calldata attestation,
        bytes32 ensNode,
        uint256 agentId,
        bytes calldata attestationQuote,
        bytes calldata publicKey
    ) external {
        _registerAgent(msg.sender, name, attestation, ensNode);

        // ── Interactions (TEE attestation -- external call after state writes) ──
        if (attestationQuote.length > 0) {
            if (address(i_validationRegistry) == address(0)) {
                revert ValidationRegistryNotConfigured();
            }

            i_validationRegistry.verifyTeeAttestation(agentId, attestationQuote, publicKey);
        }
    }

    /// @inheritdoc IAgentRegistry
    function isAgent(address addr) external view returns (bool) {
        return s_agents[addr].exists;
    }

    /// @inheritdoc IAgentRegistry
    function getAgent(address addr) external view returns (Agent memory) {
        return s_agents[addr];
    }

    /// @inheritdoc IAgentRegistry
    function getAgentCount() external view returns (uint256) {
        return s_agentCount;
    }

    /// @inheritdoc IAgentRegistry
    function getAgentAddresses() external view returns (address[] memory) {
        return s_agentAddresses;
    }

    /// @inheritdoc IAgentRegistry
    /// @dev Reverts with `ENSNodeNotLinked` if no agent is linked to the given node.
    function getAgentByENS(bytes32 ensNode) external view returns (address) {
        address agent = s_ensNodeToAgent[ensNode];
        if (agent == address(0)) {
            revert ENSNodeNotLinked();
        }
        return agent;
    }

    // -------------------------------------------------
    // Internal Functions
    // -------------------------------------------------

    /// @notice Core registration logic shared by `registerAgent` and `registerAgentWithENS`.
    /// @dev Performs all validation, stores the agent, and optionally links an ENS node.
    ///      Follows Checks-Effects-Interactions: all state is written before any external calls
    ///      (though ENS ownership check is a view call, not a state mutation, so it is safe to
    ///      perform before state writes -- we do it first for fail-fast behavior).
    /// @param agent       The address being registered (always msg.sender from external callers).
    /// @param name        Human-readable agent name. Must be non-empty.
    /// @param attestation TEE attestation bytes.
    /// @param ensNode     Optional ENS namehash. bytes32(0) to skip ENS linkage.
    function _registerAgent(address agent, string calldata name, bytes calldata attestation, bytes32 ensNode) internal {
        // ── Checks ──────────────────────────────────────────────────────────
        if (s_agents[agent].exists) {
            revert AlreadyRegistered();
        }

        if (bytes(name).length == 0) {
            revert EmptyName();
        }

        // If ENS linkage is requested, verify ownership and uniqueness.
        if (ensNode != bytes32(0)) {
            if (address(i_ensRegistry) == address(0)) {
                revert ENSNotConfigured();
            }

            // Verify the caller owns the ENS node. This is a view call -- no reentrancy risk.
            if (i_ensRegistry.owner(ensNode) != agent) {
                revert NotENSOwner();
            }

            // Ensure the ENS node is not already claimed by another agent.
            if (s_ensNodeToAgent[ensNode] != address(0)) {
                revert ENSNodeAlreadyLinked();
            }
        }

        // ── Effects ─────────────────────────────────────────────────────────
        s_agents[agent] = Agent({
            name: name,
            attestation: attestation,
            registeredAt: block.timestamp,
            exists: true,
            ensNode: ensNode
        });

        s_agentCount++;
        s_agentAddresses.push(agent);

        // Link ENS node -> agent address (bidirectional: agent struct has ensNode, mapping has address).
        if (ensNode != bytes32(0)) {
            s_ensNodeToAgent[ensNode] = agent;
        }

        // ── Events ──────────────────────────────────────────────────────────
        emit AgentRegistered(agent, name);

        if (ensNode != bytes32(0)) {
            emit ENSLinked(agent, ensNode, name);
        }
    }
}
