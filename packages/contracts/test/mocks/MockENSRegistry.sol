// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IENS} from "../../src/interfaces/IENS.sol";

/// @title MockENSRegistry
/// @notice Simplified mock of the ENS Registry for testing ENS identity integration.
/// @dev Implements the IENS interface with basic node ownership and subdomain creation logic.
///      Anyone can claim unclaimed nodes via `setOwner()` for test convenience.
contract MockENSRegistry is IENS {
    /// @dev Maps node -> owner address
    mapping(bytes32 => address) private s_owners;

    /// @dev Maps node -> resolver address
    mapping(bytes32 => address) private s_resolvers;

    // -------------------------------------------------
    // IENS Implementation
    // -------------------------------------------------

    /// @inheritdoc IENS
    function owner(bytes32 node) external view override returns (address) {
        return s_owners[node];
    }

    /// @inheritdoc IENS
    function setSubnodeOwner(bytes32 node, bytes32 label, address owner_) external override returns (bytes32) {
        require(s_owners[node] == msg.sender, "MockENS: not owner of parent node");

        bytes32 subnode = keccak256(abi.encodePacked(node, label));
        s_owners[subnode] = owner_;

        return subnode;
    }

    /// @inheritdoc IENS
    function setResolver(bytes32 node, address resolver_) external override {
        require(s_owners[node] == msg.sender, "MockENS: not owner of node");
        s_resolvers[node] = resolver_;
    }

    // -------------------------------------------------
    // Test Helpers (not part of IENS)
    // -------------------------------------------------

    /// @notice Directly set the owner of a node (test convenience).
    /// @param node  The namehash to set ownership for.
    /// @param owner_ The address to assign as owner.
    function setOwner(bytes32 node, address owner_) external {
        s_owners[node] = owner_;
    }

    /// @notice Get the resolver for a node.
    /// @param node The namehash to look up.
    /// @return The resolver address.
    function resolver(bytes32 node) external view returns (address) {
        return s_resolvers[node];
    }
}
