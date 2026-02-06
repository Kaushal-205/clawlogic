// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title IAgentRegistry
/// @notice Interface for the agent registration system used by $CLAWLOGIC.
/// @dev Agents must register through this registry to participate in prediction markets.
///      This is the "Silicon Gate" -- only registered agents can interact with the
///      PredictionMarketHook's beforeSwap and beforeAddLiquidity hooks.
///
///      Phase 1.1 adds optional ENS identity integration. Agents can optionally link an
///      ENS node (e.g., `alpha.agent.eth`) to their on-chain address during registration.
///      ENS linkage is verified by checking that the caller owns the node in the ENS registry.
interface IAgentRegistry {
    /// @notice Data associated with a registered agent
    /// @param name         Human-readable agent name (e.g., "AlphaTrader")
    /// @param attestation  TEE attestation bytes (accepted as-is for MVP, not verified)
    /// @param registeredAt Block timestamp when the agent registered
    /// @param exists       Whether the agent is registered
    /// @param ensNode      Optional ENS namehash linked to this agent (bytes32(0) if none)
    struct Agent {
        string name;
        bytes attestation;
        uint256 registeredAt;
        bool exists;
        bytes32 ensNode;
    }

    // -------------------------------------------------
    // Events
    // -------------------------------------------------

    /// @notice Emitted when a new agent registers
    /// @param agent The address of the newly registered agent
    /// @param name  The human-readable name supplied at registration
    event AgentRegistered(address indexed agent, string name);

    /// @notice Emitted when an agent links an ENS node to their address
    /// @param agent   The address of the agent
    /// @param ensNode The ENS namehash that was linked
    /// @param name    The human-readable agent name for indexing convenience
    event ENSLinked(address indexed agent, bytes32 indexed ensNode, string name);

    // -------------------------------------------------
    // Errors
    // -------------------------------------------------

    /// @notice Thrown when an address attempts to register but is already registered
    error AlreadyRegistered();

    /// @notice Thrown when an empty name string is provided during registration
    error EmptyName();

    /// @notice Thrown when a lookup is performed for an address that is not registered
    error AgentNotFound();

    /// @notice Thrown when the caller does not own the specified ENS node
    error NotENSOwner();

    /// @notice Thrown when the specified ENS node is already linked to another agent
    error ENSNodeAlreadyLinked();

    /// @notice Thrown when an ENS lookup returns no linked agent
    error ENSNodeNotLinked();

    // -------------------------------------------------
    // Functions
    // -------------------------------------------------

    /// @notice Register the caller as an agent (without ENS linkage)
    /// @param name Human-readable agent name (e.g., "AlphaTrader"). Must be non-empty.
    /// @param attestation TEE attestation bytes (accepted as-is for MVP, not verified)
    function registerAgent(string calldata name, bytes calldata attestation) external;

    /// @notice Register the caller as an agent with optional ENS identity linkage
    /// @param name Human-readable agent name (e.g., "AlphaTrader"). Must be non-empty.
    /// @param attestation TEE attestation bytes (accepted as-is for MVP, not verified)
    /// @param ensNode The ENS namehash to link. Pass bytes32(0) for no ENS linkage.
    ///                If non-zero, the caller must own this node in the ENS registry.
    function registerAgentWithENS(string calldata name, bytes calldata attestation, bytes32 ensNode) external;

    /// @notice Check if an address is a registered agent
    /// @param addr The address to check
    /// @return True if the address is registered, false otherwise
    function isAgent(address addr) external view returns (bool);

    /// @notice Get the full Agent struct for a registered address
    /// @param addr The agent address to look up
    /// @return The Agent struct containing name, attestation, registeredAt, exists, and ensNode
    function getAgent(address addr) external view returns (Agent memory);

    /// @notice Get the total number of registered agents
    /// @return The current agent count
    function getAgentCount() external view returns (uint256);

    /// @notice Get all registered agent addresses for enumeration
    /// @return An array of every address that has registered as an agent
    function getAgentAddresses() external view returns (address[] memory);

    /// @notice Resolve an ENS node to its linked agent address
    /// @param ensNode The ENS namehash to look up
    /// @return The address of the agent linked to this ENS node
    function getAgentByENS(bytes32 ensNode) external view returns (address);
}
