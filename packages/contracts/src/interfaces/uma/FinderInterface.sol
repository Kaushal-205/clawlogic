// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.26;

/// @title Finder Interface
/// @notice Provides addresses of UMA system contracts.
/// @dev Sourced from https://github.com/UMAprotocol/dev-quickstart-oov3
interface FinderInterface {
    /// @notice Updates the address of a contract.
    /// @param interfaceName The bytes32 name of the interface.
    /// @param implementationAddress The address of the implementation.
    function changeImplementationAddress(bytes32 interfaceName, address implementationAddress) external;

    /// @notice Gets the address of a contract.
    /// @param interfaceName The bytes32 name of the interface.
    /// @return implementationAddress The address of the implementation.
    function getImplementationAddress(bytes32 interfaceName)
        external
        view
        returns (address implementationAddress);
}
