// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test, Vm} from "forge-std/Test.sol";
import {Hooks} from "v4-core/src/libraries/Hooks.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {PoolManager} from "v4-core/src/PoolManager.sol";

import {AgentRegistry} from "../../src/AgentRegistry.sol";
import {PredictionMarketHook} from "../../src/PredictionMarketHook.sol";
import {OutcomeToken} from "../../src/OutcomeToken.sol";
import {IENS} from "../../src/interfaces/IENS.sol";
import {IERC8004AgentValidation} from "../../src/interfaces/erc8004/IERC8004AgentValidation.sol";
import {MockOptimisticOracleV3} from "../mocks/MockOptimisticOracleV3.sol";
import {MockERC20} from "../mocks/MockERC20.sol";

/// @title TestSetup
/// @notice Shared test setup for all $CLAWLOGIC contract tests
abstract contract TestSetup is Test {
    // Contracts
    PoolManager public poolManager;
    AgentRegistry public registry;
    PredictionMarketHook public hook;
    MockOptimisticOracleV3 public mockOO;
    MockERC20 public mockCurrency;

    // Test accounts
    address public agentAlpha;
    address public agentBeta;
    address public humanUser;
    address public deployer;

    // Constants
    uint64 public constant DEFAULT_LIVENESS = 120; // 2 minutes
    uint256 public constant INITIAL_ETH_BALANCE = 100 ether;

    function setUp() public virtual {
        // Create test accounts
        agentAlpha = makeAddr("agentAlpha");
        agentBeta = makeAddr("agentBeta");
        humanUser = makeAddr("humanUser");
        deployer = address(this);

        // Deploy V4 PoolManager
        poolManager = new PoolManager(deployer);

        // Deploy AgentRegistry without ENS or validation registry (backward-compatible)
        registry = new AgentRegistry(IENS(address(0)), IERC8004AgentValidation(address(0)));

        // Deploy mock UMA OOV3
        mockOO = new MockOptimisticOracleV3();

        // Deploy mock ERC20 for UMA bond currency
        mockCurrency = new MockERC20("Mock WETH", "mWETH");

        // Deploy PredictionMarketHook at a valid hook address with correct flags
        // We need beforeSwap and beforeAddLiquidity flags
        uint160 flags = uint160(
            Hooks.BEFORE_SWAP_FLAG | Hooks.BEFORE_ADD_LIQUIDITY_FLAG
        );
        address hookAddress = address(flags);

        // Use deployCodeTo to deploy at the specific address with flags
        deployCodeTo(
            "PredictionMarketHook.sol:PredictionMarketHook",
            abi.encode(
                poolManager,
                registry,
                mockOO,
                mockCurrency,
                DEFAULT_LIVENESS
            ),
            hookAddress
        );

        hook = PredictionMarketHook(payable(hookAddress));

        // Fund test accounts with ETH
        deal(agentAlpha, INITIAL_ETH_BALANCE);
        deal(agentBeta, INITIAL_ETH_BALANCE);
        deal(humanUser, INITIAL_ETH_BALANCE);

        // Fund test accounts with mock currency for UMA bonds
        mockCurrency.mint(agentAlpha, 1000 ether);
        mockCurrency.mint(agentBeta, 1000 ether);

        // Register test agents
        vm.prank(agentAlpha);
        registry.registerAgent("Alpha", "");

        vm.prank(agentBeta);
        registry.registerAgent("Beta", "");
    }

    /// @notice Helper to create a market and return its ID
    function _createMarket(
        address creator,
        string memory description,
        uint256 reward,
        uint256 requiredBond
    ) internal returns (bytes32 marketId) {
        // Approve reward if needed
        if (reward > 0) {
            vm.prank(creator);
            mockCurrency.approve(address(hook), reward);
        }

        vm.prank(creator);
        marketId = hook.initializeMarket(
            "yes",
            "no",
            description,
            reward,
            requiredBond
        );
    }

    /// @notice Helper to mint outcome tokens
    function _mintTokens(
        address agent,
        bytes32 marketId,
        uint256 ethAmount
    ) internal {
        vm.prank(agent);
        hook.mintOutcomeTokens{value: ethAmount}(marketId);
    }

    /// @notice Helper to create a market with initial AMM liquidity
    function _createMarketWithLiquidity(
        address creator,
        string memory description,
        uint256 reward,
        uint256 requiredBond,
        uint256 initialLiquidity
    ) internal returns (bytes32 marketId) {
        if (reward > 0) {
            vm.prank(creator);
            mockCurrency.approve(address(hook), reward);
        }

        vm.prank(creator);
        marketId = hook.initializeMarket{value: initialLiquidity}(
            "yes",
            "no",
            description,
            reward,
            requiredBond
        );
    }

    /// @notice Helper to assert a market outcome
    function _assertMarket(
        address agent,
        bytes32 marketId,
        string memory outcome,
        uint256 bond
    ) internal returns (bytes32) {
        // Approve bond
        vm.prank(agent);
        mockCurrency.approve(address(hook), bond);

        // Assert
        vm.recordLogs();
        vm.prank(agent);
        hook.assertMarket(marketId, outcome);

        // Extract assertionId from event
        // MarketAsserted(bytes32 indexed marketId, string assertedOutcome, address indexed asserter, bytes32 assertionId)
        // topics: [0] = sig, [1] = marketId, [2] = asserter
        // data: (string assertedOutcome, bytes32 assertionId) - ABI encoded
        Vm.Log[] memory logs = vm.getRecordedLogs();
        for (uint256 i = 0; i < logs.length; i++) {
            if (
                logs[i].topics[0] ==
                keccak256("MarketAsserted(bytes32,string,address,bytes32)")
            ) {
                // Decode the non-indexed parameters from data
                // The data contains: string (dynamic) + bytes32 (static)
                // For ABI encoding: offset to string (32 bytes) + assertionId (32 bytes) + string length + string data
                // assertionId is at offset 32 in the data (right after the offset pointer to the string)
                (, bytes32 assertionId) = abi.decode(
                    logs[i].data,
                    (string, bytes32)
                );
                return assertionId;
            }
        }
        revert("MarketAsserted event not found");
    }
}
