// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IOutcomeToken} from "./interfaces/IOutcomeToken.sol";

/// @title OutcomeToken
/// @author CLAWLOGIC Team
/// @notice ERC-20 token representing a YES or NO outcome in a prediction market.
/// @dev Each prediction market deploys two OutcomeToken instances (one YES, one NO).
///      Only the PredictionMarketHook that created this token can mint and burn supply.
contract OutcomeToken is ERC20, IOutcomeToken {
    /// @notice The PredictionMarketHook address authorized to mint and burn tokens
    address public immutable hook;

    /// @notice Restricts function access to the PredictionMarketHook
    modifier onlyHook() {
        if (msg.sender != hook) {
            revert OnlyHook();
        }
        _;
    }

    /// @notice Deploys a new OutcomeToken bound to a specific PredictionMarketHook
    /// @param name_ The token name (e.g., "CLAWLOGIC YES Token - Will ETH break $4000?")
    /// @param symbol_ The token symbol (e.g., "clYES")
    /// @param hook_ The PredictionMarketHook address that will control minting and burning
    constructor(string memory name_, string memory symbol_, address hook_) ERC20(name_, symbol_) {
        hook = hook_;
    }

    /// @inheritdoc IOutcomeToken
    function mint(address to, uint256 amount) external onlyHook {
        _mint(to, amount);
    }

    /// @inheritdoc IOutcomeToken
    function burn(address from, uint256 amount) external onlyHook {
        _burn(from, amount);
    }
}
