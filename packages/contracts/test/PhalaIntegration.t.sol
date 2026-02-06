// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";

import {AgentRegistry} from "../src/AgentRegistry.sol";
import {AgentIdentityRegistry} from "../src/erc8004/AgentIdentityRegistry.sol";
import {AgentValidationRegistry} from "../src/erc8004/AgentValidationRegistry.sol";

import {IAgentRegistry} from "../src/interfaces/IAgentRegistry.sol";
import {IENS} from "../src/interfaces/IENS.sol";
import {IPhalaVerifier} from "../src/interfaces/IPhalaVerifier.sol";
import {IERC8004AgentIdentity} from "../src/interfaces/erc8004/IERC8004AgentIdentity.sol";
import {IERC8004AgentValidation} from "../src/interfaces/erc8004/IERC8004AgentValidation.sol";

import {MockPhalaVerifier} from "./mocks/MockPhalaVerifier.sol";
import {MockENSRegistry} from "./mocks/MockENSRegistry.sol";

/// @title PhalaIntegrationTest
/// @notice Comprehensive test suite for Phase 1.3: Phala TEE Attestation Verification.
/// @dev Tests cover:
///      - Successful TEE verification via AgentValidationRegistry
///      - Failed TEE verification (mock returns false)
///      - TEE verification for non-existent agent (revert)
///      - Multiple TEE verifications for same agent (overwrite previous)
///      - Integration: register agent -> verify TEE -> check isValidated()
///      - AgentRegistry integration: register with TEE attestation -> auto-verify
///      - AgentRegistry integration: register without TEE -> manual verification later
///      - Phala verifier not configured (address(0)) -> graceful revert
contract PhalaIntegrationTest is Test {
    // -------------------------------------------------
    // Contracts under test
    // -------------------------------------------------
    AgentIdentityRegistry public identity;
    AgentValidationRegistry public validation;
    AgentRegistry public agentRegistry;
    MockPhalaVerifier public phalaVerifier;
    MockENSRegistry public ensRegistry;

    // -------------------------------------------------
    // Test accounts
    // -------------------------------------------------
    address public owner;
    address public minter; // Acts as identity minter
    address public agentAlpha;
    address public agentBeta;
    address public unauthorized;

    // -------------------------------------------------
    // Constants
    // -------------------------------------------------
    string constant ALPHA_URI = "ipfs://QmAlphaMetadata";
    string constant BETA_URI = "ipfs://QmBetaMetadata";
    bytes constant SAMPLE_QUOTE = hex"deadbeefcafebabe0123456789abcdef";
    bytes constant SAMPLE_PUBLIC_KEY = hex"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    bytes constant DIFFERENT_QUOTE = hex"aabbccdd11223344";
    bytes constant DIFFERENT_KEY = hex"ffeeddccbbaa99887766554433221100ffeeddccbbaa99887766554433221100";

    /// @dev Simulated ENS namehash for "alpha.agent.eth"
    bytes32 public constant ALPHA_ENS_NODE = keccak256("alpha.agent.eth");

    // -------------------------------------------------
    // Setup
    // -------------------------------------------------

    function setUp() public {
        owner = makeAddr("owner");
        minter = makeAddr("minter");
        agentAlpha = makeAddr("agentAlpha");
        agentBeta = makeAddr("agentBeta");
        unauthorized = makeAddr("unauthorized");

        // Deploy mock Phala verifier (default: verification succeeds)
        phalaVerifier = new MockPhalaVerifier(true);

        // Deploy mock ENS registry
        ensRegistry = new MockENSRegistry();

        // Deploy identity registry (minter is the owner / authorized minter)
        vm.prank(minter);
        identity = new AgentIdentityRegistry(minter);

        // Deploy validation registry with Phala verifier
        vm.prank(owner);
        validation = new AgentValidationRegistry(
            owner,
            IERC8004AgentIdentity(address(identity)),
            IPhalaVerifier(address(phalaVerifier))
        );

        // Deploy AgentRegistry with ENS and validation registry
        agentRegistry = new AgentRegistry(
            IENS(address(ensRegistry)),
            IERC8004AgentValidation(address(validation))
        );

        // Set up ENS node ownership
        ensRegistry.setOwner(ALPHA_ENS_NODE, agentAlpha);
    }

    // =========================================================================
    // Helper Functions
    // =========================================================================

    /// @dev Mint an agent identity NFT for testing.
    function _mintAgent(address agent, string memory uri) internal returns (uint256) {
        vm.prank(minter);
        return identity.mintAgentIdentity(agent, uri);
    }

    // =========================================================================
    // AgentValidationRegistry: Direct TEE Verification Tests
    // =========================================================================

    // -------------------------------------------------
    // Successful TEE Verification
    // -------------------------------------------------

    function test_VerifyTeeAttestation_Success() public {
        uint256 agentId = _mintAgent(agentAlpha, ALPHA_URI);

        // Expect the TeeAttestationVerified event
        bytes32 expectedHash = keccak256(SAMPLE_QUOTE);
        vm.expectEmit(true, false, false, true);
        emit IERC8004AgentValidation.TeeAttestationVerified(agentId, expectedHash, block.timestamp);

        // Expect the ValidationSubmitted event
        vm.expectEmit(true, true, false, true);
        emit IERC8004AgentValidation.ValidationSubmitted(
            agentId, IERC8004AgentValidation.ValidationType.TEE, SAMPLE_QUOTE
        );

        // Expect the ValidationVerified event
        vm.expectEmit(true, true, false, true);
        emit IERC8004AgentValidation.ValidationVerified(agentId, IERC8004AgentValidation.ValidationType.TEE, true);

        // Verify TEE attestation
        vm.prank(agentAlpha);
        validation.verifyTeeAttestation(agentId, SAMPLE_QUOTE, SAMPLE_PUBLIC_KEY);

        // Check validation state
        assertTrue(
            validation.isValidated(agentId, IERC8004AgentValidation.ValidationType.TEE),
            "Agent should be TEE validated"
        );

        // Check the stored validation data
        IERC8004AgentValidation.Validation memory v =
            validation.getValidation(agentId, IERC8004AgentValidation.ValidationType.TEE);
        assertEq(uint8(v.validationType), uint8(IERC8004AgentValidation.ValidationType.TEE), "Type should be TEE");
        assertEq(v.proof, SAMPLE_QUOTE, "Proof should be the attestation quote");
        assertEq(v.timestamp, block.timestamp, "Timestamp should be now");
        assertTrue(v.valid, "Should be valid (verified inline)");
    }

    // -------------------------------------------------
    // Failed TEE Verification (mock returns false)
    // -------------------------------------------------

    function test_VerifyTeeAttestation_Fails_WhenVerifierReturnsFalse() public {
        uint256 agentId = _mintAgent(agentAlpha, ALPHA_URI);

        // Set the mock to return false
        phalaVerifier.setVerificationResult(false);

        vm.prank(agentAlpha);
        vm.expectRevert(IERC8004AgentValidation.TeeVerificationFailed.selector);
        validation.verifyTeeAttestation(agentId, SAMPLE_QUOTE, SAMPLE_PUBLIC_KEY);

        // Confirm validation state is unchanged
        assertFalse(
            validation.isValidated(agentId, IERC8004AgentValidation.ValidationType.TEE),
            "Agent should NOT be TEE validated after failed verification"
        );
    }

    // -------------------------------------------------
    // TEE Verification for Non-Existent Agent
    // -------------------------------------------------

    function test_VerifyTeeAttestation_RevertsForNonExistentAgent() public {
        vm.expectRevert(IERC8004AgentValidation.AgentDoesNotExist.selector);
        validation.verifyTeeAttestation(999, SAMPLE_QUOTE, SAMPLE_PUBLIC_KEY);
    }

    // -------------------------------------------------
    // Multiple TEE Verifications (Overwrite Previous)
    // -------------------------------------------------

    function test_VerifyTeeAttestation_OverwritesPrevious() public {
        uint256 agentId = _mintAgent(agentAlpha, ALPHA_URI);

        // First verification
        validation.verifyTeeAttestation(agentId, SAMPLE_QUOTE, SAMPLE_PUBLIC_KEY);

        assertTrue(
            validation.isValidated(agentId, IERC8004AgentValidation.ValidationType.TEE),
            "Should be validated after first verification"
        );

        IERC8004AgentValidation.Validation memory v1 =
            validation.getValidation(agentId, IERC8004AgentValidation.ValidationType.TEE);
        assertEq(v1.proof, SAMPLE_QUOTE, "First proof should match");

        // Second verification with different quote (overwrites)
        vm.warp(block.timestamp + 100);
        validation.verifyTeeAttestation(agentId, DIFFERENT_QUOTE, DIFFERENT_KEY);

        assertTrue(
            validation.isValidated(agentId, IERC8004AgentValidation.ValidationType.TEE),
            "Should still be validated after second verification"
        );

        IERC8004AgentValidation.Validation memory v2 =
            validation.getValidation(agentId, IERC8004AgentValidation.ValidationType.TEE);
        assertEq(v2.proof, DIFFERENT_QUOTE, "Proof should be overwritten with new quote");
        assertEq(v2.timestamp, block.timestamp, "Timestamp should be updated");
        assertTrue(v2.valid, "Should remain valid");
    }

    // -------------------------------------------------
    // Overwrite: Valid Then Invalid Then Valid
    // -------------------------------------------------

    function test_VerifyTeeAttestation_OverwriteWithFailedThenSucceed() public {
        uint256 agentId = _mintAgent(agentAlpha, ALPHA_URI);

        // First: successful verification
        validation.verifyTeeAttestation(agentId, SAMPLE_QUOTE, SAMPLE_PUBLIC_KEY);
        assertTrue(
            validation.isValidated(agentId, IERC8004AgentValidation.ValidationType.TEE),
            "Should be validated"
        );

        // Now set verifier to return false
        phalaVerifier.setVerificationResult(false);

        // Second: failed verification (reverts, does NOT overwrite)
        vm.expectRevert(IERC8004AgentValidation.TeeVerificationFailed.selector);
        validation.verifyTeeAttestation(agentId, DIFFERENT_QUOTE, DIFFERENT_KEY);

        // Original validation should still be intact
        assertTrue(
            validation.isValidated(agentId, IERC8004AgentValidation.ValidationType.TEE),
            "Previous validation should persist after failed re-verification"
        );

        // Set verifier back to true
        phalaVerifier.setVerificationResult(true);

        // Third: successful verification overwrites
        vm.warp(block.timestamp + 200);
        validation.verifyTeeAttestation(agentId, DIFFERENT_QUOTE, DIFFERENT_KEY);

        IERC8004AgentValidation.Validation memory v =
            validation.getValidation(agentId, IERC8004AgentValidation.ValidationType.TEE);
        assertEq(v.proof, DIFFERENT_QUOTE, "Proof should be updated");
        assertTrue(v.valid, "Should be valid again");
    }

    // -------------------------------------------------
    // Integration: Register -> Verify TEE -> Check isValidated
    // -------------------------------------------------

    function test_Integration_RegisterThenVerifyTee() public {
        // 1. Mint agent identity
        uint256 agentId = _mintAgent(agentAlpha, ALPHA_URI);
        assertEq(agentId, 1, "First agent ID should be 1");

        // 2. Verify TEE attestation
        vm.prank(agentAlpha);
        validation.verifyTeeAttestation(agentId, SAMPLE_QUOTE, SAMPLE_PUBLIC_KEY);

        // 3. Check all state is consistent
        assertTrue(identity.agentExists(agentId), "Agent should exist in identity registry");
        assertTrue(
            validation.isValidated(agentId, IERC8004AgentValidation.ValidationType.TEE),
            "Agent should be TEE validated"
        );
        assertEq(identity.ownerOfAgent(agentId), agentAlpha, "Identity owner should be agentAlpha");
    }

    // -------------------------------------------------
    // Phala Verifier Not Configured (address(0))
    // -------------------------------------------------

    function test_VerifyTeeAttestation_RevertsWhenPhalaVerifierNotConfigured() public {
        // Deploy a validation registry WITHOUT a Phala verifier
        vm.prank(owner);
        AgentValidationRegistry noPhalaValidation = new AgentValidationRegistry(
            owner,
            IERC8004AgentIdentity(address(identity)),
            IPhalaVerifier(address(0))
        );

        uint256 agentId = _mintAgent(agentAlpha, ALPHA_URI);

        vm.expectRevert(IERC8004AgentValidation.PhalaVerifierNotConfigured.selector);
        noPhalaValidation.verifyTeeAttestation(agentId, SAMPLE_QUOTE, SAMPLE_PUBLIC_KEY);
    }

    // -------------------------------------------------
    // Immutable Accessor
    // -------------------------------------------------

    function test_PhalaVerifier_Immutable_IsSet() public view {
        assertEq(
            address(validation.i_phalaVerifier()),
            address(phalaVerifier),
            "Phala verifier address should match"
        );
    }

    function test_PhalaVerifier_Immutable_ZeroWhenNotConfigured() public {
        vm.prank(owner);
        AgentValidationRegistry noPhala = new AgentValidationRegistry(
            owner,
            IERC8004AgentIdentity(address(identity)),
            IPhalaVerifier(address(0))
        );
        assertEq(address(noPhala.i_phalaVerifier()), address(0), "Should be zero when not configured");
    }

    // -------------------------------------------------
    // TEE Verification Does Not Affect Other Validation Types
    // -------------------------------------------------

    function test_VerifyTeeAttestation_IndependentOfOtherTypes() public {
        uint256 agentId = _mintAgent(agentAlpha, ALPHA_URI);

        // Verify TEE
        validation.verifyTeeAttestation(agentId, SAMPLE_QUOTE, SAMPLE_PUBLIC_KEY);

        // TEE should be validated
        assertTrue(
            validation.isValidated(agentId, IERC8004AgentValidation.ValidationType.TEE),
            "TEE should be validated"
        );

        // STAKE and ZKML should NOT be validated
        assertFalse(
            validation.isValidated(agentId, IERC8004AgentValidation.ValidationType.STAKE),
            "STAKE should not be affected"
        );
        assertFalse(
            validation.isValidated(agentId, IERC8004AgentValidation.ValidationType.ZKML),
            "ZKML should not be affected"
        );
    }

    // -------------------------------------------------
    // Multiple Agents with TEE Verification
    // -------------------------------------------------

    function test_VerifyTeeAttestation_MultipleAgents() public {
        uint256 alphaId = _mintAgent(agentAlpha, ALPHA_URI);
        uint256 betaId = _mintAgent(agentBeta, BETA_URI);

        // Verify Alpha
        validation.verifyTeeAttestation(alphaId, SAMPLE_QUOTE, SAMPLE_PUBLIC_KEY);

        // Verify Beta with different attestation
        validation.verifyTeeAttestation(betaId, DIFFERENT_QUOTE, DIFFERENT_KEY);

        // Both should be validated independently
        assertTrue(
            validation.isValidated(alphaId, IERC8004AgentValidation.ValidationType.TEE),
            "Alpha should be TEE validated"
        );
        assertTrue(
            validation.isValidated(betaId, IERC8004AgentValidation.ValidationType.TEE),
            "Beta should be TEE validated"
        );

        // Proofs should be different
        IERC8004AgentValidation.Validation memory vAlpha =
            validation.getValidation(alphaId, IERC8004AgentValidation.ValidationType.TEE);
        IERC8004AgentValidation.Validation memory vBeta =
            validation.getValidation(betaId, IERC8004AgentValidation.ValidationType.TEE);

        assertEq(vAlpha.proof, SAMPLE_QUOTE, "Alpha proof should match");
        assertEq(vBeta.proof, DIFFERENT_QUOTE, "Beta proof should match");
    }

    // =========================================================================
    // AgentRegistry Integration: registerAgentWithENSAndTEE
    // =========================================================================

    // -------------------------------------------------
    // Register with TEE Attestation -> Auto-Verify
    // -------------------------------------------------

    function test_RegisterWithENSAndTEE_AutoVerifies() public {
        // First, mint an identity for agentAlpha (the identity minting is a separate step)
        uint256 agentId = _mintAgent(agentAlpha, ALPHA_URI);

        // Register agent with ENS and TEE attestation
        vm.prank(agentAlpha);
        agentRegistry.registerAgentWithENSAndTEE(
            "Alpha",
            "attestation_data",
            ALPHA_ENS_NODE,
            agentId,
            SAMPLE_QUOTE,
            SAMPLE_PUBLIC_KEY
        );

        // Agent should be registered in AgentRegistry
        assertTrue(agentRegistry.isAgent(agentAlpha), "Agent should be registered");

        // Agent should be TEE validated in the validation registry
        assertTrue(
            validation.isValidated(agentId, IERC8004AgentValidation.ValidationType.TEE),
            "Agent should be TEE validated after registration"
        );

        // ENS should be linked
        assertEq(agentRegistry.getAgentByENS(ALPHA_ENS_NODE), agentAlpha, "ENS should resolve to agentAlpha");
    }

    // -------------------------------------------------
    // Register without TEE -> Manual Verification Later
    // -------------------------------------------------

    function test_RegisterWithoutTEE_ThenManualVerification() public {
        uint256 agentId = _mintAgent(agentAlpha, ALPHA_URI);

        // Register agent with ENS but NO TEE attestation (empty quote)
        vm.prank(agentAlpha);
        agentRegistry.registerAgentWithENSAndTEE(
            "Alpha",
            "",
            ALPHA_ENS_NODE,
            agentId,
            "", // empty attestation quote -> skip TEE
            ""  // empty public key
        );

        // Agent should be registered
        assertTrue(agentRegistry.isAgent(agentAlpha), "Agent should be registered");

        // Agent should NOT be TEE validated yet
        assertFalse(
            validation.isValidated(agentId, IERC8004AgentValidation.ValidationType.TEE),
            "Agent should NOT be TEE validated without attestation"
        );

        // Now manually verify TEE
        vm.prank(agentAlpha);
        validation.verifyTeeAttestation(agentId, SAMPLE_QUOTE, SAMPLE_PUBLIC_KEY);

        // Now should be validated
        assertTrue(
            validation.isValidated(agentId, IERC8004AgentValidation.ValidationType.TEE),
            "Agent should be TEE validated after manual verification"
        );
    }

    // -------------------------------------------------
    // Register with TEE but Verification Fails -> Entire Tx Reverts
    // -------------------------------------------------

    function test_RegisterWithENSAndTEE_RevertsOnFailedVerification() public {
        uint256 agentId = _mintAgent(agentAlpha, ALPHA_URI);

        // Set verifier to fail
        phalaVerifier.setVerificationResult(false);

        vm.prank(agentAlpha);
        vm.expectRevert(IERC8004AgentValidation.TeeVerificationFailed.selector);
        agentRegistry.registerAgentWithENSAndTEE(
            "Alpha",
            "attestation_data",
            ALPHA_ENS_NODE,
            agentId,
            SAMPLE_QUOTE,
            SAMPLE_PUBLIC_KEY
        );

        // Agent should NOT be registered (entire tx reverted)
        assertFalse(agentRegistry.isAgent(agentAlpha), "Agent should NOT be registered after revert");
    }

    // -------------------------------------------------
    // Register with TEE but Validation Registry Not Configured
    // -------------------------------------------------

    function test_RegisterWithENSAndTEE_RevertsWhenNoValidationRegistry() public {
        // Deploy an AgentRegistry without validation registry
        AgentRegistry noValRegistry = new AgentRegistry(
            IENS(address(ensRegistry)),
            IERC8004AgentValidation(address(0))
        );

        // Set up ENS ownership for this new registry
        ensRegistry.setOwner(ALPHA_ENS_NODE, agentAlpha);

        vm.prank(agentAlpha);
        vm.expectRevert(AgentRegistry.ValidationRegistryNotConfigured.selector);
        noValRegistry.registerAgentWithENSAndTEE(
            "Alpha",
            "",
            ALPHA_ENS_NODE,
            1, // agentId
            SAMPLE_QUOTE,
            SAMPLE_PUBLIC_KEY
        );
    }

    // -------------------------------------------------
    // Register with ENS and TEE without ENS node (bytes32(0))
    // -------------------------------------------------

    function test_RegisterWithENSAndTEE_NoENS_StillVerifiesTEE() public {
        uint256 agentId = _mintAgent(agentAlpha, ALPHA_URI);

        // Register without ENS linkage but with TEE
        vm.prank(agentAlpha);
        agentRegistry.registerAgentWithENSAndTEE(
            "Alpha",
            "attestation_data",
            bytes32(0), // no ENS
            agentId,
            SAMPLE_QUOTE,
            SAMPLE_PUBLIC_KEY
        );

        // Agent registered
        assertTrue(agentRegistry.isAgent(agentAlpha), "Agent should be registered");

        // TEE verified
        assertTrue(
            validation.isValidated(agentId, IERC8004AgentValidation.ValidationType.TEE),
            "Agent should be TEE validated"
        );

        // No ENS linkage
        IAgentRegistry.Agent memory agent = agentRegistry.getAgent(agentAlpha);
        assertEq(agent.ensNode, bytes32(0), "ENS node should be zero");
    }

    // -------------------------------------------------
    // Backward Compatibility: Old registration functions still work
    // -------------------------------------------------

    function test_BackwardCompatibility_RegisterAgent_StillWorks() public {
        vm.prank(agentAlpha);
        agentRegistry.registerAgent("Alpha", "attestation_data");

        assertTrue(agentRegistry.isAgent(agentAlpha), "Agent should be registered via old function");
    }

    function test_BackwardCompatibility_RegisterAgentWithENS_StillWorks() public {
        vm.prank(agentAlpha);
        agentRegistry.registerAgentWithENS("Alpha", "attestation_data", ALPHA_ENS_NODE);

        assertTrue(agentRegistry.isAgent(agentAlpha), "Agent should be registered via ENS function");
        assertEq(agentRegistry.getAgentByENS(ALPHA_ENS_NODE), agentAlpha, "ENS should resolve");
    }

    // -------------------------------------------------
    // Validation Registry Immutable Accessor on AgentRegistry
    // -------------------------------------------------

    function test_AgentRegistry_ValidationRegistry_Immutable() public view {
        assertEq(
            address(agentRegistry.i_validationRegistry()),
            address(validation),
            "Validation registry address should match"
        );
    }

    function test_AgentRegistry_ValidationRegistry_ZeroWhenNotConfigured() public {
        AgentRegistry noValReg = new AgentRegistry(
            IENS(address(0)),
            IERC8004AgentValidation(address(0))
        );
        assertEq(
            address(noValReg.i_validationRegistry()),
            address(0),
            "Should be zero when not configured"
        );
    }

    // =========================================================================
    // Fuzz Tests
    // =========================================================================

    function testFuzz_VerifyTeeAttestation_ArbitraryQuote(bytes memory quote) public {
        vm.assume(quote.length > 0 && quote.length < 2000);

        uint256 agentId = _mintAgent(agentAlpha, ALPHA_URI);

        validation.verifyTeeAttestation(agentId, quote, SAMPLE_PUBLIC_KEY);

        assertTrue(
            validation.isValidated(agentId, IERC8004AgentValidation.ValidationType.TEE),
            "Should be validated with arbitrary quote"
        );

        IERC8004AgentValidation.Validation memory v =
            validation.getValidation(agentId, IERC8004AgentValidation.ValidationType.TEE);
        assertEq(v.proof, quote, "Proof should match fuzzed quote");
    }

    function testFuzz_VerifyTeeAttestation_AttestationHash(bytes memory quote) public {
        vm.assume(quote.length > 0 && quote.length < 2000);

        uint256 agentId = _mintAgent(agentAlpha, ALPHA_URI);

        bytes32 expectedHash = keccak256(quote);

        vm.expectEmit(true, false, false, true);
        emit IERC8004AgentValidation.TeeAttestationVerified(agentId, expectedHash, block.timestamp);

        validation.verifyTeeAttestation(agentId, quote, SAMPLE_PUBLIC_KEY);
    }
}
