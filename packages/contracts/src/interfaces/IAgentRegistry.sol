// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title IAgentRegistry
/// @notice Interface for the agent registration system used by $CLAWLOGIC.
/// @dev Agents must register through this registry to participate in prediction markets.
///      This is the "Silicon Gate" -- only registered agents can interact with the
///      PredictionMarketHook's beforeSwap and beforeAddLiquidity hooks.
interface IAgentRegistry {
    /// @notice Data associated with a registered agent
    struct Agent {
        string name;
        bytes attestation;
        uint256 registeredAt;
        bool exists;
    }

    // -------------------------------------------------
    // Events
    // -------------------------------------------------

    /// @notice Emitted when a new agent registers
    /// @param agent The address of the newly registered agent
    /// @param name  The human-readable name supplied at registration
    event AgentRegistered(address indexed agent, string name);

    // -------------------------------------------------
    // Errors
    // -------------------------------------------------

    /// @notice Thrown when an address attempts to register but is already registered
    error AlreadyRegistered();

    /// @notice Thrown when an empty name string is provided during registration
    error EmptyName();

    /// @notice Thrown when a lookup is performed for an address that is not registered
    error AgentNotFound();

    // -------------------------------------------------
    // Functions
    // -------------------------------------------------

    /// @notice Register the caller as an agent
    /// @param name Human-readable agent name (e.g., "AlphaTrader"). Must be non-empty.
    /// @param attestation TEE attestation bytes (accepted as-is for MVP, not verified)
    function registerAgent(string calldata name, bytes calldata attestation) external;

    /// @notice Check if an address is a registered agent
    /// @param addr The address to check
    /// @return True if the address is registered, false otherwise
    function isAgent(address addr) external view returns (bool);

    /// @notice Get the full Agent struct for a registered address
    /// @param addr The agent address to look up
    /// @return The Agent struct containing name, attestation, registeredAt, and exists flag
    function getAgent(address addr) external view returns (Agent memory);

    /// @notice Get the total number of registered agents
    /// @return The current agent count
    function getAgentCount() external view returns (uint256);

    /// @notice Get all registered agent addresses for enumeration
    /// @return An array of every address that has registered as an agent
    function getAgentAddresses() external view returns (address[] memory);
}
