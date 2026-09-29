// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {TestSetup} from "./helpers/TestSetup.sol";
import {PredictionMarketHook} from "../src/PredictionMarketHook.sol";
import {OutcomeToken} from "../src/OutcomeToken.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @dev Stand-in for the canonical ERC-8004 IdentityRegistry (only balanceOf is used).
contract MockERC8004Identity {
    mapping(address => uint256) public balanceOf;

    function mint(address to) external {
        balanceOf[to] += 1;
    }
}

/// @title PredictionMarketRevenueTest
/// @notice Fees, LP accounting, selling, duplicate detection, close time, pause and
///         ERC-8004 eligibility of the mainnet PredictionMarketHook.
contract PredictionMarketRevenueTest is TestSetup {
    address internal treasury = makeAddr("treasury");
    address internal erc8004Agent = makeAddr("erc8004Agent");

    receive() external payable {}

    function setUp() public override {
        super.setUp();
        hook.setTreasury(treasury);
        deal(erc8004Agent, INITIAL_ETH_BALANCE);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────────────────

    function _tokens(bytes32 marketId) internal view returns (OutcomeToken t1, OutcomeToken t2) {
        (,,, address a1, address a2,,,,,,) = hook.getMarket(marketId);
        return (OutcomeToken(a1), OutcomeToken(a2));
    }

    function _collateral(bytes32 marketId) internal view returns (uint256 c) {
        (,,,,,,,,,, c) = hook.getMarket(marketId);
    }

    /// @dev Every token pair is backed 1:1 by ETH until resolution.
    function _assertFullyBacked(bytes32 marketId) internal view {
        (OutcomeToken t1, OutcomeToken t2) = _tokens(marketId);
        uint256 c = _collateral(marketId);
        assertEq(t1.totalSupply(), c, "outcome1 supply != collateral");
        assertEq(t2.totalSupply(), c, "outcome2 supply != collateral");
        assertGe(address(hook).balance, c + hook.s_protocolFeesAccrued(), "hook is insolvent");
    }

    function _resolve(bytes32 marketId, string memory outcome) internal {
        bytes32 assertionId = _assertMarket(agentAlpha, marketId, outcome, 0);
        mockOO.resolveAssertion(assertionId, true);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Fees
    // ─────────────────────────────────────────────────────────────────────────

    function test_Buy_ChargesProtocolAndLpFees() public {
        bytes32 marketId = _createMarketWithLiquidity(agentAlpha, "Fee test", 0, 0, 10 ether);

        (uint256 quoted, uint256 pFee, uint256 lFee) = hook.quoteBuy(marketId, true, 1 ether);
        assertEq(pFee, 0.01 ether, "1% protocol fee");
        assertEq(lFee, 0.01 ether, "1% LP fee");

        vm.prank(agentBeta);
        hook.buyOutcomeToken{value: 1 ether}(marketId, true, quoted);

        (OutcomeToken t1,) = _tokens(marketId);
        assertEq(t1.balanceOf(agentBeta), quoted, "quote must match execution");
        assertEq(hook.s_protocolFeesAccrued(), 0.01 ether, "protocol fee accrued");
        assertEq(_collateral(marketId), 10 ether + 0.99 ether, "collateral excludes protocol fee");
        _assertFullyBacked(marketId);

        hook.withdrawProtocolFees();
        assertEq(treasury.balance, 0.01 ether, "treasury paid");
        assertEq(hook.s_protocolFeesAccrued(), 0);
    }

    function test_CreationFee_AccruesAndRestSeedsLiquidity() public {
        hook.setMarketCreationFee(0.01 ether);

        vm.prank(agentAlpha);
        vm.expectRevert(PredictionMarketHook.InsufficientCreationFee.selector);
        hook.createMarket{value: 0.005 ether}("yes", "no", "Fee market", 0, 0, 0, _resolutionTime());

        vm.prank(agentAlpha);
        bytes32 marketId = hook.createMarket{value: 1.01 ether}("yes", "no", "Fee market", 0, 0, 0, _resolutionTime());
        assertEq(hook.s_protocolFeesAccrued(), 0.01 ether);
        (uint256 r1, uint256 r2) = hook.getMarketReserves(marketId);
        assertEq(r1, 1 ether);
        assertEq(r2, 1 ether);
        assertEq(hook.s_lpShares(marketId, agentAlpha), 1 ether, "creator owns the LP shares");
    }

    function test_Admin_FeeCapsAndOwnership() public {
        vm.expectRevert(PredictionMarketHook.FeeTooHigh.selector);
        hook.setFees(600, 401);
        hook.setFees(600, 400);
        assertEq(hook.s_protocolFeeBps(), 600);

        vm.expectRevert(PredictionMarketHook.FeeTooHigh.selector);
        hook.setMarketCreationFee(0.1 ether + 1);

        vm.prank(agentAlpha);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, agentAlpha));
        hook.setFees(0, 0);

        vm.expectRevert(PredictionMarketHook.ZeroAddress.selector);
        hook.setTreasury(address(0));

        vm.expectRevert(PredictionMarketHook.ZeroAddress.selector);
        hook.setErc8004IdentityRegistry(makeAddr("eoa"));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Selling and merging
    // ─────────────────────────────────────────────────────────────────────────

    function test_Sell_RoundTripCostsAboutTheFees() public {
        bytes32 marketId = _createMarketWithLiquidity(agentAlpha, "Sell test", 0, 0, 10 ether);
        (OutcomeToken t1,) = _tokens(marketId);

        uint256 before = agentBeta.balance;
        vm.startPrank(agentBeta);
        hook.buyOutcomeToken{value: 1 ether}(marketId, true, 0);
        uint256 bought = t1.balanceOf(agentBeta);
        (uint256 quoted,,) = hook.quoteSell(marketId, true, bought);
        hook.sellOutcomeToken(marketId, true, bought, quoted);
        vm.stopPrank();

        assertEq(t1.balanceOf(agentBeta), 0, "all tokens sold");
        uint256 lost = before - agentBeta.balance;
        // ~2% in and ~2% out (the LP fee partly accrues back to the pool).
        assertGt(lost, 0.03 ether, "round trip pays fees");
        assertLt(lost, 0.05 ether, "round trip costs only fees");
        _assertFullyBacked(marketId);
    }

    function test_Sell_SlippageReverts() public {
        bytes32 marketId = _createMarketWithLiquidity(agentAlpha, "Sell slippage", 0, 0, 10 ether);
        (OutcomeToken t1,) = _tokens(marketId);
        vm.startPrank(agentBeta);
        hook.buyOutcomeToken{value: 1 ether}(marketId, true, 0);
        uint256 bought = t1.balanceOf(agentBeta);
        vm.expectRevert(PredictionMarketHook.InsufficientOutput.selector);
        hook.sellOutcomeToken(marketId, true, bought, 10 ether);
        vm.stopPrank();
    }

    function test_Merge_ReturnsEthForCompleteSets() public {
        bytes32 marketId = _createMarket(agentAlpha, "Merge test", 0, 0);
        _mintTokens(agentBeta, marketId, 2 ether);

        uint256 before = agentBeta.balance;
        vm.prank(agentBeta);
        hook.mergeOutcomeTokens(marketId, 1.5 ether);
        assertEq(agentBeta.balance - before, 1.5 ether, "merge is fee-free");
        _assertFullyBacked(marketId);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Liquidity -- nothing is ever stranded
    // ─────────────────────────────────────────────────────────────────────────

    function test_FullLifecycle_NoEthStranded() public {
        bytes32 marketId = _createMarketWithLiquidity(agentAlpha, "Stranded funds", 0, 0, 10 ether);

        vm.prank(agentBeta);
        hook.addLiquidity{value: 4 ether}(marketId);
        vm.prank(agentBeta);
        hook.buyOutcomeToken{value: 3 ether}(marketId, true, 0);
        vm.prank(agentAlpha);
        hook.buyOutcomeToken{value: 2 ether}(marketId, false, 0);
        _mintTokens(agentAlpha, marketId, 1 ether);
        _assertFullyBacked(marketId);

        _resolve(marketId, "yes");

        // LPs pull their reserves out, then everyone settles.
        uint256 alphaShares = hook.s_lpShares(marketId, agentAlpha);
        uint256 betaShares = hook.s_lpShares(marketId, agentBeta);
        vm.prank(agentAlpha);
        hook.removeLiquidity(marketId, alphaShares);
        vm.prank(agentBeta);
        hook.removeLiquidity(marketId, betaShares);

        (uint256 r1, uint256 r2) = hook.getMarketReserves(marketId);
        assertEq(r1, 0);
        assertEq(r2, 0);

        (OutcomeToken t1,) = _tokens(marketId);
        if (t1.balanceOf(agentAlpha) > 0) {
            vm.prank(agentAlpha);
            hook.settleOutcomeTokens(marketId);
        }
        if (t1.balanceOf(agentBeta) > 0) {
            vm.prank(agentBeta);
            hook.settleOutcomeTokens(marketId);
        }

        hook.withdrawProtocolFees();
        assertEq(_collateral(marketId), 0, "all collateral paid out");
        assertEq(address(hook).balance, 0, "no ETH left in the hook");
    }

    function test_AddLiquidity_UnbalancedPoolReturnsSurplus() public {
        bytes32 marketId = _createMarketWithLiquidity(agentAlpha, "Unbalanced LP", 0, 0, 10 ether);
        vm.prank(agentAlpha);
        hook.buyOutcomeToken{value: 5 ether}(marketId, true, 0);
        (uint256 p1Before,) = hook.getMarketProbability(marketId);

        vm.prank(agentBeta);
        hook.addLiquidity{value: 2 ether}(marketId);

        (uint256 p1After,) = hook.getMarketProbability(marketId);
        assertApproxEqAbs(p1After, p1Before, 1, "adding liquidity must not move the price");
        (OutcomeToken t1, OutcomeToken t2) = _tokens(marketId);
        assertGt(t1.balanceOf(agentBeta) + t2.balanceOf(agentBeta), 0, "surplus returned");
        _assertFullyBacked(marketId);
    }

    function test_RemoveLiquidity_MoreThanOwnedReverts() public {
        bytes32 marketId = _createMarketWithLiquidity(agentAlpha, "LP owner", 0, 0, 1 ether);
        vm.prank(agentBeta);
        vm.expectRevert(PredictionMarketHook.InsufficientShares.selector);
        hook.removeLiquidity(marketId, 1);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Duplicate markets
    // ─────────────────────────────────────────────────────────────────────────

    function test_Duplicate_NormalizedQuestionReverts() public {
        bytes32 first = _createMarket(agentAlpha, "Will ETH close above $4,000 on 2026-12-31?", 0, 0);

        // Case, whitespace and sentence punctuation are ignored.
        vm.prank(agentBeta);
        vm.expectRevert(abi.encodeWithSelector(PredictionMarketHook.DuplicateMarket.selector, first));
        hook.createMarket("YES", "No", "  will ETH close above $4,000 on 2026-12-31 ", 0, 0, 0, _resolutionTime());

        assertEq(hook.getMarketIdByQuestion("WILL ETH CLOSE ABOVE $4,000 ON 2026-12-31!", "yes", "no"), first);
    }

    function test_Duplicate_SwappedNonBinaryOutcomes() public {
        vm.prank(agentAlpha);
        bytes32 first = hook.createMarket("Harris", "Trump", "Who wins?", 0, 0, 0, _resolutionTime());

        vm.prank(agentBeta);
        vm.expectRevert(abi.encodeWithSelector(PredictionMarketHook.DuplicateMarket.selector, first));
        hook.createMarket("trump", "harris", "who wins", 0, 0, 0, _resolutionTime());
    }

    /// @dev M-03: symbols and decimal points that change meaning produce distinct keys.
    function test_MarketKey_KeepsMeaningfulSymbols() public view {
        bytes32 above = hook.computeMarketKey("BTC > $100", "yes", "no");
        assertTrue(above != hook.computeMarketKey("BTC < $100", "yes", "no"), "> vs <");
        assertTrue(
            hook.computeMarketKey("Price > $1.50", "yes", "no") != hook.computeMarketKey("Price > $150", "yes", "no"),
            "1.50 vs 150"
        );
        assertTrue(
            hook.computeMarketKey("Up 5%?", "yes", "no") != hook.computeMarketKey("Up -5%?", "yes", "no"), "sign kept"
        );
        assertEq(above, hook.computeMarketKey("btc>$100.", "YES", "NO"), "spacing and case ignored");
    }

    /// @dev M-08: a No/Yes market cannot pose as the Yes/No market of the same question.
    function test_ReversedYesNo_Rejected() public {
        vm.prank(agentAlpha);
        vm.expectRevert(PredictionMarketHook.InvalidMarketParams.selector);
        hook.createMarket("No", "Yes", "Reversed", 0, 0, 0, _resolutionTime());
    }

    /// @dev M-08: token metadata follows the outcome each token pays out on.
    function test_TokenMetadata_FollowsOutcomeLabel() public {
        vm.prank(agentAlpha);
        bytes32 marketId = hook.createMarket("Harris", "Trump", "Who wins?", 0, 0, 0, _resolutionTime());
        (,,, address t1, address t2,,,,,,) = hook.getMarket(marketId);
        assertEq(OutcomeToken(t1).symbol(), "clHARRIS");
        assertEq(OutcomeToken(t1).name(), "CLAW Harris - Who wins?");
        assertEq(OutcomeToken(t2).symbol(), "clTRUMP");

        bytes32 yesNo = _createMarket(agentAlpha, "Binary", 0, 0);
        (,,, t1, t2,,,,,,) = hook.getMarket(yesNo);
        assertEq(OutcomeToken(t1).symbol(), "clYES");
        assertEq(OutcomeToken(t2).symbol(), "clNO");

        // Long labels are truncated; labels without ASCII letters/digits fall back.
        vm.prank(agentAlpha);
        marketId = hook.createMarket("Extraordinarily", unicode"😀", "Labels", 0, 0, 0, _resolutionTime());
        (,,, t1, t2,,,,,,) = hook.getMarket(marketId);
        assertEq(OutcomeToken(t1).symbol(), "clEXTRAORD");
        assertEq(OutcomeToken(t2).symbol(), "clOUT2");
    }

    /// @dev H-04: "Unresolvable" is reserved and cannot be a named outcome.
    function test_ReservedUnresolvableLabel_Rejected() public {
        vm.startPrank(agentAlpha);
        vm.expectRevert(PredictionMarketHook.InvalidMarketParams.selector);
        hook.createMarket("yes", "Unresolvable", "Reserved", 0, 0, 0, _resolutionTime());
        vm.expectRevert(PredictionMarketHook.InvalidMarketParams.selector);
        hook.createMarket("unresolvable!", "no", "Reserved", 0, 0, 0, _resolutionTime());
        vm.stopPrank();
    }

    /// @dev H-04: an "Unresolvable" result always pays both sides half.
    function test_Unresolvable_PaysBothSidesEqually() public {
        bytes32 marketId = _createMarket(agentAlpha, "Neutral", 0, 0);
        _mintTokens(agentAlpha, marketId, 10 ether);
        (,,, address t1, address t2,,,,,,) = hook.getMarket(marketId);

        // agentAlpha keeps outcome1, agentBeta gets the outcome2 side.
        vm.prank(agentAlpha);
        OutcomeToken(t2).transfer(agentBeta, 10 ether);

        _resolve(marketId, "Unresolvable");

        uint256 alphaBefore = agentAlpha.balance;
        vm.prank(agentAlpha);
        hook.settleOutcomeTokens(marketId);
        uint256 betaBefore = agentBeta.balance;
        vm.prank(agentBeta);
        hook.settleOutcomeTokens(marketId);

        assertEq(agentAlpha.balance - alphaBefore, 5 ether, "half to outcome1 holder");
        assertEq(agentBeta.balance - betaBefore, 5 ether, "half to outcome2 holder");
    }

    /// @dev Same vector as packages/sdk/test/market-dedupe.test.ts -- keeps the SDK's
    ///      off-chain key identical to the contract's.
    function test_MarketKey_MatchesSdkVector() public view {
        assertEq(
            hook.computeMarketKey("Will ETH close above $4,000 on 2026-12-31?", "yes", "no"),
            0xc839be639246d2c604354c054587be09c0629f7979473d2db256b1216c5f8b6a
        );
        assertEq(
            hook.computeMarketKey(unicode"Café index up -5.5% by 12:00, (1,000 pts)?\t", "Up", "Down."),
            0xb0b4047fb7b05596ce69928c805c5c34ac765be94a52c1ba072bf73ee8c45cab
        );
    }

    function test_Duplicate_AllowedAfterResolution() public {
        bytes32 first = _createMarket(agentAlpha, "Recurring question", 0, 0);
        _resolve(first, "yes");
        bytes32 second = _createMarket(agentBeta, "Recurring question", 0, 0);
        assertTrue(second != first);
    }

    function test_InvalidMarketParams() public {
        vm.startPrank(agentAlpha);
        vm.expectRevert(PredictionMarketHook.InvalidMarketParams.selector);
        hook.createMarket("yes", "YES!", "Same outcomes", 0, 0, 0, _resolutionTime());
        vm.expectRevert(PredictionMarketHook.InvalidMarketParams.selector);
        hook.createMarket("yes", "no", "???", 0, 0, 0, _resolutionTime());
        vm.stopPrank();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Timing, assertion halt, pause
    // ─────────────────────────────────────────────────────────────────────────

    function test_CloseTime_StopsTrading() public {
        vm.prank(agentAlpha);
        vm.expectRevert(PredictionMarketHook.InvalidCloseTime.selector);
        hook.createMarket("yes", "no", "Past close", 0, 0, uint64(block.timestamp), _resolutionTime());

        uint64 closeTime = uint64(block.timestamp + 1 days);
        vm.prank(agentAlpha);
        bytes32 marketId = hook.createMarket{value: 5 ether}("yes", "no", "Closes tomorrow", 0, 0, closeTime, _resolutionTime());

        vm.prank(agentBeta);
        hook.buyOutcomeToken{value: 1 ether}(marketId, true, 0);

        vm.warp(closeTime);
        vm.prank(agentBeta);
        vm.expectRevert(PredictionMarketHook.TradingClosed.selector);
        hook.buyOutcomeToken{value: 1 ether}(marketId, true, 0);

        (,,,,, bool tradingOpen,) = hook.getMarketInfo(marketId);
        assertFalse(tradingOpen);
    }

    /// @dev Trading stops at the resolution time at the latest; a failed assertion does not
    ///      reopen it, and the market can be asserted again.
    function test_Assertion_OnlyAfterTradingCloses() public {
        bytes32 marketId = _createMarketWithLiquidity(agentAlpha, "Halt test", 0, 0, 5 ether);
        bytes32 assertionId = _assertMarket(agentAlpha, marketId, "yes", 0);

        (,, bytes32 active,,, bool tradingOpen,) = hook.getMarketInfo(marketId);
        assertEq(active, assertionId, "active assertion exposed for disputers");
        assertFalse(tradingOpen);

        vm.prank(agentBeta);
        vm.expectRevert(PredictionMarketHook.AssertionPending.selector);
        hook.buyOutcomeToken{value: 1 ether}(marketId, true, 0);

        mockOO.resolveAssertion(assertionId, false);
        vm.prank(agentBeta);
        vm.expectRevert(PredictionMarketHook.TradingClosed.selector);
        hook.buyOutcomeToken{value: 1 ether}(marketId, true, 0);

        _assertMarket(agentBeta, marketId, "no", 0);
    }

    function test_Pause_BlocksTradingButNotExits() public {
        bytes32 marketId = _createMarketWithLiquidity(agentAlpha, "Pause test", 0, 0, 5 ether);
        _mintTokens(agentBeta, marketId, 1 ether);
        hook.setPaused(true);

        vm.prank(agentBeta);
        vm.expectRevert(PredictionMarketHook.ProtocolPaused.selector);
        hook.buyOutcomeToken{value: 1 ether}(marketId, true, 0);

        vm.prank(agentBeta);
        vm.expectRevert(PredictionMarketHook.ProtocolPaused.selector);
        hook.createMarket("yes", "no", "Paused market", 0, 0, 0, _resolutionTime());

        vm.prank(agentBeta);
        hook.mergeOutcomeTokens(marketId, 1 ether);
        uint256 shares = hook.s_lpShares(marketId, agentAlpha);
        vm.prank(agentAlpha);
        hook.removeLiquidity(marketId, shares);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ERC-8004 eligibility
    // ─────────────────────────────────────────────────────────────────────────

    function test_ERC8004Holder_CanTradeWithoutRegistering() public {
        MockERC8004Identity identity = new MockERC8004Identity();

        vm.prank(erc8004Agent);
        vm.expectRevert(PredictionMarketHook.NotRegisteredAgent.selector);
        hook.createMarket("yes", "no", "8004 market", 0, 0, 0, _resolutionTime());

        hook.setErc8004IdentityRegistry(address(identity));
        identity.mint(erc8004Agent);
        assertTrue(hook.isEligibleAgent(erc8004Agent));
        assertFalse(registry.isAgent(erc8004Agent));

        vm.prank(erc8004Agent);
        bytes32 marketId = hook.createMarket{value: 1 ether}("yes", "no", "8004 market", 0, 0, 0, _resolutionTime());
        vm.prank(erc8004Agent);
        hook.buyOutcomeToken{value: 0.1 ether}(marketId, false, 0);
        assertFalse(hook.isEligibleAgent(humanUser));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Fuzz: arbitrary buys and sells never break backing
    // ─────────────────────────────────────────────────────────────────────────

    function testFuzz_TradesKeepMarketFullyBacked(uint96 seed, uint96 buyA, uint96 buyB, uint8 sellPct) public {
        uint256 liquidity = bound(seed, 0.01 ether, 50 ether);
        bytes32 marketId = _createMarketWithLiquidity(agentAlpha, "Fuzz market", 0, 0, liquidity);
        (OutcomeToken t1, OutcomeToken t2) = _tokens(marketId);

        vm.startPrank(agentBeta);
        hook.buyOutcomeToken{value: bound(buyA, 1, 20 ether)}(marketId, true, 0);
        hook.buyOutcomeToken{value: bound(buyB, 1, 20 ether)}(marketId, false, 0);

        uint256 sell1 = (t1.balanceOf(agentBeta) * bound(sellPct, 1, 100)) / 100;
        (uint256 q1,,) = hook.quoteSell(marketId, true, sell1);
        if (q1 > 0) hook.sellOutcomeToken(marketId, true, sell1, 0);
        uint256 sell2 = t2.balanceOf(agentBeta);
        (uint256 q2,,) = hook.quoteSell(marketId, false, sell2);
        if (q2 > 0) hook.sellOutcomeToken(marketId, false, sell2, 0);
        vm.stopPrank();

        _assertFullyBacked(marketId);
        (uint256 r1, uint256 r2) = hook.getMarketReserves(marketId);
        assertGt(r1, 0);
        assertGt(r2, 0);
    }
}
