// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Script.sol";
import "forge-std/console2.sol";

import {Hooks} from "v4-core/src/libraries/Hooks.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {HookMiner} from "v4-periphery/src/utils/HookMiner.sol";

import {PredictionMarketHook} from "../src/PredictionMarketHook.sol";
import {IAgentRegistry} from "../src/interfaces/IAgentRegistry.sol";
import {OptimisticOracleV3Interface} from "../src/interfaces/uma/OptimisticOracleV3Interface.sol";
import {AgentReputationRegistry} from "../src/erc8004/AgentReputationRegistry.sol";

import {HookConfigScript} from "./HookConfig.sol";

/// @title DeployHookOnly
/// @notice Redeploys only the PredictionMarketHook against the registry, oracle and bond
///         currency recorded in this chain's deployment JSON, and leaves it configured exactly
///         like `Deploy.s.sol` would (treasury, fees, bond cap, ERC-8004 registry, ownership).
/// @dev Markets on the previous hook are not migrated. If the deployer no longer owns the
///      AgentReputationRegistry, its owner must call `setRecorder(newHook)` afterwards.
///      Environment: PRIVATE_KEY, V4_POOL_MANAGER, DEFAULT_LIVENESS, plus everything read by
///      `HookConfigScript`.
contract DeployHookOnlyScript is HookConfigScript {
    address constant CREATE2_DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C;

    /// @dev UMA's standard liveness; the minimum on production chains.
    uint64 constant PRODUCTION_LIVENESS = 7200;

    function run() external {
        uint256 deployerPk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPk);
        bool production = _isProduction();

        address poolManager = vm.envAddress("V4_POOL_MANAGER");
        uint64 liveness =
            uint64(vm.envOr("DEFAULT_LIVENESS", uint256(production ? PRODUCTION_LIVENESS : 120)));
        if (production) {
            require(liveness >= PRODUCTION_LIVENESS, "DeployHookOnly: DEFAULT_LIVENESS below 7200s on production");
        }

        string memory path = _deploymentPath();
        string memory json = vm.readFile(path);
        address registry = vm.parseJsonAddress(json, ".contracts.AgentRegistry");
        address umaOov3 = vm.parseJsonAddress(json, ".contracts.OptimisticOracleV3");
        address bondCurrency = vm.parseJsonAddress(json, ".contracts.BondCurrency");
        address reputationRegistry = vm.parseJsonAddress(json, ".contracts.AgentReputationRegistry");

        console2.log("================================================");
        console2.log("  CLAWLOGIC Hook Redeployment");
        console2.log("================================================");
        console2.log("Deployer:        ", deployer);
        console2.log("PoolManager:     ", poolManager);
        console2.log("AgentRegistry:   ", registry);
        console2.log("UMA OOV3:        ", umaOov3);
        console2.log("BondCurrency:    ", bondCurrency);
        console2.log("Liveness (s):    ", uint256(liveness));
        (address finalOwner, address treasury) = _readAdmin(deployer, production);
        console2.log("");

        bytes memory constructorArgs = abi.encode(
            IPoolManager(poolManager),
            IAgentRegistry(registry),
            OptimisticOracleV3Interface(umaOov3),
            IERC20(bondCurrency),
            liveness,
            deployer // initial owner; configured and handed over below
        );
        (address hookAddress, bytes32 salt) = HookMiner.find(
            CREATE2_DEPLOYER,
            uint160(Hooks.BEFORE_SWAP_FLAG | Hooks.BEFORE_ADD_LIQUIDITY_FLAG),
            type(PredictionMarketHook).creationCode,
            constructorArgs
        );
        console2.log("Mined hook address:      ", hookAddress);

        vm.startBroadcast(deployerPk);

        PredictionMarketHook hook = new PredictionMarketHook{salt: salt}(
            IPoolManager(poolManager),
            IAgentRegistry(registry),
            OptimisticOracleV3Interface(umaOov3),
            IERC20(bondCurrency),
            liveness,
            deployer
        );
        require(address(hook) == hookAddress, "DeployHookOnly: address mismatch");

        _configureHook(hook, treasury);

        if (reputationRegistry != address(0) && Ownable(reputationRegistry).owner() == deployer) {
            AgentReputationRegistry(reputationRegistry).setRecorder(address(hook));
            console2.log("Reputation recorder -> new hook");
        } else {
            console2.log("ACTION: reputation registry owner must call setRecorder(newHook)");
        }

        if (finalOwner != deployer) {
            hook.transferOwnership(finalOwner);
            console2.log("Ownership -> (pending acceptOwnership)", finalOwner);
        }

        vm.stopBroadcast();

        console2.log("PredictionMarketHook:    ", address(hook));
        vm.writeJson(vm.toString(address(hook)), path, ".contracts.PredictionMarketHook");
        console2.log("Updated deployment JSON at:", path);
    }

    /// @dev Same file naming as `Deploy.s.sol`.
    function _deploymentPath() internal view returns (string memory) {
        string memory fileName;
        if (block.chainid == 421_614) {
            fileName = "arbitrum-sepolia.json";
        } else if (block.chainid == 42_161) {
            fileName = "arbitrum-one.json";
        } else {
            fileName = string.concat("chain-", vm.toString(block.chainid), ".json");
        }
        return string.concat(vm.projectRoot(), "/deployments/", fileName);
    }
}
