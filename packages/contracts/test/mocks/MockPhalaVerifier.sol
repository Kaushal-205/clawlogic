// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IPhalaVerifier} from "../../src/interfaces/IPhalaVerifier.sol";

/// @title MockPhalaVerifier
/// @notice Mock implementation of the Phala zkDCAP verifier for testing.
/// @dev Returns a configurable verification result. The result can be toggled at any
///      time via `setVerificationResult()` to simulate both passing and failing
///      TEE attestation verification scenarios.
///
///      **Default Behavior:**
///      The constructor accepts a `defaultReturn` value that `verify()` will return
///      for all calls. This can be changed dynamically via `setVerificationResult()`.
///
///      Since the interface declares `verify()` as `view`, the mock cannot emit events
///      or modify state during verification calls. Use `setVerificationResult()` to
///      control behavior between test steps.
contract MockPhalaVerifier is IPhalaVerifier {
    // -------------------------------------------------
    // Storage
    // -------------------------------------------------

    /// @dev The result that `verify()` returns.
    bool private s_verificationResult;

    // -------------------------------------------------
    // Constructor
    // -------------------------------------------------

    /// @notice Deploy the mock with a default verification result.
    /// @param defaultReturn The value that `verify()` will return by default.
    constructor(bool defaultReturn) {
        s_verificationResult = defaultReturn;
    }

    // -------------------------------------------------
    // IPhalaVerifier Implementation
    // -------------------------------------------------

    /// @inheritdoc IPhalaVerifier
    /// @dev Returns the configured result. This is a pure view function as required
    ///      by the interface. The attestation quote and public key are ignored;
    ///      only the pre-configured result matters for testing.
    function verify(bytes calldata, bytes calldata) external view override returns (bool) {
        return s_verificationResult;
    }

    // -------------------------------------------------
    // Test Helpers
    // -------------------------------------------------

    /// @notice Change the verification result returned by `verify()`.
    /// @param result The new result to return.
    function setVerificationResult(bool result) external {
        s_verificationResult = result;
    }

    /// @notice Get the current verification result setting.
    /// @return The configured result.
    function getVerificationResult() external view returns (bool) {
        return s_verificationResult;
    }
}
