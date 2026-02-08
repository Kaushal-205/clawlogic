// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title IENS
/// @notice Minimal interface for the ENS Registry contract.
/// @dev Only the functions required by CLAWLOGIC are included. The full ENS Registry
///      interface is defined in EIP-137. The canonical ENS Registry is deployed at
///      0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e on all supported chains.
interface IENS {
    /// @notice Returns the owner of the specified ENS node.
    /// @param node The namehash of the ENS name to query.
    /// @return The address that owns the node.
    function owner(bytes32 node) external view returns (address);

    /// @notice Creates a subdomain under the given node and assigns ownership.
    /// @dev Only callable by the current owner of `node`.
    /// @param node  The parent namehash.
    /// @param label The keccak256 hash of the subdomain label (e.g., keccak256("alpha")).
    /// @param owner_ The address to assign as the owner of the new subnode.
    /// @return The namehash of the newly created subnode.
    function setSubnodeOwner(bytes32 node, bytes32 label, address owner_) external returns (bytes32);

    /// @notice Sets the resolver contract for the specified node.
    /// @dev Only callable by the current owner of `node`.
    /// @param node     The namehash of the ENS name.
    /// @param resolver The address of the resolver contract.
    function setResolver(bytes32 node, address resolver) external;
}
