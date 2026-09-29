// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IAgentRegistry} from "./interfaces/IAgentRegistry.sol";
import {IENS} from "./interfaces/IENS.sol";
import {IERC8004AgentValidation} from "./interfaces/erc8004/IERC8004AgentValidation.sol";

/// @title AgentRegistry
/// @author CLAWLOGIC Team
/// @notice On-chain identity registry for autonomous AI agents with optional ENS integration.
/// @dev This contract is the "Silicon Gate" of the CLAWLOGIC protocol.
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
///      ENS links follow live ownership: `getAgentByENS` only returns an agent that still
///      owns the node, and a new owner can take over a stale link with `linkENS()`.
///
///      **Phase 1.3 -- Phala TEE Attestation Integration:**
///      TEE attestations are verified by the identity owner directly on
///      `AgentValidationRegistry.verifyTeeAttestation()`, which binds the attested key to the
///      ERC-8004 identity. `i_validationRegistry` records which registry this deployment uses.
contract AgentRegistry is IAgentRegistry {
    // -------------------------------------------------
    // Custom Errors (contract-level, not in interface)
    // -------------------------------------------------

    /// @notice Thrown when an ENS operation is attempted but no ENS registry was configured
    error ENSNotConfigured();

    // -------------------------------------------------
    // Immutables
    // -------------------------------------------------

    /// @notice The ENS Registry contract used for ownership verification.
    /// @dev Set to address(0) on chains without ENS. All ENS operations will revert in that case.
    IENS public immutable i_ensRegistry;

    /// @notice The ERC-8004 Agent Validation Registry used by this deployment (discovery only).
    /// @dev Set to address(0) on deployments without ERC-8004 validation support.
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

    /// @inheritdoc IAgentRegistry
    /// @dev Replaces the caller's current link, and takes the node over from a previous
    ///      owner whose link went stale when the name was transferred.
    function linkENS(bytes32 ensNode) external {
        if (!s_agents[msg.sender].exists) {
            revert AgentNotFound();
        }
        if (ensNode == bytes32(0)) {
            revert NotENSOwner();
        }
        _linkENS(msg.sender, ensNode);
    }

    /// @inheritdoc IAgentRegistry
    function isAgent(address addr) external view returns (bool) {
        return s_agents[addr].exists;
    }

    /// @inheritdoc IAgentRegistry
    /// @dev `ensNode` is zeroed when the agent no longer owns the linked node.
    function getAgent(address addr) external view returns (Agent memory agent) {
        agent = s_agents[addr];
        if (agent.ensNode != bytes32(0) && i_ensRegistry.owner(agent.ensNode) != addr) {
            agent.ensNode = bytes32(0);
        }
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
    /// @dev Reverts with `ENSNodeNotLinked` if no agent is linked to the given node, or if the
    ///      linked agent no longer owns it in the ENS registry.
    function getAgentByENS(bytes32 ensNode) external view returns (address) {
        address agent = s_ensNodeToAgent[ensNode];
        if (agent == address(0) || i_ensRegistry.owner(ensNode) != agent) {
            revert ENSNodeNotLinked();
        }
        return agent;
    }

    // -------------------------------------------------
    // Internal Functions
    // -------------------------------------------------

    /// @notice Core registration logic shared by `registerAgent` and `registerAgentWithENS`.
    /// @dev Validates and stores the agent, then optionally links an ENS node (`_linkENS`
    ///      reverts the whole registration if the caller does not own the node).
    /// @param agent       The address being registered (always msg.sender from external callers).
    /// @param name        Human-readable agent name. Must be non-empty.
    /// @param attestation TEE attestation bytes.
    /// @param ensNode     Optional ENS namehash. bytes32(0) to skip ENS linkage.
    function _registerAgent(address agent, string calldata name, bytes calldata attestation, bytes32 ensNode) internal {
        // ── Checks
        // ──────────────────────────────────────────────────────────
        if (s_agents[agent].exists) {
            revert AlreadyRegistered();
        }

        if (bytes(name).length == 0) {
            revert EmptyName();
        }

        // ── Effects
        // ─────────────────────────────────────────────────────────
        s_agents[agent] = Agent({
            name: name, attestation: attestation, registeredAt: block.timestamp, exists: true, ensNode: bytes32(0)
        });

        s_agentCount++;
        s_agentAddresses.push(agent);

        emit AgentRegistered(agent, name);

        // ENS ownership is a view call, so linking after the writes is still CEI-safe.
        if (ensNode != bytes32(0)) {
            _linkENS(agent, ensNode);
        }
    }

    /// @dev Links `ensNode` to `agent` after checking live ENS ownership. Any previous link of
    ///      the node is necessarily stale (its agent no longer owns it) and is removed, as is
    ///      the agent's own previous node.
    function _linkENS(address agent, bytes32 ensNode) internal {
        if (address(i_ensRegistry) == address(0)) {
            revert ENSNotConfigured();
        }
        if (i_ensRegistry.owner(ensNode) != agent) {
            revert NotENSOwner();
        }

        address previous = s_ensNodeToAgent[ensNode];
        if (previous == agent) {
            revert ENSNodeAlreadyLinked();
        }
        if (previous != address(0)) {
            s_agents[previous].ensNode = bytes32(0);
            emit ENSUnlinked(previous, ensNode);
        }

        bytes32 oldNode = s_agents[agent].ensNode;
        if (oldNode != bytes32(0)) {
            delete s_ensNodeToAgent[oldNode];
            emit ENSUnlinked(agent, oldNode);
        }

        s_ensNodeToAgent[ensNode] = agent;
        s_agents[agent].ensNode = ensNode;
        emit ENSLinked(agent, ensNode, s_agents[agent].name);
    }
}
