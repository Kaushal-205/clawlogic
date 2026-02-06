// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

/// @title IERC8004AgentIdentity
/// @notice Interface for the ERC-8004 Agent Identity Registry.
/// @dev Extends ERC-721 to provide canonical, portable agent identities as NFTs.
///      Each token represents a unique agent identity with attached metadata.
///      Token IDs are sequential (1, 2, 3, ...) and serve as the canonical agent ID
///      across all $CLAWLOGIC registries (reputation, validation, etc.).
interface IERC8004AgentIdentity is IERC721 {
    // -------------------------------------------------
    // Events
    // -------------------------------------------------

    /// @notice Emitted when a new agent identity NFT is minted.
    /// @param agentId The sequential ID assigned to the agent.
    /// @param to The address receiving the identity token.
    /// @param metadataURI The URI pointing to the agent's metadata JSON.
    event AgentIdentityMinted(uint256 indexed agentId, address indexed to, string metadataURI);

    /// @notice Emitted when an agent's metadata URI is updated.
    /// @param agentId The agent whose metadata was updated.
    /// @param newMetadataURI The new metadata URI.
    event AgentMetadataUpdated(uint256 indexed agentId, string newMetadataURI);

    // -------------------------------------------------
    // Errors
    // -------------------------------------------------

    /// @notice Thrown when a caller other than the authorized minter attempts to mint.
    error OnlyAuthorizedMinter();

    /// @notice Thrown when an empty metadata URI is provided.
    error EmptyMetadataURI();

    /// @notice Thrown when a query references a non-existent agent ID.
    error AgentDoesNotExist();

    /// @notice Thrown when the zero address is provided as a recipient.
    error ZeroAddress();

    // -------------------------------------------------
    // Functions
    // -------------------------------------------------

    /// @notice Mint a new agent identity NFT.
    /// @dev Only callable by the authorized minter (AgentRegistry).
    ///      Increments the internal counter and mints a new ERC-721 token.
    /// @param to The address that will own the agent identity.
    /// @param metadataURI URI pointing to the agent metadata JSON (e.g., IPFS hash).
    /// @return agentId The sequential ID assigned to the new agent.
    function mintAgentIdentity(address to, string calldata metadataURI) external returns (uint256 agentId);

    /// @notice Retrieve the metadata URI for a given agent.
    /// @param agentId The agent identity token ID.
    /// @return The metadata URI string.
    function getAgentMetadata(uint256 agentId) external view returns (string memory);

    /// @notice Retrieve the owner of a given agent identity.
    /// @param agentId The agent identity token ID.
    /// @return The address that owns the agent identity NFT.
    function ownerOfAgent(uint256 agentId) external view returns (address);

    /// @notice Get the total number of agent identities minted.
    /// @return The current count of minted agent identities.
    function totalAgents() external view returns (uint256);

    /// @notice Check whether an agent identity exists for the given ID.
    /// @param agentId The agent identity token ID.
    /// @return True if the agent identity has been minted, false otherwise.
    function agentExists(uint256 agentId) external view returns (bool);
}
