// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

// ──────────────────────────────────────────────────────────────────────────────
// V4 Core & Periphery
// ──────────────────────────────────────────────────────────────────────────────
import {BaseHook} from "v4-periphery/src/utils/BaseHook.sol";
import {Hooks} from "v4-core/src/libraries/Hooks.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "v4-core/src/types/PoolId.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary} from "v4-core/src/types/BeforeSwapDelta.sol";
import {ModifyLiquidityParams, SwapParams} from "v4-core/src/types/PoolOperation.sol";

// ──────────────────────────────────────────────────────────────────────────────
// OpenZeppelin
// ──────────────────────────────────────────────────────────────────────────────
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

// ──────────────────────────────────────────────────────────────────────────────
// UMA Interfaces
// ──────────────────────────────────────────────────────────────────────────────
import {OptimisticOracleV3Interface} from "./interfaces/uma/OptimisticOracleV3Interface.sol";
import {OptimisticOracleV3CallbackRecipientInterface} from
    "./interfaces/uma/OptimisticOracleV3CallbackRecipientInterface.sol";

// ──────────────────────────────────────────────────────────────────────────────
// Project Contracts
// ──────────────────────────────────────────────────────────────────────────────
import {IAgentRegistry} from "./interfaces/IAgentRegistry.sol";
import {OutcomeToken} from "./OutcomeToken.sol";

