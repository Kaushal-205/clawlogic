// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {OptimisticOracleV3Interface} from "../interfaces/uma/OptimisticOracleV3Interface.sol";
import {OptimisticOracleV3CallbackRecipientInterface} from
    "../interfaces/uma/OptimisticOracleV3CallbackRecipientInterface.sol";

/// @title DeployableMockOOV3
/// @author $CLAWLOGIC Team
/// @notice A deployable mock of UMA Optimistic Oracle V3 for chains where UMA is not
///         available natively (e.g., Circle Arc testnet).
///
/// @dev This contract replicates the MockOptimisticOracleV3 from tests but is placed
///      under src/mocks/ so the deployment script can reference it without pulling test
///      dependencies. It supports the full assertion lifecycle:
///
///      1. assertTruth()       -- creates an assertion, returns an assertionId
///      2. settleAssertion()   -- settles (marks truthful if not disputed) and triggers callback
///      3. disputeAssertion()  -- marks as disputed and triggers dispute callback
///      4. resolveAssertion()  -- admin helper to manually resolve (truthful or not)
///
///      No bonds are actually escrowed -- this is purely for demonstration purposes.
contract DeployableMockOOV3 is OptimisticOracleV3Interface {
    // ─────────────────────────────────────────────────────────────────────────
    // Storage
    // ─────────────────────────────────────────────────────────────────────────

    mapping(bytes32 => Assertion) public assertions;
    uint256 private assertionIdCounter;

    bytes32 public constant ASSERT_TRUTH_IDENTIFIER = bytes32("ASSERT_TRUTH");

    // ─────────────────────────────────────────────────────────────────────────
    // Core OOV3 Interface
    // ─────────────────────────────────────────────────────────────────────────

    /// @inheritdoc OptimisticOracleV3Interface
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
    ) external override returns (bytes32 assertionId) {
        assertionIdCounter++;
        assertionId = keccak256(abi.encode(claim, asserter, assertionIdCounter));

        assertions[assertionId] = Assertion({
            escalationManagerSettings: EscalationManagerSettings({
                arbitrateViaEscalationManager: false,
                discardOracle: false,
                validateDisputers: false,
                assertingCaller: msg.sender,
                escalationManager: escalationManager
            }),
            asserter: asserter,
            assertionTime: uint64(block.timestamp),
            settled: false,
            currency: currency,
            expirationTime: uint64(block.timestamp + liveness),
            settlementResolution: false,
            domainId: domainId,
            identifier: identifier,
            bond: bond,
            callbackRecipient: callbackRecipient,
            disputer: address(0)
        });

        return assertionId;
    }

    /// @inheritdoc OptimisticOracleV3Interface
    function disputeAssertion(bytes32 assertionId, address disputer) external override returns (bytes32) {
        Assertion storage assertion = assertions[assertionId];
        assertion.disputer = disputer;

        // Notify callback recipient
        if (assertion.callbackRecipient != address(0)) {
            OptimisticOracleV3CallbackRecipientInterface(assertion.callbackRecipient).assertionDisputedCallback(
                assertionId
            );
        }

        return assertionId;
    }

    /// @inheritdoc OptimisticOracleV3Interface
    function settleAssertion(bytes32 assertionId) external override {
        Assertion storage assertion = assertions[assertionId];
        require(!assertion.settled, "Already settled");

        assertion.settled = true;
        // Default: if not disputed, assertion is truthful
        bool truthful = (assertion.disputer == address(0));
        assertion.settlementResolution = truthful;

        // Notify callback recipient
        if (assertion.callbackRecipient != address(0)) {
            OptimisticOracleV3CallbackRecipientInterface(assertion.callbackRecipient).assertionResolvedCallback(
                assertionId, truthful
            );
        }
    }

    /// @notice Admin/demo helper to manually resolve an assertion with a specific outcome.
    /// @param assertionId The assertion to resolve.
    /// @param truthful    True if the assertion should be considered truthful.
    function resolveAssertion(bytes32 assertionId, bool truthful) external {
        Assertion storage assertion = assertions[assertionId];
        require(!assertion.settled, "Already settled");

        assertion.settled = true;
        assertion.settlementResolution = truthful;

        // Notify callback recipient
        if (assertion.callbackRecipient != address(0)) {
            OptimisticOracleV3CallbackRecipientInterface(assertion.callbackRecipient).assertionResolvedCallback(
                assertionId, truthful
            );
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // View Functions
    // ─────────────────────────────────────────────────────────────────────────

    /// @inheritdoc OptimisticOracleV3Interface
    function getAssertionResult(bytes32 assertionId) external view override returns (bool) {
        return assertions[assertionId].settlementResolution;
    }

    /// @inheritdoc OptimisticOracleV3Interface
    function getAssertion(bytes32 assertionId) external view override returns (Assertion memory) {
        return assertions[assertionId];
    }

    /// @inheritdoc OptimisticOracleV3Interface
    function getMinimumBond(address) external pure override returns (uint256) {
        return 0; // No minimum for mock
    }

    /// @inheritdoc OptimisticOracleV3Interface
    function defaultIdentifier() external pure override returns (bytes32) {
        return ASSERT_TRUTH_IDENTIFIER;
    }
}
