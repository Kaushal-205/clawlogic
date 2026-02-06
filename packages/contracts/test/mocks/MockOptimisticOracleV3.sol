// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {OptimisticOracleV3Interface} from "../../src/interfaces/uma/OptimisticOracleV3Interface.sol";
import {OptimisticOracleV3CallbackRecipientInterface} from
    "../../src/interfaces/uma/OptimisticOracleV3CallbackRecipientInterface.sol";

/// @title MockOptimisticOracleV3
/// @notice Simplified mock of UMA OOV3 for testing assertion workflows without full UMA complexity
contract MockOptimisticOracleV3 is OptimisticOracleV3Interface {
    // Storage for assertions
    mapping(bytes32 => Assertion) public assertions;
    uint256 private assertionIdCounter;

    bytes32 public constant ASSERT_TRUTH_IDENTIFIER = bytes32("ASSERT_TRUTH");

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

    /// @notice Helper for tests to manually resolve an assertion
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

    function getAssertionResult(bytes32 assertionId) external view override returns (bool) {
        return assertions[assertionId].settlementResolution;
    }

    function getAssertion(bytes32 assertionId) external view override returns (Assertion memory) {
        return assertions[assertionId];
    }

    function getMinimumBond(address) external pure override returns (uint256) {
        return 0; // No minimum for testing
    }

    function defaultIdentifier() external pure override returns (bytes32) {
        return ASSERT_TRUTH_IDENTIFIER;
    }
}
