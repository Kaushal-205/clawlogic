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
///                                     (DEPLOYER_PRIVATE_KEY is accepted as a fallback)
///        V4_POOL_MANAGER           -- Uniswap V4 PoolManager address
///
///      Production chains (Arbitrum One, or PRODUCTION=true) never deploy mocks:
///        UMA_OOV3 and UMA_BOND_CURRENCY are required, DEFAULT_LIVENESS must be
///        >= 7200 (the default there), and an unset ENS_REGISTRY / PHALA_VERIFIER
///        disables that feature instead of deploying a permissive mock.
///
///      Optional on testnets (auto-deploys mocks if missing):
///        UMA_OOV3                  -- UMA Optimistic Oracle V3 address
///        UMA_BOND_CURRENCY         -- ERC-20 bond currency address
///        ENS_REGISTRY              -- ENS Registry address
///        PHALA_VERIFIER            -- Phala zkDCAP verifier address
///        VALIDATION_REGISTRY       -- Pre-deployed AgentValidationRegistry
///        DEFAULT_LIVENESS          -- UMA liveness in seconds (default: 120)
///
///      Revenue/admin (optional): PROTOCOL_OWNER, TREASURY, PROTOCOL_FEE_BPS, LP_FEE_BPS,
///        MARKET_CREATION_FEE_WEI, ERC8004_IDENTITY_REGISTRY -- see `_configureHook`.
///
///      Usage (verification uses the Etherscan API v2 config in foundry.toml):
///        source .env && forge script script/Deploy.s.sol \
///          --rpc-url arbitrum_one \
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

    /// @dev Default and minimum liveness on production chains (UMA's standard 2 hours).
    ///      A short window gives disputers no realistic chance to react.
    uint64 constant PRODUCTION_LIVENESS = 7200;

    /// @dev Arbitrum One chain ID.
    uint256 constant ARBITRUM_ONE_CHAIN_ID = 42_161;

    // -------------------------------------------------------------------------
    // Script entry point
    // -------------------------------------------------------------------------

    function run() external {
        // ── 1. Read environment variables ───────────────────────────────────
        uint256 deployerPk =
            vm.envExists("PRIVATE_KEY") ? vm.envUint("PRIVATE_KEY") : vm.envUint("DEPLOYER_PRIVATE_KEY");
        address poolManager = vm.envAddress("V4_POOL_MANAGER");

        (bool production, uint64 liveness) = _readProductionSettings();

        address deployer = vm.addr(deployerPk);

        console2.log("================================================");
        console2.log("  CLAWLOGIC Full-Stack Deployment");
        console2.log("================================================");
        console2.log("Deployer:        ", deployer);
        console2.log("PoolManager:     ", poolManager);
        console2.log("Liveness (s):    ", uint256(liveness));
        console2.log("Production:      ", production);
        console2.log("");

        // ── 2. Deploy infrastructure mocks (if not provided) ─────────────
        vm.startBroadcast(deployerPk);

        Infra memory infra = _deployInfra(production);
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
                IPhalaVerifier(infra.phalaVerifier)
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
            IENS(infra.ensRegistry),
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
            OptimisticOracleV3Interface(infra.umaOov3),
            IERC20(infra.bondCurrency),
            liveness,
            deployer // initial owner + treasury; handed over below
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
            OptimisticOracleV3Interface(infra.umaOov3),
            IERC20(infra.bondCurrency),
            liveness,
            deployer // initial owner + treasury; handed over below
        );

        // 6b. Deploy AgentReputationRegistry (needs hook address as recorder)
        AgentReputationRegistry reputationRegistry = new AgentReputationRegistry(
            deployer,
            IERC8004AgentIdentity(address(identityRegistry)),
            address(hook) // PredictionMarketHook is the authorized recorder
        );
        console2.log("ReputationRegistry:      ", address(reputationRegistry));

        // 6c. Revenue + eligibility configuration (all optional).
        _configureHook(hook);

        // 6d. Hand admin rights to the final owner (e.g. a Safe).
        _handOverOwnership(deployer, hook, identityRegistry, reputationRegistry, validationRegistry);

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
            infra.umaOov3,
            infra.bondCurrency,
            infra.ensRegistry,
            address(identityRegistry),
            validationRegistryAddr,
            address(reputationRegistry),
            infra.phalaVerifier
        );
    }

    // -------------------------------------------------------------------------
    // Internal helpers
    // -------------------------------------------------------------------------

    /// @dev External dependencies, deployed as mocks on testnets when not provided.
    struct Infra {
        address umaOov3;
        address bondCurrency;
        address ensRegistry;
        address phalaVerifier;
    }

    /// @dev Must run inside the broadcast. On production chains UMA addresses are required
    ///      and ENS / Phala stay disabled (address(0)) unless provided.
    function _deployInfra(bool production) internal returns (Infra memory infra) {
        // 2a. UMA OOV3
        infra.umaOov3 = vm.envOr("UMA_OOV3", address(0));
        if (infra.umaOov3 == address(0)) {
            require(!production, "Deploy: UMA_OOV3 is required on production chains");
            DeployableMockOOV3 mockOO = new DeployableMockOOV3();
            infra.umaOov3 = address(mockOO);
            console2.log("[mock] MockOOV3:          ", infra.umaOov3);
        } else {
            console2.log("[ext]  UMA OOV3:          ", infra.umaOov3);
        }

        // 2b. Bond currency
        infra.bondCurrency = vm.envOr("UMA_BOND_CURRENCY", address(0));
        if (infra.bondCurrency == address(0)) {
            require(!production, "Deploy: UMA_BOND_CURRENCY is required on production chains");
            MockERC20 mockCurrency = new MockERC20("Mock Bond WETH", "mbWETH");
            infra.bondCurrency = address(mockCurrency);
            console2.log("[mock] BondCurrency:      ", infra.bondCurrency);
        } else {
            console2.log("[ext]  BondCurrency:      ", infra.bondCurrency);
        }

        // 2c. ENS Registry
        // On production chains an unset ENS_REGISTRY disables ENS linkage (address(0)).
        infra.ensRegistry = vm.envOr("ENS_REGISTRY", address(0));
        if (production) {
            console2.log("[ext]  ENSRegistry:       ", infra.ensRegistry);
        } else if (infra.ensRegistry == address(0)) {
            MockENSRegistry mockENS = new MockENSRegistry();
            infra.ensRegistry = address(mockENS);
            console2.log("[mock] ENSRegistry:       ", infra.ensRegistry);
        } else {
            console2.log("[ext]  ENSRegistry:       ", infra.ensRegistry);
        }

        // 2d. Phala TEE Verifier
        // On production chains an unset PHALA_VERIFIER leaves TEE validation disabled
        // (every verification reverts) instead of accepting everything.
        infra.phalaVerifier = vm.envOr("PHALA_VERIFIER", address(0));
        if (production) {
            console2.log("[ext]  PhalaVerifier:     ", infra.phalaVerifier);
        } else if (infra.phalaVerifier == address(0)) {
            // Deploy mock with defaultReturn=true (all attestations pass for demo)
            MockPhalaVerifier mockVerifier = new MockPhalaVerifier(true);
            infra.phalaVerifier = address(mockVerifier);
            console2.log("[mock] PhalaVerifier:     ", infra.phalaVerifier);
        } else {
            console2.log("[ext]  PhalaVerifier:     ", infra.phalaVerifier);
        }
    }

    /// @dev On production chains mocks are never deployed: a mock oracle lets anyone settle
    ///      markets and the mock TEE verifier accepts every attestation.
    function _readProductionSettings() internal view returns (bool production, uint64 liveness) {
        production = block.chainid == ARBITRUM_ONE_CHAIN_ID || vm.envOr("PRODUCTION", false);
        liveness = uint64(vm.envOr("DEFAULT_LIVENESS", uint256(production ? PRODUCTION_LIVENESS : DEFAULT_LIVENESS)));
        if (production) {
            require(liveness >= PRODUCTION_LIVENESS, "Deploy: DEFAULT_LIVENESS below 7200s on a production chain");
        }
    }

    /// @dev Transfers admin rights to PROTOCOL_OWNER when set. The hook uses Ownable2Step,
    ///      so the new owner must call acceptOwnership() on it afterwards.
    function _handOverOwnership(
        address deployer,
        PredictionMarketHook hook,
        AgentIdentityRegistry identityRegistry,
        AgentReputationRegistry reputationRegistry,
        AgentValidationRegistry validationRegistry
    ) internal {
        address finalOwner = vm.envOr("PROTOCOL_OWNER", deployer);
        if (finalOwner == deployer) return;
        hook.transferOwnership(finalOwner);
        identityRegistry.transferOwnership(finalOwner);
        reputationRegistry.transferOwnership(finalOwner);
        if (address(validationRegistry) != address(0)) {
            validationRegistry.transferOwnership(finalOwner);
        }
        console2.log("Ownership -> (hook: pending acceptOwnership)", finalOwner);
    }

    /// @dev Applies optional env configuration to a freshly deployed hook (deployer is owner).
    ///      TREASURY                  -- protocol fee recipient (default: deployer)
    ///      PROTOCOL_FEE_BPS          -- protocol share of each trade (default: 100 = 1%)
    ///      LP_FEE_BPS                -- LP share of each trade (default: 100 = 1%)
    ///      MARKET_CREATION_FEE_WEI   -- flat fee per market (default: 0, max 0.1 ETH)
    ///      ERC8004_IDENTITY_REGISTRY -- canonical ERC-8004 IdentityRegistry; holders may trade
    function _configureHook(PredictionMarketHook hook) internal {
        address treasury = vm.envOr("TREASURY", address(0));
        if (treasury != address(0)) hook.setTreasury(treasury);

        uint256 protocolFeeBps = vm.envOr("PROTOCOL_FEE_BPS", hook.s_protocolFeeBps());
        uint256 lpFeeBps = vm.envOr("LP_FEE_BPS", hook.s_lpFeeBps());
        hook.setFees(protocolFeeBps, lpFeeBps);

        uint256 creationFee = vm.envOr("MARKET_CREATION_FEE_WEI", uint256(0));
        if (creationFee > 0) hook.setMarketCreationFee(creationFee);

        address erc8004 = vm.envOr("ERC8004_IDENTITY_REGISTRY", address(0));
        if (erc8004 != address(0)) hook.setErc8004IdentityRegistry(erc8004);

        console2.log("Treasury:                ", hook.s_treasury());
        console2.log("Protocol fee (bps):      ", protocolFeeBps);
        console2.log("LP fee (bps):            ", lpFeeBps);
        console2.log("Creation fee (wei):      ", creationFee);
        console2.log("ERC-8004 identity:       ", erc8004);
    }

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
        } else if (block.chainid == ARBITRUM_ONE_CHAIN_ID) {
            fileName = "arbitrum-one.json";
        } else {
            fileName = string.concat("chain-", vm.toString(block.chainid), ".json");
        }

        string memory outPath = string.concat("deployments/", fileName);
        vm.writeJson(finalJson, outPath);
        console2.log("Deployment JSON written to:", outPath);
    }
}
