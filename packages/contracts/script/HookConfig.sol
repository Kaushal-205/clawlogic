// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Script.sol";
import "forge-std/console2.sol";

import {PredictionMarketHook} from "../src/PredictionMarketHook.sol";

/// @title HookConfigScript
/// @notice Admin configuration shared by every script that deploys a PredictionMarketHook,
///         so a full deployment and a hook-only redeployment end in the same state.
///
/// @dev Environment (all optional):
///        PROTOCOL_OWNER            -- final admin, e.g. a Safe (default: deployer). Required on
///                                     production chains.
///        TREASURY                  -- protocol fee recipient (default: PROTOCOL_OWNER)
///        PROTOCOL_FEE_BPS          -- protocol share of each trade (default: 100 = 1%)
///        LP_FEE_BPS                -- LP share of each trade (default: 100 = 1%)
///        MARKET_CREATION_FEE_WEI   -- flat fee per market (default: 0, max 0.1 ETH)
///        MAX_REQUIRED_BOND         -- largest requiredBond a market may set, in bond-currency
///                                     units (default: 0 = the UMA minimum bond only)
///        ERC8004_IDENTITY_REGISTRY -- canonical ERC-8004 IdentityRegistry; holders may trade
///        PRODUCTION                -- force production rules on a testnet chain
abstract contract HookConfigScript is Script {
    /// @dev Chains where mocks may be deployed. Every other chain is treated as production.
    function _isKnownTestnet(uint256 chainId) internal pure returns (bool) {
        return chainId == 31_337 // anvil
            || chainId == 421_614 // Arbitrum Sepolia
            || chainId == 11_155_111 // Sepolia
            || chainId == 84_532 // Base Sepolia
            || chainId == 5_042_002; // Arc testnet
    }

    /// @dev Production chains never get mocks and must name their owner explicitly.
    function _isProduction() internal view returns (bool) {
        return !_isKnownTestnet(block.chainid) || vm.envOr("PRODUCTION", false);
    }

    /// @dev Resolves the final owner and treasury before anything is broadcast. The treasury
    ///      defaults to the final owner (never silently to the deployer after a handover).
    function _readAdmin(address deployer, bool production) internal view returns (address owner, address treasury) {
        if (production) {
            require(vm.envExists("PROTOCOL_OWNER"), "Deploy: PROTOCOL_OWNER is required on production chains");
        }
        owner = vm.envOr("PROTOCOL_OWNER", deployer);
        treasury = vm.envOr("TREASURY", owner);
        require(owner != address(0) && treasury != address(0), "Deploy: zero owner or treasury");
        console2.log("Final owner:             ", owner);
        console2.log("Treasury:                ", treasury);
    }

    /// @dev Applies the env configuration to a hook the deployer still owns.
    function _configureHook(PredictionMarketHook hook, address treasury) internal {
        if (treasury != hook.s_treasury()) hook.setTreasury(treasury);

        uint256 protocolFeeBps = vm.envOr("PROTOCOL_FEE_BPS", hook.s_protocolFeeBps());
        uint256 lpFeeBps = vm.envOr("LP_FEE_BPS", hook.s_lpFeeBps());
        hook.setFees(protocolFeeBps, lpFeeBps);

        uint256 creationFee = vm.envOr("MARKET_CREATION_FEE_WEI", uint256(0));
        if (creationFee > 0) hook.setMarketCreationFee(creationFee);

        uint256 maxBond = vm.envOr("MAX_REQUIRED_BOND", uint256(0));
        if (maxBond > 0) hook.setMaxRequiredBond(maxBond);

        address erc8004 = vm.envOr("ERC8004_IDENTITY_REGISTRY", address(0));
        if (erc8004 != address(0)) hook.setErc8004IdentityRegistry(erc8004);

        console2.log("Protocol fee (bps):      ", protocolFeeBps);
        console2.log("LP fee (bps):            ", lpFeeBps);
        console2.log("Creation fee (wei):      ", creationFee);
        console2.log("Max required bond:       ", maxBond);
        console2.log("ERC-8004 identity:       ", erc8004);
    }
}
