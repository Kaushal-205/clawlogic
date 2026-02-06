// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Script.sol";
import "forge-std/console2.sol";

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {AgentRegistry} from "../src/AgentRegistry.sol";
import {PredictionMarketHook} from "../src/PredictionMarketHook.sol";

/// @title CreateMarket
/// @author $CLAWLOGIC Team
/// @notice Helper script for demo setup after deployment.
///
/// @dev Performs three steps in a single broadcast:
///      1. Registers the caller as an agent in the AgentRegistry.
///      2. Creates a sample prediction market on the PredictionMarketHook.
///      3. Mints outcome tokens by depositing ETH collateral.
///
///      Required environment variables:
///        DEPLOYER_PRIVATE_KEY          -- EOA that broadcasts (will be the agent)
///        AGENT_REGISTRY                -- Deployed AgentRegistry address
///        PREDICTION_MARKET_HOOK        -- Deployed PredictionMarketHook address
///
///      Optional:
///        MARKET_DESCRIPTION            -- Custom market question (default provided)
///        MARKET_OUTCOME1               -- First outcome label  (default: "yes")
///        MARKET_OUTCOME2               -- Second outcome label (default: "no")
///        MARKET_REWARD                 -- Asserter reward in wei (default: 0 for demo)
///        MARKET_REQUIRED_BOND          -- Required bond in wei  (default: 0 for demo)
///        MINT_AMOUNT_ETH               -- ETH to deposit for minting, in ether (default: 0.01)
///
///      Usage:
///        source .env && forge script script/CreateMarket.s.sol \
///          --rpc-url $ARBITRUM_SEPOLIA_RPC_URL \
///          --broadcast \
///          -vvvv
contract CreateMarketScript is Script {
    function run() external {
        // ── 1. Read environment ─────────────────────────────────────────────
        uint256 deployerPk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address registryAddr = vm.envAddress("AGENT_REGISTRY");
        address hookAddr = vm.envAddress("PREDICTION_MARKET_HOOK");

        string memory description = vm.envOr(
            "MARKET_DESCRIPTION",
            string("Will the next Arbitrum Sepolia block basefee exceed 0.1 gwei?")
        );
        string memory outcome1 = vm.envOr("MARKET_OUTCOME1", string("yes"));
        string memory outcome2 = vm.envOr("MARKET_OUTCOME2", string("no"));
        uint256 reward = vm.envOr("MARKET_REWARD", uint256(0));
        uint256 requiredBond = vm.envOr("MARKET_REQUIRED_BOND", uint256(0));
        uint256 mintAmountWei = vm.envOr("MINT_AMOUNT_ETH", uint256(0.01 ether));

        AgentRegistry registry = AgentRegistry(registryAddr);
        PredictionMarketHook hook = PredictionMarketHook(payable(hookAddr));

        address agent = vm.addr(deployerPk);

        console2.log("=== $CLAWLOGIC CreateMarket ===");
        console2.log("Agent:             ", agent);
        console2.log("AgentRegistry:     ", registryAddr);
        console2.log("PredictionMarketHook:", hookAddr);
        console2.log("Description:       ", description);
        console2.log("Outcome 1:         ", outcome1);
        console2.log("Outcome 2:         ", outcome2);
        console2.log("Reward (wei):      ", reward);
        console2.log("Required bond (wei):", requiredBond);
        console2.log("Mint amount (wei): ", mintAmountWei);
        console2.log("");

        vm.startBroadcast(deployerPk);

        // ── 2. Register agent (skip if already registered) ──────────────────
        if (!registry.isAgent(agent)) {
            registry.registerAgent("demo-agent", "");
            console2.log("Agent registered:  ", agent);
        } else {
            console2.log("Agent already registered, skipping registration.");
        }

        // ── 3. Approve reward currency if reward > 0 ───────────────────────
        if (reward > 0) {
            IERC20 currency = hook.i_currency();
            currency.approve(address(hook), reward);
            console2.log("Approved reward currency.");
        }

        // ── 4. Create market ────────────────────────────────────────────────
        bytes32 marketId = hook.initializeMarket(
            outcome1,
            outcome2,
            description,
            reward,
            requiredBond
        );
        console2.log("Market created, ID:", vm.toString(marketId));

        // ── 5. Mint outcome tokens ──────────────────────────────────────────
        if (mintAmountWei > 0) {
            hook.mintOutcomeTokens{value: mintAmountWei}(marketId);
            console2.log("Minted outcome tokens for", mintAmountWei, "wei");
        }

        vm.stopBroadcast();

        console2.log("");
        console2.log("=== CreateMarket Complete ===");
    }
}
