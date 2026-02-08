// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC8004AgentIdentity} from "../interfaces/erc8004/IERC8004AgentIdentity.sol";

/// @title AgentIdentityRegistry
/// @author CLAWLOGIC Team
/// @notice ERC-8004 compliant Agent Identity Registry.
/// @dev Issues canonical, portable agent identities as ERC-721 tokens. Each token ID
///      is a sequential agent ID (1, 2, 3, ...) that serves as the universal identifier
///      across the reputation and validation registries.
///
///      **Access Control:**
///      The contract owner (intended to be the AgentRegistry) is the sole authorized
///      minter. This ensures agent identities can only be created through the official
///      registration flow. Ownership can be transferred via the inherited Ownable pattern
///      if the protocol governance requires it.
///
///      **Metadata:**
///      Each agent identity stores a URI pointing to a JSON metadata document (typically
///      hosted on IPFS). The metadata schema should include agent name, description,
///      capabilities, and attestation information.
contract AgentIdentityRegistry is ERC721, Ownable, IERC8004AgentIdentity {
    // -------------------------------------------------
    // Storage
    // -------------------------------------------------

    /// @dev Sequential counter for agent IDs. Starts at 0; first minted ID is 1.
    uint256 private s_nextAgentId;

    /// @dev Maps agent token ID to its metadata URI.
    mapping(uint256 => string) private s_agentMetadata;

    // -------------------------------------------------
    // Constructor
    // -------------------------------------------------

    /// @notice Deploys the AgentIdentityRegistry.
    /// @param initialOwner The address authorized to mint agent identities (typically AgentRegistry).
    constructor(address initialOwner)
        ERC721("CLAWLOGIC Agent Identity", "CLAW-ID")
        Ownable(initialOwner)
    {}

    // -------------------------------------------------
    // External Functions
    // -------------------------------------------------

    /// @inheritdoc IERC8004AgentIdentity
    function mintAgentIdentity(address to, string calldata metadataURI) external onlyOwner returns (uint256 agentId) {
        if (to == address(0)) {
            revert ZeroAddress();
        }
        if (bytes(metadataURI).length == 0) {
            revert EmptyMetadataURI();
        }

        // Increment first so IDs start at 1 (0 is reserved as "no agent").
        unchecked {
            agentId = ++s_nextAgentId;
        }

        // Store metadata before minting (Checks-Effects-Interactions).
        s_agentMetadata[agentId] = metadataURI;

        // Mint the ERC-721 token. _safeMint checks that the recipient can receive ERC-721
        // if it is a contract (via IERC721Receiver).
        _safeMint(to, agentId);

        emit AgentIdentityMinted(agentId, to, metadataURI);
    }

    /// @notice Update the metadata URI for an existing agent identity.
    /// @dev Only callable by the contract owner (AgentRegistry). The agent must exist.
    /// @param agentId The agent identity token ID.
    /// @param newMetadataURI The new metadata URI to set.
    function updateAgentMetadata(uint256 agentId, string calldata newMetadataURI) external onlyOwner {
        if (_ownerOf(agentId) == address(0)) {
            revert AgentDoesNotExist();
        }
        if (bytes(newMetadataURI).length == 0) {
            revert EmptyMetadataURI();
        }

        s_agentMetadata[agentId] = newMetadataURI;

        emit AgentMetadataUpdated(agentId, newMetadataURI);
    }

    /// @inheritdoc IERC8004AgentIdentity
    function getAgentMetadata(uint256 agentId) external view returns (string memory) {
        if (_ownerOf(agentId) == address(0)) {
            revert AgentDoesNotExist();
        }
        return s_agentMetadata[agentId];
    }

    /// @inheritdoc IERC8004AgentIdentity
    function ownerOfAgent(uint256 agentId) external view returns (address) {
        address owner = _ownerOf(agentId);
        if (owner == address(0)) {
            revert AgentDoesNotExist();
        }
        return owner;
    }

    /// @inheritdoc IERC8004AgentIdentity
    function totalAgents() external view returns (uint256) {
        return s_nextAgentId;
    }

    /// @inheritdoc IERC8004AgentIdentity
    function agentExists(uint256 agentId) external view returns (bool) {
        return _ownerOf(agentId) != address(0);
    }

    // -------------------------------------------------
    // ERC-721 Overrides
    // -------------------------------------------------

    /// @notice Returns the metadata URI for a given token ID.
    /// @dev Overrides ERC721.tokenURI to use the stored metadata URI.
    /// @param tokenId The token ID (same as agentId).
    /// @return The metadata URI string.
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        if (_ownerOf(tokenId) == address(0)) {
            revert AgentDoesNotExist();
        }
        return s_agentMetadata[tokenId];
    }

    /// @notice ERC-165 interface detection.
    /// @dev Returns true for IERC721, IERC165, and IERC8004AgentIdentity.
    /// @param interfaceId The interface identifier to check.
    /// @return True if the interface is supported.
    function supportsInterface(bytes4 interfaceId) public view override(ERC721, IERC165) returns (bool) {
        return interfaceId == type(IERC8004AgentIdentity).interfaceId || super.supportsInterface(interfaceId);
    }
}
