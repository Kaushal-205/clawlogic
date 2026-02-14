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

    // -------------------------------------------------
    // AMM / CPMM Tests
    // -------------------------------------------------

    function test_InitializeMarket_WithLiquidity() public {
        bytes32 marketId = _createMarketWithLiquidity(
            agentAlpha,
            "Liquidity test",
            0,
            0,
            5 ether
        );

        // Verify reserves
        (uint256 r1, uint256 r2) = hook.getMarketReserves(marketId);
        assertEq(r1, 5 ether, "Reserve1 should equal initial liquidity");
        assertEq(r2, 5 ether, "Reserve2 should equal initial liquidity");

        // Verify probability is 50/50
        (uint256 p1, uint256 p2) = hook.getMarketProbability(marketId);
        assertEq(p1, 5000, "Prob1 should be 50%");
        assertEq(p2, 5000, "Prob2 should be 50%");

        // Verify collateral tracked
        (, , , , , , , , , , uint256 totalCollateral) = hook.getMarket(marketId);
        assertEq(totalCollateral, 5 ether, "Collateral should track liquidity");
    }

    function test_BuyOutcomeToken_Outcome1() public {
        bytes32 marketId = _createMarketWithLiquidity(
            agentAlpha,
            "Buy test",
            0,
            0,
            10 ether
        );

        // Get token addresses
        (, , , address outcome1Token, , , , , , , ) = hook.getMarket(marketId);

        // Buy outcome1 tokens
        vm.prank(agentBeta);
        hook.buyOutcomeToken{value: 1 ether}(marketId, true, 0);

        // Verify agent received outcome1 tokens
        OutcomeToken token1 = OutcomeToken(outcome1Token);
        uint256 balance = token1.balanceOf(agentBeta);
        assertTrue(balance > 0, "Agent should have outcome1 tokens");
    }

    function test_BuyOutcomeToken_ShiftsProbability() public {
        bytes32 marketId = _createMarketWithLiquidity(
            agentAlpha,
            "Probability shift test",
            0,
            0,
            10 ether
        );

        // Buy outcome1 tokens (YES)
        vm.prank(agentBeta);
        hook.buyOutcomeToken{value: 2 ether}(marketId, true, 0);

        // Probability should shift: outcome1 > 50%, outcome2 < 50%
        (uint256 p1, uint256 p2) = hook.getMarketProbability(marketId);
        assertTrue(p1 > 5000, "Outcome1 probability should be above 50%");
        assertTrue(p2 < 5000, "Outcome2 probability should be below 50%");
        assertEq(p1 + p2, 10000, "Probabilities should sum to 100%");
    }

    function test_BuyOutcomeToken_NotAgent_Reverts() public {
        bytes32 marketId = _createMarketWithLiquidity(
            agentAlpha,
            "Agent gate test",
            0,
            0,
            10 ether
        );

        vm.prank(humanUser);
        vm.expectRevert(IPredictionMarketHook.NotRegisteredAgent.selector);
        hook.buyOutcomeToken{value: 1 ether}(marketId, true, 0);
    }

    function test_GetMarketProbability_NoLiquidity() public {
        bytes32 marketId = _createMarket(agentAlpha, "No liquidity", 0, 0);

        (uint256 p1, uint256 p2) = hook.getMarketProbability(marketId);
        assertEq(p1, 5000, "Should default to 50%");
        assertEq(p2, 5000, "Should default to 50%");
    }

    function test_BuyOutcomeToken_InsufficientOutput_Reverts() public {
        bytes32 marketId = _createMarketWithLiquidity(
            agentAlpha,
            "Slippage test",
            0,
            0,
            10 ether
        );

        // Set minTokensOut unreasonably high
        vm.prank(agentBeta);
        vm.expectRevert(IPredictionMarketHook.InsufficientOutput.selector);
        hook.buyOutcomeToken{value: 1 ether}(marketId, true, 100 ether);
    }

    function test_Pause_OnlyOwner_RevertsForNonOwner() public {
        vm.prank(agentAlpha);
        vm.expectRevert(IPredictionMarketHook.OnlyOwner.selector);
        hook.pause();
    }

    function test_Pause_BlocksInitializeMarket() public {
        vm.prank(deployer);
        hook.pause();

        vm.prank(agentAlpha);
        vm.expectRevert(IPredictionMarketHook.ContractPaused.selector);
        hook.initializeMarket("yes", "no", "Paused market create", 0, 0);
    }

    function test_Unpause_RestoresInitializeMarket() public {
        vm.prank(deployer);
        hook.pause();

        vm.prank(deployer);
        hook.unpause();

        bytes32 marketId = _createMarket(agentAlpha, "Post-unpause market", 0, 0);
        assertTrue(marketId != bytes32(0), "Market should be creatable after unpause");
    }

    function test_E2E_OnboardingAndFirstTrade() public {
        // 1) Unregistered wallet is blocked from market creation.
        vm.prank(humanUser);
        vm.expectRevert(IPredictionMarketHook.NotRegisteredAgent.selector);
        hook.initializeMarket("yes", "no", "Human should fail before onboarding", 0, 0);

        // 2) Onboard: register wallet as agent (non-ENS path).
        vm.prank(humanUser);
        registry.registerAgent("Gamma", "");
        assertTrue(registry.isAgent(humanUser), "Human wallet should be registered after onboarding");

        // 3) Registered agent creates a market with initial CPMM liquidity.
        vm.prank(humanUser);
        bytes32 marketId = hook.initializeMarket{value: 5 ether}(
            "yes",
            "no",
            "Will onboarding e2e pass?",
            0,
            0
        );
        assertTrue(marketId != bytes32(0), "Market should be created by onboarded agent");

        // 4) Another registered agent executes the first directional trade.
        vm.prank(agentBeta);
        hook.buyOutcomeToken{value: 1 ether}(marketId, true, 0);

        // 5) Verify trade effect and inventory.
        (
            ,
            ,
            ,
            address outcome1Token,
            ,
            ,
            ,
            bool resolved,
            ,
            ,
            uint256 totalCollateral
        ) = hook.getMarket(marketId);
        assertFalse(resolved, "Market should remain unresolved after first trade");
        uint256 protocolFee = (1 ether * uint256(hook.s_protocolFeeBps())) / 10_000;
        uint256 creatorFee = (1 ether * uint256(hook.s_creatorFeeBps())) / 10_000;
        uint256 netTradeValue = 1 ether - protocolFee - creatorFee;
        assertEq(totalCollateral, 5 ether + netTradeValue, "Collateral should increase by net trade size");

        OutcomeToken token1 = OutcomeToken(outcome1Token);
        assertTrue(token1.balanceOf(agentBeta) > 0, "First trader should receive directional tokens");
    }

    function test_BuyOutcomeToken_AccruesAndClaimsCreatorAndProtocolFees() public {
        bytes32 marketId = _createMarketWithLiquidity(
            agentAlpha,
            "Fee sharing market",
            0,
            0,
            10 ether
        );

        // Route protocol fees to an EOA so native ETH payout is receivable in this test.
        vm.prank(deployer);
        hook.setProtocolFeeRecipient(agentBeta);

        uint256 tradeSize = 2 ether;
        uint256 protocolFeeBps = hook.s_protocolFeeBps();
        uint256 creatorFeeBps = hook.s_creatorFeeBps();
        uint256 expectedProtocolFee = (tradeSize * protocolFeeBps) / 10_000;
        uint256 expectedCreatorFee = (tradeSize * creatorFeeBps) / 10_000;

        vm.prank(agentBeta);
        hook.buyOutcomeToken{value: tradeSize}(marketId, true, 0);

        address creator;
        uint256 creatorFeesAccrued;
        uint256 protocolFeesAccrued;
        uint16 observedProtocolFeeBps;
        uint16 observedCreatorFeeBps;
        (
            creator,
            creatorFeesAccrued,
            protocolFeesAccrued,
            observedProtocolFeeBps,
            observedCreatorFeeBps
        ) = hook.getMarketFeeInfo(marketId);

        assertEq(creator, agentAlpha, "Creator should match market creator");
        assertEq(creatorFeesAccrued, expectedCreatorFee, "Creator fee accrual mismatch");
        assertEq(protocolFeesAccrued, expectedProtocolFee, "Protocol fee accrual mismatch");
        assertEq(observedProtocolFeeBps, protocolFeeBps, "Observed protocol bps mismatch");
        assertEq(observedCreatorFeeBps, creatorFeeBps, "Observed creator bps mismatch");

        (uint256 creatorClaimable, uint256 protocolClaimableDeployer) = hook.getClaimableFees(deployer);
        assertEq(creatorClaimable, 0, "Deployer should have no creator claim");
        assertEq(protocolClaimableDeployer, 0, "Deployer protocol claim should be zero after recipient reroute");

        (, uint256 protocolClaimableAgentBeta) = hook.getClaimableFees(agentBeta);
        assertEq(protocolClaimableAgentBeta, expectedProtocolFee, "Agent Beta protocol claim mismatch");

        (creatorClaimable, ) = hook.getClaimableFees(agentAlpha);
        assertEq(creatorClaimable, expectedCreatorFee, "Creator claimable fee mismatch");

        uint256 creatorEthBefore = agentAlpha.balance;
        vm.prank(agentAlpha);
        hook.claimCreatorFees(marketId);
        assertEq(agentAlpha.balance - creatorEthBefore, expectedCreatorFee, "Creator fee payout mismatch");

        (creatorClaimable, ) = hook.getClaimableFees(agentAlpha);
        assertEq(creatorClaimable, 0, "Creator claimable should be zero after claim");

        (, creatorFeesAccrued, , , ) = hook.getMarketFeeInfo(marketId);
        assertEq(creatorFeesAccrued, 0, "Market creator fees should reset after claim");

        uint256 protocolEthBefore = agentBeta.balance;
        vm.prank(agentBeta);
        hook.claimProtocolFees();
        assertEq(agentBeta.balance - protocolEthBefore, expectedProtocolFee, "Protocol fee payout mismatch");

        (, uint256 protocolClaimableAfter) = hook.getClaimableFees(agentBeta);
        assertEq(protocolClaimableAfter, 0, "Protocol claimable should be zero after claim");
    }

    function test_ClaimCreatorFees_NotCreator_Reverts() public {
        bytes32 marketId = _createMarketWithLiquidity(
            agentAlpha,
            "Fee claim auth",
            0,
            0,
            5 ether
        );

        vm.prank(agentBeta);
        hook.buyOutcomeToken{value: 1 ether}(marketId, true, 0);

        vm.prank(agentBeta);
        vm.expectRevert(IPredictionMarketHook.NotMarketCreator.selector);
        hook.claimCreatorFees(marketId);
    }

    // -------------------------------------------------
    // Integration Tests (continued)
    // -------------------------------------------------

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
