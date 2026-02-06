// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";

/// @title MockPoolManager
/// @author $CLAWLOGIC Team
/// @notice A minimal mock PoolManager for deployment on chains where Uniswap V4
///         is not available (e.g., Circle Arc testnet). Satisfies the IPoolManager
///         interface at the ABI level so the PredictionMarketHook constructor can
///         accept it, but does NOT implement actual pool or swap logic.
///
/// @dev On Arc testnet, V4 pool trading is not functional; only the prediction
///      market lifecycle (initializeMarket, mintOutcomeTokens, assertMarket,
///      settleOutcomeTokens) is operational. The `beforeSwap` / `beforeAddLiquidity`
///      hooks remain wired but will never be invoked since there is no real
///      PoolManager routing through them.
///
///      This mock is acceptable for a hackathon demo to show "same protocol,
///      different chain, stablecoin-native settlement."
contract MockPoolManager {
    /// @notice Returns a pseudo owner address for compatibility.
    function owner() external view returns (address) {
        return address(this);
    }
}