/// @title PredictionMarketHook
/// @author $CLAWLOGIC Team
/// @notice The core contract of $CLAWLOGIC -- a Uniswap V4 Hook that doubles as a
///         prediction market with UMA Optimistic Oracle V3 for resolution.
///
/// @dev This contract is a HYBRID serving three roles:
///
///      1. **V4 Hook** -- extends BaseHook, implements `beforeSwap` and `beforeAddLiquidity`
///         for agent-only gating. Only addresses registered in the AgentRegistry can trade
///         or provide liquidity on V4 pools that reference this hook.
///
///      2. **Prediction Market** -- manages the full market lifecycle:
///         initializeMarket -> mintOutcomeTokens -> assertMarket -> settleOutcomeTokens.
///         Each market deploys a pair of OutcomeToken ERC-20s (one per outcome). Agents
///         deposit ETH as collateral to mint equal quantities of both outcome tokens. After
///         resolution the winning token redeems 1:1 for the collateral ETH.
///
///      3. **UMA Callback Recipient** -- implements `assertionResolvedCallback` and
///         `assertionDisputedCallback` so UMA OOV3 can push resolution results back.
///
///      **tx.origin usage (known limitation):**
///         Hook callbacks (`beforeSwap`, `beforeAddLiquidity`) are invoked by the V4
///         PoolManager, so `msg.sender` is always the PoolManager address. To identify
///         the originating agent, this contract checks `tx.origin` against the registry.
///         This is a deliberate hackathon trade-off; in production the sender address
///         would be forwarded through the hookData parameter or a router contract.
contract PredictionMarketHook is BaseHook, OptimisticOracleV3CallbackRecipientInterface {
    using SafeERC20 for IERC20;
    using PoolIdLibrary for PoolKey;

    // ─────────────────────────────────────────────────────────────────────────
    // Structs
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Full representation of a prediction market.
    struct Market {
        string description;
        string outcome1; // e.g. "yes"
        string outcome2; // e.g. "no"
        OutcomeToken outcome1Token;
        OutcomeToken outcome2Token;
        uint256 reward; // incentive for the asserter
        uint256 requiredBond; // minimum bond the asserter must post
        bool resolved;
        bytes32 assertedOutcomeId; // keccak256 of the currently asserted outcome string
        PoolId poolId; // V4 pool associated with this market (zero if none)
        uint256 totalCollateral; // total ETH locked as collateral
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Immutables
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice The agent identity registry used for Silicon Gate checks.
    IAgentRegistry public immutable i_registry;

    /// @notice UMA Optimistic Oracle V3 instance.
    OptimisticOracleV3Interface public immutable i_oo;

    /// @notice ERC-20 used as the UMA assertion bond currency.
    IERC20 public immutable i_currency;

    /// @notice Default liveness window for UMA assertions (seconds). 120 s for demo.
    uint64 public immutable i_defaultLiveness;

    /// @notice Default UMA identifier, fetched from the OOV3 at deploy time.
    bytes32 public immutable i_defaultIdentifier;

    // ─────────────────────────────────────────────────────────────────────────
    // Storage
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Maps marketId to its Market data.
    mapping(bytes32 => Market) public s_markets;

    /// @notice Maps a UMA assertionId back to the marketId it belongs to.
    mapping(bytes32 => bytes32) public s_assertionToMarket;

    /// @notice Running counter used for deterministic marketId generation.
    uint256 public s_marketCount;

    /// @notice Array of all marketIds for enumeration.
    bytes32[] private s_marketIds;

    /// @notice The hash of the "Unresolvable" outcome string, cached for comparison.
    bytes32 private constant UNRESOLVABLE_HASH = keccak256(bytes("Unresolvable"));

    // ─────────────────────────────────────────────────────────────────────────
    // Custom Errors
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Thrown when the caller (or tx.origin in hook context) is not a registered agent.
    error NotRegisteredAgent();

    /// @notice Thrown when a marketId does not correspond to an initialized market.
    error MarketNotFound();

    /// @notice Thrown when an operation is attempted on an already-resolved market.
    error MarketAlreadyResolved();

    /// @notice Thrown when a new assertion is attempted while one is already active.
    error ActiveAssertionExists();

    /// @notice Thrown when the asserted outcome string does not match outcome1, outcome2,
    ///         or "Unresolvable".
    error InvalidOutcome();

    /// @notice Thrown when settlement is attempted on a market that has not resolved.
    error MarketNotResolved();

    /// @notice Thrown when the caller has zero winning tokens to settle.
    error NoTokensToSettle();

    /// @notice Thrown when a callback is received from an address other than UMA OOV3.
    error OnlyOracle();

    /// @notice Thrown when zero ETH is sent to mintOutcomeTokens.
    error ZeroMintAmount();

    /// @notice Thrown when an ETH transfer fails during settlement.
    error EthTransferFailed();

    // ─────────────────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Emitted when a new prediction market is initialized.
    event MarketInitialized(bytes32 indexed marketId, string description, address indexed creator);

    /// @notice Emitted when an agent mints outcome token pairs by depositing ETH collateral.
    event TokensMinted(bytes32 indexed marketId, address indexed agent, uint256 amount);

    /// @notice Emitted when an agent asserts the outcome of a market via UMA OOV3.
    event MarketAsserted(
        bytes32 indexed marketId, string assertedOutcome, address indexed asserter, bytes32 assertionId
    );

    /// @notice Emitted when UMA OOV3 resolves an assertion as truthful and the market settles.
    event MarketResolved(bytes32 indexed marketId, bytes32 outcomeId);

    /// @notice Emitted when UMA OOV3 resolves an assertion as NOT truthful (disputed and lost).
    event AssertionFailed(bytes32 indexed marketId, bytes32 assertionId);

    /// @notice Emitted when UMA OOV3 notifies that an assertion has been disputed.
    event AssertionDisputed(bytes32 indexed marketId, bytes32 assertionId);

    /// @notice Emitted when an agent redeems winning outcome tokens for ETH.
    event TokensSettled(bytes32 indexed marketId, address indexed agent, uint256 payout);

    // ─────────────────────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Deploys the PredictionMarketHook, binding it to V4, the agent registry,
    ///         and UMA OOV3.
    /// @param _poolManager   The Uniswap V4 PoolManager instance.
    /// @param _registry      The AgentRegistry used for Silicon Gate checks.
    /// @param _oo            The UMA Optimistic Oracle V3 address.
    /// @param _currency      The ERC-20 used as UMA bond currency (e.g., WETH or mock).
    /// @param _defaultLiveness The liveness window in seconds (120 for demo).
    constructor(
        IPoolManager _poolManager,
        IAgentRegistry _registry,
        OptimisticOracleV3Interface _oo,
        IERC20 _currency,
        uint64 _defaultLiveness
    ) BaseHook(_poolManager) {
        i_registry = _registry;
        i_oo = _oo;
        i_currency = _currency;
        i_defaultLiveness = _defaultLiveness;
        i_defaultIdentifier = _oo.defaultIdentifier();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // V4 Hook Permissions
    // ─────────────────────────────────────────────────────────────────────────

    /// @inheritdoc BaseHook
    function getHookPermissions() public pure override returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: false,
            afterInitialize: false,
            beforeAddLiquidity: true,
            afterAddLiquidity: false,
            beforeRemoveLiquidity: false,
            afterRemoveLiquidity: false,
            beforeSwap: true,
            afterSwap: false,
            beforeDonate: false,
            afterDonate: false,
            beforeSwapReturnDelta: false,
            afterSwapReturnDelta: false,
            afterAddLiquidityReturnDelta: false,
            afterRemoveLiquidityReturnDelta: false
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // V4 Hook Callbacks (Agent Gating)
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Enforces that only registered agents can execute swaps on pools using this hook.
    /// @dev Uses `tx.origin` because `msg.sender` in the hook callback is always the V4
    ///      PoolManager. This is a known hackathon trade-off documented above.
    function _beforeSwap(address, PoolKey calldata, SwapParams calldata, bytes calldata)
        internal
        view
        override
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        // solhint-disable-next-line avoid-tx-origin
        if (!i_registry.isAgent(tx.origin)) {
            revert NotRegisteredAgent();
        }
        return (this.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
    }

    /// @notice Enforces that only registered agents can add liquidity to pools using this hook.
    /// @dev Same tx.origin rationale as _beforeSwap.
    function _beforeAddLiquidity(address, PoolKey calldata, ModifyLiquidityParams calldata, bytes calldata)
        internal
        view
        override
        returns (bytes4)
    {
        // solhint-disable-next-line avoid-tx-origin
        if (!i_registry.isAgent(tx.origin)) {
            revert NotRegisteredAgent();
        }
        return this.beforeAddLiquidity.selector;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Prediction Market Lifecycle
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Create a new prediction market.
    /// @dev Only registered agents may create markets. Deploys two OutcomeToken contracts
    ///      (one per outcome) owned by this hook. The caller must have previously approved
    ///      `reward` amount of `i_currency` to this contract so the reward can be held for
    ///      the eventual asserter.
    /// @param outcome1     Label for the first outcome (e.g. "yes").
    /// @param outcome2     Label for the second outcome (e.g. "no").
    /// @param description  Human-readable market question.
    /// @param reward       Amount of `i_currency` offered as incentive to the asserter.
    /// @param requiredBond Minimum bond required from an asserter (may be raised by OOV3).
    /// @return marketId    The unique identifier for the newly created market.
    function initializeMarket(
        string calldata outcome1,
        string calldata outcome2,
        string calldata description,
        uint256 reward,
        uint256 requiredBond
    ) external returns (bytes32 marketId) {
        if (!i_registry.isAgent(msg.sender)) {
            revert NotRegisteredAgent();
        }

        // Deterministic, collision-resistant marketId.
        marketId = keccak256(abi.encode(description, block.timestamp, msg.sender, s_marketCount));

        // Deploy outcome tokens. The hook (address(this)) is the sole minter/burner.
        OutcomeToken token1 = new OutcomeToken(
            string.concat("CLAW YES - ", description),
            "clYES",
            address(this)
        );
        OutcomeToken token2 = new OutcomeToken(
            string.concat("CLAW NO - ", description),
            "clNO",
            address(this)
        );

        // Pull the reward from the market creator. The reward is held in this contract
        // and will be included in the UMA assertion bond later.
        if (reward > 0) {
            i_currency.safeTransferFrom(msg.sender, address(this), reward);
        }

        // Persist market state.
        Market storage m = s_markets[marketId];
        m.description = description;
        m.outcome1 = outcome1;
        m.outcome2 = outcome2;
        m.outcome1Token = token1;
        m.outcome2Token = token2;
        m.reward = reward;
        m.requiredBond = requiredBond;
        // m.resolved defaults to false
        // m.assertedOutcomeId defaults to bytes32(0)
        // m.poolId defaults to bytes32(0) -- V4 pool association is optional for MVP
        // m.totalCollateral defaults to 0

        s_marketIds.push(marketId);
        s_marketCount++;

        emit MarketInitialized(marketId, description, msg.sender);
    }

    /// @notice Deposit ETH collateral to mint equal amounts of both outcome tokens.
    /// @dev Only registered agents. The ETH is held by this contract as collateral backing
    ///      the eventual settlement. The caller receives `msg.value` of outcome1Token AND
    ///      `msg.value` of outcome2Token.
    /// @param marketId The market to mint tokens for.
    function mintOutcomeTokens(bytes32 marketId) external payable {
        if (!i_registry.isAgent(msg.sender)) {
            revert NotRegisteredAgent();
        }
        if (msg.value == 0) {
            revert ZeroMintAmount();
        }

        Market storage m = s_markets[marketId];
        if (address(m.outcome1Token) == address(0)) {
            revert MarketNotFound();
        }
        if (m.resolved) {
            revert MarketAlreadyResolved();
        }

        // Mint equal quantities of both tokens to the agent.
        m.outcome1Token.mint(msg.sender, msg.value);
        m.outcome2Token.mint(msg.sender, msg.value);

        // Track total collateral for settlement calculations.
        m.totalCollateral += msg.value;

        emit TokensMinted(marketId, msg.sender, msg.value);
    }

    /// @notice Assert the outcome of a market via UMA Optimistic Oracle V3.
    /// @dev Only registered agents. The asserted outcome must exactly match `outcome1`,
    ///      `outcome2`, or the literal string "Unresolvable". The caller must have approved
    ///      `bond` amount of `i_currency` to this contract. The bond is forwarded to UMA
    ///      OOV3 along with any reward. If the assertion survives the liveness window,
    ///      `assertionResolvedCallback` is called with `assertedTruthfully = true`.
    /// @param marketId        The market to assert.
    /// @param assertedOutcome The outcome string being asserted (must match outcome1/outcome2
    ///                        or "Unresolvable").
    function assertMarket(bytes32 marketId, string calldata assertedOutcome) external {
        if (!i_registry.isAgent(msg.sender)) {
            revert NotRegisteredAgent();
        }

        Market storage m = s_markets[marketId];
        if (address(m.outcome1Token) == address(0)) {
            revert MarketNotFound();
        }
        if (m.resolved) {
            revert MarketAlreadyResolved();
        }
        // Only one active assertion per market at a time.
        if (m.assertedOutcomeId != bytes32(0)) {
            revert ActiveAssertionExists();
        }

        // Validate the outcome string.
        bytes32 outcomeHash = keccak256(bytes(assertedOutcome));
        bytes32 outcome1Hash = keccak256(bytes(m.outcome1));
        bytes32 outcome2Hash = keccak256(bytes(m.outcome2));

        if (outcomeHash != outcome1Hash && outcomeHash != outcome2Hash && outcomeHash != UNRESOLVABLE_HASH) {
            revert InvalidOutcome();
        }

        // Determine the effective bond: max(requiredBond, OOV3 minimum).
        uint256 minimumBond = i_oo.getMinimumBond(address(i_currency));
        uint256 bond = m.requiredBond > minimumBond ? m.requiredBond : minimumBond;

        // Pull the bond from the asserter.
        i_currency.safeTransferFrom(msg.sender, address(this), bond);

        // Approve OOV3 to pull the total amount (bond + reward).
        uint256 totalApproval = bond + m.reward;
        i_currency.forceApprove(address(i_oo), totalApproval);

        // Build the claim string for UMA.
        bytes memory claim = abi.encodePacked(
            "Market: ",
            m.description,
            ". Asserted outcome: ",
            assertedOutcome,
            "."
        );

        // Submit the assertion to UMA OOV3.
        bytes32 assertionId = i_oo.assertTruth(
            claim,
            msg.sender, // the asserter receives bond back on success
            address(this), // this contract receives resolution callbacks
            address(0), // no escalation manager
            i_defaultLiveness,
            address(i_currency),
            bond,
            i_defaultIdentifier,
            bytes32(0) // no domain
        );

        // Map the assertion back to the market.
        s_assertionToMarket[assertionId] = marketId;
        m.assertedOutcomeId = outcomeHash;

        emit MarketAsserted(marketId, assertedOutcome, msg.sender, assertionId);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // UMA OOV3 Callbacks
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Called by UMA OOV3 when an assertion is resolved.
    /// @dev If `assertedTruthfully` is true the assertion survived the liveness window (or
    ///      a dispute was resolved in the asserter's favour) and the market is marked
    ///      resolved. If false, the assertion was disputed and the asserter lost; the market
    ///      is reset so a new assertion can be made.
    /// @param assertionId       The UMA assertion identifier.
    /// @param assertedTruthfully True if the assertion was deemed truthful.
    function assertionResolvedCallback(bytes32 assertionId, bool assertedTruthfully) external {
        if (msg.sender != address(i_oo)) {
            revert OnlyOracle();
        }

        bytes32 marketId = s_assertionToMarket[assertionId];
        Market storage m = s_markets[marketId];

        if (assertedTruthfully) {
            // Mark the market as resolved. The assertedOutcomeId already stores which
            // outcome won.
            m.resolved = true;
            emit MarketResolved(marketId, m.assertedOutcomeId);
        } else {
            // The assertion was disputed and overturned. Clear the asserted outcome so
            // a fresh assertion can be submitted.
            m.assertedOutcomeId = bytes32(0);
            emit AssertionFailed(marketId, assertionId);
        }
    }

    /// @notice Called by UMA OOV3 when an assertion is disputed.
    /// @dev This is informational only. The market stays in its current state until
    ///      `assertionResolvedCallback` is called with the dispute outcome.
    /// @param assertionId The UMA assertion identifier that was disputed.
    function assertionDisputedCallback(bytes32 assertionId) external {
        if (msg.sender != address(i_oo)) {
            revert OnlyOracle();
        }

        bytes32 marketId = s_assertionToMarket[assertionId];
        emit AssertionDisputed(marketId, assertionId);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Settlement
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Redeem winning outcome tokens for proportional ETH collateral.
    /// @dev The market must be resolved. The caller's winning tokens are burned and they
    ///      receive a proportional share of the total collateral. If the resolved outcome
    ///      is "Unresolvable", both tokens redeem equally (each token is worth 0.5 ETH
    ///      per token-unit).
    ///
    ///      Payout calculation:
    ///      - Winning outcome: payout = (winnerBalance / totalWinnerSupply) * totalCollateral
    ///      - Unresolvable:    payout = (callerTotal / totalBothSupply) * totalCollateral
    ///        where callerTotal = outcome1Balance + outcome2Balance
    ///
    /// @param marketId The resolved market.
    function settleOutcomeTokens(bytes32 marketId) external {
        Market storage m = s_markets[marketId];

        if (address(m.outcome1Token) == address(0)) {
            revert MarketNotFound();
        }
        if (!m.resolved) {
            revert MarketNotResolved();
        }

        bytes32 outcome1Hash = keccak256(bytes(m.outcome1));
        bytes32 outcome2Hash = keccak256(bytes(m.outcome2));
        bytes32 resolvedOutcome = m.assertedOutcomeId;

        uint256 payout;

        if (resolvedOutcome == outcome1Hash) {
            // Outcome 1 won. Only outcome1Token holders receive a payout.
            uint256 balance = m.outcome1Token.balanceOf(msg.sender);
            if (balance == 0) revert NoTokensToSettle();

            uint256 totalSupply = m.outcome1Token.totalSupply();
            // Payout proportional to share of winning token supply.
            // Round DOWN (in favour of the protocol) to avoid over-paying.
            payout = (balance * m.totalCollateral) / totalSupply;

            // Burn the winning tokens first (Checks-Effects-Interactions).
            m.outcome1Token.burn(msg.sender, balance);
        } else if (resolvedOutcome == outcome2Hash) {
            // Outcome 2 won. Only outcome2Token holders receive a payout.
            uint256 balance = m.outcome2Token.balanceOf(msg.sender);
            if (balance == 0) revert NoTokensToSettle();

            uint256 totalSupply = m.outcome2Token.totalSupply();
            payout = (balance * m.totalCollateral) / totalSupply;

            m.outcome2Token.burn(msg.sender, balance);
        } else {
            // Unresolvable. Both tokens redeem proportionally.
            uint256 balance1 = m.outcome1Token.balanceOf(msg.sender);
            uint256 balance2 = m.outcome2Token.balanceOf(msg.sender);
            uint256 callerTotal = balance1 + balance2;
            if (callerTotal == 0) revert NoTokensToSettle();

            uint256 totalSupply = m.outcome1Token.totalSupply() + m.outcome2Token.totalSupply();
            payout = (callerTotal * m.totalCollateral) / totalSupply;

            // Burn both token types.
            if (balance1 > 0) m.outcome1Token.burn(msg.sender, balance1);
            if (balance2 > 0) m.outcome2Token.burn(msg.sender, balance2);
        }

        // Reduce tracked collateral before external call (CEI).
        m.totalCollateral -= payout;

        // Transfer ETH to the caller.
        (bool success,) = msg.sender.call{value: payout}("");
        if (!success) revert EthTransferFailed();

        emit TokensSettled(marketId, msg.sender, payout);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // View Helpers
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Returns the full Market struct for a given marketId.
    /// @param marketId The identifier of the market.
    /// @return description        The human-readable market question.
    /// @return outcome1           The first outcome label.
    /// @return outcome2           The second outcome label.
    /// @return outcome1Token      The address of the outcome1 ERC-20 token.
    /// @return outcome2Token      The address of the outcome2 ERC-20 token.
    /// @return reward             The asserter reward amount.
    /// @return requiredBond       The minimum assertion bond.
    /// @return resolved           Whether the market has been resolved.
    /// @return assertedOutcomeId  The keccak256 hash of the asserted outcome (bytes32(0) if none).
    /// @return poolId             The V4 pool identifier (bytes32(0) if no pool associated).
    /// @return totalCollateral    The total ETH collateral backing the market.
    function getMarket(bytes32 marketId)
        external
        view
        returns (
            string memory description,
            string memory outcome1,
            string memory outcome2,
            address outcome1Token,
            address outcome2Token,
            uint256 reward,
            uint256 requiredBond,
            bool resolved,
            bytes32 assertedOutcomeId,
            PoolId poolId,
            uint256 totalCollateral
        )
    {
        Market storage m = s_markets[marketId];
        return (
            m.description,
            m.outcome1,
            m.outcome2,
            address(m.outcome1Token),
            address(m.outcome2Token),
            m.reward,
            m.requiredBond,
            m.resolved,
            m.assertedOutcomeId,
            m.poolId,
            m.totalCollateral
        );
    }

    /// @notice Returns all market IDs for enumeration by front-ends and agents.
    /// @return An array of all created marketId values.
    function getMarketIds() external view returns (bytes32[] memory) {
        return s_marketIds;
    }

    /// @notice Allow the contract to receive ETH (required for mintOutcomeTokens).
    receive() external payable {}
}
