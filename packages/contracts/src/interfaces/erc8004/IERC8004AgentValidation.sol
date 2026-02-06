// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title IERC8004AgentValidation
/// @notice Interface for the ERC-8004 Agent Validation Registry.
/// @dev Manages multiple validation proof types (TEE, Stake, zkML) for agent identities.
///      Each validation type has an authorized verifier address that can confirm or reject
///      submitted proofs. This enables a modular trust framework where different validation
///      mechanisms can coexist and be independently verified.
interface IERC8004AgentValidation {
    // -------------------------------------------------
    // Enums
    // -------------------------------------------------

    /// @notice Types of validation proofs supported by the registry.
    /// @dev NONE is the zero value / uninitialized sentinel.
    enum ValidationType {
        NONE,
        TEE,
        STAKE,
        ZKML
    }

    // -------------------------------------------------
    // Structs
    // -------------------------------------------------

    /// @notice A validation proof submitted for an agent identity.
    /// @param validationType The type of validation proof.
    /// @param proof The raw proof bytes (format depends on validationType).
    /// @param timestamp The block.timestamp when the proof was submitted.
    /// @param valid Whether the proof has been verified as valid by the authorized verifier.
    struct Validation {
        ValidationType validationType;
        bool valid;
        uint256 timestamp;
        bytes proof;
    }

    // -------------------------------------------------
    // Events
    // -------------------------------------------------

    /// @notice Emitted when a validation proof is submitted for an agent.
    /// @param agentId The agent identity token ID.
    /// @param validationType The type of validation proof submitted.
    /// @param proof The raw proof bytes.
    event ValidationSubmitted(uint256 indexed agentId, ValidationType indexed validationType, bytes proof);

    /// @notice Emitted when a verifier confirms or rejects a validation proof.
    /// @param agentId The agent identity token ID.
    /// @param validationType The type of validation proof verified.
    /// @param valid Whether the proof was accepted (true) or rejected (false).
    event ValidationVerified(uint256 indexed agentId, ValidationType indexed validationType, bool valid);

    /// @notice Emitted when a verifier is assigned to a validation type.
    /// @param validationType The type of validation.
    /// @param verifier The address authorized to verify proofs of this type.
    event VerifierSet(ValidationType indexed validationType, address indexed verifier);

    /// @notice Emitted when a TEE attestation is verified via the Phala verifier.
    /// @param agentId The agent identity token ID whose TEE attestation was verified.
    /// @param attestationHash The keccak256 hash of the attestation quote bytes.
    /// @param timestamp The block.timestamp when the verification occurred.
    event TeeAttestationVerified(uint256 indexed agentId, bytes32 attestationHash, uint256 timestamp);

    // -------------------------------------------------
    // Errors
    // -------------------------------------------------

    /// @notice Thrown when a caller is not the authorized verifier for the given validation type.
    error OnlyVerifier();

    /// @notice Thrown when a query references a non-existent agent ID.
    error AgentDoesNotExist();

    /// @notice Thrown when an invalid validation type (NONE) is provided.
    error InvalidValidationType();

    /// @notice Thrown when an empty proof is submitted.
    error EmptyProof();

    /// @notice Thrown when the zero address is provided for a verifier.
    error ZeroAddress();

    /// @notice Thrown when attempting to verify a validation that has not been submitted.
    error ValidationNotSubmitted();

    /// @notice Thrown when a non-owner attempts an owner-only operation.
    error OnlyOwner();

    /// @notice Thrown when a TEE attestation fails verification via the Phala verifier.
    error TeeVerificationFailed();

    /// @notice Thrown when a TEE verification is attempted but no Phala verifier is configured.
    error PhalaVerifierNotConfigured();

    // -------------------------------------------------
    // Functions
    // -------------------------------------------------

    /// @notice Submit a validation proof for an agent.
    /// @dev Anyone can submit a proof; only the authorized verifier for the given type can verify it.
    /// @param agentId The agent identity token ID.
    /// @param proof The raw proof bytes.
    /// @param validationType The type of validation proof being submitted.
    function submitValidation(uint256 agentId, bytes calldata proof, ValidationType validationType) external;

    /// @notice Verify a previously submitted validation proof.
    /// @dev Only callable by the authorized verifier for the given validation type.
    /// @param agentId The agent identity token ID.
    /// @param validationType The type of validation proof to verify.
    /// @param valid Whether the proof is accepted (true) or rejected (false).
    function verifyValidation(uint256 agentId, ValidationType validationType, bool valid) external;

    /// @notice Check whether an agent has a valid proof for a given validation type.
    /// @param agentId The agent identity token ID.
    /// @param validationType The type of validation to check.
    /// @return True if the agent has a verified, valid proof for this type.
    function isValidated(uint256 agentId, ValidationType validationType) external view returns (bool);

    /// @notice Get the full validation data for an agent and validation type.
    /// @param agentId The agent identity token ID.
    /// @param validationType The type of validation to query.
    /// @return The Validation struct.
    function getValidation(uint256 agentId, ValidationType validationType) external view returns (Validation memory);

    /// @notice Set the authorized verifier address for a given validation type.
    /// @dev Only callable by the contract owner.
    /// @param validationType The type of validation.
    /// @param verifier The address authorized to verify proofs of this type.
    function setVerifier(ValidationType validationType, address verifier) external;

    /// @notice Get the authorized verifier address for a given validation type.
    /// @param validationType The type of validation.
    /// @return The verifier address.
    function getVerifier(ValidationType validationType) external view returns (address);

    /// @notice Verify a TEE attestation for an agent via the Phala zkDCAP verifier.
    /// @dev Performs an atomic submit-and-verify flow: submits the attestation quote as
    ///      the TEE proof, calls the Phala verifier, and if valid marks the validation
    ///      as verified. Reverts if the Phala verifier is not configured or verification fails.
    /// @param agentId The agent identity token ID.
    /// @param attestationQuote The raw Intel SGX DCAP attestation quote bytes.
    /// @param publicKey The public key expected to be embedded in the attestation quote.
    function verifyTeeAttestation(uint256 agentId, bytes calldata attestationQuote, bytes calldata publicKey) external;
}
