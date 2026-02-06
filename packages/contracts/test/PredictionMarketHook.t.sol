// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {TestSetup} from "./helpers/TestSetup.sol";
import {IPredictionMarketHook} from "../src/interfaces/IPredictionMarketHook.sol";
import {IOutcomeToken} from "../src/interfaces/IOutcomeToken.sol";
import {OutcomeToken} from "../src/OutcomeToken.sol";
import {PoolId} from "v4-core/src/types/PoolId.sol";

/// @title PredictionMarketHookTest
/// @notice Comprehensive tests for PredictionMarketHook contract
contract PredictionMarketHookTest is TestSetup {
    // -------------------------------------------------
    // Market Initialization Tests
    // -------------------------------------------------

    function test_InitializeMarket_Success() public {
        string memory description = "Will ETH break $4000?";
        uint256 reward = 10 ether;
        uint256 requiredBond = 5 ether;

        // Approve reward
        vm.prank(agentAlpha);
        mockCurrency.approve(address(hook), reward);

        // Expect event
        vm.expectEmit(false, true, false, false);
        emit IPredictionMarketHook.MarketInitialized(
            bytes32(0),
            description,
            agentAlpha
        );

        // Create market
        vm.prank(agentAlpha);
        bytes32 marketId = hook.initializeMarket(
            "yes",
            "no",
            description,
            reward,
            requiredBond
        );

        // Verify market data
        (
            string memory desc,
            string memory outcome1,
            string memory outcome2,
            address outcome1Token,
            address outcome2Token,
            uint256 marketReward,
            uint256 marketBond,
            bool resolved,
            bytes32 assertedOutcomeId,
            PoolId poolId,
            uint256 totalCollateral
        ) = hook.getMarket(marketId);

        assertEq(desc, description, "Description mismatch");
        assertEq(outcome1, "yes", "Outcome1 mismatch");
        assertEq(outcome2, "no", "Outcome2 mismatch");
        assertTrue(
            outcome1Token != address(0),
            "Outcome1 token should be deployed"
        );
        assertTrue(
            outcome2Token != address(0),
            "Outcome2 token should be deployed"
        );
        assertEq(marketReward, reward, "Reward mismatch");
        assertEq(marketBond, requiredBond, "Required bond mismatch");
        assertFalse(resolved, "Market should not be resolved");
        assertEq(assertedOutcomeId, bytes32(0), "No assertion should exist");
        assertEq(totalCollateral, 0, "Collateral should be 0");

        // Verify token ownership
        OutcomeToken token1 = OutcomeToken(outcome1Token);
        assertEq(
            token1.hook(),
            address(hook),
            "Token1 hook should be the hook contract"
        );
    }

    function test_InitializeMarket_NotAgent_Reverts() public {
        vm.prank(humanUser);
        vm.expectRevert(IPredictionMarketHook.NotRegisteredAgent.selector);
        hook.initializeMarket("yes", "no", "Test market", 0, 0);
    }

    function test_InitializeMarket_MultipleMarkets() public {
        bytes32 marketId1 = _createMarket(agentAlpha, "Market 1", 0, 0);
        bytes32 marketId2 = _createMarket(agentBeta, "Market 2", 0, 0);

        assertTrue(marketId1 != marketId2, "Market IDs should be unique");

        bytes32[] memory marketIds = hook.getMarketIds();
        assertEq(marketIds.length, 2, "Should have 2 markets");
        assertEq(marketIds[0], marketId1, "First market ID mismatch");
        assertEq(marketIds[1], marketId2, "Second market ID mismatch");
    }

    // -------------------------------------------------
    // Minting Tests
    // -------------------------------------------------

    function test_MintOutcomeTokens_Success() public {
        bytes32 marketId = _createMarket(agentAlpha, "Test market", 0, 0);
        uint256 mintAmount = 10 ether;

        // Get token addresses
        (
            ,
            ,
            ,
            address outcome1Token,
            address outcome2Token,
            ,
            ,
            ,
            ,
            ,
            uint256 collateralBefore
        ) = hook.getMarket(marketId);

        vm.expectEmit(true, true, false, true);
        emit IPredictionMarketHook.TokensMinted(
            marketId,
            agentBeta,
            mintAmount
        );

        // Mint tokens
        uint256 ethBalanceBefore = agentBeta.balance;
        _mintTokens(agentBeta, marketId, mintAmount);

        // Verify ETH was transferred
        assertEq(
            agentBeta.balance,
            ethBalanceBefore - mintAmount,
            "ETH should be deducted"
        );

        // Verify tokens were minted
        OutcomeToken token1 = OutcomeToken(outcome1Token);
        OutcomeToken token2 = OutcomeToken(outcome2Token);

        assertEq(
            token1.balanceOf(agentBeta),
            mintAmount,
            "Should receive outcome1 tokens"
        );
        assertEq(
            token2.balanceOf(agentBeta),
            mintAmount,
            "Should receive outcome2 tokens"
        );

        // Verify collateral tracking
        (, , , , , , , , , , uint256 collateralAfter) = hook.getMarket(
            marketId
        );
        assertEq(
            collateralAfter,
            collateralBefore + mintAmount,
            "Collateral should increase"
        );
    }

    function test_MintOutcomeTokens_NotAgent_Reverts() public {
        bytes32 marketId = _createMarket(agentAlpha, "Test market", 0, 0);

        vm.prank(humanUser);
        vm.expectRevert(IPredictionMarketHook.NotRegisteredAgent.selector);
        hook.mintOutcomeTokens{value: 1 ether}(marketId);
    }

    function test_MintOutcomeTokens_ZeroValue_Reverts() public {
        bytes32 marketId = _createMarket(agentAlpha, "Test market", 0, 0);

        vm.prank(agentAlpha);
        vm.expectRevert(IPredictionMarketHook.ZeroMintAmount.selector);
        hook.mintOutcomeTokens{value: 0}(marketId);
    }

    function test_MintOutcomeTokens_InvalidMarket_Reverts() public {
        bytes32 fakeMarketId = keccak256("fake");

        vm.prank(agentAlpha);
        vm.expectRevert(IPredictionMarketHook.MarketNotFound.selector);
        hook.mintOutcomeTokens{value: 1 ether}(fakeMarketId);
    }

    function test_MintOutcomeTokens_ResolvedMarket_Reverts() public {
        bytes32 marketId = _createMarket(agentAlpha, "Test market", 0, 0);
        _mintTokens(agentAlpha, marketId, 10 ether);

        // Assert and resolve the market
        bytes32 assertionId = _assertMarket(agentAlpha, marketId, "yes", 0);
        mockOO.resolveAssertion(assertionId, true);

        // Try to mint after resolution
        vm.prank(agentBeta);
        vm.expectRevert(IPredictionMarketHook.MarketAlreadyResolved.selector);
        hook.mintOutcomeTokens{value: 1 ether}(marketId);
    }

    // -------------------------------------------------
    // Assertion Tests
    // -------------------------------------------------

    function test_AssertMarket_Success() public {
        bytes32 marketId = _createMarket(
            agentAlpha,
            "Test market",
            1 ether,
            2 ether
        );
        _mintTokens(agentAlpha, marketId, 10 ether);

        uint256 bond = 2 ether;
        vm.prank(agentAlpha);
        mockCurrency.approve(address(hook), bond);

        vm.expectEmit(true, false, false, false);
        emit IPredictionMarketHook.MarketAsserted(
            marketId,
            "yes",
            agentAlpha,
            bytes32(0)
        );

        vm.prank(agentAlpha);
        hook.assertMarket(marketId, "yes");

        // Verify assertion was stored
        (, , , , , , , , bytes32 assertedOutcomeId, , ) = hook.getMarket(
            marketId
        );
        assertEq(
            assertedOutcomeId,
            keccak256(bytes("yes")),
            "Asserted outcome should be stored"
        );
    }

    function test_AssertMarket_InvalidOutcome_Reverts() public {
        bytes32 marketId = _createMarket(agentAlpha, "Test market", 0, 0);

        vm.prank(agentAlpha);
        mockCurrency.approve(address(hook), 10 ether);

        vm.prank(agentAlpha);
        vm.expectRevert(IPredictionMarketHook.InvalidOutcome.selector);
        hook.assertMarket(marketId, "invalid_outcome");
    }

    function test_AssertMarket_ActiveAssertion_Reverts() public {
        bytes32 marketId = _createMarket(agentAlpha, "Test market", 0, 0);
        _mintTokens(agentAlpha, marketId, 10 ether);

        // First assertion
        _assertMarket(agentAlpha, marketId, "yes", 0);

        // Try second assertion while first is active
        vm.prank(agentBeta);
        mockCurrency.approve(address(hook), 10 ether);

        vm.prank(agentBeta);
        vm.expectRevert(IPredictionMarketHook.ActiveAssertionExists.selector);
        hook.assertMarket(marketId, "no");
    }

    function test_AssertMarket_UnresolvableOutcome() public {
        bytes32 marketId = _createMarket(agentAlpha, "Test market", 0, 0);
        _mintTokens(agentAlpha, marketId, 10 ether);

        vm.prank(agentAlpha);
        mockCurrency.approve(address(hook), 10 ether);

        // Assert as "Unresolvable"
        vm.prank(agentAlpha);
        hook.assertMarket(marketId, "Unresolvable");

        (, , , , , , , , bytes32 assertedOutcomeId, ,) = hook.getMarket(
            marketId
        );
        assertEq(
            assertedOutcomeId,
            keccak256(bytes("Unresolvable")),
            "Should store Unresolvable"
        );
    }

    function test_AssertMarket_NotAgent_Reverts() public {
        bytes32 marketId = _createMarket(agentAlpha, "Test market", 0, 0);

        vm.prank(humanUser);
        vm.expectRevert(IPredictionMarketHook.NotRegisteredAgent.selector);
        hook.assertMarket(marketId, "yes");
    }

    // -------------------------------------------------
    // UMA Callback Tests
    // -------------------------------------------------

    function test_AssertionResolvedCallback_Truthful() public {
        bytes32 marketId = _createMarket(agentAlpha, "Test market", 0, 0);
        _mintTokens(agentAlpha, marketId, 10 ether);

        bytes32 assertionId = _assertMarket(agentAlpha, marketId, "yes", 0);

        // Simulate UMA resolving as truthful
        vm.expectEmit(true, false, false, true);
        emit IPredictionMarketHook.MarketResolved(
            marketId,
            keccak256(bytes("yes"))
        );

        mockOO.resolveAssertion(assertionId, true);

        // Verify market is resolved
        (, , , , , , , bool resolved, , , ) = hook.getMarket(marketId);
        assertTrue(resolved, "Market should be resolved");
    }

    function test_AssertionResolvedCallback_NotTruthful() public {
        bytes32 marketId = _createMarket(agentAlpha, "Test market", 0, 0);
        _mintTokens(agentAlpha, marketId, 10 ether);

        bytes32 assertionId = _assertMarket(agentAlpha, marketId, "yes", 0);

        // Simulate UMA resolving as not truthful (disputed and lost)
        vm.expectEmit(true, false, false, true);
        emit IPredictionMarketHook.AssertionFailed(marketId, assertionId);

        mockOO.resolveAssertion(assertionId, false);

        // Verify market is NOT resolved and assertion is cleared
        (, , , , , , , bool resolved, bytes32 assertedOutcomeId, , ) = hook
            .getMarket(marketId);
        assertFalse(resolved, "Market should not be resolved");
        assertEq(assertedOutcomeId, bytes32(0), "Assertion should be cleared");
    }

    function test_AssertionResolvedCallback_OnlyOracle() public {
        bytes32 marketId = _createMarket(agentAlpha, "Test market", 0, 0);
        bytes32 fakeAssertionId = keccak256("fake");

        // Try to call callback from non-oracle address
        vm.prank(agentAlpha);
        vm.expectRevert(IPredictionMarketHook.OnlyOracle.selector);
        hook.assertionResolvedCallback(fakeAssertionId, true);
    }

    function test_AssertionDisputedCallback() public {
        bytes32 marketId = _createMarket(agentAlpha, "Test market", 0, 0);
        _mintTokens(agentAlpha, marketId, 10 ether);

        bytes32 assertionId = _assertMarket(agentAlpha, marketId, "yes", 0);

        // Simulate dispute
        vm.expectEmit(true, false, false, true);
        emit IPredictionMarketHook.AssertionDisputed(marketId, assertionId);

        mockOO.disputeAssertion(assertionId, agentBeta);

        // Market should still be unresolved
        (, , , , , , , bool resolved, , , ) = hook.getMarket(marketId);
        assertFalse(resolved, "Market should not be resolved yet");
    }

    // -------------------------------------------------
    // Settlement Tests
    // -------------------------------------------------

    function test_SettleOutcomeTokens_Outcome1Wins() public {
        bytes32 marketId = _createMarket(agentAlpha, "Test market", 0, 0);

        // Both agents mint tokens
        _mintTokens(agentAlpha, marketId, 10 ether);
        _mintTokens(agentBeta, marketId, 10 ether);

        // Get token addresses
        (
            ,
            ,
            ,
            address outcome1Token,
            address outcome2Token,
            ,
            ,
            ,
            ,
            ,
            uint256 totalCollateral
        ) = hook.getMarket(marketId);

        // Assert and resolve as outcome1 ("yes")
        bytes32 assertionId = _assertMarket(agentAlpha, marketId, "yes", 0);
        mockOO.resolveAssertion(assertionId, true);

        // Agent Alpha (outcome1 holder) settles
        OutcomeToken token1 = OutcomeToken(outcome1Token);
        uint256 alphaBalance = token1.balanceOf(agentAlpha);
        uint256 totalSupply = token1.totalSupply();
        uint256 expectedPayout = (alphaBalance * totalCollateral) / totalSupply;

        uint256 ethBefore = agentAlpha.balance;

        vm.expectEmit(true, true, false, true);
        emit IPredictionMarketHook.TokensSettled(
            marketId,
            agentAlpha,
            expectedPayout
        );

        vm.prank(agentAlpha);
        hook.settleOutcomeTokens(marketId);

        uint256 ethAfter = agentAlpha.balance;
        assertEq(ethAfter - ethBefore, expectedPayout, "Payout mismatch");
        assertEq(token1.balanceOf(agentAlpha), 0, "Tokens should be burned");
    }

    function test_SettleOutcomeTokens_Outcome2Wins() public {
        bytes32 marketId = _createMarket(agentAlpha, "Test market", 0, 0);

        _mintTokens(agentAlpha, marketId, 10 ether);
        _mintTokens(agentBeta, marketId, 15 ether);

        (
            ,
            ,
            ,
            ,
            address outcome2Token,
            ,
            ,
            ,
            ,
            ,
            uint256 totalCollateral
        ) = hook.getMarket(marketId);

        // Assert and resolve as outcome2 ("no")
        bytes32 assertionId = _assertMarket(agentAlpha, marketId, "no", 0);
        mockOO.resolveAssertion(assertionId, true);

        // Agent Beta (outcome2 holder) settles
        OutcomeToken token2 = OutcomeToken(outcome2Token);
        uint256 betaBalance = token2.balanceOf(agentBeta);
        uint256 totalSupply = token2.totalSupply();
        uint256 expectedPayout = (betaBalance * totalCollateral) / totalSupply;

        uint256 ethBefore = agentBeta.balance;

        vm.prank(agentBeta);
        hook.settleOutcomeTokens(marketId);

        uint256 ethAfter = agentBeta.balance;
        assertEq(ethAfter - ethBefore, expectedPayout, "Payout mismatch");
    }

    function test_SettleOutcomeTokens_Unresolvable() public {
        bytes32 marketId = _createMarket(agentAlpha, "Test market", 0, 0);

        _mintTokens(agentAlpha, marketId, 10 ether);
        _mintTokens(agentBeta, marketId, 10 ether);

        (
            ,
            ,
            ,
            address outcome1Token,
            address outcome2Token,
            ,
            ,
            ,
            ,
            ,
            uint256 totalCollateral
        ) = hook.getMarket(marketId);

        // Assert and resolve as Unresolvable
        bytes32 assertionId = _assertMarket(
            agentAlpha,
            marketId,
            "Unresolvable",
            0
        );
        mockOO.resolveAssertion(assertionId, true);

        OutcomeToken token1 = OutcomeToken(outcome1Token);
        OutcomeToken token2 = OutcomeToken(outcome2Token);

        // Both agents should be able to settle proportionally
        uint256 alphaBalance1 = token1.balanceOf(agentAlpha);
        uint256 alphaBalance2 = token2.balanceOf(agentAlpha);
        uint256 alphaTotalTokens = alphaBalance1 + alphaBalance2;

        uint256 totalSupply = token1.totalSupply() + token2.totalSupply();
        uint256 expectedPayout = (alphaTotalTokens * totalCollateral) /
            totalSupply;

        uint256 ethBefore = agentAlpha.balance;

        vm.prank(agentAlpha);
        hook.settleOutcomeTokens(marketId);

        uint256 ethAfter = agentAlpha.balance;
        assertEq(
            ethAfter - ethBefore,
            expectedPayout,
            "Payout mismatch for Unresolvable"
        );

        // Verify both token types were burned
        assertEq(
            token1.balanceOf(agentAlpha),
            0,
            "Outcome1 tokens should be burned"
        );
        assertEq(
            token2.balanceOf(agentAlpha),
            0,
            "Outcome2 tokens should be burned"
        );
    }

    function test_SettleOutcomeTokens_NotResolved_Reverts() public {
        bytes32 marketId = _createMarket(agentAlpha, "Test market", 0, 0);
        _mintTokens(agentAlpha, marketId, 10 ether);

        vm.prank(agentAlpha);
        vm.expectRevert(IPredictionMarketHook.MarketNotResolved.selector);
        hook.settleOutcomeTokens(marketId);
    }

    function test_SettleOutcomeTokens_NoTokens_Reverts() public {
        bytes32 marketId = _createMarket(agentAlpha, "Test market", 0, 0);
        _mintTokens(agentAlpha, marketId, 10 ether);

        // Resolve market
        bytes32 assertionId = _assertMarket(agentAlpha, marketId, "yes", 0);
        mockOO.resolveAssertion(assertionId, true);

        // Agent Beta has no tokens
        vm.prank(agentBeta);
        vm.expectRevert(IPredictionMarketHook.NoTokensToSettle.selector);
        hook.settleOutcomeTokens(marketId);
    }

    function test_SettleOutcomeTokens_InvalidMarket_Reverts() public {
        bytes32 fakeMarketId = keccak256("fake");

        vm.prank(agentAlpha);
        vm.expectRevert(IPredictionMarketHook.MarketNotFound.selector);
        hook.settleOutcomeTokens(fakeMarketId);
    }

    // -------------------------------------------------
    // View Function Tests
    // -------------------------------------------------

    function test_GetMarket_ReturnsCorrectData() public {
        string memory description = "Test market";
        uint256 reward = 5 ether;
        uint256 requiredBond = 2 ether;

        bytes32 marketId = _createMarket(
            agentAlpha,
            description,
            reward,
            requiredBond
        );

        (
            string memory desc,
            string memory outcome1,
            string memory outcome2,
            address outcome1Token,
            address outcome2Token,
            uint256 marketReward,
            uint256 marketBond,
            bool resolved,
            bytes32 assertedOutcomeId,
            PoolId poolId,
            uint256 totalCollateral
        ) = hook.getMarket(marketId);

        assertEq(desc, description, "Description mismatch");
        assertEq(outcome1, "yes", "Outcome1 mismatch");
        assertEq(outcome2, "no", "Outcome2 mismatch");
        assertTrue(outcome1Token != address(0), "Outcome1 token should exist");
        assertTrue(outcome2Token != address(0), "Outcome2 token should exist");
        assertEq(marketReward, reward, "Reward mismatch");
        assertEq(marketBond, requiredBond, "Bond mismatch");
        assertFalse(resolved, "Should not be resolved");
        assertEq(assertedOutcomeId, bytes32(0), "No assertion");
        assertEq(totalCollateral, 0, "No collateral yet");
    }

    function test_GetMarketIds_ReturnsAll() public {
        bytes32 marketId1 = _createMarket(agentAlpha, "Market 1", 0, 0);
        bytes32 marketId2 = _createMarket(agentBeta, "Market 2", 0, 0);
        bytes32 marketId3 = _createMarket(agentAlpha, "Market 3", 0, 0);

        bytes32[] memory marketIds = hook.getMarketIds();

        assertEq(marketIds.length, 3, "Should have 3 markets");
        assertEq(marketIds[0], marketId1, "First market ID");
        assertEq(marketIds[1], marketId2, "Second market ID");
        assertEq(marketIds[2], marketId3, "Third market ID");
    }

    // -------------------------------------------------
    // Integration Tests
    // -------------------------------------------------

    function test_FullMarketLifecycle() public {
        // 1. Create market
        bytes32 marketId = _createMarket(
            agentAlpha,
            "Will ETH break $4000?",
            0,
            0
        );

        // 2. Both agents mint tokens
        _mintTokens(agentAlpha, marketId, 10 ether);
        _mintTokens(agentBeta, marketId, 5 ether);

        (, , , , , , , , , , uint256 totalCollateral) = hook.getMarket(
            marketId
        );
        assertEq(
            totalCollateral,
            15 ether,
            "Total collateral should be 15 ETH"
        );

        // 3. Alpha asserts "yes"
        bytes32 assertionId = _assertMarket(agentAlpha, marketId, "yes", 0);

        // 4. OOV3 resolves as truthful
        mockOO.resolveAssertion(assertionId, true);

        // 5. Verify market resolved
        (, , , , , , , bool resolved, , , ) = hook.getMarket(marketId);
        assertTrue(resolved, "Market should be resolved");

        // 6. Alpha settles and receives payout
        uint256 ethBefore = agentAlpha.balance;
        vm.prank(agentAlpha);
        hook.settleOutcomeTokens(marketId);
        uint256 ethAfter = agentAlpha.balance;

        assertTrue(ethAfter > ethBefore, "Alpha should receive payout");
    }

    function test_FullMarketLifecycle_WithDispute() public {
        // 1. Create market
        bytes32 marketId = _createMarket(agentAlpha, "Disputed market", 0, 0);

        // 2. Mint tokens
        _mintTokens(agentAlpha, marketId, 10 ether);

        // 3. Alpha asserts "yes"
        bytes32 assertionId = _assertMarket(agentAlpha, marketId, "yes", 0);

        // 4. Beta disputes
        mockOO.disputeAssertion(assertionId, agentBeta);

        // 5. OOV3 resolves dispute in favor of disputer (assertion fails)
        mockOO.resolveAssertion(assertionId, false);

        // 6. Market should not be resolved, assertion cleared
        (, , , , , , , bool resolved, bytes32 assertedOutcomeId, , ) = hook
            .getMarket(marketId);
        assertFalse(resolved, "Market should not be resolved");
        assertEq(assertedOutcomeId, bytes32(0), "Assertion should be cleared");

        // 7. New assertion can be made
        bytes32 newAssertionId = _assertMarket(agentAlpha, marketId, "no", 0);
        assertTrue(
            newAssertionId != bytes32(0),
            "New assertion should succeed"
        );
    }
}
