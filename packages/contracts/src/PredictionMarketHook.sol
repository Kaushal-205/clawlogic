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
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

// ──────────────────────────────────────────────────────────────────────────────
// UMA Interfaces
// ──────────────────────────────────────────────────────────────────────────────
import {OptimisticOracleV3Interface} from "./interfaces/uma/OptimisticOracleV3Interface.sol";
import {
    OptimisticOracleV3CallbackRecipientInterface
} from "./interfaces/uma/OptimisticOracleV3CallbackRecipientInterface.sol";

// ──────────────────────────────────────────────────────────────────────────────
// Project Contracts
// ──────────────────────────────────────────────────────────────────────────────
import {OutcomeToken} from "./OutcomeToken.sol";
import {IAgentRegistry} from "./interfaces/IAgentRegistry.sol";

/// @notice Minimal view of the canonical ERC-8004 IdentityRegistry (an ERC-721).
interface IERC8004IdentityBalance {
    function balanceOf(address owner) external view returns (uint256);
}

/// @title PredictionMarketHook
/// @author CLAWLOGIC Team
/// @notice The core contract of CLAWLOGIC -- a Uniswap V4 Hook that doubles as a
///         prediction market with UMA Optimistic Oracle V3 for resolution.
///
/// @dev This contract is a HYBRID serving three roles:
///
///      1. **V4 Hook** -- extends BaseHook, implements `beforeSwap` and `beforeAddLiquidity`
///         for agent-only gating.
///
///      2. **Prediction Market** -- manages the full market lifecycle:
///         createMarket -> trade (mint / buy / sell / merge / LP) -> assertMarket -> settle.
///         Each market deploys a pair of OutcomeToken ERC-20s. Every outcome token pair is
///         backed 1:1 by ETH collateral, so `totalCollateral == outcome1 supply == outcome2
///         supply` until resolution; a winning token redeems for 1 wei of ETH per unit.
///
///         Trading runs against a built-in constant-product market maker (FPMM style).
///         Liquidity providers own the AMM reserves through per-market LP shares and can
///         withdraw them at any time -- no collateral is ever stranded in the contract.
///
///      3. **UMA Callback Recipient** -- implements `assertionResolvedCallback` and
///         `assertionDisputedCallback` so UMA OOV3 can push resolution results back.
///
///      **Eligibility:** an address may trade if it is registered in the AgentRegistry OR
///      holds an identity in the configured ERC-8004 IdentityRegistry.
///
///      **Revenue:** every AMM trade pays `protocolFeeBps` to the treasury and `lpFeeBps`
///      to liquidity providers (added to the pool). Market creation can carry a flat fee.
///      Fees are owner-configurable up to hard caps. Minting and merging complete sets,
///      settlement and LP withdrawal are fee-free.
///
///      **Duplicates:** while a market is unresolved, no other market with the same
///      normalized question and outcome pair can be created (see `computeMarketKey`).
///      The owner can release a key at any time, and anyone can release it once the market
///      is still unresolved `KEY_RELEASE_DELAY` after its resolution time.
///
///      **Timing:** every market has a resolution time (the earliest moment an outcome may
///      be asserted) no more than `MAX_MARKET_DURATION` ahead, and a close time for trading
///      at or before it (defaults to the resolution time).
///
///      **Pause:** the owner can pause market creation, minting, buying, selling and adding
///      liquidity. Pausing never blocks merging complete sets, LP withdrawal, assertion or
///      settlement, so funds can always leave.
///
///      **tx.origin usage (known limitation):**
///         Hook callbacks are invoked by the V4 PoolManager, so `msg.sender` is always the
///         PoolManager. To identify the originating agent those callbacks check `tx.origin`.
///         All market functions use `msg.sender`, so smart-contract wallets work there.
contract PredictionMarketHook is BaseHook, Ownable2Step, ReentrancyGuard, OptimisticOracleV3CallbackRecipientInterface {
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
        uint256 reserve1; // AMM reserve of outcome1 tokens held by contract
        uint256 reserve2; // AMM reserve of outcome2 tokens held by contract
        address creator;
        uint64 closeTime; // trading stops at this timestamp
        uint64 resolutionTime; // earliest timestamp an outcome may be asserted
        address asserter; // asserter of the pending or truthful assertion (earns `reward`)
        bytes32 activeAssertionId; // current UMA assertion (zero if none)
        uint256 totalLpShares;
        bytes32 marketKey; // normalized question key used for duplicate detection
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Immutables
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice UMA Optimistic Oracle V3 instance.
    OptimisticOracleV3Interface public immutable i_oo;

    /// @notice The agent identity registry used for Silicon Gate checks.
    IAgentRegistry public immutable i_registry;

    /// @notice ERC-20 used as the UMA assertion bond currency.
    IERC20 public immutable i_currency;

    /// @notice Default UMA identifier.
    bytes32 public immutable i_defaultIdentifier;

    /// @notice Liveness window for UMA assertions (seconds).
    uint64 public immutable i_defaultLiveness;

    // ─────────────────────────────────────────────────────────────────────────
    // Constants
    // ─────────────────────────────────────────────────────────────────────────

    /// @dev UMA's standard assertion identifier. Hardcoded to avoid external call in constructor.
    bytes32 private constant ASSERT_TRUTH_IDENTIFIER = bytes32("ASSERT_TRUTH");

    /// @notice The hash of the "Unresolvable" outcome string, cached for comparison.
    bytes32 private constant UNRESOLVABLE_HASH = keccak256(bytes("Unresolvable"));

    /// @dev Normalized forms of the reserved and binary outcome labels.
    bytes32 private constant NORMALIZED_UNRESOLVABLE_HASH = keccak256("unresolvable");
    bytes32 private constant NORMALIZED_YES_HASH = keccak256("yes");
    bytes32 private constant NORMALIZED_NO_HASH = keccak256("no");

    /// @notice Latest allowed resolution time, relative to market creation.
    uint256 public constant MAX_MARKET_DURATION = 365 days;

    /// @notice After `resolutionTime + KEY_RELEASE_DELAY` anyone may release the question
    ///         key of a still-unresolved market.
    uint256 public constant KEY_RELEASE_DELAY = 30 days;

    /// @notice Basis-point denominator.
    uint256 public constant BPS = 10_000;

    /// @notice Hard cap on protocolFeeBps + lpFeeBps (10%).
    uint256 public constant MAX_TOTAL_FEE_BPS = 1000;

    /// @notice Hard cap on the flat market creation fee.
    uint256 public constant MAX_MARKET_CREATION_FEE = 0.1 ether;

    // ─────────────────────────────────────────────────────────────────────────
    // Storage
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Maps marketId to its Market data.
    mapping(bytes32 => Market) internal s_markets;

    /// @notice Maps a UMA assertionId back to the marketId it belongs to.
    mapping(bytes32 => bytes32) public s_assertionToMarket;

    /// @notice Running counter used for deterministic marketId generation.
    uint256 public s_marketCount;

    /// @notice Array of all marketIds for enumeration.
    bytes32[] private s_marketIds;

    /// @notice LP shares per market per provider.
    mapping(bytes32 => mapping(address => uint256)) public s_lpShares;

    /// @notice Normalized question key => unresolved market using it.
    mapping(bytes32 => bytes32) public s_activeMarketByKey;

    /// @notice Protocol share of each trade, in basis points.
    uint256 public s_protocolFeeBps = 100;

    /// @notice Liquidity-provider share of each trade, in basis points.
    uint256 public s_lpFeeBps = 100;

    /// @notice Flat ETH fee charged when a market is created.
    uint256 public s_marketCreationFee;

    /// @notice Receives protocol fees.
    address public s_treasury;

    /// @notice Protocol fees accrued and not yet withdrawn to the treasury.
    uint256 public s_protocolFeesAccrued;

    /// @notice When true, market creation and trading are halted (exits stay open).
    bool public s_paused;

    /// @notice Canonical ERC-8004 IdentityRegistry. Holders are eligible agents.
    IERC8004IdentityBalance public s_erc8004IdentityRegistry;

    /// @notice Largest `requiredBond` a market may demand (0 = UMA minimum only).
    uint256 public s_maxRequiredBond;

    // ─────────────────────────────────────────────────────────────────────────
    // Custom Errors
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Thrown when the caller (or tx.origin in hook context) is not an eligible agent.
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

    /// @notice Thrown when a zero amount is supplied.
    error ZeroMintAmount();

    /// @notice Thrown when an ETH transfer fails.
    error EthTransferFailed();

    /// @notice Thrown when the output of a trade is below the caller's minimum.
    error InsufficientOutput();

    /// @notice Thrown when an equivalent market is still unresolved.
    error DuplicateMarket(bytes32 existingMarketId);

    /// @notice Thrown when the description is empty or the outcomes are empty/identical.
    error InvalidMarketParams();

    /// @notice Thrown when a close time is in the past or after the resolution time.
    error InvalidCloseTime();

    /// @notice Thrown when a resolution time is in the past or beyond MAX_MARKET_DURATION.
    error InvalidResolutionTime();

    /// @notice Thrown when asserting before the market's resolution time.
    error ResolutionTimeNotReached();

    /// @notice Thrown when `requiredBond` exceeds `s_maxRequiredBond`.
    error BondTooHigh();

    /// @notice Thrown when there is no reward left to pay.
    error NothingToClaim();

    /// @notice Thrown when a question key cannot (yet) be released.
    error KeyNotReleasable();

    /// @notice Thrown when trading after the market's close time.
    error TradingClosed();

    /// @notice Thrown when trading while an assertion is awaiting resolution.
    error AssertionPending();

    /// @notice Thrown when creation or trading is attempted while paused.
    error ProtocolPaused();

    /// @notice Thrown when msg.value does not cover the market creation fee.
    error InsufficientCreationFee();

    /// @notice Thrown when fee settings exceed the hard caps.
    error FeeTooHigh();

    /// @notice Thrown when a zero address is supplied where one is not allowed.
    error ZeroAddress();

    /// @notice Thrown when trading against a market with no AMM liquidity.
    error NoLiquidity();

    /// @notice Thrown when removing more LP shares than owned.
    error InsufficientShares();

    // ─────────────────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Emitted when a new prediction market is initialized.
    event MarketInitialized(bytes32 indexed marketId, string description, address indexed creator);

    /// @notice Emitted alongside MarketInitialized with the market's extra configuration.
    event MarketConfigured(
        bytes32 indexed marketId,
        address indexed creator,
        uint64 closeTime,
        uint64 resolutionTime,
        bytes32 marketKey,
        uint256 creationFee
    );

    /// @notice Emitted when an agent mints outcome token pairs by depositing ETH collateral.
    event TokensMinted(bytes32 indexed marketId, address indexed agent, uint256 amount);

    /// @notice Emitted when outcome token pairs are burned back into ETH before resolution.
    event TokensMerged(bytes32 indexed marketId, address indexed agent, uint256 amount);

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

    /// @notice Emitted when an agent buys directional outcome tokens via the built-in CPMM.
    event OutcomeTokenBought(
        bytes32 indexed marketId, address indexed buyer, bool isOutcome1, uint256 ethIn, uint256 tokensOut
    );

    /// @notice Emitted when an agent sells outcome tokens back to the built-in CPMM.
    event OutcomeTokenSold(
        bytes32 indexed marketId, address indexed seller, bool isOutcome1, uint256 tokensIn, uint256 ethOut
    );

    /// @notice Emitted on every AMM trade with the fees it paid.
    event TradeFeesCharged(bytes32 indexed marketId, uint256 protocolFee, uint256 lpFee);

    /// @notice Emitted when liquidity is added to a market's AMM.
    event LiquidityAdded(bytes32 indexed marketId, address indexed provider, uint256 amount, uint256 shares);

    /// @notice Emitted when liquidity is withdrawn from a market's AMM.
    event LiquidityRemoved(
        bytes32 indexed marketId, address indexed provider, uint256 shares, uint256 amount1, uint256 amount2
    );

    event FeesUpdated(uint256 protocolFeeBps, uint256 lpFeeBps);
    event MarketCreationFeeUpdated(uint256 fee);
    event TreasuryUpdated(address treasury);
    event PausedUpdated(bool paused);
    event Erc8004IdentityRegistryUpdated(address registry);
    event ProtocolFeesWithdrawn(address indexed treasury, uint256 amount);
    event MaxRequiredBondUpdated(uint256 maxRequiredBond);
    event AssertionRewardPaid(bytes32 indexed marketId, address indexed asserter, uint256 amount);
    event MarketKeyReleased(bytes32 indexed marketId, bytes32 marketKey);

    // ─────────────────────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────────────────────

    /// @param _poolManager     The Uniswap V4 PoolManager instance.
    /// @param _registry        The AgentRegistry used for Silicon Gate checks.
    /// @param _oo              The UMA Optimistic Oracle V3 address.
    /// @param _currency        The ERC-20 used as UMA bond currency.
    /// @param _defaultLiveness The liveness window in seconds.
    /// @param _owner           Admin (fees, treasury, pause). Also the initial treasury.
    constructor(
        IPoolManager _poolManager,
        IAgentRegistry _registry,
        OptimisticOracleV3Interface _oo,
        IERC20 _currency,
        uint64 _defaultLiveness,
        address _owner
    ) BaseHook(_poolManager) Ownable(_owner) {
        i_registry = _registry;
        i_oo = _oo;
        i_currency = _currency;
        i_defaultLiveness = _defaultLiveness;
        i_defaultIdentifier = ASSERT_TRUTH_IDENTIFIER;
        s_treasury = _owner;
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

    /// @notice Enforces that only eligible agents can execute swaps on pools using this hook.
    function _beforeSwap(address, PoolKey calldata, SwapParams calldata, bytes calldata)
        internal
        view
        override
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        // solhint-disable-next-line avoid-tx-origin
        _requireAgent(tx.origin);
        return (this.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
    }

    /// @notice Enforces that only eligible agents can add liquidity to pools using this hook.
    function _beforeAddLiquidity(address, PoolKey calldata, ModifyLiquidityParams calldata, bytes calldata)
        internal
        view
        override
        returns (bytes4)
    {
        // solhint-disable-next-line avoid-tx-origin
        _requireAgent(tx.origin);
        return this.beforeAddLiquidity.selector;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Market Creation
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Create a new prediction market.
    /// @dev `msg.value` first pays `s_marketCreationFee`; the remainder seeds AMM liquidity
    ///      and the creator receives the LP shares. The caller must have approved `reward`
    ///      of `i_currency` to this contract. Reverts with `DuplicateMarket` if an unresolved
    ///      market with the same normalized question and outcomes exists.
    ///      Outcomes may not be "Unresolvable" (reserved), and a yes/no pair must be ordered
    ///      yes first so that outcome1 is always the "yes" side.
    /// @param outcome1       Label for the first outcome (e.g. "yes").
    /// @param outcome2       Label for the second outcome (e.g. "no").
    /// @param description    Human-readable market question. Include the resolution source.
    /// @param reward         Amount of `i_currency` paid to the asserter of the final outcome.
    /// @param requiredBond   Minimum asserter bond (<= `s_maxRequiredBond`; OOV3 may raise it).
    /// @param closeTime      Trading stops at this timestamp (0 = at `resolutionTime`).
    /// @param resolutionTime Earliest timestamp an outcome may be asserted -- when the event
    ///                       has happened. At most `MAX_MARKET_DURATION` from now.
    /// @return marketId      The unique identifier for the newly created market.
    function createMarket(
        string calldata outcome1,
        string calldata outcome2,
        string calldata description,
        uint256 reward,
        uint256 requiredBond,
        uint64 closeTime,
        uint64 resolutionTime
    ) external payable returns (bytes32 marketId) {
        _requireNotPaused();
        _requireAgent(msg.sender);
        if (requiredBond > s_maxRequiredBond) revert BondTooHigh();

        marketId = _initMarket(outcome1, outcome2, description, _checkTimes(closeTime, resolutionTime), resolutionTime);

        Market storage m = s_markets[marketId];
        m.reward = reward;
        m.requiredBond = requiredBond;

        // Pull the reward from the market creator; it is paid to the asserter of the final
        // outcome via `claimAssertionReward`.
        if (reward > 0) {
            i_currency.safeTransferFrom(msg.sender, address(this), reward);
        }

        // `_initMarket` checked that msg.value covers the creation fee.
        uint256 liquidity = msg.value - s_marketCreationFee;
        if (liquidity > 0) {
            _addLiquidity(m, marketId, msg.sender, liquidity);
        }
    }

    /// @dev Duplicate check, creation fee, outcome tokens and the market's identity/timing.
    function _initMarket(
        string calldata outcome1,
        string calldata outcome2,
        string calldata description,
        uint64 closeTime,
        uint64 resolutionTime
    ) internal returns (bytes32 marketId) {
        bytes32 key = _marketKey(description, outcome1, outcome2);
        bytes32 existing = s_activeMarketByKey[key];
        if (existing != bytes32(0)) revert DuplicateMarket(existing);

        uint256 creationFee = s_marketCreationFee;
        if (msg.value < creationFee) revert InsufficientCreationFee();
        s_protocolFeesAccrued += creationFee;

        // Deterministic, collision-resistant marketId.
        marketId = keccak256(abi.encode(description, block.timestamp, msg.sender, s_marketCount));

        Market storage m = s_markets[marketId];
        m.description = description;
        m.outcome1 = outcome1;
        m.outcome2 = outcome2;
        // Outcome tokens are named after their own outcome. The hook is the sole minter/burner.
        m.outcome1Token = _deployOutcomeToken(outcome1, description, "clOUT1");
        m.outcome2Token = _deployOutcomeToken(outcome2, description, "clOUT2");
        m.creator = msg.sender;
        m.closeTime = closeTime;
        m.resolutionTime = resolutionTime;
        m.marketKey = key;

        s_activeMarketByKey[key] = marketId;
        s_marketIds.push(marketId);
        s_marketCount++;

        emit MarketInitialized(marketId, description, msg.sender);
        emit MarketConfigured(marketId, msg.sender, closeTime, resolutionTime, key, creationFee);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Complete Sets (fee-free)
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Deposit ETH collateral to mint equal amounts of both outcome tokens.
    /// @param marketId The market to mint tokens for.
    function mintOutcomeTokens(bytes32 marketId) external payable {
        _requireNotPaused();
        _requireAgent(msg.sender);
        if (msg.value == 0) revert ZeroMintAmount();

        Market storage m = _existingMarket(marketId);
        if (m.resolved) revert MarketAlreadyResolved();

        m.outcome1Token.mint(msg.sender, msg.value);
        m.outcome2Token.mint(msg.sender, msg.value);
        m.totalCollateral += msg.value;

        emit TokensMinted(marketId, msg.sender, msg.value);
    }

    /// @notice Burn `amount` of BOTH outcome tokens to get `amount` ETH back before resolution.
    /// @dev Always available (even when paused), so a complete set can always be exited.
    function mergeOutcomeTokens(bytes32 marketId, uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroMintAmount();
        Market storage m = _existingMarket(marketId);
        if (m.resolved) revert MarketAlreadyResolved();

        m.outcome1Token.burn(msg.sender, amount);
        m.outcome2Token.burn(msg.sender, amount);
        m.totalCollateral -= amount;

        emit TokensMerged(marketId, msg.sender, amount);
        _sendEth(msg.sender, amount);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Assertion (UMA OOV3)
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Assert the outcome of a market via UMA Optimistic Oracle V3.
    /// @dev The asserted outcome must exactly match `outcome1`, `outcome2`, or "Unresolvable",
    ///      and the market's resolution time must have passed. The caller must have approved
    ///      the bond (max(requiredBond, OOV3 minimum)) of `i_currency` to this contract.
    ///      Trading halts until the assertion resolves. If the assertion is resolved as
    ///      truthful, the asserter can collect the market's reward.
    function assertMarket(bytes32 marketId, string calldata assertedOutcome) external {
        _requireAgent(msg.sender);

        Market storage m = _existingMarket(marketId);
        if (m.resolved) revert MarketAlreadyResolved();
        if (m.assertedOutcomeId != bytes32(0)) revert ActiveAssertionExists();
        if (block.timestamp < m.resolutionTime) revert ResolutionTimeNotReached();

        bytes32 outcomeHash = keccak256(bytes(assertedOutcome));
        if (
            outcomeHash != keccak256(bytes(m.outcome1)) && outcomeHash != keccak256(bytes(m.outcome2))
                && outcomeHash != UNRESOLVABLE_HASH
        ) {
            revert InvalidOutcome();
        }

        // UMA pulls exactly `bond`; the reward stays here until `claimAssertionReward`.
        uint256 bond = getAssertionBond(marketId);
        i_currency.safeTransferFrom(msg.sender, address(this), bond);
        i_currency.forceApprove(address(i_oo), bond);

        bytes memory claim = abi.encodePacked("Market: ", m.description, ". Asserted outcome: ", assertedOutcome, ".");

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

        s_assertionToMarket[assertionId] = marketId;
        m.assertedOutcomeId = outcomeHash;
        m.activeAssertionId = assertionId;
        m.asserter = msg.sender;

        emit MarketAsserted(marketId, assertedOutcome, msg.sender, assertionId);
    }

    /// @notice Called by UMA OOV3 when an assertion is resolved.
    function assertionResolvedCallback(bytes32 assertionId, bool assertedTruthfully) external {
        if (msg.sender != address(i_oo)) revert OnlyOracle();

        bytes32 marketId = s_assertionToMarket[assertionId];
        Market storage m = s_markets[marketId];
        m.activeAssertionId = bytes32(0);

        if (assertedTruthfully) {
            m.resolved = true;
            // Free the question so it can be asked again (e.g. a new period).
            if (s_activeMarketByKey[m.marketKey] == marketId) {
                delete s_activeMarketByKey[m.marketKey];
            }
            emit MarketResolved(marketId, m.assertedOutcomeId);
        } else {
            // The reward rolls over to the next asserter.
            m.assertedOutcomeId = bytes32(0);
            m.asserter = address(0);
            emit AssertionFailed(marketId, assertionId);
        }
    }

    /// @notice Pay the market's reward to the asserter whose outcome was accepted.
    /// @dev Callable by anyone once the market has resolved; the reward always goes to the
    ///      asserter (including for an accepted "Unresolvable" assertion).
    function claimAssertionReward(bytes32 marketId) external nonReentrant {
        Market storage m = _existingMarket(marketId);
        if (!m.resolved) revert MarketNotResolved();
        uint256 reward = m.reward;
        if (reward == 0) revert NothingToClaim();
        m.reward = 0;
        address asserter = m.asserter;
        emit AssertionRewardPaid(marketId, asserter, reward);
        i_currency.safeTransfer(asserter, reward);
    }

    /// @notice Free the question key of an unresolved market so an equivalent market can be
    ///         created. The market itself keeps working.
    /// @dev The owner may release any key (moderation of squatted questions); anyone may
    ///      release one once `resolutionTime + KEY_RELEASE_DELAY` has passed.
    function releaseMarketKey(bytes32 marketId) external {
        Market storage m = _existingMarket(marketId);
        bytes32 key = m.marketKey;
        if (s_activeMarketByKey[key] != marketId) revert KeyNotReleasable();
        if (msg.sender != owner() && block.timestamp < uint256(m.resolutionTime) + KEY_RELEASE_DELAY) {
            revert KeyNotReleasable();
        }
        delete s_activeMarketByKey[key];
        emit MarketKeyReleased(marketId, key);
    }

    /// @notice Called by UMA OOV3 when an assertion is disputed (informational).
    function assertionDisputedCallback(bytes32 assertionId) external {
        if (msg.sender != address(i_oo)) revert OnlyOracle();
        emit AssertionDisputed(s_assertionToMarket[assertionId], assertionId);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Settlement
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Redeem outcome tokens of a resolved market for ETH.
    /// @dev Winning tokens redeem 1:1. For "Unresolvable" both tokens redeem at 0.5 each.
    ///      LPs withdraw their reserves with `removeLiquidity` first, then settle.
    ///      "Unresolvable" is checked first; outcome labels can never equal it.
    function settleOutcomeTokens(bytes32 marketId) external nonReentrant {
        Market storage m = _existingMarket(marketId);
        if (!m.resolved) revert MarketNotResolved();

        bytes32 resolvedOutcome = m.assertedOutcomeId;
        uint256 payout;

        if (resolvedOutcome == UNRESOLVABLE_HASH) {
            uint256 balance1 = m.outcome1Token.balanceOf(msg.sender);
            uint256 balance2 = m.outcome2Token.balanceOf(msg.sender);
            uint256 callerTotal = balance1 + balance2;
            if (callerTotal == 0) revert NoTokensToSettle();
            uint256 totalSupply = m.outcome1Token.totalSupply() + m.outcome2Token.totalSupply();
            payout = (callerTotal * m.totalCollateral) / totalSupply;
            if (balance1 > 0) m.outcome1Token.burn(msg.sender, balance1);
            if (balance2 > 0) m.outcome2Token.burn(msg.sender, balance2);
        } else {
            OutcomeToken winner = resolvedOutcome == keccak256(bytes(m.outcome1)) ? m.outcome1Token : m.outcome2Token;
            uint256 balance = winner.balanceOf(msg.sender);
            if (balance == 0) revert NoTokensToSettle();
            payout = (balance * m.totalCollateral) / winner.totalSupply();
            winner.burn(msg.sender, balance);
        }

        m.totalCollateral -= payout;
        emit TokensSettled(marketId, msg.sender, payout);
        _sendEth(msg.sender, payout);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Built-in CPMM (Constant Product Market Maker)
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Buy directional outcome tokens with ETH via the built-in CPMM.
    /// @param marketId      The market to trade on.
    /// @param isOutcome1    True to buy outcome1 tokens, false to buy outcome2 tokens.
    /// @param minTokensOut  Minimum tokens the buyer expects to receive (slippage protection).
    function buyOutcomeToken(bytes32 marketId, bool isOutcome1, uint256 minTokensOut) external payable {
        _requireAgent(msg.sender);
        if (msg.value == 0) revert ZeroMintAmount();
        Market storage m = _tradableMarket(marketId);

        (uint256 tokensOut, uint256 protocolFee, uint256 lpFee) = _quoteBuy(m, isOutcome1, msg.value);
        if (tokensOut < minTokensOut) revert InsufficientOutput();

        uint256 net = msg.value - protocolFee - lpFee;
        // Collateral grows by everything except the protocol fee; the net amount and the LP
        // fee are both minted as complete sets into the reserves.
        uint256 minted = net + lpFee;
        m.outcome1Token.mint(address(this), minted);
        m.outcome2Token.mint(address(this), minted);
        m.totalCollateral += minted;
        s_protocolFeesAccrued += protocolFee;

        if (isOutcome1) {
            m.reserve1 = m.reserve1 + minted - tokensOut;
            m.reserve2 += minted;
            m.outcome1Token.transfer(msg.sender, tokensOut);
        } else {
            m.reserve2 = m.reserve2 + minted - tokensOut;
            m.reserve1 += minted;
            m.outcome2Token.transfer(msg.sender, tokensOut);
        }

        emit TradeFeesCharged(marketId, protocolFee, lpFee);
        emit OutcomeTokenBought(marketId, msg.sender, isOutcome1, msg.value, tokensOut);
    }

    /// @notice Sell outcome tokens back to the built-in CPMM for ETH.
    /// @dev No approval needed: the hook moves the tokens itself.
    /// @param marketId   The market to trade on.
    /// @param isOutcome1 True to sell outcome1 tokens, false to sell outcome2 tokens.
    /// @param tokensIn   Amount of outcome tokens to sell.
    /// @param minEthOut  Minimum ETH the seller expects (slippage protection).
    function sellOutcomeToken(bytes32 marketId, bool isOutcome1, uint256 tokensIn, uint256 minEthOut)
        external
        nonReentrant
    {
        _requireAgent(msg.sender);
        if (tokensIn == 0) revert ZeroMintAmount();
        Market storage m = _tradableMarket(marketId);

        (uint256 ethOut, uint256 protocolFee, uint256 lpFee, uint256 setsOut) = _quoteSell(m, isOutcome1, tokensIn);
        if (ethOut == 0 || ethOut < minEthOut) revert InsufficientOutput();

        // Move the sold tokens into the pool, then burn `setsOut - lpFee` complete sets from
        // the reserves. The LP fee stays in the pool as collateral-backed sets.
        uint256 burned = setsOut - lpFee;
        if (isOutcome1) {
            m.outcome1Token.burn(msg.sender, tokensIn);
            m.outcome1Token.mint(address(this), tokensIn);
            m.reserve1 = m.reserve1 + tokensIn - burned;
            m.reserve2 -= burned;
        } else {
            m.outcome2Token.burn(msg.sender, tokensIn);
            m.outcome2Token.mint(address(this), tokensIn);
            m.reserve2 = m.reserve2 + tokensIn - burned;
            m.reserve1 -= burned;
        }
        m.outcome1Token.burn(address(this), burned);
        m.outcome2Token.burn(address(this), burned);
        m.totalCollateral -= burned;
        s_protocolFeesAccrued += protocolFee;

        emit TradeFeesCharged(marketId, protocolFee, lpFee);
        emit OutcomeTokenSold(marketId, msg.sender, isOutcome1, tokensIn, ethOut);
        _sendEth(msg.sender, ethOut);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Liquidity Provision
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Add ETH liquidity to a market's AMM and receive LP shares.
    /// @dev If the pool is unbalanced the surplus outcome tokens are sent to the provider
    ///      so the pool price does not move.
    function addLiquidity(bytes32 marketId) external payable returns (uint256 shares) {
        _requireAgent(msg.sender);
        if (msg.value == 0) revert ZeroMintAmount();
        Market storage m = _tradableMarket(marketId);
        shares = _addLiquidity(m, marketId, msg.sender, msg.value);
    }

    /// @notice Withdraw LP shares as outcome tokens. Available at any time, even when paused.
    /// @dev After resolution, call `settleOutcomeTokens` to redeem the returned tokens.
    function removeLiquidity(bytes32 marketId, uint256 shares)
        external
        nonReentrant
        returns (uint256 amount1, uint256 amount2)
    {
        if (shares == 0) revert ZeroMintAmount();
        Market storage m = _existingMarket(marketId);
        uint256 owned = s_lpShares[marketId][msg.sender];
        if (shares > owned) revert InsufficientShares();

        uint256 total = m.totalLpShares;
        amount1 = (m.reserve1 * shares) / total;
        amount2 = (m.reserve2 * shares) / total;

        s_lpShares[marketId][msg.sender] = owned - shares;
        m.totalLpShares = total - shares;
        m.reserve1 -= amount1;
        m.reserve2 -= amount2;

        if (amount1 > 0) m.outcome1Token.transfer(msg.sender, amount1);
        if (amount2 > 0) m.outcome2Token.transfer(msg.sender, amount2);

        emit LiquidityRemoved(marketId, msg.sender, shares, amount1, amount2);
    }

    function _addLiquidity(Market storage m, bytes32 marketId, address provider, uint256 amount)
        internal
        returns (uint256 shares)
    {
        uint256 r1 = m.reserve1;
        uint256 r2 = m.reserve2;
        uint256 total = m.totalLpShares;

        uint256 add1 = amount;
        uint256 add2 = amount;
        if (total == 0) {
            shares = amount;
        } else {
            uint256 poolWeight = r1 > r2 ? r1 : r2;
            add1 = (amount * r1) / poolWeight;
            add2 = (amount * r2) / poolWeight;
            shares = (amount * total) / poolWeight;
        }
        if (shares == 0) revert ZeroMintAmount();

        m.outcome1Token.mint(address(this), add1);
        m.outcome2Token.mint(address(this), add2);
        if (amount > add1) m.outcome1Token.mint(provider, amount - add1);
        if (amount > add2) m.outcome2Token.mint(provider, amount - add2);

        m.reserve1 = r1 + add1;
        m.reserve2 = r2 + add2;
        m.totalCollateral += amount;
        m.totalLpShares = total + shares;
        s_lpShares[marketId][provider] += shares;

        emit LiquidityAdded(marketId, provider, amount, shares);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Admin
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Set the trade fees. `protocolFeeBps + lpFeeBps` is capped at 10%.
    function setFees(uint256 protocolFeeBps, uint256 lpFeeBps) external onlyOwner {
        if (protocolFeeBps + lpFeeBps > MAX_TOTAL_FEE_BPS) revert FeeTooHigh();
        s_protocolFeeBps = protocolFeeBps;
        s_lpFeeBps = lpFeeBps;
        emit FeesUpdated(protocolFeeBps, lpFeeBps);
    }

    /// @notice Set the flat market creation fee (capped at 0.1 ETH).
    function setMarketCreationFee(uint256 fee) external onlyOwner {
        if (fee > MAX_MARKET_CREATION_FEE) revert FeeTooHigh();
        s_marketCreationFee = fee;
        emit MarketCreationFeeUpdated(fee);
    }

    /// @notice Set the largest `requiredBond` new markets may demand. A bond nobody can post
    ///         would make a market unresolvable. Existing markets keep their bond.
    function setMaxRequiredBond(uint256 maxRequiredBond) external onlyOwner {
        s_maxRequiredBond = maxRequiredBond;
        emit MaxRequiredBondUpdated(maxRequiredBond);
    }

    /// @notice Set the address that receives protocol fees.
    function setTreasury(address treasury) external onlyOwner {
        if (treasury == address(0)) revert ZeroAddress();
        s_treasury = treasury;
        emit TreasuryUpdated(treasury);
    }

    /// @notice Pause or unpause market creation and trading. Exits are never paused.
    function setPaused(bool paused) external onlyOwner {
        s_paused = paused;
        emit PausedUpdated(paused);
    }

    /// @notice Set the ERC-8004 IdentityRegistry whose holders are eligible (zero disables).
    function setErc8004IdentityRegistry(address registry) external onlyOwner {
        // A non-contract address would make every eligibility check revert.
        if (registry != address(0) && registry.code.length == 0) revert ZeroAddress();
        s_erc8004IdentityRegistry = IERC8004IdentityBalance(registry);
        emit Erc8004IdentityRegistryUpdated(registry);
    }

    /// @notice Send accrued protocol fees to the treasury. Callable by anyone.
    function withdrawProtocolFees() external nonReentrant returns (uint256 amount) {
        amount = s_protocolFeesAccrued;
        s_protocolFeesAccrued = 0;
        address treasury = s_treasury;
        emit ProtocolFeesWithdrawn(treasury, amount);
        _sendEth(treasury, amount);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // View Helpers
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Returns the core Market fields for a given marketId.
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

    /// @notice Returns the market fields added for mainnet (creator, timing, LP, dedupe key).
    /// @return creator           Address that created the market.
    /// @return closeTime         Trading close timestamp (0 = none).
    /// @return activeAssertionId Current UMA assertion (zero if none) -- dispute it on UMA OOV3.
    /// @return totalLpShares     Outstanding LP shares.
    /// @return marketKey         Normalized question key.
    /// @return tradingOpen       Whether buy/sell/addLiquidity would currently succeed.
    /// @return resolutionTime    Earliest timestamp an outcome may be asserted.
    function getMarketInfo(bytes32 marketId)
        external
        view
        returns (
            address creator,
            uint64 closeTime,
            bytes32 activeAssertionId,
            uint256 totalLpShares,
            bytes32 marketKey,
            bool tradingOpen,
            uint64 resolutionTime
        )
    {
        Market storage m = s_markets[marketId];
        return (
            m.creator,
            m.closeTime,
            m.activeAssertionId,
            m.totalLpShares,
            m.marketKey,
            _isTradable(m) && m.reserve1 > 0 && m.reserve2 > 0,
            m.resolutionTime
        );
    }

    /// @notice Returns all market IDs for enumeration by front-ends and agents.
    function getMarketIds() external view returns (bytes32[] memory) {
        return s_marketIds;
    }

    /// @notice Returns the implied probability for each outcome in basis points (0-10000).
    function getMarketProbability(bytes32 marketId) external view returns (uint256 prob1Bps, uint256 prob2Bps) {
        Market storage m = s_markets[marketId];
        if (m.reserve1 == 0 || m.reserve2 == 0) {
            return (5000, 5000);
        }
        prob1Bps = (m.reserve2 * BPS) / (m.reserve1 + m.reserve2);
        prob2Bps = BPS - prob1Bps;
    }

    /// @notice Returns the raw AMM reserves for a market.
    function getMarketReserves(bytes32 marketId) external view returns (uint256 reserve1, uint256 reserve2) {
        Market storage m = s_markets[marketId];
        return (m.reserve1, m.reserve2);
    }

    /// @notice Quote `buyOutcomeToken` for `ethIn` (zeros when the market has no liquidity).
    function quoteBuy(bytes32 marketId, bool isOutcome1, uint256 ethIn)
        external
        view
        returns (uint256 tokensOut, uint256 protocolFee, uint256 lpFee)
    {
        Market storage m = s_markets[marketId];
        if (m.reserve1 == 0 || m.reserve2 == 0 || ethIn == 0) return (0, 0, 0);
        return _quoteBuy(m, isOutcome1, ethIn);
    }

    /// @notice Quote `sellOutcomeToken` for `tokensIn` (zeros when the market has no liquidity).
    function quoteSell(bytes32 marketId, bool isOutcome1, uint256 tokensIn)
        external
        view
        returns (uint256 ethOut, uint256 protocolFee, uint256 lpFee)
    {
        Market storage m = s_markets[marketId];
        if (m.reserve1 == 0 || m.reserve2 == 0 || tokensIn == 0) return (0, 0, 0);
        (ethOut, protocolFee, lpFee,) = _quoteSell(m, isOutcome1, tokensIn);
    }

    /// @notice The bond an asserter must approve: max(requiredBond, UMA minimum).
    function getAssertionBond(bytes32 marketId) public view returns (uint256) {
        uint256 minimumBond = i_oo.getMinimumBond(address(i_currency));
        uint256 required = s_markets[marketId].requiredBond;
        return required > minimumBond ? required : minimumBond;
    }

    /// @notice Whether `account` may create markets and trade.
    function isEligibleAgent(address account) public view returns (bool) {
        if (i_registry.isAgent(account)) return true;
        IERC8004IdentityBalance identity = s_erc8004IdentityRegistry;
        if (address(identity) == address(0)) return false;
        try identity.balanceOf(account) returns (uint256 balance) {
            return balance > 0;
        } catch {
            return false;
        }
    }

    /// @notice The unresolved market asking this question, or zero.
    function getMarketIdByQuestion(string calldata description, string calldata outcome1, string calldata outcome2)
        external
        view
        returns (bytes32)
    {
        return s_activeMarketByKey[_marketKey(description, outcome1, outcome2)];
    }

    /// @notice Duplicate-detection key. Case, whitespace and sentence punctuation are ignored
    ///         and the outcome order does not matter ("Will ETH hit $4,000?" == "will eth hit
    ///         $4,000"). Symbols that change meaning (`<`, `>`, `$`, `%`, `-`, ...) and `.`, `,`,
    ///         `:` between two digits are kept ("> $1.50" != "< $150"). Reverts for invalid
    ///         outcomes (empty, identical, "Unresolvable", or "no" before "yes").
    function computeMarketKey(string calldata description, string calldata outcome1, string calldata outcome2)
        external
        pure
        returns (bytes32)
    {
        return _marketKey(description, outcome1, outcome2);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Internal Helpers
    // ─────────────────────────────────────────────────────────────────────────

    function _requireAgent(address account) internal view {
        if (!isEligibleAgent(account)) revert NotRegisteredAgent();
    }

    function _requireNotPaused() internal view {
        if (s_paused) revert ProtocolPaused();
    }

    function _existingMarket(bytes32 marketId) internal view returns (Market storage m) {
        m = s_markets[marketId];
        if (address(m.outcome1Token) == address(0)) revert MarketNotFound();
    }

    function _isTradable(Market storage m) internal view returns (bool) {
        return address(m.outcome1Token) != address(0) && !m.resolved && !s_paused && m.assertedOutcomeId == bytes32(0)
            && block.timestamp < m.closeTime;
    }

    function _tradableMarket(bytes32 marketId) internal view returns (Market storage m) {
        _requireNotPaused();
        m = _existingMarket(marketId);
        if (m.resolved) revert MarketAlreadyResolved();
        if (m.assertedOutcomeId != bytes32(0)) revert AssertionPending();
        if (block.timestamp >= m.closeTime) revert TradingClosed();
    }

    function _fees(uint256 amount) internal view returns (uint256 protocolFee, uint256 lpFee) {
        protocolFee = (amount * s_protocolFeeBps) / BPS;
        lpFee = (amount * s_lpFeeBps) / BPS;
    }

    /// @dev Buy: the net ETH mints complete sets into the pool, then enough of the bought
    ///      side is released to restore the invariant (rounded in the pool's favour).
    function _quoteBuy(Market storage m, bool isOutcome1, uint256 ethIn)
        internal
        view
        returns (uint256 tokensOut, uint256 protocolFee, uint256 lpFee)
    {
        uint256 r1 = m.reserve1;
        uint256 r2 = m.reserve2;
        if (r1 == 0 || r2 == 0) revert NoLiquidity();

        (protocolFee, lpFee) = _fees(ethIn);
        uint256 net = ethIn - protocolFee - lpFee;
        (uint256 rSelf, uint256 rOther) = isOutcome1 ? (r1, r2) : (r2, r1);
        uint256 newSelf = Math.ceilDiv(r1 * r2, rOther + net);
        tokensOut = rSelf + net - newSelf;
    }

    /// @dev Sell: the sold tokens join the pool and `setsOut` complete sets leave it, where
    ///      setsOut is the smaller root of (rSelf + t - x)(rOther - x) = rSelf * rOther:
    ///      x = (S - sqrt(S^2 - 4 t rOther)) / 2 with S = rSelf + t + rOther.
    ///      The square root is rounded up so x rounds down (in the pool's favour).
    function _quoteSell(Market storage m, bool isOutcome1, uint256 tokensIn)
        internal
        view
        returns (uint256 ethOut, uint256 protocolFee, uint256 lpFee, uint256 setsOut)
    {
        uint256 r1 = m.reserve1;
        uint256 r2 = m.reserve2;
        if (r1 == 0 || r2 == 0) revert NoLiquidity();

        (uint256 rSelf, uint256 rOther) = isOutcome1 ? (r1, r2) : (r2, r1);
        uint256 s = rSelf + tokensIn + rOther;
        uint256 root = Math.sqrt(s * s - 4 * tokensIn * rOther, Math.Rounding.Ceil);
        setsOut = (s - root) / 2;

        (protocolFee, lpFee) = _fees(setsOut);
        ethOut = setsOut - protocolFee - lpFee;
    }

    /// @dev Validates the market timing and returns the effective close time.
    function _checkTimes(uint64 closeTime, uint64 resolutionTime) internal view returns (uint64) {
        if (resolutionTime <= block.timestamp || resolutionTime > block.timestamp + MAX_MARKET_DURATION) {
            revert InvalidResolutionTime();
        }
        if (closeTime == 0) return resolutionTime;
        if (closeTime <= block.timestamp || closeTime > resolutionTime) revert InvalidCloseTime();
        return closeTime;
    }

    function _deployOutcomeToken(string calldata outcome, string calldata description, string memory fallbackSymbol)
        internal
        returns (OutcomeToken)
    {
        return new OutcomeToken(
            string.concat("CLAW ", outcome, " - ", description), _tokenSymbol(outcome, fallbackSymbol), address(this)
        );
    }

    /// @dev keccak of the normalized description and the order-independent outcome pair.
    ///      Also validates the outcomes: non-empty, distinct, not the reserved "Unresolvable"
    ///      result, and a yes/no pair ordered yes first.
    function _marketKey(string calldata description, string calldata outcome1, string calldata outcome2)
        internal
        pure
        returns (bytes32)
    {
        bytes memory d = _normalize(description);
        bytes32 h1 = keccak256(_normalize(outcome1));
        bytes32 h2 = keccak256(_normalize(outcome2));
        if (
            d.length == 0 || h1 == h2 || h1 == keccak256("") || h2 == keccak256("")
                || h1 == NORMALIZED_UNRESOLVABLE_HASH || h2 == NORMALIZED_UNRESOLVABLE_HASH
                || (h1 == NORMALIZED_NO_HASH && h2 == NORMALIZED_YES_HASH)
        ) {
            revert InvalidMarketParams();
        }
        if (h1 > h2) (h1, h2) = (h2, h1);
        return keccak256(abi.encode(keccak256(d), h1, h2));
    }

    /// @dev Lower-cases ASCII letters; drops whitespace, control characters and the sentence
    ///      punctuation ? ! ; ' " ` ; drops `.` `,` `:` unless both neighbours are digits.
    ///      Every other byte (symbols, digits, non-ASCII) is kept.
    function _normalize(string calldata text) internal pure returns (bytes memory out) {
        bytes calldata b = bytes(text);
        out = new bytes(b.length);
        uint256 len;
        for (uint256 i; i < b.length; ++i) {
            bytes1 c = b[i];
            if (c >= 0x41 && c <= 0x5A) {
                c = bytes1(uint8(c) + 32);
            } else if (c <= 0x20 || c == 0x7F || c == "?" || c == "!" || c == ";" || c == "'" || c == '"' || c == "`") {
                continue;
            } else if (
                (c == "." || c == "," || c == ":")
                    && (i == 0 || i + 1 == b.length || !_isDigit(b[i - 1]) || !_isDigit(b[i + 1]))
            ) {
                continue;
            }
            out[len++] = c;
        }
        assembly {
            mstore(out, len)
        }
    }

    function _isDigit(bytes1 c) private pure returns (bool) {
        return c >= 0x30 && c <= 0x39;
    }

    /// @dev "cl" + up to 8 upper-cased ASCII letters/digits of the outcome label
    ///      ("yes" -> "clYES"), or `fallbackSymbol` when the label has none.
    function _tokenSymbol(string calldata label, string memory fallbackSymbol) internal pure returns (string memory) {
        bytes calldata b = bytes(label);
        bytes memory out = new bytes(10);
        out[0] = "c";
        out[1] = "l";
        uint256 len = 2;
        for (uint256 i; i < b.length && len < 10; ++i) {
            bytes1 c = b[i];
            if (c >= 0x61 && c <= 0x7A) c = bytes1(uint8(c) - 32);
            if ((c >= 0x41 && c <= 0x5A) || _isDigit(c)) out[len++] = c;
        }
        if (len == 2) return fallbackSymbol;
        assembly {
            mstore(out, len)
        }
        return string(out);
    }

    function _sendEth(address to, uint256 amount) internal {
        if (amount == 0) return;
        (bool success,) = to.call{value: amount}("");
        if (!success) revert EthTransferFailed();
    }

    /// @notice Allow the contract to receive ETH.
    receive() external payable {}
}
