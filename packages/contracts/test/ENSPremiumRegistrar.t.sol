// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";

import {AgentRegistry} from "../src/AgentRegistry.sol";
import {ENSPremiumRegistrar} from "../src/ENSPremiumRegistrar.sol";
import {IENS} from "../src/interfaces/IENS.sol";
import {IERC8004AgentValidation} from "../src/interfaces/erc8004/IERC8004AgentValidation.sol";
import {MockENSRegistry} from "./mocks/MockENSRegistry.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

contract ENSPremiumRegistrarTest is Test {
    MockENSRegistry private ens;
    MockERC20 private usdc;
    AgentRegistry private registry;
    ENSPremiumRegistrar private registrar;

    address private deployer;
    address private treasury;
    address private agent;
    address private outsider;

    bytes32 private constant BASE_NODE = keccak256("clawlogic.eth");

    function setUp() public {
        deployer = address(this);
        treasury = makeAddr("treasury");
        agent = makeAddr("agent");
        outsider = makeAddr("outsider");

        ens = new MockENSRegistry();
        usdc = new MockERC20("Mock USDC", "mUSDC");
        registry = new AgentRegistry(IENS(address(ens)), IERC8004AgentValidation(address(0)));
        registrar = new ENSPremiumRegistrar(ens, BASE_NODE, usdc, registry, treasury);

        // Registrar must control the parent node.
        ens.setOwner(BASE_NODE, address(registrar));

        usdc.mint(agent, 10_000e6);
        usdc.mint(outsider, 10_000e6);

        vm.prank(agent);
        registry.registerAgent("Alpha", "");
    }

    function test_QuotePrice_UsesLengthTiers() public view {
        assertEq(registrar.quotePrice("ab"), 250e6, "short label price mismatch");
        assertEq(registrar.quotePrice("alpha"), 100e6, "medium label price mismatch");
        assertEq(registrar.quotePrice("alphadelta"), 25e6, "long label price mismatch");
    }

    function test_BuyName_AgentCommitReveal_Success() public {
        string memory label = "alpha";
        bytes32 secret = keccak256("alpha-secret");
        _commitAndWait(agent, label, secret);

        vm.prank(agent);
        usdc.approve(address(registrar), 1_000e6);

        uint256 treasuryBefore = usdc.balanceOf(treasury);
        vm.prank(agent);
        bytes32 subnode = registrar.buyName(label, secret, 150e6);

        assertEq(ens.owner(subnode), agent, "ENS ownership should transfer to buyer");
        assertEq(usdc.balanceOf(treasury) - treasuryBefore, 100e6, "treasury should receive tiered price");

        (address owner, uint256 purchasedAt, uint256 paidPrice,, bool available) = registrar.getLabelInfo(label);
        assertEq(owner, agent, "stored label owner mismatch");
        assertTrue(purchasedAt > 0, "purchase timestamp should be recorded");
        assertEq(paidPrice, 100e6, "paid price mismatch");
        assertFalse(available, "name should not remain available");
    }

    function test_BuyName_WithoutCommit_Reverts() public {
        vm.prank(agent);
        usdc.approve(address(registrar), 1_000e6);

        vm.prank(agent);
        vm.expectRevert(ENSPremiumRegistrar.MissingCommitment.selector);
        registrar.buyName("alpha", keccak256("missing"), 200e6);
    }

    function test_BuyName_CommitTooEarly_Reverts() public {
        string memory label = "alpha";
        bytes32 secret = keccak256("early-secret");

        bytes32 labelHash = registrar.computeLabelHash(label);
        bytes32 commitment = registrar.computeCommitment(agent, labelHash, secret);

        vm.prank(agent);
        registrar.commitPurchase(commitment);

        vm.prank(agent);
        usdc.approve(address(registrar), 1_000e6);

        vm.prank(agent);
        vm.expectRevert(ENSPremiumRegistrar.CommitTooEarly.selector);
        registrar.buyName(label, secret, 200e6);
    }

    function test_BuyName_CommitExpired_Reverts() public {
        string memory label = "alpha";
        bytes32 secret = keccak256("expired-secret");
        _commitAndWait(agent, label, secret);

        vm.warp(block.timestamp + registrar.s_commitMaxAge() + 1);

        vm.prank(agent);
        usdc.approve(address(registrar), 1_000e6);

        vm.prank(agent);
        vm.expectRevert(ENSPremiumRegistrar.CommitExpired.selector);
        registrar.buyName(label, secret, 200e6);
    }

    function test_BuyName_NonAgent_RevertsWhenAgentOnlyMode() public {
        string memory label = "outsider";
        bytes32 secret = keccak256("outsider-secret");
        _commitAndWait(outsider, label, secret);

        vm.prank(outsider);
        usdc.approve(address(registrar), 1_000e6);

        vm.prank(outsider);
        vm.expectRevert(ENSPremiumRegistrar.NotAgent.selector);
        registrar.buyName(label, secret, 200e6);
    }

    function test_BuyName_NonAgent_SucceedsWhenAgentOnlyDisabled() public {
        vm.prank(deployer);
        registrar.setAgentOnlyMode(false);

        string memory label = "outsider";
        bytes32 secret = keccak256("outsider-secret");
        _commitAndWait(outsider, label, secret);

        vm.prank(outsider);
        usdc.approve(address(registrar), 1_000e6);

        vm.prank(outsider);
        bytes32 subnode = registrar.buyName(label, secret, 200e6);
        assertEq(ens.owner(subnode), outsider, "outsider should own purchased name");
    }

    function test_BuyName_DoublePurchase_Reverts() public {
        string memory label = "alpha";
        bytes32 firstSecret = keccak256("first-secret");
        _commitAndWait(agent, label, firstSecret);

        vm.prank(agent);
        usdc.approve(address(registrar), 1_000e6);
        vm.prank(agent);
        registrar.buyName(label, firstSecret, 200e6);

        bytes32 secondSecret = keccak256("second-secret");
        _commitAndWait(agent, label, secondSecret);
        vm.prank(agent);
        usdc.approve(address(registrar), 1_000e6);

        vm.prank(agent);
        vm.expectRevert(ENSPremiumRegistrar.NameAlreadySold.selector);
        registrar.buyName(label, secondSecret, 200e6);
    }

    function _commitAndWait(address buyer, string memory label, bytes32 secret) internal {
        bytes32 labelHash = registrar.computeLabelHash(label);
        bytes32 commitment = registrar.computeCommitment(buyer, labelHash, secret);

        vm.prank(buyer);
        registrar.commitPurchase(commitment);

        vm.warp(block.timestamp + registrar.s_commitMinDelay());
    }
}
