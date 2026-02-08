// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title IOutcomeToken
/// @notice Interface for YES/NO outcome tokens used in CLAWLOGIC prediction markets.
/// @dev Extends ERC-20 with mint/burn restricted to the PredictionMarketHook.
interface IOutcomeToken is IERC20 {
    /// @notice Thrown when a caller other than the hook attempts a restricted operation
    error OnlyHook();

    /// @notice Mint tokens (only callable by PredictionMarketHook)
    /// @param to Recipient address
    /// @param amount Amount to mint
    function mint(address to, uint256 amount) external;

    /// @notice Burn tokens (only callable by PredictionMarketHook)
    /// @param from Address to burn from
    /// @param amount Amount to burn
    function burn(address from, uint256 amount) external;

    /// @notice Returns the PredictionMarketHook address that controls this token
    /// @return The hook address
    function hook() external view returns (address);
}
