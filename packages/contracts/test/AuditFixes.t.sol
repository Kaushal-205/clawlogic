// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {TestSetup} from "./helpers/TestSetup.sol";
import {PredictionMarketHook} from "../src/PredictionMarketHook.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title AuditFixesTest
/// @notice Regression tests for the 2026-09-28 security review: market timing (H-01),
///         asserter rewards (M-01), bond cap and question-key release (M-02).
contract AuditFixesTest is TestSetup {
    // ─────────────────────────────────────────────────────────────────────────
    // H-01: no assertion before the resolution time
    // ─────────────────────────────────────────────────────────────────────────

    function test_H01_AssertBeforeResolutionTime_Reverts() public {
        bytes32 marketId = _createMarketWithLiquidity(agentAlpha, "Event tomorrow", 0, 0, 5 ether);
        (,,,,,, uint64 resolutionTime) = hook.getMarketInfo(marketId);

        vm.prank(agentBeta);
        vm.expectRevert(PredictionMarketHook.ResolutionTimeNotReached.selector);
        hook.assertMarket(marketId, "no");

        vm.warp(resolutionTime - 1);
        vm.prank(agentBeta);
        vm.expectRevert(PredictionMarketHook.ResolutionTimeNotReached.selector);
        hook.assertMarket(marketId, "Unresolvable");

        // Trading keeps working until then.
        vm.prank(agentBeta);
        hook.buyOutcomeToken{value: 0.1 ether}(marketId, true, 0);

        vm.warp(resolutionTime);
        vm.prank(agentBeta);
        hook.assertMarket(marketId, "no");
    }

    function test_H01_ResolutionTimeValidation() public {
        uint64 nowTs = uint64(block.timestamp);
        uint64 maxDuration = uint64(hook.MAX_MARKET_DURATION());
        vm.startPrank(agentAlpha);

        vm.expectRevert(PredictionMarketHook.InvalidResolutionTime.selector);
        hook.createMarket("yes", "no", "Past", 0, 0, 0, nowTs);

        vm.expectRevert(PredictionMarketHook.InvalidResolutionTime.selector);
        hook.createMarket("yes", "no", "Too far", 0, 0, 0, nowTs + maxDuration + 1);

        // The close time cannot be after the resolution time.
        vm.expectRevert(PredictionMarketHook.InvalidCloseTime.selector);
        hook.createMarket("yes", "no", "Late close", 0, 0, nowTs + 2 days, nowTs + 1 days);

        bytes32 marketId = hook.createMarket("yes", "no", "Defaults", 0, 0, 0, nowTs + 1 days);
        vm.stopPrank();

        (, uint64 closeTime,,,,, uint64 resolutionTime) = hook.getMarketInfo(marketId);
        assertEq(resolutionTime, nowTs + 1 days);
        assertEq(closeTime, resolutionTime, "close time defaults to the resolution time");
    }

    function test_H01_EarlyCloseThenResolve() public {
        uint64 closeTime = uint64(block.timestamp + 1 hours);
        uint64 resolutionTime = uint64(block.timestamp + 1 days);
        vm.prank(agentAlpha);
        bytes32 marketId =
            hook.createMarket{value: 5 ether}("yes", "no", "Two stage", 0, 0, closeTime, resolutionTime);

        vm.warp(closeTime);
        vm.prank(agentBeta);
        vm.expectRevert(PredictionMarketHook.TradingClosed.selector);
        hook.buyOutcomeToken{value: 1 ether}(marketId, true, 0);

        vm.prank(agentBeta);
        vm.expectRevert(PredictionMarketHook.ResolutionTimeNotReached.selector);
        hook.assertMarket(marketId, "yes");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // M-01: the reward is paid to the asserter, never trapped
    // ─────────────────────────────────────────────────────────────────────────

    function test_M01_RewardPaidToAsserterAfterResolution() public {
        uint256 reward = 100 ether;
        uint256 bond = 10 ether;
        bytes32 marketId = _createMarket(agentAlpha, "Reward market", reward, bond);
        assertEq(mockCurrency.balanceOf(address(hook)), reward, "reward escrowed");

        uint256 betaBefore = mockCurrency.balanceOf(agentBeta);
        bytes32 assertionId = _assertMarket(agentBeta, marketId, "yes", bond);

        // UMA pulled exactly the bond; no stray allowance for the reward.
        assertEq(mockCurrency.balanceOf(address(mockOO)), bond, "oracle holds only the bond");
        assertEq(mockCurrency.allowance(address(hook), address(mockOO)), 0, "no reward allowance");
        assertEq(mockCurrency.balanceOf(address(hook)), reward, "reward still escrowed");

        vm.expectRevert(PredictionMarketHook.MarketNotResolved.selector);
        hook.claimAssertionReward(marketId);

        mockOO.resolveAssertion(assertionId, true);

        // Anyone may trigger the payout; it always goes to the asserter.
        vm.expectEmit(true, true, false, true);
        emit PredictionMarketHook.AssertionRewardPaid(marketId, agentBeta, reward);
        vm.prank(humanUser);
        hook.claimAssertionReward(marketId);

        assertEq(mockCurrency.balanceOf(agentBeta), betaBefore - bond + reward, "asserter got the reward");
        assertEq(mockCurrency.balanceOf(address(hook)), 0, "nothing left in the hook");

        vm.expectRevert(PredictionMarketHook.NothingToClaim.selector);
        hook.claimAssertionReward(marketId);
    }

    function test_M01_RewardRollsOverAfterFailedAssertion() public {
        uint256 reward = 50 ether;
        bytes32 marketId = _createMarket(agentAlpha, "Rollover", reward, 0);

        bytes32 first = _assertMarket(agentAlpha, marketId, "no", 0);
        mockOO.resolveAssertion(first, false); // disputed and lost

        bytes32 second = _assertMarket(agentBeta, marketId, "yes", 0);
        mockOO.resolveAssertion(second, true);

        uint256 betaBefore = mockCurrency.balanceOf(agentBeta);
        hook.claimAssertionReward(marketId);
        assertEq(mockCurrency.balanceOf(agentBeta) - betaBefore, reward, "second asserter earns it");
    }

    function test_M01_RewardPaidForAcceptedUnresolvable() public {
        bytes32 marketId = _createMarket(agentAlpha, "Void", 5 ether, 0);
        bytes32 assertionId = _assertMarket(agentBeta, marketId, "Unresolvable", 0);
        mockOO.resolveAssertion(assertionId, true);

        uint256 betaBefore = mockCurrency.balanceOf(agentBeta);
        hook.claimAssertionReward(marketId);
        assertEq(mockCurrency.balanceOf(agentBeta) - betaBefore, 5 ether);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // M-02: bond cap and question-key release
    // ─────────────────────────────────────────────────────────────────────────

    function test_M02_ImpossibleBond_Rejected() public {
        vm.prank(agentAlpha);
        vm.expectRevert(PredictionMarketHook.BondTooHigh.selector);
        hook.createMarket("yes", "no", "Squat", 0, type(uint256).max, 0, _resolutionTime());

        // The default cap is zero (UMA minimum bond only) until the owner raises it.
        vm.prank(agentAlpha);
        vm.expectRevert(PredictionMarketHook.BondTooHigh.selector);
        hook.createMarket("yes", "no", "Squat", 0, 1, 0, _resolutionTime());

        hook.setMaxRequiredBond(10 ether);
        vm.prank(agentAlpha);
        hook.createMarket("yes", "no", "Bonded", 0, 10 ether, 0, _resolutionTime());
    }

    function test_M02_SetMaxRequiredBond_OnlyOwner() public {
        vm.prank(agentAlpha);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, agentAlpha));
        hook.setMaxRequiredBond(1 ether);
    }

    function test_M02_OwnerCanReleaseSquattedKey() public {
        bytes32 squat = _createMarket(agentAlpha, "Contested question", 0, 0);

        vm.prank(agentBeta);
        vm.expectRevert(PredictionMarketHook.KeyNotReleasable.selector);
        hook.releaseMarketKey(squat);

        hook.releaseMarketKey(squat); // owner
        assertEq(hook.getMarketIdByQuestion("Contested question", "yes", "no"), bytes32(0));

        bytes32 replacement = _createMarket(agentBeta, "Contested question", 0, 0);
        assertEq(hook.getMarketIdByQuestion("Contested question", "yes", "no"), replacement);

        // Releasing again (or a market that no longer owns the key) reverts.
        vm.expectRevert(PredictionMarketHook.KeyNotReleasable.selector);
        hook.releaseMarketKey(squat);

        // The released market still resolves; it must not free the replacement's key.
        bytes32 assertionId = _assertMarket(agentAlpha, squat, "yes", 0);
        mockOO.resolveAssertion(assertionId, true);
        assertEq(hook.getMarketIdByQuestion("Contested question", "yes", "no"), replacement);
    }

    function test_M02_AnyoneCanReleaseAbandonedKey() public {
        bytes32 marketId = _createMarket(agentAlpha, "Abandoned", 0, 0);
        (,,,,,, uint64 resolutionTime) = hook.getMarketInfo(marketId);

        vm.warp(uint256(resolutionTime) + hook.KEY_RELEASE_DELAY() - 1);
        vm.prank(agentBeta);
        vm.expectRevert(PredictionMarketHook.KeyNotReleasable.selector);
        hook.releaseMarketKey(marketId);

        vm.warp(uint256(resolutionTime) + hook.KEY_RELEASE_DELAY());
        vm.expectEmit(true, false, false, false);
        emit PredictionMarketHook.MarketKeyReleased(marketId, bytes32(0));
        vm.prank(agentBeta);
        hook.releaseMarketKey(marketId);

        _createMarket(agentBeta, "Abandoned", 0, 0);
    }
}
