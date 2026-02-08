// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IENS} from "./interfaces/IENS.sol";

/// @title ENSAgentHelper
/// @author CLAWLOGIC Team
/// @notice Helper contract for registering `<name>.agent.eth` subdomains under the
///         CLAWLOGIC agent namespace.
///
/// @dev This contract must own the `agent.eth` parent node in the ENS Registry (or
///      whichever base node is configured). It creates subdomains on behalf of the
///      AgentRegistry, so that when an agent registers as "alpha", the helper can
///      automatically provision `alpha.agent.eth` and assign ownership to the agent's
///      address.
///
///      **Access Control:** Only the designated AgentRegistry contract may call
///      `registerAgentSubdomain()`. This prevents unauthorized subdomain creation.
///
///      **ENS Namehash Calculation:**
///      - `agent.eth` = namehash("agent.eth") = keccak256(abi.encodePacked(namehash("eth"), keccak256("agent")))
///      - `alpha.agent.eth` = keccak256(abi.encodePacked(baseNode, keccak256("alpha")))
///
///      The caller is responsible for computing the correct base node off-chain or in
///      the deploy script. The full subnode is computed on-chain from `baseNode + label`.
contract ENSAgentHelper {
    // -------------------------------------------------
    // Custom Errors
    // -------------------------------------------------

    /// @notice Thrown when a function restricted to the AgentRegistry is called by another address
    error OnlyAgentRegistry();

    /// @notice Thrown when the subdomain label is empty
    error EmptySubdomain();

    /// @notice Thrown when the owner address is the zero address
    error ZeroAddress();

    // -------------------------------------------------
    // Events
    // -------------------------------------------------

    /// @notice Emitted when a new agent subdomain is registered under the base node
    /// @param subdomain The human-readable subdomain label (e.g., "alpha")
    /// @param owner     The address assigned as the owner of the subdomain
    /// @param subnode   The full ENS namehash of the registered subdomain
    event AgentSubdomainRegistered(string subdomain, address indexed owner, bytes32 indexed subnode);

    // -------------------------------------------------
    // Immutables
    // -------------------------------------------------

    /// @notice The ENS Registry contract
    IENS public immutable i_ensRegistry;

    /// @notice The ENS namehash of the base node (e.g., namehash("agent.eth"))
    bytes32 public immutable i_baseNode;

    /// @notice The AgentRegistry contract -- sole authorized caller of registerAgentSubdomain
    address public immutable i_agentRegistry;

    // -------------------------------------------------
    // Constructor
    // -------------------------------------------------

    /// @notice Deploys the ENSAgentHelper.
    /// @dev After deployment, the deployer must transfer ownership of `baseNode` in the ENS
    ///      Registry to this contract's address so it can call `setSubnodeOwner`.
    /// @param ensRegistry_    The ENS Registry address.
    /// @param baseNode_       The namehash of the parent domain (e.g., namehash("agent.eth")).
    /// @param agentRegistry_  The AgentRegistry address authorized to request subdomain creation.
    constructor(IENS ensRegistry_, bytes32 baseNode_, address agentRegistry_) {
        i_ensRegistry = ensRegistry_;
        i_baseNode = baseNode_;
        i_agentRegistry = agentRegistry_;
    }

    // -------------------------------------------------
    // External Functions
    // -------------------------------------------------

    /// @notice Register a subdomain under the base node and assign ownership to the specified address.
    /// @dev Only callable by the AgentRegistry. The subdomain is created by calling
    ///      `ENS.setSubnodeOwner(baseNode, labelHash, owner)`. This contract must be the
    ///      owner of `baseNode` in the ENS Registry for this to succeed.
    ///
    ///      Example: If baseNode = namehash("agent.eth") and subdomain = "alpha",
    ///      this creates `alpha.agent.eth` with `owner` as its owner.
    ///
    /// @param subdomain The subdomain label (e.g., "alpha"). Must be non-empty.
    /// @param owner     The address to assign as owner of the new subdomain.
    /// @return subnode  The full ENS namehash of the newly created subdomain.
    function registerAgentSubdomain(string calldata subdomain, address owner) external returns (bytes32 subnode) {
        // ── Checks ──────────────────────────────────────────────────────────
        if (msg.sender != i_agentRegistry) {
            revert OnlyAgentRegistry();
        }

        if (bytes(subdomain).length == 0) {
            revert EmptySubdomain();
        }

        if (owner == address(0)) {
            revert ZeroAddress();
        }

        // ── Interactions ────────────────────────────────────────────────────
        // Compute the label hash from the subdomain string.
        bytes32 labelHash = keccak256(bytes(subdomain));

        // Register the subdomain in ENS. This sets `owner` as the owner of the subnode.
        // The returned value is the namehash of the full subdomain.
        subnode = i_ensRegistry.setSubnodeOwner(i_baseNode, labelHash, owner);

        // ── Events ──────────────────────────────────────────────────────────
        emit AgentSubdomainRegistered(subdomain, owner, subnode);
    }

    /// @notice Computes the full ENS namehash for a subdomain under the base node.
    /// @dev Pure helper for off-chain tooling and verification. Does not modify state.
    /// @param subdomain The subdomain label (e.g., "alpha").
    /// @return The full ENS namehash (e.g., namehash("alpha.agent.eth")).
    function computeSubnode(string calldata subdomain) external view returns (bytes32) {
        bytes32 labelHash = keccak256(bytes(subdomain));
        return keccak256(abi.encodePacked(i_baseNode, labelHash));
    }
}
