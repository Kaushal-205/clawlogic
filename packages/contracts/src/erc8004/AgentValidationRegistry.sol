// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC8004AgentValidation} from "../interfaces/erc8004/IERC8004AgentValidation.sol";
import {IERC8004AgentIdentity} from "../interfaces/erc8004/IERC8004AgentIdentity.sol";
import {IPhalaVerifier} from "../interfaces/IPhalaVerifier.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/// @title AgentValidationRegistry
/// @author CLAWLOGIC Team
/// @notice ERC-8004 compliant Agent Validation Registry.
/// @dev Manages multiple validation proof types for agent identities. Each validation
///      type (TEE, Stake, zkML) has an independently authorized verifier address that
///      can confirm or reject submitted proofs. This creates a modular trust framework
///      where different validation mechanisms coexist and are independently verifiable.
///
///      **Lifecycle:**
///      1. The identity owner (or an approved operator) submits a proof via
///         `submitValidation(agentId, proof, type)`. It is stored as *pending*; the active
///         proof, if any, stays in force.
///      2. The authorized verifier for that type calls
///         `verifyValidation(agentId, type, keccak256(proof), valid)`. The hash pins the exact
///         proof it reviewed, so a proof swapped in before the call cannot be approved.
///      3. Other contracts query `isValidated(agentId, type)` to gate access.
///
///      **Revocation:** the verifier revokes an active proof by calling `verifyValidation`
///      with its hash and `valid = false`. A revoked TEE validation cannot be restored with
///      `verifyTeeAttestation`; only a verifier approval clears it.
///
///      **Ownership binding:** an approval is bound to the identity's owner at that moment.
///      If the identity NFT is transferred, `isValidated` returns false until revalidated.
///
///      **Verifier Assignment:**
///      - TEE: Phala Network verifier contract or oracle
///      - STAKE: Staking contract that can verify deposit proofs
///      - ZKML: zkML proof verifier contract
///      The contract owner assigns verifiers via `setVerifier(type, address)`.
contract AgentValidationRegistry is Ownable, IERC8004AgentValidation {
    // -------------------------------------------------
    // Types
    // -------------------------------------------------

    /// @dev Bookkeeping kept next to the interface's `Validation` struct.
    struct ValidationState {
        address boundOwner; // identity owner when the active proof was approved
        bool revoked; // the verifier revoked the active proof
        bytes32 pendingHash; // keccak256 of the pending proof (zero if none)
        address pendingOwner; // identity owner when the pending proof was submitted
        bytes pendingProof;
    }

    // -------------------------------------------------
    // Constants
    // -------------------------------------------------

    /// @notice Type hash of the message the attested TEE key signs in `verifyTeeAttestation`.
    bytes32 public constant TEE_BINDING_TYPEHASH =
        keccak256("ClawlogicTeeBinding(uint256 chainId,address registry,uint256 agentId,address owner,uint256 nonce)");

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

    /// @dev Maps (agentId, validationType) to the active validation proof.
    mapping(uint256 => mapping(ValidationType => Validation)) private s_validations;

    /// @dev Maps (agentId, validationType) to its pending proof, owner binding and revocation.
    mapping(uint256 => mapping(ValidationType => ValidationState)) private s_states;

    /// @dev Maps validationType to the authorized verifier address.
    mapping(ValidationType => address) private s_verifiers;

    /// @notice One-time nonce per agent included in the TEE binding message.
    mapping(uint256 => uint256) public s_teeNonces;

    /// @notice keccak256 of every attestation quote already accepted.
    mapping(bytes32 => bool) public s_usedQuotes;

    /// @notice The attested TEE key (as an address) of each agent's active TEE validation.
    mapping(uint256 => address) public s_teeKeys;

    // -------------------------------------------------
    // Constructor
    // -------------------------------------------------

    /// @notice Deploys the AgentValidationRegistry.
    /// @param initialOwner The address that can assign verifiers (protocol admin).
    /// @param identityRegistry The AgentIdentityRegistry for agent existence checks.
    /// @param phalaVerifier_ The Phala zkDCAP verifier contract. Pass IPhalaVerifier(address(0))
    ///        to disable TEE attestation verification (verifyTeeAttestation will revert).
    constructor(address initialOwner, IERC8004AgentIdentity identityRegistry, IPhalaVerifier phalaVerifier_)
        Ownable(initialOwner)
    {
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
        address owner_ = _requireController(agentId);

        // Replaces any earlier pending proof; the active proof is untouched.
        bytes32 proofHash = keccak256(proof);
        ValidationState storage st = s_states[agentId][validationType];
        st.pendingHash = proofHash;
        st.pendingOwner = owner_;
        st.pendingProof = proof;

        emit ValidationSubmitted(agentId, validationType, proof);
        emit ValidationPending(agentId, validationType, proofHash);
    }

    /// @inheritdoc IERC8004AgentValidation
    function verifyValidation(uint256 agentId, ValidationType validationType, bytes32 proofHash, bool valid) external {
        if (validationType == ValidationType.NONE) {
            revert InvalidValidationType();
        }

        address verifier = s_verifiers[validationType];
        if (msg.sender != verifier) {
            revert OnlyVerifier();
        }

        ValidationState storage st = s_states[agentId][validationType];
        Validation storage v = s_validations[agentId][validationType];

        bool pendingMatch = st.pendingHash != bytes32(0) && proofHash == st.pendingHash;
        bool activeMatch = v.timestamp != 0 && proofHash == keccak256(v.proof);
        if (!pendingMatch && !activeMatch) {
            if (st.pendingHash == bytes32(0) && v.timestamp == 0) revert ValidationNotSubmitted();
            revert ProofMismatch();
        }

        if (!valid) {
            // A rejection covers every proof with this hash: resubmitting the active proof as
            // pending cannot shield it from revocation.
            if (activeMatch) {
                v.valid = false;
                st.revoked = true;
            }
            if (pendingMatch) _clearPending(st);
        } else if (pendingMatch) {
            // Approval of the pending proof. A proof submitted by a previous identity owner can
            // only be rejected.
            if (i_identityRegistry.ownerOfAgent(agentId) != st.pendingOwner) revert ProofMismatch();
            v.validationType = validationType;
            v.proof = st.pendingProof;
            v.timestamp = block.timestamp;
            v.valid = true;
            st.boundOwner = st.pendingOwner;
            st.revoked = false;
            if (validationType == ValidationType.TEE) delete s_teeKeys[agentId];
            _clearPending(st);
        } else {
            // Reinstatement of the active proof.
            v.valid = true;
            st.revoked = false;
            st.boundOwner = i_identityRegistry.ownerOfAgent(agentId);
        }

        emit ValidationVerified(agentId, validationType, valid);
    }

    /// @inheritdoc IERC8004AgentValidation
    function isValidated(uint256 agentId, ValidationType validationType) external view returns (bool) {
        if (!s_validations[agentId][validationType].valid) return false;
        if (!i_identityRegistry.agentExists(agentId)) return false;
        return i_identityRegistry.ownerOfAgent(agentId) == s_states[agentId][validationType].boundOwner;
    }

    /// @inheritdoc IERC8004AgentValidation
    function getValidation(uint256 agentId, ValidationType validationType) external view returns (Validation memory) {
        return s_validations[agentId][validationType];
    }

    /// @notice The pending proof awaiting a verifier decision (empty if none).
    function getPendingValidation(uint256 agentId, ValidationType validationType)
        external
        view
        returns (bytes32 proofHash, bytes memory proof)
    {
        ValidationState storage st = s_states[agentId][validationType];
        return (st.pendingHash, st.pendingProof);
    }

    /// @notice Whether the verifier has revoked the active proof.
    function isRevoked(uint256 agentId, ValidationType validationType) external view returns (bool) {
        return s_states[agentId][validationType].revoked;
    }

    /// @notice The identity owner the active proof was approved for.
    function getBoundOwner(uint256 agentId, ValidationType validationType) external view returns (address) {
        return s_states[agentId][validationType].boundOwner;
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

    /// @notice The message the attested TEE key must sign (EIP-191 personal_sign of
    ///         `keccak256(abi.encode(TEE_BINDING_TYPEHASH, chainId, this, agentId, owner, nonce))`).
    function teeBindingDigest(uint256 agentId) public view returns (bytes32) {
        return MessageHashUtils.toEthSignedMessageHash(
            keccak256(
                abi.encode(
                    TEE_BINDING_TYPEHASH,
                    block.chainid,
                    address(this),
                    agentId,
                    i_identityRegistry.ownerOfAgent(agentId),
                    s_teeNonces[agentId]
                )
            )
        );
    }

    /// @inheritdoc IERC8004AgentValidation
    /// @dev Atomic submit-and-verify flow for TEE attestations. On success the quote becomes
    ///      the active TEE proof, bound to the current identity owner, and the nonce advances.
    function verifyTeeAttestation(
        uint256 agentId,
        bytes calldata attestationQuote,
        bytes calldata publicKey,
        bytes calldata keySignature
    ) external {
        // ── Checks
        // ──────────────────────────────────────────────────────────
        if (address(i_phalaVerifier) == address(0)) {
            revert PhalaVerifierNotConfigured();
        }
        address owner_ = _requireController(agentId);
        ValidationState storage st = s_states[agentId][ValidationType.TEE];
        if (st.revoked) {
            revert ValidationIsRevoked();
        }
        bytes32 attestationHash = keccak256(attestationQuote);
        if (s_usedQuotes[attestationHash]) {
            revert QuoteAlreadyUsed();
        }
        if (publicKey.length != 64) {
            revert InvalidPublicKey();
        }

        // The attested key proves possession by signing this agent's binding message.
        address teeKey = address(uint160(uint256(keccak256(publicKey))));
        (address signer, ECDSA.RecoverError err,) = ECDSA.tryRecover(teeBindingDigest(agentId), keySignature);
        if (err != ECDSA.RecoverError.NoError || signer != teeKey) {
            revert InvalidKeySignature();
        }

        // Call the Phala verifier (view call -- no reentrancy risk).
        if (!i_phalaVerifier.verify(attestationQuote, publicKey)) {
            revert TeeVerificationFailed();
        }

        // ── Effects
        // ─────────────────────────────────────────────────────────
        s_usedQuotes[attestationHash] = true;
        s_teeNonces[agentId]++;
        s_teeKeys[agentId] = teeKey;
        st.boundOwner = owner_;

        Validation storage v = s_validations[agentId][ValidationType.TEE];
        v.validationType = ValidationType.TEE;
        v.proof = attestationQuote;
        v.timestamp = block.timestamp;
        v.valid = true; // Verified inline by Phala verifier.

        // ── Events
        // ──────────────────────────────────────────────────────────
        emit TeeAttestationVerified(agentId, attestationHash, block.timestamp);
        emit ValidationSubmitted(agentId, ValidationType.TEE, attestationQuote);
        emit ValidationVerified(agentId, ValidationType.TEE, true);
    }

    // -------------------------------------------------
    // Internal Helpers
    // -------------------------------------------------

    function _clearPending(ValidationState storage st) private {
        delete st.pendingHash;
        delete st.pendingOwner;
        delete st.pendingProof;
    }

    /// @dev Reverts unless the caller is the identity owner or an ERC-721-approved operator.
    function _requireController(uint256 agentId) internal view returns (address owner_) {
        if (!i_identityRegistry.agentExists(agentId)) {
            revert AgentDoesNotExist();
        }
        owner_ = i_identityRegistry.ownerOfAgent(agentId);
        if (msg.sender == owner_) return owner_;
        IERC721 nft = IERC721(address(i_identityRegistry));
        if (nft.isApprovedForAll(owner_, msg.sender) || nft.getApproved(agentId) == msg.sender) return owner_;
        revert NotAgentController();
    }
}
