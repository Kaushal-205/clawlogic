// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Script.sol";
import "forge-std/console2.sol";

import {Hooks} from "v4-core/src/libraries/Hooks.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {HookMiner} from "v4-periphery/src/utils/HookMiner.sol";

import {PredictionMarketHook} from "../src/PredictionMarketHook.sol";
import {IAgentRegistry} from "../src/interfaces/IAgentRegistry.sol";
import {OptimisticOracleV3Interface} from "../src/interfaces/uma/OptimisticOracleV3Interface.sol";

/// @title DeployHookOnly
/// @notice Deploys only the PredictionMarketHook using existing infrastructure
contract DeployHookOnlyScript is Script {
    address constant CREATE2_DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C;

    function run() external {
        uint256 deployerPk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPk);

        // Read existing deployment addresses
        address poolManager = vm.envAddress("V4_POOL_MANAGER");
        uint64 liveness = uint64(vm.envOr("DEFAULT_LIVENESS", uint256(120)));

        // Load from deployments/arbitrum-sepolia.json
        string memory root = vm.projectRoot();
        string memory path = string.concat(root, "/deployments/arbitrum-sepolia.json");
        string memory json = vm.readFile(path);

        address registry = vm.parseJsonAddress(json, ".contracts.AgentRegistry");
        address umaOov3 = vm.parseJsonAddress(json, ".contracts.OptimisticOracleV3");
        address bondCurrency = vm.parseJsonAddress(json, ".contracts.BondCurrency");

        console2.log("================================================");
        console2.log("  CLAWLOGIC Hook Redeployment");
        console2.log("================================================");
        console2.log("Deployer:        ", deployer);
        console2.log("PoolManager:     ", poolManager);
        console2.log("AgentRegistry:   ", registry);
        console2.log("UMA OOV3:        ", umaOov3);
        console2.log("BondCurrency:    ", bondCurrency);
        console2.log("Liveness (s):    ", uint256(liveness));
        console2.log("");

        vm.startBroadcast(deployerPk);

        // Mine CREATE2 salt for hook address
        uint160 flags = uint160(
            Hooks.BEFORE_SWAP_FLAG | Hooks.BEFORE_ADD_LIQUIDITY_FLAG
        );

        bytes memory constructorArgs = abi.encode(
            IPoolManager(poolManager),
            IAgentRegistry(registry),
            OptimisticOracleV3Interface(umaOov3),
            IERC20(bondCurrency),
            liveness
        );

        console2.log("Mining CREATE2 salt for hook address flags...");

        (address hookAddress, bytes32 salt) = HookMiner.find(
            CREATE2_DEPLOYER,
            flags,
            type(PredictionMarketHook).creationCode,
            constructorArgs
        );

        console2.log("Mined hook address:      ", hookAddress);
        console2.log("Salt:                    ", vm.toString(salt));
        console2.log("");

        // Deploy via CREATE2
        PredictionMarketHook hook = new PredictionMarketHook{salt: salt}(
            IPoolManager(poolManager),
            IAgentRegistry(registry),
            OptimisticOracleV3Interface(umaOov3),
            IERC20(bondCurrency),
            liveness
        );

        vm.stopBroadcast();

        require(address(hook) == hookAddress, "DeployHookOnly: address mismatch");

        console2.log("PredictionMarketHook:    ", address(hook));
        console2.log("");
        console2.log("================================================");
        console2.log("  Hook Deployment Complete");
        console2.log("================================================");
        console2.log("");

        // Update deployments JSON
        _updateDeploymentJson(address(hook));
    }

    function _updateDeploymentJson(address hook) internal {
        string memory root = vm.projectRoot();
        string memory path = string.concat(root, "/deployments/arbitrum-sepolia.json");
        string memory json = vm.readFile(path);

        // Parse existing data
        uint256 chainId = vm.parseJsonUint(json, ".chainId");
        address deployer = vm.parseJsonAddress(json, ".deployer");

        // Read all existing contracts
        address registry = vm.parseJsonAddress(json, ".contracts.AgentRegistry");
        address poolManager = vm.parseJsonAddress(json, ".contracts.PoolManager");
        address oov3 = vm.parseJsonAddress(json, ".contracts.OptimisticOracleV3");
        address bondCurrency = vm.parseJsonAddress(json, ".contracts.BondCurrency");
        address ensRegistry = vm.parseJsonAddress(json, ".contracts.ENSRegistry");
        address identityRegistry = vm.parseJsonAddress(json, ".contracts.AgentIdentityRegistry");
        address validationRegistry = vm.parseJsonAddress(json, ".contracts.AgentValidationRegistry");
        address reputationRegistry = vm.parseJsonAddress(json, ".contracts.AgentReputationRegistry");
        address phalaVerifier = vm.parseJsonAddress(json, ".contracts.PhalaVerifier");
        address ensPremiumRegistrar = address(0);
        if (vm.keyExistsJson(json, ".contracts.ENSPremiumRegistrar")) {
            ensPremiumRegistrar = vm.parseJsonAddress(json, ".contracts.ENSPremiumRegistrar");
        }

        // Rebuild JSON with new hook address
        string memory newJson = "deployment";
        vm.serializeUint(newJson, "chainId", chainId);
        vm.serializeAddress(newJson, "deployer", deployer);
        vm.serializeUint(newJson, "blockNumber", block.number);
        vm.serializeString(newJson, "deployedAt", vm.toString(block.timestamp));

        string memory contracts = "contracts";
        vm.serializeAddress(contracts, "AgentRegistry", registry);
        vm.serializeAddress(contracts, "PredictionMarketHook", hook); // Updated!
        vm.serializeAddress(contracts, "PoolManager", poolManager);
        vm.serializeAddress(contracts, "OptimisticOracleV3", oov3);
        vm.serializeAddress(contracts, "BondCurrency", bondCurrency);
        vm.serializeAddress(contracts, "ENSRegistry", ensRegistry);
        vm.serializeAddress(contracts, "AgentIdentityRegistry", identityRegistry);
        vm.serializeAddress(contracts, "AgentValidationRegistry", validationRegistry);
        vm.serializeAddress(contracts, "AgentReputationRegistry", reputationRegistry);
        vm.serializeAddress(contracts, "PhalaVerifier", phalaVerifier);
        string memory contractsJson = vm.serializeAddress(contracts, "ENSPremiumRegistrar", ensPremiumRegistrar);

        string memory finalJson = vm.serializeString(newJson, "contracts", contractsJson);

        vm.writeJson(finalJson, path);
        console2.log("Updated deployment JSON at:", path);
    }
}
