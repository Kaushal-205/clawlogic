// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title IERC8004AgentReputation
/// @notice Interface for the ERC-8004 Agent Reputation Registry.
/// @dev Tracks on-chain, verifiable reputation metrics for agent identities.
///      Reputation is derived from market assertion outcomes (successful vs. failed)
///      and total trading volume. This data is both on-chain verifiable and off-chain
///      indexable via emitted events.
interface IERC8004AgentReputation {
    // -------------------------------------------------
    // Structs
    // -------------------------------------------------

    /// @notice On-chain reputation score for an agent.
    /// @param totalAssertions The total number of assertions the agent has participated in.
    /// @param successfulAssertions The number of assertions resolved in the agent's favour.
    /// @param totalVolume The cumulative ETH volume the agent has transacted.
    /// @param lastUpdated The block.timestamp of the most recent reputation update.
    struct ReputationScore {
        uint64 totalAssertions;
        uint64 successfulAssertions;
        uint128 totalVolume;
        uint256 lastUpdated;
    }

    // -------------------------------------------------
    // Events
    // -------------------------------------------------

    /// @notice Emitted when an assertion outcome is recorded for an agent.
    /// @param agentId The agent identity token ID.
    /// @param marketId The prediction market associated with the assertion.
    /// @param successful Whether the assertion was resolved in the agent's favour.
    /// @param volume The ETH volume associated with this assertion.
    event AssertionRecorded(uint256 indexed agentId, bytes32 indexed marketId, bool successful, uint256 volume);

    /// @notice Emitted when the authorized recorder address is updated.
    /// @param oldRecorder The previous recorder address.
    /// @param newRecorder The new recorder address.
    event RecorderUpdated(address indexed oldRecorder, address indexed newRecorder);

    // -------------------------------------------------
    // Errors
    // -------------------------------------------------

    /// @notice Thrown when a caller other than the authorized recorder attempts to record.
    error OnlyRecorder();

    /// @notice Thrown when a query references a non-existent agent ID.
    error AgentDoesNotExist();

    /// @notice Thrown when the zero address is provided for the recorder.
    error ZeroAddress();

    // -------------------------------------------------
    // Functions
    // -------------------------------------------------

    /// @notice Record an assertion outcome for an agent's reputation.
    /// @dev Only callable by the authorized recorder (PredictionMarketHook).
    /// @param agentId The agent identity token ID.
    /// @param marketId The prediction market associated with the assertion.
    /// @param successful Whether the assertion was resolved successfully.
    /// @param volume The ETH volume associated with this assertion.
    function recordAssertion(uint256 agentId, bytes32 marketId, bool successful, uint256 volume) external;

    /// @notice Get the full reputation score for an agent.
    /// @param agentId The agent identity token ID.
    /// @return The ReputationScore struct containing all metrics.
    function getReputationScore(uint256 agentId) external view returns (ReputationScore memory);

    /// @notice Get the assertion accuracy for an agent as a basis-point percentage.
    /// @dev Returns 0 if the agent has no assertions. Otherwise returns
    ///      (successfulAssertions * 10000) / totalAssertions, i.e., 10000 = 100.00%.
    /// @param agentId The agent identity token ID.
    /// @return Accuracy in basis points (0-10000).
    function getAccuracy(uint256 agentId) external view returns (uint256);
}
