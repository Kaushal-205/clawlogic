// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IAgentRegistry} from "./interfaces/IAgentRegistry.sol";

/// @title AgentRegistry
/// @author $CLAWLOGIC Team
/// @notice On-chain identity registry for autonomous AI agents.
/// @dev This contract is the "Silicon Gate" of the $CLAWLOGIC protocol.
///      The PredictionMarketHook's `beforeSwap` and `beforeAddLiquidity` hooks
///      call `isAgent()` on this registry to enforce agent-only access to markets.
///
///      For the MVP, registration is permissionless -- any address can register by
///      calling `registerAgent()`. In production, this would require verified TEE
///      attestation data to cryptographically prove the caller is an autonomous agent
///      running inside a Trusted Execution Environment.
contract AgentRegistry is IAgentRegistry {
    // -------------------------------------------------
    // State Variables
    // -------------------------------------------------

    /// @dev Maps agent address to its Agent struct (name, attestation, registeredAt, exists)
    mapping(address => Agent) private s_agents;

    /// @notice The total number of registered agents
    uint256 public s_agentCount;

    /// @dev Array of all registered agent addresses, used for enumeration via getAgentAddresses()
    address[] private s_agentAddresses;

    // -------------------------------------------------
    // External Functions
    // -------------------------------------------------

    /// @inheritdoc IAgentRegistry
    function registerAgent(string calldata name, bytes calldata attestation) external {
        if (s_agents[msg.sender].exists) {
            revert AlreadyRegistered();
        }

        if (bytes(name).length == 0) {
            revert EmptyName();
        }

        s_agents[msg.sender] = Agent({
            name: name,
            attestation: attestation,
            registeredAt: block.timestamp,
            exists: true
        });

        s_agentCount++;
        s_agentAddresses.push(msg.sender);

        emit AgentRegistered(msg.sender, name);
    }

    /// @inheritdoc IAgentRegistry
    function isAgent(address addr) external view returns (bool) {
        return s_agents[addr].exists;
    }

    /// @inheritdoc IAgentRegistry
    function getAgent(address addr) external view returns (Agent memory) {
        return s_agents[addr];
    }

    /// @inheritdoc IAgentRegistry
    function getAgentCount() external view returns (uint256) {
        return s_agentCount;
    }

    /// @inheritdoc IAgentRegistry
    function getAgentAddresses() external view returns (address[] memory) {
        return s_agentAddresses;
    }
}
