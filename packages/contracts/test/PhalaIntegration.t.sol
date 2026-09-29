// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test, Vm} from "forge-std/Test.sol";

import {AgentRegistry} from "../src/AgentRegistry.sol";
import {AgentIdentityRegistry} from "../src/erc8004/AgentIdentityRegistry.sol";
import {AgentValidationRegistry} from "../src/erc8004/AgentValidationRegistry.sol";

import {IENS} from "../src/interfaces/IENS.sol";
import {IPhalaVerifier} from "../src/interfaces/IPhalaVerifier.sol";
import {IERC8004AgentIdentity} from "../src/interfaces/erc8004/IERC8004AgentIdentity.sol";
import {IERC8004AgentValidation} from "../src/interfaces/erc8004/IERC8004AgentValidation.sol";

import {MockPhalaVerifier} from "./mocks/MockPhalaVerifier.sol";
import {MockENSRegistry} from "./mocks/MockENSRegistry.sol";

/// @title PhalaIntegrationTest
/// @notice Phala TEE attestation verification on the AgentValidationRegistry.
/// @dev Covers the identity binding (the attested key signs a per-agent, per-nonce message),
///      quote replay, revocation, ownership transfer and the AgentRegistry integration.
contract PhalaIntegrationTest is Test {
    AgentIdentityRegistry public identity;
    AgentValidationRegistry public validation;
    AgentRegistry public agentRegistry;
    MockPhalaVerifier public phalaVerifier;
    MockENSRegistry public ensRegistry;

    address public owner;
    address public minter;
    address public teeVerifier;
    address public unauthorized;

    /// @dev TEE-derived keys. As in `tee-bootstrap.ts`, the agent wallet is the TEE key.
    Vm.Wallet public alphaKey;
    Vm.Wallet public betaKey;

    string constant ALPHA_URI = "ipfs://QmAlphaMetadata";
    string constant BETA_URI = "ipfs://QmBetaMetadata";
    bytes constant SAMPLE_QUOTE = hex"deadbeefcafebabe0123456789abcdef";
    bytes constant DIFFERENT_QUOTE = hex"aabbccdd11223344";

    bytes32 public constant ALPHA_ENS_NODE = keccak256("alpha.agent.eth");

    IERC8004AgentValidation.ValidationType constant TEE = IERC8004AgentValidation.ValidationType.TEE;
    IERC8004AgentValidation.ValidationType constant STAKE = IERC8004AgentValidation.ValidationType.STAKE;

    function setUp() public {
        owner = makeAddr("owner");
        minter = makeAddr("minter");
        teeVerifier = makeAddr("teeVerifier");
        unauthorized = makeAddr("unauthorized");
        alphaKey = vm.createWallet("alphaTeeKey");
        betaKey = vm.createWallet("betaTeeKey");

        phalaVerifier = new MockPhalaVerifier(true);
        ensRegistry = new MockENSRegistry();

        vm.prank(minter);
        identity = new AgentIdentityRegistry(minter);

        vm.prank(owner);
        validation = new AgentValidationRegistry(
            owner, IERC8004AgentIdentity(address(identity)), IPhalaVerifier(address(phalaVerifier))
        );
        vm.prank(owner);
        validation.setVerifier(TEE, teeVerifier);

        agentRegistry = new AgentRegistry(IENS(address(ensRegistry)), IERC8004AgentValidation(address(validation)));

        ensRegistry.setOwner(ALPHA_ENS_NODE, alphaKey.addr);
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    function _mintAgent(address agent, string memory uri) internal returns (uint256) {
        vm.prank(minter);
        return identity.mintAgentIdentity(agent, uri);
    }

    function _publicKey(Vm.Wallet memory w) internal pure returns (bytes memory) {
        return abi.encodePacked(w.publicKeyX, w.publicKeyY);
    }

    /// @dev Signature by `w` over the agent's current binding digest.
    function _bindingSig(Vm.Wallet memory w, uint256 agentId) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(w.privateKey, validation.teeBindingDigest(agentId));
        return abi.encodePacked(r, s, v);
    }

    /// @dev The identity owner verifies a quote for `w` with a fresh binding signature.
    function _verifyTee(address caller, uint256 agentId, Vm.Wallet memory w, bytes memory quote) internal {
        bytes memory sig = _bindingSig(w, agentId);
        vm.prank(caller);
        validation.verifyTeeAttestation(agentId, quote, _publicKey(w), sig);
    }

    // =========================================================================
    // Successful verification
    // =========================================================================

    function test_VerifyTeeAttestation_Success() public {
        uint256 agentId = _mintAgent(alphaKey.addr, ALPHA_URI);
        bytes memory sig = _bindingSig(alphaKey, agentId);

        vm.expectEmit(true, false, false, true);
        emit IERC8004AgentValidation.TeeAttestationVerified(agentId, keccak256(SAMPLE_QUOTE), block.timestamp);
        vm.expectEmit(true, true, false, true);
        emit IERC8004AgentValidation.ValidationVerified(agentId, TEE, true);

        vm.prank(alphaKey.addr);
        validation.verifyTeeAttestation(agentId, SAMPLE_QUOTE, _publicKey(alphaKey), sig);

        assertTrue(validation.isValidated(agentId, TEE), "TEE validated");
        IERC8004AgentValidation.Validation memory v = validation.getValidation(agentId, TEE);
        assertEq(v.proof, SAMPLE_QUOTE, "Quote stored as proof");
        assertEq(v.timestamp, block.timestamp, "Timestamp");
        assertEq(validation.s_teeKeys(agentId), alphaKey.addr, "Attested key recorded");
        assertEq(validation.s_teeNonces(agentId), 1, "Nonce advanced");
        assertTrue(validation.s_usedQuotes(keccak256(SAMPLE_QUOTE)), "Quote marked used");
        assertEq(validation.getBoundOwner(agentId, TEE), alphaKey.addr, "Bound to owner");
    }

    /// @dev The identity owner does not have to be the TEE key itself (e.g. a Safe owner).
    function test_VerifyTeeAttestation_OwnerDifferentFromTeeKey() public {
        address safe = makeAddr("safe");
        uint256 agentId = _mintAgent(safe, ALPHA_URI);

        _verifyTee(safe, agentId, alphaKey, SAMPLE_QUOTE);

        assertTrue(validation.isValidated(agentId, TEE), "TEE validated");
        assertEq(validation.s_teeKeys(agentId), alphaKey.addr, "Attested key recorded");
    }

    function test_VerifyTeeAttestation_ApprovedOperatorCanCall() public {
        uint256 agentId = _mintAgent(alphaKey.addr, ALPHA_URI);
        vm.prank(alphaKey.addr);
        identity.approve(unauthorized, agentId);

        _verifyTee(unauthorized, agentId, alphaKey, SAMPLE_QUOTE);
        assertTrue(validation.isValidated(agentId, TEE), "Operator verified");
    }

    function test_VerifyTeeAttestation_NewQuoteReplacesPrevious() public {
        uint256 agentId = _mintAgent(alphaKey.addr, ALPHA_URI);
        _verifyTee(alphaKey.addr, agentId, alphaKey, SAMPLE_QUOTE);

        vm.warp(block.timestamp + 1 hours);
        _verifyTee(alphaKey.addr, agentId, alphaKey, DIFFERENT_QUOTE);

        IERC8004AgentValidation.Validation memory v = validation.getValidation(agentId, TEE);
        assertEq(v.proof, DIFFERENT_QUOTE, "Latest quote active");
        assertEq(validation.s_teeNonces(agentId), 2, "Nonce advanced twice");
    }

    // =========================================================================
    // Failures
    // =========================================================================

    function test_VerifyTeeAttestation_Fails_WhenVerifierReturnsFalse() public {
        uint256 agentId = _mintAgent(alphaKey.addr, ALPHA_URI);
        phalaVerifier.setVerificationResult(false);

        bytes memory sig = _bindingSig(alphaKey, agentId);
        vm.prank(alphaKey.addr);
        vm.expectRevert(IERC8004AgentValidation.TeeVerificationFailed.selector);
        validation.verifyTeeAttestation(agentId, SAMPLE_QUOTE, _publicKey(alphaKey), sig);

        assertFalse(validation.isValidated(agentId, TEE), "Not validated");
    }

    function test_VerifyTeeAttestation_RevertsForNonExistentAgent() public {
        vm.prank(alphaKey.addr);
        vm.expectRevert(IERC8004AgentValidation.AgentDoesNotExist.selector);
        validation.verifyTeeAttestation(999, SAMPLE_QUOTE, _publicKey(alphaKey), "");
    }

    function test_VerifyTeeAttestation_RevertsWhenNotController() public {
        uint256 agentId = _mintAgent(alphaKey.addr, ALPHA_URI);
        bytes memory sig = _bindingSig(alphaKey, agentId);

        vm.prank(unauthorized);
        vm.expectRevert(IERC8004AgentValidation.NotAgentController.selector);
        validation.verifyTeeAttestation(agentId, SAMPLE_QUOTE, _publicKey(alphaKey), sig);
    }

    function test_VerifyTeeAttestation_RevertsOnBadPublicKeyLength() public {
        uint256 agentId = _mintAgent(alphaKey.addr, ALPHA_URI);
        bytes memory sig = _bindingSig(alphaKey, agentId);

        vm.prank(alphaKey.addr);
        vm.expectRevert(IERC8004AgentValidation.InvalidPublicKey.selector);
        validation.verifyTeeAttestation(agentId, SAMPLE_QUOTE, hex"0123456789abcdef", sig);
    }

    function test_VerifyTeeAttestation_RevertsWhenPhalaVerifierNotConfigured() public {
        AgentValidationRegistry noPhala = new AgentValidationRegistry(
            owner, IERC8004AgentIdentity(address(identity)), IPhalaVerifier(address(0))
        );
        uint256 agentId = _mintAgent(alphaKey.addr, ALPHA_URI);

        vm.prank(alphaKey.addr);
        vm.expectRevert(IERC8004AgentValidation.PhalaVerifierNotConfigured.selector);
        noPhala.verifyTeeAttestation(agentId, SAMPLE_QUOTE, _publicKey(alphaKey), "");
    }

    // =========================================================================
    // H-02: a quote cannot certify a different identity
    // =========================================================================

    /// @dev Beta copies Alpha's public quote, key and signature from calldata/events and
    ///      submits them for its own identity: the signature covers Alpha's agent ID.
    function test_H02_CopiedQuoteAndSignature_CannotCertifyOtherIdentity() public {
        uint256 alphaId = _mintAgent(alphaKey.addr, ALPHA_URI);
        uint256 betaId = _mintAgent(betaKey.addr, BETA_URI);

        bytes memory alphaSig = _bindingSig(alphaKey, alphaId);
        vm.prank(alphaKey.addr);
        validation.verifyTeeAttestation(alphaId, SAMPLE_QUOTE, _publicKey(alphaKey), alphaSig);

        // Same quote: rejected as replay.
        vm.prank(betaKey.addr);
        vm.expectRevert(IERC8004AgentValidation.QuoteAlreadyUsed.selector);
        validation.verifyTeeAttestation(betaId, SAMPLE_QUOTE, _publicKey(alphaKey), alphaSig);

        // Another valid quote of Alpha's key: the copied signature does not bind Beta's ID.
        vm.prank(betaKey.addr);
        vm.expectRevert(IERC8004AgentValidation.InvalidKeySignature.selector);
        validation.verifyTeeAttestation(betaId, DIFFERENT_QUOTE, _publicKey(alphaKey), alphaSig);

        // Signing with its own key while claiming Alpha's key also fails.
        bytes memory betaSig = _bindingSig(betaKey, betaId);
        vm.prank(betaKey.addr);
        vm.expectRevert(IERC8004AgentValidation.InvalidKeySignature.selector);
        validation.verifyTeeAttestation(betaId, DIFFERENT_QUOTE, _publicKey(alphaKey), betaSig);

        assertFalse(validation.isValidated(betaId, TEE), "Beta not certified by Alpha's quote");
    }

    /// @dev A binding signature is single-use: the nonce advances on success.
    function test_H02_BindingSignatureCannotBeReplayed() public {
        uint256 agentId = _mintAgent(alphaKey.addr, ALPHA_URI);
        bytes memory sig = _bindingSig(alphaKey, agentId);

        vm.prank(alphaKey.addr);
        validation.verifyTeeAttestation(agentId, SAMPLE_QUOTE, _publicKey(alphaKey), sig);

        vm.prank(alphaKey.addr);
        vm.expectRevert(IERC8004AgentValidation.InvalidKeySignature.selector);
        validation.verifyTeeAttestation(agentId, DIFFERENT_QUOTE, _publicKey(alphaKey), sig);
    }

    // =========================================================================
    // M-05: revocation cannot be undone by replay
    // =========================================================================

    function test_M05_RevokedTee_CannotBeRestoredWithAttestation() public {
        uint256 agentId = _mintAgent(alphaKey.addr, ALPHA_URI);
        _verifyTee(alphaKey.addr, agentId, alphaKey, SAMPLE_QUOTE);

        vm.prank(teeVerifier);
        validation.verifyValidation(agentId, TEE, keccak256(SAMPLE_QUOTE), false);
        assertFalse(validation.isValidated(agentId, TEE), "Revoked");

        // Old quote: replay rejected.
        bytes memory sig = _bindingSig(alphaKey, agentId);
        vm.prank(alphaKey.addr);
        vm.expectRevert(IERC8004AgentValidation.ValidationIsRevoked.selector);
        validation.verifyTeeAttestation(agentId, SAMPLE_QUOTE, _publicKey(alphaKey), sig);

        // Even a fresh, correctly signed quote cannot self-clear a revocation.
        vm.prank(alphaKey.addr);
        vm.expectRevert(IERC8004AgentValidation.ValidationIsRevoked.selector);
        validation.verifyTeeAttestation(agentId, DIFFERENT_QUOTE, _publicKey(alphaKey), sig);

        // Only a verifier approval clears it.
        vm.prank(alphaKey.addr);
        validation.submitValidation(agentId, DIFFERENT_QUOTE, TEE);
        vm.prank(teeVerifier);
        validation.verifyValidation(agentId, TEE, keccak256(DIFFERENT_QUOTE), true);
        assertTrue(validation.isValidated(agentId, TEE), "Re-approved by verifier");
        assertFalse(validation.isRevoked(agentId, TEE), "Revocation cleared");
    }

    // =========================================================================
    // Ownership and independence
    // =========================================================================

    function test_VerifyTeeAttestation_NotInheritedByNftBuyer() public {
        uint256 agentId = _mintAgent(alphaKey.addr, ALPHA_URI);
        _verifyTee(alphaKey.addr, agentId, alphaKey, SAMPLE_QUOTE);

        vm.prank(alphaKey.addr);
        identity.transferFrom(alphaKey.addr, betaKey.addr, agentId);

        assertFalse(validation.isValidated(agentId, TEE), "Buyer does not inherit TEE status");
    }

    function test_VerifyTeeAttestation_IndependentOfOtherTypes() public {
        uint256 agentId = _mintAgent(alphaKey.addr, ALPHA_URI);
        _verifyTee(alphaKey.addr, agentId, alphaKey, SAMPLE_QUOTE);

        assertTrue(validation.isValidated(agentId, TEE), "TEE validated");
        assertFalse(validation.isValidated(agentId, STAKE), "STAKE untouched");
    }

    function test_VerifyTeeAttestation_MultipleAgents() public {
        uint256 alphaId = _mintAgent(alphaKey.addr, ALPHA_URI);
        uint256 betaId = _mintAgent(betaKey.addr, BETA_URI);

        _verifyTee(alphaKey.addr, alphaId, alphaKey, SAMPLE_QUOTE);
        _verifyTee(betaKey.addr, betaId, betaKey, DIFFERENT_QUOTE);

        assertTrue(validation.isValidated(alphaId, TEE), "Alpha validated");
        assertTrue(validation.isValidated(betaId, TEE), "Beta validated");
        assertEq(validation.s_teeKeys(alphaId), alphaKey.addr, "Alpha key");
        assertEq(validation.s_teeKeys(betaId), betaKey.addr, "Beta key");
    }

    // =========================================================================
    // AgentRegistry integration
    // =========================================================================

    function test_Integration_RegisterWithENS_ThenVerifyTee() public {
        vm.prank(alphaKey.addr);
        agentRegistry.registerAgentWithENS("Alpha", hex"", ALPHA_ENS_NODE);
        uint256 agentId = _mintAgent(alphaKey.addr, ALPHA_URI);

        _verifyTee(alphaKey.addr, agentId, alphaKey, SAMPLE_QUOTE);

        assertTrue(agentRegistry.isAgent(alphaKey.addr), "Registered");
        assertEq(agentRegistry.getAgentByENS(ALPHA_ENS_NODE), alphaKey.addr, "ENS linked");
        assertTrue(validation.isValidated(agentId, TEE), "TEE validated");
    }

    function test_BackwardCompatibility_RegisterAgent_StillWorks() public {
        vm.prank(betaKey.addr);
        agentRegistry.registerAgent("Beta", hex"");
        assertTrue(agentRegistry.isAgent(betaKey.addr), "Registered");
    }

    function test_AgentRegistry_ValidationRegistry_Immutable() public view {
        assertEq(address(agentRegistry.i_validationRegistry()), address(validation), "Validation registry");
    }

    function test_AgentRegistry_ValidationRegistry_ZeroWhenNotConfigured() public {
        AgentRegistry plain = new AgentRegistry(IENS(address(0)), IERC8004AgentValidation(address(0)));
        assertEq(address(plain.i_validationRegistry()), address(0), "Zero when not configured");
    }

    // =========================================================================
    // Fuzz
    // =========================================================================

    function testFuzz_VerifyTeeAttestation_ArbitraryQuote(bytes memory quote) public {
        vm.assume(quote.length > 0 && quote.length < 2048);
        uint256 agentId = _mintAgent(alphaKey.addr, ALPHA_URI);

        _verifyTee(alphaKey.addr, agentId, alphaKey, quote);

        assertTrue(validation.isValidated(agentId, TEE), "Validated");
        assertTrue(validation.s_usedQuotes(keccak256(quote)), "Quote recorded");
    }

    function testFuzz_VerifyTeeAttestation_WrongSignerAlwaysRejected(uint256 signerPk) public {
        signerPk = bound(signerPk, 1, 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364140);
        vm.assume(signerPk != alphaKey.privateKey);
        uint256 agentId = _mintAgent(alphaKey.addr, ALPHA_URI);

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, validation.teeBindingDigest(agentId));
        vm.prank(alphaKey.addr);
        vm.expectRevert(IERC8004AgentValidation.InvalidKeySignature.selector);
        validation.verifyTeeAttestation(agentId, SAMPLE_QUOTE, _publicKey(alphaKey), abi.encodePacked(r, s, v));
    }
}
