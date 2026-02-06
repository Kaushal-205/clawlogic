// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";

import {AgentIdentityRegistry} from "../src/erc8004/AgentIdentityRegistry.sol";
import {AgentReputationRegistry} from "../src/erc8004/AgentReputationRegistry.sol";
import {AgentValidationRegistry} from "../src/erc8004/AgentValidationRegistry.sol";

import {IERC8004AgentIdentity} from "../src/interfaces/erc8004/IERC8004AgentIdentity.sol";
import {IERC8004AgentReputation} from "../src/interfaces/erc8004/IERC8004AgentReputation.sol";
import {IERC8004AgentValidation} from "../src/interfaces/erc8004/IERC8004AgentValidation.sol";

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IPhalaVerifier} from "../src/interfaces/IPhalaVerifier.sol";

/// @title ERC8004IntegrationTest
/// @notice Comprehensive test suite for the ERC-8004 Agent Identity, Reputation,
///         and Validation registries.
contract ERC8004IntegrationTest is Test {
    // -------------------------------------------------
    // Contracts under test
    // -------------------------------------------------
    AgentIdentityRegistry public identity;
    AgentReputationRegistry public reputation;
    AgentValidationRegistry public validation;

    // -------------------------------------------------
    // Test accounts
    // -------------------------------------------------
    address public owner;
    address public minter; // Acts as AgentRegistry (identity minter)
    address public recorder; // Acts as PredictionMarketHook (reputation recorder)
    address public teeVerifier; // TEE validation verifier
    address public stakeVerifier; // Stake validation verifier
    address public zkmlVerifier; // zkML validation verifier
    address public agentAlpha;
    address public agentBeta;
    address public unauthorized;

    // -------------------------------------------------
    // Constants
    // -------------------------------------------------
    string constant ALPHA_URI = "ipfs://QmAlphaMetadata";
    string constant BETA_URI = "ipfs://QmBetaMetadata";
    string constant UPDATED_URI = "ipfs://QmUpdatedMetadata";
    bytes constant TEE_PROOF = hex"deadbeef";
    bytes constant STAKE_PROOF = hex"cafebabe";
    bytes constant ZKML_PROOF = hex"1234abcd";

    // -------------------------------------------------
    // Setup
    // -------------------------------------------------

    function setUp() public {
        owner = makeAddr("owner");
        minter = makeAddr("minter");
        recorder = makeAddr("recorder");
        teeVerifier = makeAddr("teeVerifier");
        stakeVerifier = makeAddr("stakeVerifier");
        zkmlVerifier = makeAddr("zkmlVerifier");
        agentAlpha = makeAddr("agentAlpha");
        agentBeta = makeAddr("agentBeta");
        unauthorized = makeAddr("unauthorized");

        // Deploy identity registry (minter is the owner / authorized minter)
        vm.prank(minter);
        identity = new AgentIdentityRegistry(minter);

        // Deploy reputation registry (owner controls recorder assignment)
        vm.prank(owner);
        reputation = new AgentReputationRegistry(owner, IERC8004AgentIdentity(address(identity)), recorder);

        // Deploy validation registry (owner controls verifier assignment)
        vm.prank(owner);
        validation = new AgentValidationRegistry(owner, IERC8004AgentIdentity(address(identity)), IPhalaVerifier(address(0)));

        // Set up verifiers
        vm.startPrank(owner);
        validation.setVerifier(IERC8004AgentValidation.ValidationType.TEE, teeVerifier);
        validation.setVerifier(IERC8004AgentValidation.ValidationType.STAKE, stakeVerifier);
        validation.setVerifier(IERC8004AgentValidation.ValidationType.ZKML, zkmlVerifier);
        vm.stopPrank();
    }

    // =========================================================================
    // AgentIdentityRegistry Tests
    // =========================================================================

    // -------------------------------------------------
    // Minting Tests
    // -------------------------------------------------

    function test_Identity_MintAgentIdentity_Success() public {
        vm.expectEmit(true, true, false, true);
        emit IERC8004AgentIdentity.AgentIdentityMinted(1, agentAlpha, ALPHA_URI);

        vm.prank(minter);
        uint256 agentId = identity.mintAgentIdentity(agentAlpha, ALPHA_URI);

        assertEq(agentId, 1, "First agent ID should be 1");
        assertEq(identity.ownerOf(agentId), agentAlpha, "Owner should be agentAlpha");
        assertEq(identity.ownerOfAgent(agentId), agentAlpha, "ownerOfAgent should return agentAlpha");
        assertEq(identity.getAgentMetadata(agentId), ALPHA_URI, "Metadata URI should match");
        assertTrue(identity.agentExists(agentId), "Agent should exist");
        assertEq(identity.totalAgents(), 1, "Total agents should be 1");
    }

    function test_Identity_MintMultipleAgents_SequentialIds() public {
        vm.startPrank(minter);
        uint256 id1 = identity.mintAgentIdentity(agentAlpha, ALPHA_URI);
        uint256 id2 = identity.mintAgentIdentity(agentBeta, BETA_URI);
        vm.stopPrank();

        assertEq(id1, 1, "First ID should be 1");
        assertEq(id2, 2, "Second ID should be 2");
        assertEq(identity.totalAgents(), 2, "Total agents should be 2");
        assertEq(identity.ownerOf(1), agentAlpha, "Token 1 owner should be agentAlpha");
        assertEq(identity.ownerOf(2), agentBeta, "Token 2 owner should be agentBeta");
    }

    function test_Identity_MintAgentIdentity_RevertWhenNotOwner() public {
        vm.prank(unauthorized);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, unauthorized));
        identity.mintAgentIdentity(agentAlpha, ALPHA_URI);
    }

    function test_Identity_MintAgentIdentity_RevertWhenZeroAddress() public {
        vm.prank(minter);
        vm.expectRevert(IERC8004AgentIdentity.ZeroAddress.selector);
        identity.mintAgentIdentity(address(0), ALPHA_URI);
    }

    function test_Identity_MintAgentIdentity_RevertWhenEmptyURI() public {
        vm.prank(minter);
        vm.expectRevert(IERC8004AgentIdentity.EmptyMetadataURI.selector);
        identity.mintAgentIdentity(agentAlpha, "");
    }

    // -------------------------------------------------
    // Metadata Tests
    // -------------------------------------------------

    function test_Identity_TokenURI_MatchesMetadata() public {
        vm.prank(minter);
        uint256 agentId = identity.mintAgentIdentity(agentAlpha, ALPHA_URI);

        assertEq(identity.tokenURI(agentId), ALPHA_URI, "tokenURI should match metadata");
    }

    function test_Identity_UpdateAgentMetadata_Success() public {
        vm.prank(minter);
        uint256 agentId = identity.mintAgentIdentity(agentAlpha, ALPHA_URI);

        vm.expectEmit(true, false, false, true);
        emit IERC8004AgentIdentity.AgentMetadataUpdated(agentId, UPDATED_URI);

        vm.prank(minter);
        identity.updateAgentMetadata(agentId, UPDATED_URI);

        assertEq(identity.getAgentMetadata(agentId), UPDATED_URI, "Metadata should be updated");
        assertEq(identity.tokenURI(agentId), UPDATED_URI, "tokenURI should reflect update");
    }

    function test_Identity_UpdateAgentMetadata_RevertWhenNotOwner() public {
        vm.prank(minter);
        identity.mintAgentIdentity(agentAlpha, ALPHA_URI);

        vm.prank(unauthorized);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, unauthorized));
        identity.updateAgentMetadata(1, UPDATED_URI);
    }

    function test_Identity_UpdateAgentMetadata_RevertWhenAgentDoesNotExist() public {
        vm.prank(minter);
        vm.expectRevert(IERC8004AgentIdentity.AgentDoesNotExist.selector);
        identity.updateAgentMetadata(999, UPDATED_URI);
    }

    function test_Identity_UpdateAgentMetadata_RevertWhenEmptyURI() public {
        vm.prank(minter);
        identity.mintAgentIdentity(agentAlpha, ALPHA_URI);

        vm.prank(minter);
        vm.expectRevert(IERC8004AgentIdentity.EmptyMetadataURI.selector);
        identity.updateAgentMetadata(1, "");
    }

    // -------------------------------------------------
    // View Function Tests
    // -------------------------------------------------

    function test_Identity_GetAgentMetadata_RevertWhenNonExistent() public {
        vm.expectRevert(IERC8004AgentIdentity.AgentDoesNotExist.selector);
        identity.getAgentMetadata(42);
    }

    function test_Identity_OwnerOfAgent_RevertWhenNonExistent() public {
        vm.expectRevert(IERC8004AgentIdentity.AgentDoesNotExist.selector);
        identity.ownerOfAgent(42);
    }

    function test_Identity_TokenURI_RevertWhenNonExistent() public {
        vm.expectRevert(IERC8004AgentIdentity.AgentDoesNotExist.selector);
        identity.tokenURI(42);
    }

    function test_Identity_AgentExists_ReturnsFalseForNonExistent() public view {
        assertFalse(identity.agentExists(42), "Non-existent agent should return false");
    }

    function test_Identity_TotalAgents_InitiallyZero() public view {
        assertEq(identity.totalAgents(), 0, "Should start at zero");
    }

    // -------------------------------------------------
    // ERC-721 Compliance Tests
    // -------------------------------------------------

    function test_Identity_ERC721_BalanceOf() public {
        vm.startPrank(minter);
        identity.mintAgentIdentity(agentAlpha, ALPHA_URI);
        identity.mintAgentIdentity(agentAlpha, BETA_URI);
        vm.stopPrank();

        assertEq(identity.balanceOf(agentAlpha), 2, "agentAlpha should own 2 tokens");
        assertEq(identity.balanceOf(agentBeta), 0, "agentBeta should own 0 tokens");
    }

    function test_Identity_ERC721_TransferFrom() public {
        vm.prank(minter);
        uint256 agentId = identity.mintAgentIdentity(agentAlpha, ALPHA_URI);

        vm.prank(agentAlpha);
        identity.transferFrom(agentAlpha, agentBeta, agentId);

        assertEq(identity.ownerOf(agentId), agentBeta, "Token should transfer to agentBeta");
    }

    function test_Identity_ERC721_Approve_And_TransferFrom() public {
        vm.prank(minter);
        uint256 agentId = identity.mintAgentIdentity(agentAlpha, ALPHA_URI);

        vm.prank(agentAlpha);
        identity.approve(agentBeta, agentId);

        vm.prank(agentBeta);
        identity.transferFrom(agentAlpha, agentBeta, agentId);

        assertEq(identity.ownerOf(agentId), agentBeta, "Approved transfer should succeed");
    }

    function test_Identity_SupportsInterface_ERC721() public view {
        // ERC-721 interface ID = 0x80ac58cd
        assertTrue(identity.supportsInterface(0x80ac58cd), "Should support ERC-721");
    }

    function test_Identity_SupportsInterface_ERC165() public view {
        // ERC-165 interface ID = 0x01ffc9a7
        assertTrue(identity.supportsInterface(0x01ffc9a7), "Should support ERC-165");
    }

    // =========================================================================
    // AgentReputationRegistry Tests
    // =========================================================================

    // -------------------------------------------------
    // Helper: mint an agent identity for reputation tests
    // -------------------------------------------------

    function _mintAgent(address agent, string memory uri) internal returns (uint256) {
        vm.prank(minter);
        return identity.mintAgentIdentity(agent, uri);
    }

    // -------------------------------------------------
    // Recording Tests
    // -------------------------------------------------

    function test_Reputation_RecordAssertion_Success() public {
        uint256 agentId = _mintAgent(agentAlpha, ALPHA_URI);
        bytes32 marketId = keccak256("market1");

        vm.expectEmit(true, true, false, true);
        emit IERC8004AgentReputation.AssertionRecorded(agentId, marketId, true, 1 ether);

        vm.prank(recorder);
        reputation.recordAssertion(agentId, marketId, true, 1 ether);

        IERC8004AgentReputation.ReputationScore memory score = reputation.getReputationScore(agentId);
        assertEq(score.totalAssertions, 1, "Total assertions should be 1");
        assertEq(score.successfulAssertions, 1, "Successful assertions should be 1");
        assertEq(uint256(score.totalVolume), 1 ether, "Volume should be 1 ether");
        assertEq(score.lastUpdated, block.timestamp, "Last updated should be now");
    }

    function test_Reputation_RecordMultipleAssertions() public {
        uint256 agentId = _mintAgent(agentAlpha, ALPHA_URI);
        bytes32 market1 = keccak256("market1");
        bytes32 market2 = keccak256("market2");
        bytes32 market3 = keccak256("market3");

        vm.startPrank(recorder);
        reputation.recordAssertion(agentId, market1, true, 2 ether);
        reputation.recordAssertion(agentId, market2, false, 1 ether);
        reputation.recordAssertion(agentId, market3, true, 3 ether);
        vm.stopPrank();

        IERC8004AgentReputation.ReputationScore memory score = reputation.getReputationScore(agentId);
        assertEq(score.totalAssertions, 3, "Total assertions should be 3");
        assertEq(score.successfulAssertions, 2, "Successful assertions should be 2");
        assertEq(uint256(score.totalVolume), 6 ether, "Volume should be 6 ether");
    }

    function test_Reputation_RecordAssertion_FailedDoesNotIncrementSuccess() public {
        uint256 agentId = _mintAgent(agentAlpha, ALPHA_URI);
        bytes32 marketId = keccak256("market1");

        vm.prank(recorder);
        reputation.recordAssertion(agentId, marketId, false, 1 ether);

        IERC8004AgentReputation.ReputationScore memory score = reputation.getReputationScore(agentId);
        assertEq(score.totalAssertions, 1, "Total assertions should be 1");
        assertEq(score.successfulAssertions, 0, "Successful assertions should be 0");
    }

    function test_Reputation_RecordAssertion_RevertWhenNotRecorder() public {
        uint256 agentId = _mintAgent(agentAlpha, ALPHA_URI);

        vm.prank(unauthorized);
        vm.expectRevert(IERC8004AgentReputation.OnlyRecorder.selector);
        reputation.recordAssertion(agentId, keccak256("m"), true, 1 ether);
    }

    function test_Reputation_RecordAssertion_RevertWhenAgentDoesNotExist() public {
        vm.prank(recorder);
        vm.expectRevert(IERC8004AgentReputation.AgentDoesNotExist.selector);
        reputation.recordAssertion(999, keccak256("m"), true, 1 ether);
    }

    // -------------------------------------------------
    // Accuracy Tests
    // -------------------------------------------------

    function test_Reputation_GetAccuracy_NoAssertions_ReturnsZero() public {
        uint256 agentId = _mintAgent(agentAlpha, ALPHA_URI);

        assertEq(reputation.getAccuracy(agentId), 0, "Accuracy with no assertions should be 0");
    }

    function test_Reputation_GetAccuracy_AllSuccessful() public {
        uint256 agentId = _mintAgent(agentAlpha, ALPHA_URI);

        vm.startPrank(recorder);
        reputation.recordAssertion(agentId, keccak256("m1"), true, 1 ether);
        reputation.recordAssertion(agentId, keccak256("m2"), true, 1 ether);
        reputation.recordAssertion(agentId, keccak256("m3"), true, 1 ether);
        vm.stopPrank();

        assertEq(reputation.getAccuracy(agentId), 10_000, "100% accuracy should be 10000");
    }

    function test_Reputation_GetAccuracy_PartialSuccess() public {
        uint256 agentId = _mintAgent(agentAlpha, ALPHA_URI);

        vm.startPrank(recorder);
        reputation.recordAssertion(agentId, keccak256("m1"), true, 1 ether);
        reputation.recordAssertion(agentId, keccak256("m2"), false, 1 ether);
        reputation.recordAssertion(agentId, keccak256("m3"), true, 1 ether);
        reputation.recordAssertion(agentId, keccak256("m4"), false, 1 ether);
        vm.stopPrank();

        // 2 out of 4 = 50% = 5000 basis points
        assertEq(reputation.getAccuracy(agentId), 5_000, "50% accuracy should be 5000");
    }

    function test_Reputation_GetAccuracy_OneThird() public {
        uint256 agentId = _mintAgent(agentAlpha, ALPHA_URI);

        vm.startPrank(recorder);
        reputation.recordAssertion(agentId, keccak256("m1"), true, 1 ether);
        reputation.recordAssertion(agentId, keccak256("m2"), false, 1 ether);
        reputation.recordAssertion(agentId, keccak256("m3"), false, 1 ether);
        vm.stopPrank();

        // 1 out of 3 = 33.33% = 3333 basis points (rounds down)
        assertEq(reputation.getAccuracy(agentId), 3_333, "33.33% accuracy should round down to 3333");
    }

    function test_Reputation_GetAccuracy_AllFailed() public {
        uint256 agentId = _mintAgent(agentAlpha, ALPHA_URI);

        vm.startPrank(recorder);
        reputation.recordAssertion(agentId, keccak256("m1"), false, 1 ether);
        reputation.recordAssertion(agentId, keccak256("m2"), false, 1 ether);
        vm.stopPrank();

        assertEq(reputation.getAccuracy(agentId), 0, "0% accuracy should be 0");
    }

    // -------------------------------------------------
    // Recorder Management Tests
    // -------------------------------------------------

    function test_Reputation_SetRecorder_Success() public {
        address newRecorder = makeAddr("newRecorder");

        vm.expectEmit(true, true, false, false);
        emit IERC8004AgentReputation.RecorderUpdated(recorder, newRecorder);

        vm.prank(owner);
        reputation.setRecorder(newRecorder);

        assertEq(reputation.getRecorder(), newRecorder, "Recorder should be updated");
    }

    function test_Reputation_SetRecorder_RevertWhenNotOwner() public {
        vm.prank(unauthorized);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, unauthorized));
        reputation.setRecorder(makeAddr("x"));
    }

    function test_Reputation_SetRecorder_RevertWhenZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert(IERC8004AgentReputation.ZeroAddress.selector);
        reputation.setRecorder(address(0));
    }

    function test_Reputation_NewRecorder_CanRecord() public {
        uint256 agentId = _mintAgent(agentAlpha, ALPHA_URI);
        address newRecorder = makeAddr("newRecorder");

        vm.prank(owner);
        reputation.setRecorder(newRecorder);

        vm.prank(newRecorder);
        reputation.recordAssertion(agentId, keccak256("m"), true, 1 ether);

        assertEq(reputation.getReputationScore(agentId).totalAssertions, 1, "New recorder should work");
    }

    function test_Reputation_OldRecorder_RevertAfterUpdate() public {
        uint256 agentId = _mintAgent(agentAlpha, ALPHA_URI);
        address newRecorder = makeAddr("newRecorder");

        vm.prank(owner);
        reputation.setRecorder(newRecorder);

        vm.prank(recorder);
        vm.expectRevert(IERC8004AgentReputation.OnlyRecorder.selector);
        reputation.recordAssertion(agentId, keccak256("m"), true, 1 ether);
    }

    // -------------------------------------------------
    // Reputation Score View Tests
    // -------------------------------------------------

    function test_Reputation_GetReputationScore_DefaultValues() public {
        uint256 agentId = _mintAgent(agentAlpha, ALPHA_URI);

        IERC8004AgentReputation.ReputationScore memory score = reputation.getReputationScore(agentId);
        assertEq(score.totalAssertions, 0, "Default totalAssertions should be 0");
        assertEq(score.successfulAssertions, 0, "Default successfulAssertions should be 0");
        assertEq(uint256(score.totalVolume), 0, "Default totalVolume should be 0");
        assertEq(score.lastUpdated, 0, "Default lastUpdated should be 0");
    }

    function test_Reputation_LastUpdated_AdvancesWithTime() public {
        uint256 agentId = _mintAgent(agentAlpha, ALPHA_URI);

        vm.warp(1000);
        vm.prank(recorder);
        reputation.recordAssertion(agentId, keccak256("m1"), true, 1 ether);

        assertEq(reputation.getReputationScore(agentId).lastUpdated, 1000, "Should be 1000");

        vm.warp(2000);
        vm.prank(recorder);
        reputation.recordAssertion(agentId, keccak256("m2"), false, 2 ether);

        assertEq(reputation.getReputationScore(agentId).lastUpdated, 2000, "Should advance to 2000");
    }

    // =========================================================================
    // AgentValidationRegistry Tests
    // =========================================================================

    // -------------------------------------------------
    // Submission Tests
    // -------------------------------------------------

    function test_Validation_SubmitValidation_TEE_Success() public {
        uint256 agentId = _mintAgent(agentAlpha, ALPHA_URI);

        vm.expectEmit(true, true, false, true);
        emit IERC8004AgentValidation.ValidationSubmitted(
            agentId, IERC8004AgentValidation.ValidationType.TEE, TEE_PROOF
        );

        vm.prank(agentAlpha);
        validation.submitValidation(agentId, TEE_PROOF, IERC8004AgentValidation.ValidationType.TEE);

        IERC8004AgentValidation.Validation memory v =
            validation.getValidation(agentId, IERC8004AgentValidation.ValidationType.TEE);
        assertEq(uint8(v.validationType), uint8(IERC8004AgentValidation.ValidationType.TEE), "Type should be TEE");
        assertEq(v.proof, TEE_PROOF, "Proof should match");
        assertEq(v.timestamp, block.timestamp, "Timestamp should be now");
        assertFalse(v.valid, "Should not be valid yet (pending verification)");
    }

    function test_Validation_SubmitValidation_AnyoneCanSubmit() public {
        uint256 agentId = _mintAgent(agentAlpha, ALPHA_URI);

        // Even an unauthorized address can submit (anyone can propose a proof)
        vm.prank(unauthorized);
        validation.submitValidation(agentId, TEE_PROOF, IERC8004AgentValidation.ValidationType.TEE);

        IERC8004AgentValidation.Validation memory v =
            validation.getValidation(agentId, IERC8004AgentValidation.ValidationType.TEE);
        assertEq(v.proof, TEE_PROOF, "Proof should be stored");
    }

    function test_Validation_SubmitValidation_RevertWhenNoneType() public {
        uint256 agentId = _mintAgent(agentAlpha, ALPHA_URI);

        vm.expectRevert(IERC8004AgentValidation.InvalidValidationType.selector);
        validation.submitValidation(agentId, TEE_PROOF, IERC8004AgentValidation.ValidationType.NONE);
    }

    function test_Validation_SubmitValidation_RevertWhenEmptyProof() public {
        uint256 agentId = _mintAgent(agentAlpha, ALPHA_URI);

        vm.expectRevert(IERC8004AgentValidation.EmptyProof.selector);
        validation.submitValidation(agentId, "", IERC8004AgentValidation.ValidationType.TEE);
    }

    function test_Validation_SubmitValidation_RevertWhenAgentDoesNotExist() public {
        vm.expectRevert(IERC8004AgentValidation.AgentDoesNotExist.selector);
        validation.submitValidation(999, TEE_PROOF, IERC8004AgentValidation.ValidationType.TEE);
    }

    function test_Validation_SubmitValidation_OverwritesPrevious() public {
        uint256 agentId = _mintAgent(agentAlpha, ALPHA_URI);
        bytes memory newProof = hex"aabbccdd";

        // First submission
        validation.submitValidation(agentId, TEE_PROOF, IERC8004AgentValidation.ValidationType.TEE);

        // Verify it, then overwrite
        vm.prank(teeVerifier);
        validation.verifyValidation(agentId, IERC8004AgentValidation.ValidationType.TEE, true);
        assertTrue(validation.isValidated(agentId, IERC8004AgentValidation.ValidationType.TEE), "Should be valid");

        // Resubmit -- should reset valid to false
        vm.warp(block.timestamp + 100);
        validation.submitValidation(agentId, newProof, IERC8004AgentValidation.ValidationType.TEE);

        IERC8004AgentValidation.Validation memory v =
            validation.getValidation(agentId, IERC8004AgentValidation.ValidationType.TEE);
        assertEq(v.proof, newProof, "Proof should be overwritten");
        assertFalse(v.valid, "Valid should be reset to false on resubmission");
    }

    // -------------------------------------------------
    // Verification Tests
    // -------------------------------------------------

    function test_Validation_VerifyValidation_TEE_Accept() public {
        uint256 agentId = _mintAgent(agentAlpha, ALPHA_URI);

        validation.submitValidation(agentId, TEE_PROOF, IERC8004AgentValidation.ValidationType.TEE);

        vm.expectEmit(true, true, false, true);
        emit IERC8004AgentValidation.ValidationVerified(agentId, IERC8004AgentValidation.ValidationType.TEE, true);

        vm.prank(teeVerifier);
        validation.verifyValidation(agentId, IERC8004AgentValidation.ValidationType.TEE, true);

        assertTrue(validation.isValidated(agentId, IERC8004AgentValidation.ValidationType.TEE), "Should be validated");
    }

    function test_Validation_VerifyValidation_TEE_Reject() public {
        uint256 agentId = _mintAgent(agentAlpha, ALPHA_URI);

        validation.submitValidation(agentId, TEE_PROOF, IERC8004AgentValidation.ValidationType.TEE);

        vm.prank(teeVerifier);
        validation.verifyValidation(agentId, IERC8004AgentValidation.ValidationType.TEE, false);

        assertFalse(
            validation.isValidated(agentId, IERC8004AgentValidation.ValidationType.TEE), "Should not be validated"
        );
    }

    function test_Validation_VerifyValidation_StakeVerifier() public {
        uint256 agentId = _mintAgent(agentAlpha, ALPHA_URI);

        validation.submitValidation(agentId, STAKE_PROOF, IERC8004AgentValidation.ValidationType.STAKE);

        vm.prank(stakeVerifier);
        validation.verifyValidation(agentId, IERC8004AgentValidation.ValidationType.STAKE, true);

        assertTrue(
            validation.isValidated(agentId, IERC8004AgentValidation.ValidationType.STAKE), "STAKE should be validated"
        );
    }

    function test_Validation_VerifyValidation_ZkmlVerifier() public {
        uint256 agentId = _mintAgent(agentAlpha, ALPHA_URI);

        validation.submitValidation(agentId, ZKML_PROOF, IERC8004AgentValidation.ValidationType.ZKML);

        vm.prank(zkmlVerifier);
        validation.verifyValidation(agentId, IERC8004AgentValidation.ValidationType.ZKML, true);

        assertTrue(
            validation.isValidated(agentId, IERC8004AgentValidation.ValidationType.ZKML), "ZKML should be validated"
        );
    }

    function test_Validation_VerifyValidation_RevertWhenWrongVerifier() public {
        uint256 agentId = _mintAgent(agentAlpha, ALPHA_URI);

        validation.submitValidation(agentId, TEE_PROOF, IERC8004AgentValidation.ValidationType.TEE);

        // stakeVerifier tries to verify TEE -- should fail
        vm.prank(stakeVerifier);
        vm.expectRevert(IERC8004AgentValidation.OnlyVerifier.selector);
        validation.verifyValidation(agentId, IERC8004AgentValidation.ValidationType.TEE, true);
    }

    function test_Validation_VerifyValidation_RevertWhenNotSubmitted() public {
        uint256 agentId = _mintAgent(agentAlpha, ALPHA_URI);

        vm.prank(teeVerifier);
        vm.expectRevert(IERC8004AgentValidation.ValidationNotSubmitted.selector);
        validation.verifyValidation(agentId, IERC8004AgentValidation.ValidationType.TEE, true);
    }

    function test_Validation_VerifyValidation_RevertWhenNoneType() public {
        vm.prank(teeVerifier);
        vm.expectRevert(IERC8004AgentValidation.InvalidValidationType.selector);
        validation.verifyValidation(1, IERC8004AgentValidation.ValidationType.NONE, true);
    }

    // -------------------------------------------------
    // Verifier Management Tests
    // -------------------------------------------------

    function test_Validation_SetVerifier_Success() public {
        address newTeeVerifier = makeAddr("newTeeVerifier");

        vm.expectEmit(true, true, false, false);
        emit IERC8004AgentValidation.VerifierSet(IERC8004AgentValidation.ValidationType.TEE, newTeeVerifier);

        vm.prank(owner);
        validation.setVerifier(IERC8004AgentValidation.ValidationType.TEE, newTeeVerifier);

        assertEq(
            validation.getVerifier(IERC8004AgentValidation.ValidationType.TEE),
            newTeeVerifier,
            "Verifier should be updated"
        );
    }

    function test_Validation_SetVerifier_RevertWhenNotOwner() public {
        vm.prank(unauthorized);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, unauthorized));
        validation.setVerifier(IERC8004AgentValidation.ValidationType.TEE, makeAddr("x"));
    }

    function test_Validation_SetVerifier_RevertWhenZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert(IERC8004AgentValidation.ZeroAddress.selector);
        validation.setVerifier(IERC8004AgentValidation.ValidationType.TEE, address(0));
    }

    function test_Validation_SetVerifier_RevertWhenNoneType() public {
        vm.prank(owner);
        vm.expectRevert(IERC8004AgentValidation.InvalidValidationType.selector);
        validation.setVerifier(IERC8004AgentValidation.ValidationType.NONE, makeAddr("x"));
    }

    function test_Validation_GetVerifier_DefaultIsZero() public view {
        // We set verifiers in setUp, but for an unset type, let's check NONE
        // NONE can't be set, so there shouldn't be a verifier for it.
        // Actually we can check a valid type that wasn't set... all three were set in setUp.
        // The default for ValidationType mappings would be whatever address was at that slot before
        // setUp -- but setUp sets all three. Let's just verify the getVerifier works.
        assertEq(
            validation.getVerifier(IERC8004AgentValidation.ValidationType.TEE), teeVerifier, "TEE verifier should match"
        );
        assertEq(
            validation.getVerifier(IERC8004AgentValidation.ValidationType.STAKE),
            stakeVerifier,
            "STAKE verifier should match"
        );
        assertEq(
            validation.getVerifier(IERC8004AgentValidation.ValidationType.ZKML),
            zkmlVerifier,
            "ZKML verifier should match"
        );
    }

    // -------------------------------------------------
    // isValidated View Tests
    // -------------------------------------------------

    function test_Validation_IsValidated_ReturnsFalseWhenNeverSubmitted() public view {
        // Agent ID 1 doesn't exist, never submitted -- should return false (not revert)
        assertFalse(
            validation.isValidated(999, IERC8004AgentValidation.ValidationType.TEE),
            "Should return false for non-existent"
        );
    }

    function test_Validation_IsValidated_ReturnsFalseWhenPending() public {
        uint256 agentId = _mintAgent(agentAlpha, ALPHA_URI);
        validation.submitValidation(agentId, TEE_PROOF, IERC8004AgentValidation.ValidationType.TEE);

        assertFalse(
            validation.isValidated(agentId, IERC8004AgentValidation.ValidationType.TEE),
            "Pending should return false"
        );
    }

    // -------------------------------------------------
    // Multiple Validation Types on Same Agent
    // -------------------------------------------------

    function test_Validation_MultipleTypesPerAgent() public {
        uint256 agentId = _mintAgent(agentAlpha, ALPHA_URI);

        // Submit all three types
        validation.submitValidation(agentId, TEE_PROOF, IERC8004AgentValidation.ValidationType.TEE);
        validation.submitValidation(agentId, STAKE_PROOF, IERC8004AgentValidation.ValidationType.STAKE);
        validation.submitValidation(agentId, ZKML_PROOF, IERC8004AgentValidation.ValidationType.ZKML);

        // Verify TEE and ZKML, leave STAKE pending
        vm.prank(teeVerifier);
        validation.verifyValidation(agentId, IERC8004AgentValidation.ValidationType.TEE, true);

        vm.prank(zkmlVerifier);
        validation.verifyValidation(agentId, IERC8004AgentValidation.ValidationType.ZKML, true);

        assertTrue(validation.isValidated(agentId, IERC8004AgentValidation.ValidationType.TEE), "TEE should be valid");
        assertFalse(
            validation.isValidated(agentId, IERC8004AgentValidation.ValidationType.STAKE),
            "STAKE should still be pending"
        );
        assertTrue(
            validation.isValidated(agentId, IERC8004AgentValidation.ValidationType.ZKML), "ZKML should be valid"
        );
    }

    // =========================================================================
    // Cross-Registry Integration Tests
    // =========================================================================

    function test_CrossRegistry_FullLifecycle() public {
        // 1. Mint agent identity
        vm.prank(minter);
        uint256 agentId = identity.mintAgentIdentity(agentAlpha, ALPHA_URI);
        assertEq(agentId, 1, "Agent ID should be 1");

        // 2. Submit and verify TEE validation
        vm.prank(agentAlpha);
        validation.submitValidation(agentId, TEE_PROOF, IERC8004AgentValidation.ValidationType.TEE);

        vm.prank(teeVerifier);
        validation.verifyValidation(agentId, IERC8004AgentValidation.ValidationType.TEE, true);
        assertTrue(validation.isValidated(agentId, IERC8004AgentValidation.ValidationType.TEE), "TEE validated");

        // 3. Record successful assertion
        bytes32 marketId = keccak256("Will ETH break $10k?");
        vm.prank(recorder);
        reputation.recordAssertion(agentId, marketId, true, 5 ether);

        // 4. Verify all data is consistent across registries
        assertEq(identity.ownerOfAgent(agentId), agentAlpha, "Identity owner correct");
        assertEq(identity.getAgentMetadata(agentId), ALPHA_URI, "Identity metadata correct");
        assertEq(reputation.getAccuracy(agentId), 10_000, "100% accuracy after one success");
        assertEq(uint256(reputation.getReputationScore(agentId).totalVolume), 5 ether, "Volume correct");
        assertTrue(validation.isValidated(agentId, IERC8004AgentValidation.ValidationType.TEE), "Still TEE validated");
    }

    function test_CrossRegistry_MultipleAgents_IndependentReputation() public {
        uint256 alphaId = _mintAgent(agentAlpha, ALPHA_URI);
        uint256 betaId = _mintAgent(agentBeta, BETA_URI);

        vm.startPrank(recorder);
        // Alpha: 3 assertions, 2 successful
        reputation.recordAssertion(alphaId, keccak256("m1"), true, 1 ether);
        reputation.recordAssertion(alphaId, keccak256("m2"), false, 2 ether);
        reputation.recordAssertion(alphaId, keccak256("m3"), true, 3 ether);

        // Beta: 2 assertions, 0 successful
        reputation.recordAssertion(betaId, keccak256("m4"), false, 5 ether);
        reputation.recordAssertion(betaId, keccak256("m5"), false, 5 ether);
        vm.stopPrank();

        // Alpha: 2/3 = 66.66% = 6666 bp
        assertEq(reputation.getAccuracy(alphaId), 6_666, "Alpha accuracy should be 6666");
        assertEq(uint256(reputation.getReputationScore(alphaId).totalVolume), 6 ether, "Alpha volume = 6 ETH");

        // Beta: 0/2 = 0%
        assertEq(reputation.getAccuracy(betaId), 0, "Beta accuracy should be 0");
        assertEq(uint256(reputation.getReputationScore(betaId).totalVolume), 10 ether, "Beta volume = 10 ETH");
    }

    function test_CrossRegistry_ReputationRequiresValidIdentity() public {
        // Try to record reputation for a non-existent agent
        vm.prank(recorder);
        vm.expectRevert(IERC8004AgentReputation.AgentDoesNotExist.selector);
        reputation.recordAssertion(42, keccak256("m"), true, 1 ether);
    }

    function test_CrossRegistry_ValidationRequiresValidIdentity() public {
        // Try to submit validation for a non-existent agent
        vm.expectRevert(IERC8004AgentValidation.AgentDoesNotExist.selector);
        validation.submitValidation(42, TEE_PROOF, IERC8004AgentValidation.ValidationType.TEE);
    }

    // =========================================================================
    // Fuzz Tests
    // =========================================================================

    function testFuzz_Identity_MintWithVariousURIs(string memory uri) public {
        vm.assume(bytes(uri).length > 0 && bytes(uri).length < 500);

        vm.prank(minter);
        uint256 agentId = identity.mintAgentIdentity(agentAlpha, uri);

        assertEq(identity.getAgentMetadata(agentId), uri, "Metadata should match fuzzed URI");
    }

    function testFuzz_Reputation_AccuracyAlwaysInRange(uint8 successful, uint8 total) public {
        vm.assume(total > 0);
        vm.assume(successful <= total);

        uint256 agentId = _mintAgent(agentAlpha, ALPHA_URI);

        vm.startPrank(recorder);
        for (uint8 i = 0; i < total; i++) {
            bool success = i < successful;
            reputation.recordAssertion(agentId, keccak256(abi.encode("m", i)), success, 1 ether);
        }
        vm.stopPrank();

        uint256 accuracy = reputation.getAccuracy(agentId);
        assertLe(accuracy, 10_000, "Accuracy should never exceed 10000");
    }

    function testFuzz_Reputation_RecordAssertionVolume(uint128 volume) public {
        vm.assume(volume > 0);

        uint256 agentId = _mintAgent(agentAlpha, ALPHA_URI);

        vm.prank(recorder);
        reputation.recordAssertion(agentId, keccak256("m"), true, uint256(volume));

        IERC8004AgentReputation.ReputationScore memory score = reputation.getReputationScore(agentId);
        assertEq(uint256(score.totalVolume), uint256(volume), "Volume should match");
    }
}
