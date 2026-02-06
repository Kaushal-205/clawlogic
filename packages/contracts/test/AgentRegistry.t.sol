// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {TestSetup} from "./helpers/TestSetup.sol";
import {IAgentRegistry} from "../src/interfaces/IAgentRegistry.sol";

/// @title AgentRegistryTest
/// @notice Comprehensive tests for AgentRegistry contract
contract AgentRegistryTest is TestSetup {
    address unregisteredAgent;

    function setUp() public override {
        super.setUp();
        unregisteredAgent = makeAddr("unregistered");
    }

    // -------------------------------------------------
    // Registration Tests
    // -------------------------------------------------

    function test_RegisterAgent_Success() public {
        address newAgent = makeAddr("newAgent");
        string memory name = "NewAgent";
        bytes memory attestation = "test_attestation";

        vm.expectEmit(true, false, false, true);
        emit IAgentRegistry.AgentRegistered(newAgent, name);

        vm.prank(newAgent);
        registry.registerAgent(name, attestation);

        // Verify isAgent
        assertTrue(registry.isAgent(newAgent), "Agent should be registered");

        // Verify getAgent
        IAgentRegistry.Agent memory agent = registry.getAgent(newAgent);
        assertEq(agent.name, name, "Name mismatch");
        assertEq(agent.attestation, attestation, "Attestation mismatch");
        assertEq(agent.registeredAt, block.timestamp, "Registration timestamp mismatch");
        assertTrue(agent.exists, "Agent should exist");
    }

    function test_RegisterAgent_AlreadyRegistered_Reverts() public {
        // agentAlpha is already registered in setUp

        vm.prank(agentAlpha);
        vm.expectRevert(IAgentRegistry.AlreadyRegistered.selector);
        registry.registerAgent("Alpha2", "");
    }

    function test_RegisterAgent_EmptyName_Reverts() public {
        address newAgent = makeAddr("newAgent");

        vm.prank(newAgent);
        vm.expectRevert(IAgentRegistry.EmptyName.selector);
        registry.registerAgent("", "");
    }

    function test_AgentCount_Increments() public {
        uint256 initialCount = registry.getAgentCount();
        assertEq(initialCount, 2, "Should start with 2 agents (Alpha and Beta)");

        address newAgent1 = makeAddr("newAgent1");
        vm.prank(newAgent1);
        registry.registerAgent("Agent1", "");

        assertEq(registry.getAgentCount(), 3, "Count should be 3 after first registration");

        address newAgent2 = makeAddr("newAgent2");
        vm.prank(newAgent2);
        registry.registerAgent("Agent2", "");

        assertEq(registry.getAgentCount(), 4, "Count should be 4 after second registration");
    }

    function test_GetAgentAddresses_ReturnsAll() public {
        address[] memory addresses = registry.getAgentAddresses();

        assertEq(addresses.length, 2, "Should have 2 registered agents");
        assertEq(addresses[0], agentAlpha, "First agent should be Alpha");
        assertEq(addresses[1], agentBeta, "Second agent should be Beta");
    }

    function test_IsAgent_UnregisteredAddress_ReturnsFalse() public {
        assertFalse(registry.isAgent(unregisteredAgent), "Unregistered address should return false");
    }

    function test_GetAgent_UnregisteredAddress_ReturnsEmpty() public {
        IAgentRegistry.Agent memory agent = registry.getAgent(unregisteredAgent);

        assertEq(agent.name, "", "Name should be empty");
        assertEq(agent.attestation, "", "Attestation should be empty");
        assertEq(agent.registeredAt, 0, "Registration timestamp should be 0");
        assertFalse(agent.exists, "exists should be false");
    }

    // -------------------------------------------------
    // Fuzz Tests
    // -------------------------------------------------

    function testFuzz_RegisterAgent_DifferentNames(string memory name) public {
        vm.assume(bytes(name).length > 0 && bytes(name).length < 100);

        address newAgent = makeAddr(string.concat("agent_", name));

        vm.prank(newAgent);
        registry.registerAgent(name, "");

        IAgentRegistry.Agent memory agent = registry.getAgent(newAgent);
        assertEq(agent.name, name, "Name should match input");
        assertTrue(registry.isAgent(newAgent), "Agent should be registered");
    }

    function testFuzz_RegisterAgent_DifferentAttestations(bytes memory attestation) public {
        vm.assume(attestation.length < 1000);

        address newAgent = makeAddr("fuzzAgent");

        vm.prank(newAgent);
        registry.registerAgent("FuzzAgent", attestation);

        IAgentRegistry.Agent memory agent = registry.getAgent(newAgent);
        assertEq(agent.attestation, attestation, "Attestation should match input");
    }
}
