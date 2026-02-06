// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.26;

/// @title Optimistic Oracle V3 Callback Recipient Interface
/// @notice Interface for contracts that receive callbacks from OOV3 upon assertion resolution.
/// @dev Sourced from https://github.com/UMAprotocol/dev-quickstart-oov3
interface OptimisticOracleV3CallbackRecipientInterface {
    /// @notice Called when an assertion is resolved as true (no dispute or dispute resolved in favor of asserter).
    /// @param assertionId The unique identifier of the resolved assertion.
    function assertionResolvedCallback(bytes32 assertionId, bool assertedTruthfully) external;

    /// @notice Called when an assertion is disputed.
    /// @param assertionId The unique identifier of the disputed assertion.
    function assertionDisputedCallback(bytes32 assertionId) external;
}
