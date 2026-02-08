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
import {IERC8004AgentIdentity} from "../src/interfaces/erc8004/IERC8004AgentIdentity.sol";
import {IERC8004AgentValidation} from "../src/interfaces/erc8004/IERC8004AgentValidation.sol";
import {IPhalaVerifier} from "../src/interfaces/IPhalaVerifier.sol";
import {OptimisticOracleV3Interface} from "../src/interfaces/uma/OptimisticOracleV3Interface.sol";

// Mocks for infrastructure not available on the target chain
import {DeployableMockOOV3} from "../src/mocks/DeployableMockOOV3.sol";
import {MockENSRegistry} from "../test/mocks/MockENSRegistry.sol";
import {MockPhalaVerifier} from "../test/mocks/MockPhalaVerifier.sol";
import {MockERC20} from "../test/mocks/MockERC20.sol";

// ERC-8004 registries
import {AgentIdentityRegistry} from "../src/erc8004/AgentIdentityRegistry.sol";
import {AgentValidationRegistry} from "../src/erc8004/AgentValidationRegistry.sol";
import {AgentReputationRegistry} from "../src/erc8004/AgentReputationRegistry.sol";

/// @title Deploy
/// @author CLAWLOGIC Team
/// @notice Full-stack Foundry deployment script for the CLAWLOGIC protocol.
///
/// @dev Deploys the complete protocol stack in dependency order:
///
///      **Infrastructure (deployed as mocks if not provided):**
///      1. UMA OOV3              -- Mock if UMA_OOV3 not set
///      2. Bond Currency          -- Mock ERC-20 if UMA_BOND_CURRENCY not set
///      3. ENS Registry           -- Mock if ENS_REGISTRY not set (for subdomain demo)
///      4. Phala Verifier         -- Mock if PHALA_VERIFIER not set (for TEE demo)
///
///      **ERC-8004 Identity Layer:**
///      5. AgentIdentityRegistry  -- ERC-721 agent identity tokens
///      6. AgentValidationRegistry -- TEE/Stake/zkML proof validation
///      7. AgentReputationRegistry -- Assertion accuracy tracking
///
///      **Core Protocol:**
///      8. AgentRegistry          -- Silicon Gate (with ENS + Validation)
///      9. PredictionMarketHook   -- V4 hook via CREATE2 (flag-bit address)
///
///      Required environment variables:
///        PRIVATE_KEY               -- EOA that broadcasts the transactions
///        V4_POOL_MANAGER           -- Uniswap V4 PoolManager address
///
///      Optional (auto-deploys mocks if missing):
///        UMA_OOV3                  -- UMA Optimistic Oracle V3 address
///        UMA_BOND_CURRENCY         -- ERC-20 bond currency address
///        ENS_REGISTRY              -- ENS Registry address
///        PHALA_VERIFIER            -- Phala zkDCAP verifier address
///        VALIDATION_REGISTRY       -- Pre-deployed AgentValidationRegistry
///        DEFAULT_LIVENESS          -- UMA liveness in seconds (default: 120)
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
    address constant CREATE2_DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C;

    /// @dev Default liveness window for UMA assertions (seconds). 120 s = 2 minutes for demo.
    uint64 constant DEFAULT_LIVENESS = 120;

    // -------------------------------------------------------------------------
    // Script entry point
    // -------------------------------------------------------------------------

    function run() external {
        // ── 1. Read environment variables ───────────────────────────────────
        uint256 deployerPk = vm.envUint("PRIVATE_KEY");
        address poolManager = vm.envAddress("V4_POOL_MANAGER");
        uint64 liveness = uint64(vm.envOr("DEFAULT_LIVENESS", uint256(DEFAULT_LIVENESS)));

        address deployer = vm.addr(deployerPk);

        console2.log("================================================");
        console2.log("  CLAWLOGIC Full-Stack Deployment");
        console2.log("================================================");
        console2.log("Deployer:        ", deployer);
        console2.log("PoolManager:     ", poolManager);
        console2.log("Liveness (s):    ", uint256(liveness));
        console2.log("");

        // ── 2. Deploy infrastructure mocks (if not provided) ─────────────
        vm.startBroadcast(deployerPk);

        // 2a. UMA OOV3
        address umaOov3 = vm.envOr("UMA_OOV3", address(0));
        if (umaOov3 == address(0)) {
            DeployableMockOOV3 mockOO = new DeployableMockOOV3();
            umaOov3 = address(mockOO);
            console2.log("[mock] MockOOV3:          ", umaOov3);
        } else {
            console2.log("[ext]  UMA OOV3:          ", umaOov3);
        }

        // 2b. Bond currency
        address bondCurrency = vm.envOr("UMA_BOND_CURRENCY", address(0));
        if (bondCurrency == address(0)) {
            MockERC20 mockCurrency = new MockERC20("Mock Bond WETH", "mbWETH");
            bondCurrency = address(mockCurrency);
            console2.log("[mock] BondCurrency:      ", bondCurrency);
        } else {
            console2.log("[ext]  BondCurrency:      ", bondCurrency);
        }

        // 2c. ENS Registry
        address ensRegistryAddr = vm.envOr("ENS_REGISTRY", address(0));
        if (ensRegistryAddr == address(0)) {
            MockENSRegistry mockENS = new MockENSRegistry();
            ensRegistryAddr = address(mockENS);
            console2.log("[mock] ENSRegistry:       ", ensRegistryAddr);
        } else {
            console2.log("[ext]  ENSRegistry:       ", ensRegistryAddr);
        }

        // 2d. Phala TEE Verifier
        address phalaVerifierAddr = vm.envOr("PHALA_VERIFIER", address(0));
        if (phalaVerifierAddr == address(0)) {
            // Deploy mock with defaultReturn=true (all attestations pass for demo)
            MockPhalaVerifier mockVerifier = new MockPhalaVerifier(true);
            phalaVerifierAddr = address(mockVerifier);
            console2.log("[mock] PhalaVerifier:     ", phalaVerifierAddr);
        } else {
            console2.log("[ext]  PhalaVerifier:     ", phalaVerifierAddr);
        }

        console2.log("");

        // ── 3. Deploy ERC-8004 Identity Layer ────────────────────────────
        console2.log("--- ERC-8004 Identity Layer ---");

        // 3a. AgentIdentityRegistry (ERC-721 agent IDs)
        AgentIdentityRegistry identityRegistry = new AgentIdentityRegistry(deployer);
        console2.log("IdentityRegistry:        ", address(identityRegistry));

        // 3b. AgentValidationRegistry (TEE/Stake/zkML proofs)
        address validationRegistryAddr = vm.envOr("VALIDATION_REGISTRY", address(0));
        AgentValidationRegistry validationRegistry;
        if (validationRegistryAddr == address(0)) {
            validationRegistry = new AgentValidationRegistry(
                deployer,
                IERC8004AgentIdentity(address(identityRegistry)),
                IPhalaVerifier(phalaVerifierAddr)
            );
            validationRegistryAddr = address(validationRegistry);
            console2.log("ValidationRegistry:      ", validationRegistryAddr);
        } else {
            console2.log("[ext] ValidationRegistry:", validationRegistryAddr);
        }

        console2.log("");

        // ── 4. Deploy AgentRegistry (Silicon Gate) ───────────────────────
        console2.log("--- Core Protocol ---");

        AgentRegistry registry = new AgentRegistry(
            IENS(ensRegistryAddr),
            IERC8004AgentValidation(validationRegistryAddr)
        );
        console2.log("AgentRegistry:           ", address(registry));

        // ── 5. Mine a CREATE2 salt for the PredictionMarketHook ─────────
        //
        // The hook address must have BEFORE_SWAP_FLAG (bit 7) and
        // BEFORE_ADD_LIQUIDITY_FLAG (bit 11) set in its lowest 14 bits.
        //
        // NOTE: Salt mining MUST happen inside the broadcast block so that
        // the MockOOV3 contract actually exists when HookMiner simulates the
        // PredictionMarketHook constructor (which calls _oo.defaultIdentifier()).
        uint160 flags = uint160(
            Hooks.BEFORE_SWAP_FLAG | Hooks.BEFORE_ADD_LIQUIDITY_FLAG
        );

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

        console2.log("Mined hook address:      ", hookAddress);
        console2.log("Salt:                    ", vm.toString(salt));
        console2.log("");

        // ── 6. Deploy PredictionMarketHook via CREATE2 ──────────────────

        PredictionMarketHook hook = new PredictionMarketHook{salt: salt}(
            IPoolManager(poolManager),
            IAgentRegistry(address(registry)),
            OptimisticOracleV3Interface(umaOov3),
            IERC20(bondCurrency),
            liveness
        );

        // 6b. Deploy AgentReputationRegistry (needs hook address as recorder)
        AgentReputationRegistry reputationRegistry = new AgentReputationRegistry(
            deployer,
            IERC8004AgentIdentity(address(identityRegistry)),
            address(hook) // PredictionMarketHook is the authorized recorder
        );
        console2.log("ReputationRegistry:      ", address(reputationRegistry));

        vm.stopBroadcast();

        // Validate the deployed address matches the mined address.
        require(address(hook) == hookAddress, "Deploy: hook address mismatch after CREATE2 deploy");

        console2.log("PredictionMarketHook:    ", address(hook));
        console2.log("");
        console2.log("================================================");
        console2.log("  Deployment Complete");
        console2.log("================================================");
        console2.log("");

        // ── 7. Write deployment addresses to JSON ───────────────────────
        _writeDeploymentJson(
            deployer,
            address(registry),
            address(hook),
            poolManager,
            umaOov3,
            bondCurrency,
            ensRegistryAddr,
            address(identityRegistry),
            validationRegistryAddr,
            address(reputationRegistry),
            phalaVerifierAddr
        );
    }

    // -------------------------------------------------------------------------
    // Internal helpers
    // -------------------------------------------------------------------------

    /// @dev Serializes all deployment addresses to JSON.
    function _writeDeploymentJson(
        address deployer,
        address registry,
        address hook,
        address poolManager,
        address oov3,
        address bondCurrency,
        address ensRegistry,
        address identityRegistry,
        address validationRegistry,
        address reputationRegistry,
        address phalaVerifier
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
        vm.serializeAddress(contracts, "BondCurrency", bondCurrency);
        vm.serializeAddress(contracts, "ENSRegistry", ensRegistry);
        vm.serializeAddress(contracts, "AgentIdentityRegistry", identityRegistry);
        vm.serializeAddress(contracts, "AgentValidationRegistry", validationRegistry);
        vm.serializeAddress(contracts, "AgentReputationRegistry", reputationRegistry);
        string memory contractsJson = vm.serializeAddress(contracts, "PhalaVerifier", phalaVerifier);

        // Finalize the top-level JSON with the nested contracts.
        string memory finalJson = vm.serializeString(
            json,
            "contracts",
            contractsJson
        );

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
