// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {OutcomeToken} from "../src/OutcomeToken.sol";
import {IOutcomeToken} from "../src/interfaces/IOutcomeToken.sol";

/// @title OutcomeTokenTest
/// @notice Tests for OutcomeToken ERC-20 implementation
contract OutcomeTokenTest is Test {
    OutcomeToken public token;
    address public hook;
    address public user;

    function setUp() public {
        hook = makeAddr("hook");
        user = makeAddr("user");

        token = new OutcomeToken("Test YES Token", "tYES", hook);
    }

    // -------------------------------------------------
    // Basic ERC-20 Tests
    // -------------------------------------------------

    function test_TokenMetadata() public view {
        assertEq(token.name(), "Test YES Token", "Name mismatch");
        assertEq(token.symbol(), "tYES", "Symbol mismatch");
        assertEq(token.decimals(), 18, "Decimals should be 18");
    }

    function test_HookAddress() public view {
        assertEq(token.hook(), hook, "Hook address mismatch");
    }

    // -------------------------------------------------
    // Mint Tests
    // -------------------------------------------------

    function test_Mint_Success() public {
        uint256 amount = 100 ether;

        vm.prank(hook);
        token.mint(user, amount);

        assertEq(token.balanceOf(user), amount, "Balance mismatch");
        assertEq(token.totalSupply(), amount, "Total supply mismatch");
    }

    function test_Mint_OnlyHook_Reverts() public {
        vm.prank(user);
        vm.expectRevert(IOutcomeToken.OnlyHook.selector);
        token.mint(user, 100 ether);
    }

    function test_Mint_Multiple() public {
        vm.startPrank(hook);
        token.mint(user, 50 ether);
        token.mint(user, 30 ether);
        vm.stopPrank();

        assertEq(token.balanceOf(user), 80 ether, "Balance should accumulate");
        assertEq(token.totalSupply(), 80 ether, "Total supply should accumulate");
    }

    // -------------------------------------------------
    // Burn Tests
    // -------------------------------------------------

    function test_Burn_Success() public {
        // Mint first
        vm.prank(hook);
        token.mint(user, 100 ether);

        // Burn
        vm.prank(hook);
        token.burn(user, 60 ether);

        assertEq(token.balanceOf(user), 40 ether, "Balance should decrease");
        assertEq(token.totalSupply(), 40 ether, "Total supply should decrease");
    }

    function test_Burn_OnlyHook_Reverts() public {
        vm.prank(hook);
        token.mint(user, 100 ether);

        vm.prank(user);
        vm.expectRevert(IOutcomeToken.OnlyHook.selector);
        token.burn(user, 50 ether);
    }

    function test_Burn_InsufficientBalance_Reverts() public {
        vm.prank(hook);
        token.mint(user, 50 ether);

        vm.prank(hook);
        vm.expectRevert();
        token.burn(user, 100 ether);
    }

    // -------------------------------------------------
    // Transfer Tests
    // -------------------------------------------------

    function test_Transfer_Success() public {
        address recipient = makeAddr("recipient");

        vm.prank(hook);
        token.mint(user, 100 ether);

        vm.prank(user);
        token.transfer(recipient, 30 ether);

        assertEq(token.balanceOf(user), 70 ether, "Sender balance mismatch");
        assertEq(token.balanceOf(recipient), 30 ether, "Recipient balance mismatch");
    }

    function test_Approve_TransferFrom_Success() public {
        address spender = makeAddr("spender");
        address recipient = makeAddr("recipient");

        vm.prank(hook);
        token.mint(user, 100 ether);

        vm.prank(user);
        token.approve(spender, 50 ether);

        vm.prank(spender);
        token.transferFrom(user, recipient, 30 ether);

        assertEq(token.balanceOf(user), 70 ether, "User balance mismatch");
        assertEq(token.balanceOf(recipient), 30 ether, "Recipient balance mismatch");
        assertEq(token.allowance(user, spender), 20 ether, "Allowance should decrease");
    }

    // -------------------------------------------------
    // Fuzz Tests
    // -------------------------------------------------

    function testFuzz_Mint_Burn(uint256 mintAmount, uint256 burnAmount) public {
        vm.assume(mintAmount > 0 && mintAmount < type(uint128).max);
        vm.assume(burnAmount <= mintAmount);

        vm.prank(hook);
        token.mint(user, mintAmount);

        vm.prank(hook);
        token.burn(user, burnAmount);

        assertEq(token.balanceOf(user), mintAmount - burnAmount, "Final balance mismatch");
        assertEq(token.totalSupply(), mintAmount - burnAmount, "Final supply mismatch");
    }
}
