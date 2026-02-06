// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title IPhalaVerifier
/// @notice Interface for Phala Network's zkDCAP TEE attestation verifier.
/// @dev This interface wraps the Phala on-chain verifier that validates Intel SGX DCAP
///      attestation quotes. The verifier confirms that an agent is genuinely running
///      inside a Trusted Execution Environment by checking the hardware attestation
///      quote against the expected public key.
///
///      In production, this points to Phala's deployed zkDCAP verifier contract.
///      In testing, use MockPhalaVerifier for deterministic control over results.
interface IPhalaVerifier {
    /// @notice Verify a TEE attestation quote against an expected public key.
    /// @dev The quote is an Intel SGX DCAP attestation quote containing hardware
    ///      measurements and identity information. The expected public key identifies
    ///      the agent that generated the quote from within the TEE.
    /// @param quote The raw Intel SGX DCAP attestation quote bytes.
    /// @param expectedPublicKey The public key expected to be embedded in the quote
    ///        (typically 32-byte secp256k1 compressed or ed25519 public key).
    /// @return True if the attestation quote is valid and matches the expected public key.
    function verify(bytes calldata quote, bytes calldata expectedPublicKey) external view returns (bool);
}
