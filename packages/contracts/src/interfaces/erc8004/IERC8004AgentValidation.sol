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

    /// @notice The active (approved or revoked) validation proof of an agent identity.
    /// @param validationType The type of validation proof.
    /// @param proof The raw proof bytes (format depends on validationType).
    /// @param timestamp The block.timestamp when the proof became active.
    /// @param valid Whether the proof is currently approved.
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

    /// @notice Emitted with the hash a verifier must quote to approve a pending proof.
    event ValidationPending(uint256 indexed agentId, ValidationType indexed validationType, bytes32 proofHash);

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

    /// @notice Thrown when the caller is neither the identity owner nor an approved operator.
    error NotAgentController();

    /// @notice Thrown when a verifier's proof hash matches neither the pending nor the active proof.
    error ProofMismatch();

    /// @notice Thrown when self-service TEE verification is attempted after a revocation.
    error ValidationIsRevoked();

    /// @notice Thrown when an attestation quote has already been used.
    error QuoteAlreadyUsed();

    /// @notice Thrown when the attested public key is not a 64-byte uncompressed secp256k1 key.
    error InvalidPublicKey();

    /// @notice Thrown when the binding signature was not made by the attested key.
    error InvalidKeySignature();

    // -------------------------------------------------
    // Functions
    // -------------------------------------------------

    /// @notice Submit a validation proof for an agent. It stays pending -- the active proof is
    ///         untouched -- until the verifier approves it.
    /// @dev Only the identity owner or an ERC-721-approved operator may submit.
    /// @param agentId The agent identity token ID.
    /// @param proof The raw proof bytes.
    /// @param validationType The type of validation proof being submitted.
    function submitValidation(uint256 agentId, bytes calldata proof, ValidationType validationType) external;

    /// @notice Approve or reject the reviewed proof.
    /// @dev Only callable by the authorized verifier for the given validation type.
    ///      `proofHash == keccak256(pending proof)`: approves (it becomes active) or rejects it.
    ///      `proofHash == keccak256(active proof)`: reinstates (`valid`) or revokes (`!valid`)
    ///      it. A revocation also blocks self-service TEE re-verification until an approval.
    /// @param agentId The agent identity token ID.
    /// @param validationType The type of validation proof to verify.
    /// @param proofHash keccak256 of the proof the verifier reviewed.
    /// @param valid Whether the proof is accepted (true) or rejected (false).
    function verifyValidation(uint256 agentId, ValidationType validationType, bytes32 proofHash, bool valid)
        external;

    /// @notice Check whether an agent has a valid proof for a given validation type.
    /// @dev False once the identity changes owner after approval.
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
    /// @dev Only the identity owner or an approved operator may call. The attested key must
    ///      sign `teeBindingDigest(agentId)`, which binds the key to this agent ID, its current
    ///      owner and a one-time nonce; a copied quote therefore cannot certify another
    ///      identity. Each quote is accepted once, and a revoked TEE validation cannot be
    ///      restored this way.
    /// @param agentId The agent identity token ID.
    /// @param attestationQuote The raw Intel SGX DCAP attestation quote bytes.
    /// @param publicKey The 64-byte uncompressed secp256k1 key embedded in the quote.
    /// @param keySignature Signature by `publicKey` over `teeBindingDigest(agentId)`.
    function verifyTeeAttestation(
        uint256 agentId,
        bytes calldata attestationQuote,
        bytes calldata publicKey,
        bytes calldata keySignature
    ) external;
}
