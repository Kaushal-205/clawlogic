// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.26;

/// @title Optimistic Oracle V3 Interface
/// @notice Minimal interface for UMA's Optimistic Oracle V3.
/// @dev Sourced from https://github.com/UMAprotocol/dev-quickstart-oov3
///      Uses address instead of IERC20 to keep this file dependency-free.
///      The consuming contract should cast to IERC20 as needed.
interface OptimisticOracleV3Interface {
    // Struct representing an assertion in the oracle.
    struct Assertion {
        EscalationManagerSettings escalationManagerSettings;
        address asserter;
        uint64 assertionTime;
        bool settled;
        address currency;
        uint64 expirationTime;
        bool settlementResolution;
        bytes32 domainId;
        bytes32 identifier;
        uint256 bond;
        address callbackRecipient;
        address disputer;
    }

    // Struct for escalation manager configuration.
    struct EscalationManagerSettings {
        bool arbitrateViaEscalationManager;
        bool discardOracle;
        bool validateDisputers;
        address assertingCaller;
        address escalationManager;
    }

    /// @notice Asserts a truth about the world, requiring a bond.
    /// @param claim The truth claim being asserted.
    /// @param asserter The account making the assertion.
    /// @param callbackRecipient The address that will receive callbacks on resolution.
    /// @param escalationManager The address of the escalation manager (address(0) for default).
    /// @param liveness The time (in seconds) before the assertion can be resolved if not disputed.
    /// @param currency The ERC20 token used for the bond.
    /// @param bond The bond amount required.
    /// @param identifier The identifier for the assertion (e.g., ASSERT_TRUTH).
    /// @param domainId An optional domain identifier.
    /// @return assertionId The unique identifier for the assertion.
    function assertTruth(
        bytes calldata claim,
        address asserter,
        address callbackRecipient,
        address escalationManager,
        uint64 liveness,
        address currency,
        uint256 bond,
        bytes32 identifier,
        bytes32 domainId
    ) external returns (bytes32 assertionId);

    /// @notice Disputes an assertion within the liveness period.
    /// @param assertionId The unique identifier of the assertion to dispute.
    /// @param disputer The account disputing the assertion.
    /// @return The assertion ID that was disputed.
    function disputeAssertion(bytes32 assertionId, address disputer) external returns (bytes32);

    /// @notice Settles an assertion after the liveness period has passed.
    /// @param assertionId The unique identifier of the assertion to settle.
    function settleAssertion(bytes32 assertionId) external;

    /// @notice Gets the assertion result (true/false).
    /// @param assertionId The unique identifier of the assertion.
    /// @return True if the assertion was resolved as truthful.
    function getAssertionResult(bytes32 assertionId) external view returns (bool);

    /// @notice Gets the full assertion data.
    /// @param assertionId The unique identifier of the assertion.
    /// @return The Assertion struct.
    function getAssertion(bytes32 assertionId) external view returns (Assertion memory);

    /// @notice Returns the minimum bond amount for a given currency.
    /// @param currency The ERC20 token.
    /// @return The minimum bond amount.
    function getMinimumBond(address currency) external view returns (uint256);

    /// @notice Default identifier used for asserting truths.
    /// @return The default identifier bytes32.
    function defaultIdentifier() external view returns (bytes32);
}
