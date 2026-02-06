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
import {IENS} from "../src/interfaces/IENS.sol";
import {IERC8004AgentValidation} from "../src/interfaces/erc8004/IERC8004AgentValidation.sol";
import {OptimisticOracleV3Interface} from "../src/interfaces/uma/OptimisticOracleV3Interface.sol";

import {DeployableMockOOV3} from "../src/mocks/DeployableMockOOV3.sol";
import {MockERC20} from "../test/mocks/MockERC20.sol";

/// @title DeployArc
/// @author $CLAWLOGIC Team
/// @notice Foundry deployment script for the $CLAWLOGIC protocol on Circle Arc testnet.
///
/// @dev This script deploys the full protocol stack to Circle's Arc testnet, where USDC
///      is the native gas token (used via `msg.value`). Since Uniswap V4 and UMA OOV3 are
///      NOT natively deployed on Arc, this script:
///
///      1. Deploys a **MockERC20** as the UMA bond currency (stand-in for wrapped USDC).
///      2. Deploys a **DeployableMockOOV3** as a lightweight UMA oracle mock.
///      3. Deploys the **AgentRegistry** (same as Arbitrum Sepolia deployment).
///      4. Deploys the **PredictionMarketHook** via CREATE2 (same contract, but uses a
///         mock PoolManager address since V4 is unavailable on Arc).
///
///      On Arc, `msg.value` sends native USDC (18 decimals), so the existing
///      `mintOutcomeTokens()` payable function works directly -- collateral is USDC
///      instead of ETH. No contract modifications are needed.
///
///      Required environment variables:
///        DEPLOYER_PRIVATE_KEY        -- EOA that broadcasts the transactions
///
///      Optional:
///        ARC_MOCK_POOL_MANAGER       -- Pre-deployed mock PoolManager address (if reusing)
///        ARC_MOCK_OOV3               -- Pre-deployed mock OOV3 address (if reusing)
///        ARC_BOND_CURRENCY           -- Pre-deployed bond currency address (if reusing)
///        DEFAULT_LIVENESS            -- UMA assertion liveness in seconds (default: 120)
///
///      Usage:
///        source .env && forge script script/DeployArc.s.sol \
///          --rpc-url $ARC_TESTNET_RPC_URL \
///          --broadcast \
///          -vvvv
contract DeployArcScript is Script {
    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    /// @dev The deterministic CREATE2 deployer used by Foundry and most EVM chains.
    address constant CREATE2_DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C;

    /// @dev Default liveness window for UMA assertions (seconds). 120 s = 2 minutes for demo.
    uint64 constant DEFAULT_LIVENESS = 120;

    /// @dev Circle Arc testnet chain ID.
    uint256 constant ARC_TESTNET_CHAIN_ID = 5_042_002;

    // -------------------------------------------------------------------------
    // Script entry point
    // -------------------------------------------------------------------------

    function run() external {
        // ── 1. Read environment variables ───────────────────────────────────
        uint256 deployerPk = vm.envUint("PRIVATE_KEY");
        uint64 liveness = uint64(vm.envOr("DEFAULT_LIVENESS", uint256(DEFAULT_LIVENESS)));

        address deployer = vm.addr(deployerPk);

        console2.log("=== $CLAWLOGIC Arc Testnet Deployment ===");
        console2.log("Deployer:        ", deployer);
        console2.log("Chain ID:        ", block.chainid);
        console2.log("Liveness (s):    ", uint256(liveness));
        console2.log("");

        // ── 2. Deploy mock infrastructure ──────────────────────────────────
        //
        // V4 PoolManager and UMA OOV3 are not available on Arc testnet,
        // so we deploy lightweight mocks.
        vm.startBroadcast(deployerPk);

        // 2a. Mock bond currency (stand-in for wrapped USDC)
        address bondCurrency = vm.envOr("ARC_BOND_CURRENCY", address(0));
        if (bondCurrency == address(0)) {
            MockERC20 mockCurrency = new MockERC20("Mock Bond USDC", "mbUSDC");
            bondCurrency = address(mockCurrency);
            console2.log("MockERC20 (bond):", bondCurrency);
        } else {
            console2.log("Reusing bond currency:", bondCurrency);
        }

        // 2b. Mock UMA OOV3
        address umaOov3 = vm.envOr("ARC_MOCK_OOV3", address(0));
        if (umaOov3 == address(0)) {
            DeployableMockOOV3 mockOO = new DeployableMockOOV3();
            umaOov3 = address(mockOO);
            console2.log("MockOOV3:        ", umaOov3);
        } else {
            console2.log("Reusing MockOOV3:", umaOov3);
        }

        // 2c. Mock PoolManager
        // We use a dummy address for the PoolManager. The PredictionMarketHook's
        // BaseHook constructor stores it but it is only invoked during V4 swap
        // callbacks, which will never happen on Arc (no real V4 routing).
        // We deploy a minimal contract so the address has code (some V4 checks
        // require the PoolManager to be a contract).
        address poolManager = vm.envOr("ARC_MOCK_POOL_MANAGER", address(0));
        if (poolManager == address(0)) {
            // Deploy a minimal contract as the mock PoolManager.
            // We use CREATE to get a simple contract at a new address.
            bytes memory minimalBytecode = hex"600160005260206000f3"; // returns 0x01
            address mockPM;
            assembly {
                mockPM := create(0, add(minimalBytecode, 0x20), mload(minimalBytecode))
            }
            require(mockPM != address(0), "Mock PoolManager deploy failed");
            poolManager = mockPM;
            console2.log("MockPoolManager: ", poolManager);
        } else {
            console2.log("Reusing PM:      ", poolManager);
        }

        vm.stopBroadcast();

        // ── 3. Deploy AgentRegistry ─────────────────────────────────────────
        vm.startBroadcast(deployerPk);

        AgentRegistry registry = new AgentRegistry(IENS(address(0)), IERC8004AgentValidation(address(0)));
        console2.log("AgentRegistry:   ", address(registry));

        vm.stopBroadcast();

        // ── 4. Mine CREATE2 salt for PredictionMarketHook ───────────────────
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

        // ── 5. Deploy PredictionMarketHook via CREATE2 ──────────────────────
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
        require(address(hook) == hookAddress, "DeployArc: hook address mismatch after CREATE2 deploy");

        console2.log("PredictionMarketHook:", address(hook));
        console2.log("");
        console2.log("=== Arc Testnet Deployment Complete ===");
        console2.log("");
        console2.log("NOTE: On Arc, USDC is the native gas token.");
        console2.log("      mintOutcomeTokens() accepts native USDC via msg.value (18 decimals).");
        console2.log("      V4 pool swaps are NOT functional (mock PoolManager).");
        console2.log("      UMA assertions use a mock oracle (settleAssertion resolves instantly).");
        console2.log("");

        // ── 6. Write deployment addresses to JSON ───────────────────────────
        _writeDeploymentJson(
            deployer,
            address(registry),
            address(hook),
            poolManager,
            umaOov3,
            bondCurrency
        );
    }

    // -------------------------------------------------------------------------
    // Internal helpers
    // -------------------------------------------------------------------------

    /// @dev Serializes deployment addresses to `deployments/arc-testnet.json`.
    function _writeDeploymentJson(
        address deployer,
        address registry,
        address hook,
        address poolManager,
        address oov3,
        address bondCurrency
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
        vm.serializeAddress(contracts, "PoolManager", poolManager);
        vm.serializeAddress(contracts, "OptimisticOracleV3", oov3);
        string memory contractsJson = vm.serializeAddress(contracts, "BondCurrency", bondCurrency);

        // Finalize the top-level JSON with the nested contracts.
        string memory finalJson = vm.serializeString(json, "contracts", contractsJson);

        string memory outPath = "deployments/arc-testnet.json";
        vm.writeJson(finalJson, outPath);
        console2.log("Deployment JSON written to:", outPath);
    }
}
