// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Script.sol";
import "forge-std/console2.sol";

import {Hooks} from "v4-core/src/libraries/Hooks.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {HookMiner} from "v4-periphery/src/utils/HookMiner.sol";

import {AgentRegistry} from "../src/AgentRegistry.sol";
import {PredictionMarketHook} from "../src/PredictionMarketHook.sol";
import {IAgentRegistry} from "../src/interfaces/IAgentRegistry.sol";
import {OptimisticOracleV3Interface} from "../src/interfaces/uma/OptimisticOracleV3Interface.sol";

/// @title Deploy
/// @author $CLAWLOGIC Team
/// @notice Foundry deployment script for the $CLAWLOGIC protocol.
///
/// @dev Deploys:
///      1. AgentRegistry          -- the Silicon Gate identity layer
///      2. PredictionMarketHook   -- the V4 hook + prediction market + UMA OOV3 integration
///
///      The PredictionMarketHook MUST live at an address whose lowest 14 bits encode the
///      enabled hook permissions (BEFORE_SWAP_FLAG | BEFORE_ADD_LIQUIDITY_FLAG). This script
///      uses the deterministic CREATE2 deployer (0x4e59b44847b379578588920cA78FbF26c0B4956C)
///      together with the HookMiner library from v4-periphery to find a salt that produces a
///      valid hook address.
///
///      Required environment variables:
///        DEPLOYER_PRIVATE_KEY        -- EOA that broadcasts the transactions
///        V4_POOL_MANAGER             -- Uniswap V4 PoolManager address on the target chain
///        UMA_OOV3                    -- UMA Optimistic Oracle V3 address on the target chain
///        UMA_BOND_CURRENCY           -- ERC-20 used as UMA bond currency (e.g. WETH)
///
///      Optional:
///        DEFAULT_LIVENESS            -- UMA assertion liveness in seconds (default: 120)
///
///      Usage:
///        source .env && forge script script/Deploy.s.sol \
///          --rpc-url $ARBITRUM_SEPOLIA_RPC_URL \
///          --broadcast --verify \
///          -vvvv
contract DeployScript is Script {
    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    /// @dev The deterministic CREATE2 deployer used by Foundry and most EVM chains.
    ///      See https://github.com/Arachnid/deterministic-deployment-proxy
    address constant CREATE2_DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C;

    /// @dev Default liveness window for UMA assertions (seconds). 120 s = 2 minutes for demo.
    uint64 constant DEFAULT_LIVENESS = 120;

    // -------------------------------------------------------------------------
    // Script entry point
    // -------------------------------------------------------------------------

    function run() external {
        // ── 1. Read environment variables ───────────────────────────────────
        uint256 deployerPk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address poolManager = vm.envAddress("V4_POOL_MANAGER");
        address umaOov3 = vm.envAddress("UMA_OOV3");
        address bondCurrency = vm.envAddress("UMA_BOND_CURRENCY");
        uint64 liveness = uint64(vm.envOr("DEFAULT_LIVENESS", uint256(DEFAULT_LIVENESS)));

        address deployer = vm.addr(deployerPk);

        console2.log("=== $CLAWLOGIC Deployment ===");
        console2.log("Deployer:        ", deployer);
        console2.log("PoolManager:     ", poolManager);
        console2.log("UMA OOV3:        ", umaOov3);
        console2.log("Bond currency:   ", bondCurrency);
        console2.log("Liveness (s):    ", uint256(liveness));
        console2.log("");

        // ── 2. Deploy AgentRegistry ─────────────────────────────────────────
        vm.startBroadcast(deployerPk);

        AgentRegistry registry = new AgentRegistry();
        console2.log("AgentRegistry:   ", address(registry));

        vm.stopBroadcast();

        // ── 3. Mine a CREATE2 salt for the PredictionMarketHook ─────────────
        //
        // The hook address must have BEFORE_SWAP_FLAG (bit 7) and
        // BEFORE_ADD_LIQUIDITY_FLAG (bit 11) set in its lowest 14 bits.
        uint160 flags = uint160(Hooks.BEFORE_SWAP_FLAG | Hooks.BEFORE_ADD_LIQUIDITY_FLAG);

        bytes memory constructorArgs = abi.encode(
            IPoolManager(poolManager),
            IAgentRegistry(address(registry)),
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

        console2.log("Mined hook address:", hookAddress);
        console2.log("Salt:              ", vm.toString(salt));
        console2.log("");

        // ── 4. Deploy PredictionMarketHook via CREATE2 ──────────────────────
        vm.startBroadcast(deployerPk);

        PredictionMarketHook hook = new PredictionMarketHook{salt: salt}(
            IPoolManager(poolManager),
            IAgentRegistry(address(registry)),
            OptimisticOracleV3Interface(umaOov3),
            IERC20(bondCurrency),
            liveness
        );

        vm.stopBroadcast();

        // Validate the deployed address matches the mined address.
        require(address(hook) == hookAddress, "Deploy: hook address mismatch after CREATE2 deploy");

        console2.log("PredictionMarketHook:", address(hook));
        console2.log("");
        console2.log("=== Deployment Complete ===");
        console2.log("");

        // ── 5. Write deployment addresses to JSON ───────────────────────────
        _writeDeploymentJson(deployer, address(registry), address(hook), poolManager);
    }

    // -------------------------------------------------------------------------
    // Internal helpers
    // -------------------------------------------------------------------------

    /// @dev Serializes deployment addresses to `deployments/arbitrum-sepolia.json`.
    function _writeDeploymentJson(
        address deployer,
        address registry,
        address hook,
        address poolManager
    ) internal {
        string memory json = "deployment";

        vm.serializeUint(json, "chainId", block.chainid);
        vm.serializeAddress(json, "deployer", deployer);
        vm.serializeUint(json, "blockNumber", block.number);
        vm.serializeString(json, "deployedAt", vm.toString(block.timestamp));

        // Nested contracts object.
        string memory contracts = "contracts";
        vm.serializeAddress(contracts, "AgentRegistry", registry);
        vm.serializeAddress(contracts, "PredictionMarketHook", hook);
        string memory contractsJson = vm.serializeAddress(contracts, "PoolManager", poolManager);

        // Finalize the top-level JSON with the nested contracts.
        string memory finalJson = vm.serializeString(json, "contracts", contractsJson);

        // Determine output path based on chain ID.
        string memory fileName;
        if (block.chainid == 421_614) {
            fileName = "arbitrum-sepolia.json";
        } else {
            fileName = string.concat("chain-", vm.toString(block.chainid), ".json");
        }

        string memory outPath = string.concat("deployments/", fileName);
        vm.writeJson(finalJson, outPath);
        console2.log("Deployment JSON written to:", outPath);
    }
}
