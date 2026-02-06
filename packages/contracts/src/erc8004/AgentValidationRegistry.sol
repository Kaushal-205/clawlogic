// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC8004AgentValidation} from "../interfaces/erc8004/IERC8004AgentValidation.sol";
import {IERC8004AgentIdentity} from "../interfaces/erc8004/IERC8004AgentIdentity.sol";
import {IPhalaVerifier} from "../interfaces/IPhalaVerifier.sol";

/// @title AgentValidationRegistry
/// @author $CLAWLOGIC Team
/// @notice ERC-8004 compliant Agent Validation Registry.
/// @dev Manages multiple validation proof types for agent identities. Each validation
///      type (TEE, Stake, zkML) has an independently authorized verifier address that
///      can confirm or reject submitted proofs. This creates a modular trust framework
///      where different validation mechanisms coexist and are independently verifiable.
///
///      **Lifecycle:**
///      1. Anyone submits a proof via `submitValidation(agentId, proof, type)`.
///      2. The authorized verifier for that type calls `verifyValidation(agentId, type, valid)`.
///      3. Other contracts query `isValidated(agentId, type)` to gate access.
///
///      **Verifier Assignment:**
///      - TEE: Phala Network verifier contract or oracle
///      - STAKE: Staking contract that can verify deposit proofs
///      - ZKML: zkML proof verifier contract
///      The contract owner assigns verifiers via `setVerifier(type, address)`.
///
///      **Resubmission:**
///      A new submission for the same (agentId, type) pair overwrites the previous one,
///      resetting the valid flag to false. This allows agents to update expired or
///      invalidated proofs.
contract AgentValidationRegistry is Ownable, IERC8004AgentValidation {
    // -------------------------------------------------
    // Immutables
    // -------------------------------------------------

    /// @notice The AgentIdentityRegistry used to verify agent existence.
    IERC8004AgentIdentity public immutable i_identityRegistry;

    /// @notice The Phala zkDCAP verifier contract for TEE attestation verification.
    /// @dev Set to address(0) if Phala TEE verification is not configured.
    ///      When address(0), calls to `verifyTeeAttestation()` will revert with
    ///      `PhalaVerifierNotConfigured()`.
    IPhalaVerifier public immutable i_phalaVerifier;

    // -------------------------------------------------
    // Storage
    // -------------------------------------------------

    /// @dev Maps (agentId, validationType) to the validation proof data.
    mapping(uint256 => mapping(ValidationType => Validation)) private s_validations;

    /// @dev Maps validationType to the authorized verifier address.
    mapping(ValidationType => address) private s_verifiers;

    // -------------------------------------------------
    // Constructor
    // -------------------------------------------------

    /// @notice Deploys the AgentValidationRegistry.
    /// @param initialOwner The address that can assign verifiers (protocol admin).
    /// @param identityRegistry The AgentIdentityRegistry for agent existence checks.
    /// @param phalaVerifier_ The Phala zkDCAP verifier contract. Pass IPhalaVerifier(address(0))
    ///        to disable TEE attestation verification (verifyTeeAttestation will revert).
    constructor(
        address initialOwner,
        IERC8004AgentIdentity identityRegistry,
        IPhalaVerifier phalaVerifier_
    ) Ownable(initialOwner) {
        i_identityRegistry = identityRegistry;
        i_phalaVerifier = phalaVerifier_;
    }

    // -------------------------------------------------
    // External Functions
    // -------------------------------------------------

    /// @inheritdoc IERC8004AgentValidation
    function submitValidation(uint256 agentId, bytes calldata proof, ValidationType validationType) external {
        if (validationType == ValidationType.NONE) {
            revert InvalidValidationType();
        }
        if (proof.length == 0) {
            revert EmptyProof();
        }
        if (!i_identityRegistry.agentExists(agentId)) {
            revert AgentDoesNotExist();
        }

        // Store the validation proof. Overwrites any existing proof for this
        // (agentId, validationType) pair, resetting the valid flag.
        Validation storage v = s_validations[agentId][validationType];
        v.validationType = validationType;
        v.proof = proof;
        v.timestamp = block.timestamp;
        v.valid = false; // Pending verification

        emit ValidationSubmitted(agentId, validationType, proof);
    }

    /// @inheritdoc IERC8004AgentValidation
    function verifyValidation(uint256 agentId, ValidationType validationType, bool valid) external {
        if (validationType == ValidationType.NONE) {
            revert InvalidValidationType();
        }

        address verifier = s_verifiers[validationType];
        if (msg.sender != verifier) {
            revert OnlyVerifier();
        }

        Validation storage v = s_validations[agentId][validationType];
        if (v.timestamp == 0) {
            revert ValidationNotSubmitted();
        }

        v.valid = valid;

        emit ValidationVerified(agentId, validationType, valid);
    }

    /// @inheritdoc IERC8004AgentValidation
    function isValidated(uint256 agentId, ValidationType validationType) external view returns (bool) {
        return s_validations[agentId][validationType].valid;
    }

    /// @inheritdoc IERC8004AgentValidation
    function getValidation(uint256 agentId, ValidationType validationType)
        external
        view
        returns (Validation memory)
    {
        return s_validations[agentId][validationType];
    }

    /// @inheritdoc IERC8004AgentValidation
    function setVerifier(ValidationType validationType, address verifier) external onlyOwner {
        if (validationType == ValidationType.NONE) {
            revert InvalidValidationType();
        }
        if (verifier == address(0)) {
            revert ZeroAddress();
        }

        s_verifiers[validationType] = verifier;

        emit VerifierSet(validationType, verifier);
    }

    /// @inheritdoc IERC8004AgentValidation
    function getVerifier(ValidationType validationType) external view returns (address) {
        return s_verifiers[validationType];
    }

    // -------------------------------------------------
    // TEE Attestation Verification (Phala)
    // -------------------------------------------------

    /// @inheritdoc IERC8004AgentValidation
    /// @dev Performs an atomic submit-and-verify flow for TEE attestations:
    ///      1. Validates the Phala verifier is configured (not address(0)).
    ///      2. Validates the agent exists in the identity registry.
    ///      3. Calls the Phala zkDCAP verifier with the quote and public key.
    ///      4. If valid, stores the attestation as a TEE proof and marks it verified.
    ///      5. Emits TeeAttestationVerified with the attestation hash.
    ///
    ///      This function is designed to be called by the AgentRegistry during
    ///      registration, or directly by agents who want to add TEE verification
    ///      to an existing identity.
    function verifyTeeAttestation(
        uint256 agentId,
        bytes calldata attestationQuote,
        bytes calldata publicKey
    ) external {
        // ── Checks ──────────────────────────────────────────────────────────
        if (address(i_phalaVerifier) == address(0)) {
            revert PhalaVerifierNotConfigured();
        }
        if (!i_identityRegistry.agentExists(agentId)) {
            revert AgentDoesNotExist();
        }

        // Call the Phala verifier (view call -- no reentrancy risk).
        bool verified = i_phalaVerifier.verify(attestationQuote, publicKey);
        if (!verified) {
            revert TeeVerificationFailed();
        }

        // ── Effects ─────────────────────────────────────────────────────────
        // Store the attestation as a TEE validation proof.
        Validation storage v = s_validations[agentId][ValidationType.TEE];
        v.validationType = ValidationType.TEE;
        v.proof = attestationQuote;
        v.timestamp = block.timestamp;
        v.valid = true; // Verified inline by Phala verifier.

        // ── Events ──────────────────────────────────────────────────────────
        bytes32 attestationHash = keccak256(attestationQuote);
        emit TeeAttestationVerified(agentId, attestationHash, block.timestamp);
        emit ValidationSubmitted(agentId, ValidationType.TEE, attestationQuote);
        emit ValidationVerified(agentId, ValidationType.TEE, true);
    }
}
