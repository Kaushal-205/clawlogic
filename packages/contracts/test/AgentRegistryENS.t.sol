// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {ENSAgentHelper} from "../src/ENSAgentHelper.sol";
import {IAgentRegistry} from "../src/interfaces/IAgentRegistry.sol";
import {IENS} from "../src/interfaces/IENS.sol";
import {IERC8004AgentValidation} from "../src/interfaces/erc8004/IERC8004AgentValidation.sol";
import {MockENSRegistry} from "./mocks/MockENSRegistry.sol";

/// @title AgentRegistryENSTest
/// @notice Comprehensive tests for ENS identity integration in AgentRegistry (Phase 1.1).
/// @dev Tests cover:
///      - Registration with valid ENS node
///      - Rejection when caller does not own the ENS node
///      - Bidirectional resolution: ENS node -> address and address -> ENS node
///      - Backward compatibility: registration without ENS still works
///      - Edge cases: duplicate ENS nodes, zero node, ENS not configured
///      - ENSAgentHelper subdomain registration
contract AgentRegistryENSTest is Test {
    // ─────────────────────────────────────────────────────────────────────────
    // Contracts
    // ─────────────────────────────────────────────────────────────────────────

    MockENSRegistry public ensRegistry;
    AgentRegistry public registry;
    ENSAgentHelper public ensHelper;

    // ─────────────────────────────────────────────────────────────────────────
    // Test Accounts
    // ─────────────────────────────────────────────────────────────────────────

    address public agentAlpha;
    address public agentBeta;
    address public agentGamma;
    address public nonOwner;

    // ─────────────────────────────────────────────────────────────────────────
    // ENS Constants
    // ─────────────────────────────────────────────────────────────────────────

    /// @dev Simulated namehash for "alpha.agent.eth"
    bytes32 public constant ALPHA_ENS_NODE = keccak256("alpha.agent.eth");

    /// @dev Simulated namehash for "beta.agent.eth"
    bytes32 public constant BETA_ENS_NODE = keccak256("beta.agent.eth");

    /// @dev Simulated namehash for "gamma.agent.eth"
    bytes32 public constant GAMMA_ENS_NODE = keccak256("gamma.agent.eth");

    /// @dev Simulated namehash for "agent.eth" (base node for ENSAgentHelper)
    bytes32 public constant BASE_NODE = keccak256("agent.eth");

    // ─────────────────────────────────────────────────────────────────────────
    // Setup
    // ─────────────────────────────────────────────────────────────────────────

    function setUp() public {
        // Create test accounts
        agentAlpha = makeAddr("agentAlpha");
        agentBeta = makeAddr("agentBeta");
        agentGamma = makeAddr("agentGamma");
        nonOwner = makeAddr("nonOwner");

        // Deploy mock ENS registry
        ensRegistry = new MockENSRegistry();

        // Deploy AgentRegistry with ENS support
        registry = new AgentRegistry(IENS(address(ensRegistry)), IERC8004AgentValidation(address(0)));

        // Set up ENS node ownership: agentAlpha owns ALPHA_ENS_NODE
        ensRegistry.setOwner(ALPHA_ENS_NODE, agentAlpha);

        // Set up ENS node ownership: agentBeta owns BETA_ENS_NODE
        ensRegistry.setOwner(BETA_ENS_NODE, agentBeta);

        // Set up ENS node ownership: agentGamma owns GAMMA_ENS_NODE
        ensRegistry.setOwner(GAMMA_ENS_NODE, agentGamma);

        // Deploy ENSAgentHelper: needs registry, base node, and agent registry address
        ensHelper = new ENSAgentHelper(
            IENS(address(ensRegistry)),
            BASE_NODE,
            address(registry)
        );

        // Give ensHelper ownership of BASE_NODE so it can create subdomains
        ensRegistry.setOwner(BASE_NODE, address(ensHelper));
    }

    // =========================================================================
    // AgentRegistry ENS Registration Tests
    // =========================================================================

    // -------------------------------------------------
    // Happy Path: Register with valid ENS node
    // -------------------------------------------------

    function test_RegisterAgentWithENS_Success() public {
        vm.expectEmit(true, false, false, true);
        emit IAgentRegistry.AgentRegistered(agentAlpha, "Alpha");

        vm.expectEmit(true, true, false, true);
        emit IAgentRegistry.ENSLinked(agentAlpha, ALPHA_ENS_NODE, "Alpha");

        vm.prank(agentAlpha);
        registry.registerAgentWithENS("Alpha", "attestation_data", ALPHA_ENS_NODE);

        // Verify agent is registered
        assertTrue(registry.isAgent(agentAlpha), "Agent should be registered");

        // Verify agent data includes ENS node
        IAgentRegistry.Agent memory agent = registry.getAgent(agentAlpha);
        assertEq(agent.name, "Alpha", "Name mismatch");
        assertEq(agent.ensNode, ALPHA_ENS_NODE, "ENS node mismatch");
        assertTrue(agent.exists, "Agent should exist");
        assertEq(agent.registeredAt, block.timestamp, "Timestamp mismatch");
    }

    function test_RegisterAgentWithENS_MultipleAgents() public {
        // Register Alpha with ENS
        vm.prank(agentAlpha);
        registry.registerAgentWithENS("Alpha", "", ALPHA_ENS_NODE);

        // Register Beta with ENS
        vm.prank(agentBeta);
        registry.registerAgentWithENS("Beta", "", BETA_ENS_NODE);

        // Both should be registered
        assertTrue(registry.isAgent(agentAlpha), "Alpha should be registered");
        assertTrue(registry.isAgent(agentBeta), "Beta should be registered");

        // Both ENS nodes should resolve correctly
        assertEq(registry.getAgentByENS(ALPHA_ENS_NODE), agentAlpha, "Alpha ENS resolution failed");
        assertEq(registry.getAgentByENS(BETA_ENS_NODE), agentBeta, "Beta ENS resolution failed");

        // Agent count should be 2
        assertEq(registry.getAgentCount(), 2, "Agent count should be 2");
    }

    // -------------------------------------------------
    // ENS Ownership Verification
    // -------------------------------------------------

    function test_RegisterAgentWithENS_NotOwner_Reverts() public {
        // nonOwner does not own ALPHA_ENS_NODE (agentAlpha does)
        vm.prank(nonOwner);
        vm.expectRevert(IAgentRegistry.NotENSOwner.selector);
        registry.registerAgentWithENS("Imposter", "", ALPHA_ENS_NODE);
    }

    function test_RegisterAgentWithENS_WrongOwner_Reverts() public {
        // agentBeta tries to claim agentAlpha's ENS node
        vm.prank(agentBeta);
        vm.expectRevert(IAgentRegistry.NotENSOwner.selector);
        registry.registerAgentWithENS("BetaImposter", "", ALPHA_ENS_NODE);
    }

    // -------------------------------------------------
    // ENS Node Uniqueness
    // -------------------------------------------------

    function test_RegisterAgentWithENS_DuplicateNode_Reverts() public {
        // First agent registers with ALPHA_ENS_NODE
        vm.prank(agentAlpha);
        registry.registerAgentWithENS("Alpha", "", ALPHA_ENS_NODE);

        // Transfer ENS ownership to agentGamma (simulating a real transfer)
        ensRegistry.setOwner(ALPHA_ENS_NODE, agentGamma);

        // agentGamma tries to register with the same node -- should fail because it is already linked
        vm.prank(agentGamma);
        vm.expectRevert(IAgentRegistry.ENSNodeAlreadyLinked.selector);
        registry.registerAgentWithENS("Gamma", "", ALPHA_ENS_NODE);
    }

    // -------------------------------------------------
    // Backward Compatibility: Register without ENS
    // -------------------------------------------------

    function test_RegisterAgent_WithoutENS_StillWorks() public {
        vm.prank(agentAlpha);
        registry.registerAgent("Alpha", "attestation");

        assertTrue(registry.isAgent(agentAlpha), "Agent should be registered");

        IAgentRegistry.Agent memory agent = registry.getAgent(agentAlpha);
        assertEq(agent.name, "Alpha", "Name mismatch");
        assertEq(agent.ensNode, bytes32(0), "ENS node should be zero");
    }

    function test_RegisterAgentWithENS_ZeroNode_NoENSLink() public {
        // Passing bytes32(0) as ensNode should behave identically to registerAgent
        vm.prank(agentAlpha);
        registry.registerAgentWithENS("Alpha", "", bytes32(0));

        assertTrue(registry.isAgent(agentAlpha), "Agent should be registered");

        IAgentRegistry.Agent memory agent = registry.getAgent(agentAlpha);
        assertEq(agent.ensNode, bytes32(0), "ENS node should be zero");
    }

    function test_RegisterAgent_ExistingErrors_StillWork() public {
        // AlreadyRegistered
        vm.prank(agentAlpha);
        registry.registerAgent("Alpha", "");

        vm.prank(agentAlpha);
        vm.expectRevert(IAgentRegistry.AlreadyRegistered.selector);
        registry.registerAgent("Alpha2", "");

        // EmptyName
        vm.prank(agentBeta);
        vm.expectRevert(IAgentRegistry.EmptyName.selector);
        registry.registerAgent("", "");
    }

    function test_RegisterAgentWithENS_AlreadyRegistered_Reverts() public {
        vm.prank(agentAlpha);
        registry.registerAgent("Alpha", "");

        // Attempting to register again with ENS should also fail
        vm.prank(agentAlpha);
        vm.expectRevert(IAgentRegistry.AlreadyRegistered.selector);
        registry.registerAgentWithENS("Alpha2", "", ALPHA_ENS_NODE);
    }

    // -------------------------------------------------
    // Link ENS After Registration
    // -------------------------------------------------

    function test_LinkENS_AfterRegister_Success() public {
        vm.prank(agentAlpha);
        registry.registerAgent("Alpha", "");

        vm.expectEmit(true, true, false, true);
        emit IAgentRegistry.ENSLinked(agentAlpha, ALPHA_ENS_NODE, "Alpha");

        vm.prank(agentAlpha);
        registry.linkENS(ALPHA_ENS_NODE);

        IAgentRegistry.Agent memory agent = registry.getAgent(agentAlpha);
        assertEq(agent.ensNode, ALPHA_ENS_NODE, "ENS node should be linked after registration");
        assertEq(registry.getAgentByENS(ALPHA_ENS_NODE), agentAlpha, "ENS lookup should resolve to agentAlpha");
    }

    function test_LinkENS_ReplaceNode_ClearsOldReverseLookup() public {
        vm.prank(agentAlpha);
        registry.registerAgentWithENS("Alpha", "", ALPHA_ENS_NODE);

        // Transfer ownership of GAMMA_ENS_NODE to agentAlpha so it can be relinked.
        ensRegistry.setOwner(GAMMA_ENS_NODE, agentAlpha);

        vm.prank(agentAlpha);
        registry.linkENS(GAMMA_ENS_NODE);

        IAgentRegistry.Agent memory agent = registry.getAgent(agentAlpha);
        assertEq(agent.ensNode, GAMMA_ENS_NODE, "ENS node should be replaced");
        assertEq(registry.getAgentByENS(GAMMA_ENS_NODE), agentAlpha, "New ENS node should resolve to agentAlpha");

        vm.expectRevert(IAgentRegistry.ENSNodeNotLinked.selector);
        registry.getAgentByENS(ALPHA_ENS_NODE);
    }

    function test_LinkENS_NotRegistered_Reverts() public {
        vm.prank(nonOwner);
        vm.expectRevert(IAgentRegistry.AgentNotFound.selector);
        registry.linkENS(ALPHA_ENS_NODE);
    }

    function test_LinkENS_NotOwner_Reverts() public {
        vm.prank(agentAlpha);
        registry.registerAgent("Alpha", "");

        vm.prank(agentAlpha);
        vm.expectRevert(IAgentRegistry.NotENSOwner.selector);
        registry.linkENS(BETA_ENS_NODE);
    }

    function test_LinkENS_AlreadyLinkedToAnotherAgent_Reverts() public {
        vm.prank(agentBeta);
        registry.registerAgentWithENS("Beta", "", BETA_ENS_NODE);

        vm.prank(agentAlpha);
        registry.registerAgent("Alpha", "");

        // Transfer ownership so owner check passes and uniqueness check is exercised.
        ensRegistry.setOwner(BETA_ENS_NODE, agentAlpha);

        vm.prank(agentAlpha);
        vm.expectRevert(IAgentRegistry.ENSNodeAlreadyLinked.selector);
        registry.linkENS(BETA_ENS_NODE);
    }

    function test_LinkENS_NoENSRegistry_Reverts() public {
        AgentRegistry noEnsRegistry = new AgentRegistry(IENS(address(0)), IERC8004AgentValidation(address(0)));

        vm.prank(agentAlpha);
        noEnsRegistry.registerAgent("Alpha", "");

        vm.prank(agentAlpha);
        vm.expectRevert(AgentRegistry.ENSNotConfigured.selector);
        noEnsRegistry.linkENS(ALPHA_ENS_NODE);
    }

    function test_LinkENS_ZeroNode_Reverts() public {
        vm.prank(agentAlpha);
        registry.registerAgent("Alpha", "");

        vm.prank(agentAlpha);
        vm.expectRevert(IAgentRegistry.ZeroENSNode.selector);
        registry.linkENS(bytes32(0));
    }

    // -------------------------------------------------
    // ENS Resolution: Forward (ENS -> Address)
    // -------------------------------------------------

    function test_GetAgentByENS_Success() public {
        vm.prank(agentAlpha);
        registry.registerAgentWithENS("Alpha", "", ALPHA_ENS_NODE);

        address resolved = registry.getAgentByENS(ALPHA_ENS_NODE);
        assertEq(resolved, agentAlpha, "ENS should resolve to agentAlpha");
    }

    function test_GetAgentByENS_NotLinked_Reverts() public {
        // ALPHA_ENS_NODE is not linked to any agent yet
        vm.expectRevert(IAgentRegistry.ENSNodeNotLinked.selector);
        registry.getAgentByENS(ALPHA_ENS_NODE);
    }

    function test_GetAgentByENS_ZeroNode_Reverts() public {
        vm.expectRevert(IAgentRegistry.ENSNodeNotLinked.selector);
        registry.getAgentByENS(bytes32(0));
    }

    // -------------------------------------------------
    // ENS Resolution: Reverse (Address -> ENS node)
    // -------------------------------------------------

    function test_ReverseResolution_AddressToENSNode() public {
        vm.prank(agentAlpha);
        registry.registerAgentWithENS("Alpha", "", ALPHA_ENS_NODE);

        IAgentRegistry.Agent memory agent = registry.getAgent(agentAlpha);
        assertEq(agent.ensNode, ALPHA_ENS_NODE, "Reverse resolution: address -> ENS node failed");
    }

    function test_ReverseResolution_NoENS_ReturnsZero() public {
        vm.prank(agentAlpha);
        registry.registerAgent("Alpha", "");

        IAgentRegistry.Agent memory agent = registry.getAgent(agentAlpha);
        assertEq(agent.ensNode, bytes32(0), "Should return zero for agent without ENS");
    }

    // -------------------------------------------------
    // ENS Not Configured (address(0) registry)
    // -------------------------------------------------

    function test_RegisterAgentWithENS_NoENSRegistry_Reverts() public {
        // Deploy a registry without ENS
        AgentRegistry noEnsRegistry = new AgentRegistry(IENS(address(0)), IERC8004AgentValidation(address(0)));

        vm.prank(agentAlpha);
        vm.expectRevert(AgentRegistry.ENSNotConfigured.selector);
        noEnsRegistry.registerAgentWithENS("Alpha", "", ALPHA_ENS_NODE);
    }

    function test_RegisterAgent_NoENSRegistry_StillWorks() public {
        // Deploy a registry without ENS
        AgentRegistry noEnsRegistry = new AgentRegistry(IENS(address(0)), IERC8004AgentValidation(address(0)));

        vm.prank(agentAlpha);
        noEnsRegistry.registerAgent("Alpha", "");

        assertTrue(noEnsRegistry.isAgent(agentAlpha), "Should work without ENS");
    }

    // -------------------------------------------------
    // Immutable ENS Registry Accessor
    // -------------------------------------------------

    function test_ENSRegistry_Immutable_IsSet() public view {
        assertEq(address(registry.i_ensRegistry()), address(ensRegistry), "ENS registry address mismatch");
    }

    function test_ENSRegistry_Immutable_ZeroWhenNotConfigured() public {
        AgentRegistry noEnsRegistry = new AgentRegistry(IENS(address(0)), IERC8004AgentValidation(address(0)));
        assertEq(address(noEnsRegistry.i_ensRegistry()), address(0), "Should be zero when not configured");
    }

    // -------------------------------------------------
    // Agent Enumeration with ENS
    // -------------------------------------------------

    function test_GetAgentAddresses_IncludesENSAgents() public {
        vm.prank(agentAlpha);
        registry.registerAgentWithENS("Alpha", "", ALPHA_ENS_NODE);

        vm.prank(agentBeta);
        registry.registerAgent("Beta", "");

        address[] memory addresses = registry.getAgentAddresses();
        assertEq(addresses.length, 2, "Should have 2 agents");
        assertEq(addresses[0], agentAlpha, "First should be Alpha");
        assertEq(addresses[1], agentBeta, "Second should be Beta");
    }

    function test_AgentCount_IncludesENSAgents() public {
        vm.prank(agentAlpha);
        registry.registerAgentWithENS("Alpha", "", ALPHA_ENS_NODE);

        vm.prank(agentBeta);
        registry.registerAgent("Beta", "");

        assertEq(registry.getAgentCount(), 2, "Count should include ENS agents");
    }

    // =========================================================================
    // ENSAgentHelper Tests
    // =========================================================================

    // -------------------------------------------------
    // Subdomain Registration
    // -------------------------------------------------

    function test_ENSHelper_RegisterSubdomain_Success() public {
        // Call from agentRegistry address (the authorized caller)
        vm.prank(address(registry));
        bytes32 subnode = ensHelper.registerAgentSubdomain("alpha", agentAlpha);

        // Verify the subnode was computed correctly
        bytes32 expectedSubnode = keccak256(abi.encodePacked(BASE_NODE, keccak256("alpha")));
        assertEq(subnode, expectedSubnode, "Subnode hash mismatch");

        // Verify ENS ownership was set
        assertEq(ensRegistry.owner(subnode), agentAlpha, "ENS subnode owner should be agentAlpha");
    }

    function test_ENSHelper_RegisterSubdomain_EmitsEvent() public {
        bytes32 expectedSubnode = keccak256(abi.encodePacked(BASE_NODE, keccak256("beta")));

        vm.expectEmit(true, true, false, true);
        emit ENSAgentHelper.AgentSubdomainRegistered("beta", agentBeta, expectedSubnode);

        vm.prank(address(registry));
        ensHelper.registerAgentSubdomain("beta", agentBeta);
    }

    // -------------------------------------------------
    // Access Control
    // -------------------------------------------------

    function test_ENSHelper_OnlyAgentRegistry_Reverts() public {
        vm.prank(agentAlpha);
        vm.expectRevert(ENSAgentHelper.OnlyAgentRegistry.selector);
        ensHelper.registerAgentSubdomain("alpha", agentAlpha);
    }

    function test_ENSHelper_RandomCaller_Reverts() public {
        vm.prank(nonOwner);
        vm.expectRevert(ENSAgentHelper.OnlyAgentRegistry.selector);
        ensHelper.registerAgentSubdomain("hacker", nonOwner);
    }

    // -------------------------------------------------
    // Input Validation
    // -------------------------------------------------

    function test_ENSHelper_EmptySubdomain_Reverts() public {
        vm.prank(address(registry));
        vm.expectRevert(ENSAgentHelper.EmptySubdomain.selector);
        ensHelper.registerAgentSubdomain("", agentAlpha);
    }

    function test_ENSHelper_ZeroAddress_Reverts() public {
        vm.prank(address(registry));
        vm.expectRevert(ENSAgentHelper.ZeroAddress.selector);
        ensHelper.registerAgentSubdomain("alpha", address(0));
    }

    // -------------------------------------------------
    // ComputeSubnode Helper
    // -------------------------------------------------

    function test_ENSHelper_ComputeSubnode() public view {
        bytes32 computed = ensHelper.computeSubnode("alpha");
        bytes32 expected = keccak256(abi.encodePacked(BASE_NODE, keccak256("alpha")));
        assertEq(computed, expected, "computeSubnode should match manual calculation");
    }

    function test_ENSHelper_ComputeSubnode_DifferentLabels() public view {
        bytes32 alpha = ensHelper.computeSubnode("alpha");
        bytes32 beta = ensHelper.computeSubnode("beta");
        assertTrue(alpha != beta, "Different labels should produce different subnodes");
    }

    // -------------------------------------------------
    // Immutable Accessors
    // -------------------------------------------------

    function test_ENSHelper_Immutables() public view {
        assertEq(address(ensHelper.i_ensRegistry()), address(ensRegistry), "ENS registry mismatch");
        assertEq(ensHelper.i_baseNode(), BASE_NODE, "Base node mismatch");
        assertEq(ensHelper.i_agentRegistry(), address(registry), "Agent registry mismatch");
    }

    // =========================================================================
    // Fuzz Tests
    // =========================================================================

    function testFuzz_RegisterAgentWithENS_DifferentNodes(bytes32 ensNode) public {
        // Skip zero node (no ENS linkage) and skip nodes not owned by agentAlpha
        vm.assume(ensNode != bytes32(0));

        // Set up ownership in mock ENS
        ensRegistry.setOwner(ensNode, agentAlpha);

        vm.prank(agentAlpha);
        registry.registerAgentWithENS("FuzzAgent", "", ensNode);

        // Verify forward resolution
        assertEq(registry.getAgentByENS(ensNode), agentAlpha, "ENS resolution should work for fuzzed node");

        // Verify reverse resolution
        IAgentRegistry.Agent memory agent = registry.getAgent(agentAlpha);
        assertEq(agent.ensNode, ensNode, "Agent ensNode should match fuzzed input");
    }

    function testFuzz_ENSHelper_ComputeSubnode_Deterministic(string memory label) public view {
        vm.assume(bytes(label).length > 0 && bytes(label).length < 100);

        bytes32 subnode1 = ensHelper.computeSubnode(label);
        bytes32 subnode2 = ensHelper.computeSubnode(label);
        assertEq(subnode1, subnode2, "computeSubnode should be deterministic");
    }
}
