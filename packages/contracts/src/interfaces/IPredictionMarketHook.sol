// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {PoolId} from "v4-core/src/types/PoolId.sol";

/// @title IPredictionMarketHook
/// @notice Interface for the core CLAWLOGIC prediction market contract integrated with
///         Uniswap V4 hooks and UMA Optimistic Oracle V3 for resolution.
/// @dev This interface defines the market lifecycle:
///      initializeMarket -> mintOutcomeTokens -> assertMarket -> settleOutcomeTokens.
interface IPredictionMarketHook {
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

    /// @notice Emitted when UMA OOV3 resolves an assertion as NOT truthful.
    event AssertionFailed(bytes32 indexed marketId, bytes32 assertionId);

    /// @notice Emitted when UMA OOV3 notifies that an assertion has been disputed.
    event AssertionDisputed(bytes32 indexed marketId, bytes32 assertionId);

    /// @notice Emitted when an agent redeems winning outcome tokens for ETH.
    event TokensSettled(bytes32 indexed marketId, address indexed agent, uint256 payout);

    /// @notice Emitted when an agent buys directional outcome tokens via the built-in CPMM.
    event OutcomeTokenBought(
        bytes32 indexed marketId, address indexed buyer, bool isOutcome1, uint256 ethIn, uint256 tokensOut
    );

    /// @notice Emitted alongside MarketInitialized with the market's extra configuration.
    event MarketConfigured(
        bytes32 indexed marketId, address indexed creator, uint64 closeTime, bytes32 marketKey, uint256 creationFee
    );

    /// @notice Emitted when outcome token pairs are burned back into ETH before resolution.
    event TokensMerged(bytes32 indexed marketId, address indexed agent, uint256 amount);

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

    // ─────────────────────────────────────────────────────────────────────────
    // Errors
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Thrown when the caller (or tx.origin in hook context) is not a registered agent.
    error NotRegisteredAgent();

    /// @notice Thrown when a marketId does not correspond to an initialized market.
    error MarketNotFound();

    /// @notice Thrown when an operation is attempted on an already-resolved market.
    error MarketAlreadyResolved();

    /// @notice Thrown when a new assertion is attempted while one is already active.
    error ActiveAssertionExists();

    /// @notice Thrown when the asserted outcome does not match outcome1, outcome2, or "Unresolvable".
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

    /// @notice Thrown when the output tokens from a buy are below the caller's minimum.
    error InsufficientOutput();

    /// @notice Thrown when an equivalent market is still unresolved.
    error DuplicateMarket(bytes32 existingMarketId);

    /// @notice Thrown when the description is empty or the outcomes are empty/identical.
    error InvalidMarketParams();

    /// @notice Thrown when a close time is in the past.
    error InvalidCloseTime();

    /// @notice Thrown when trading after the market's close time.
    error TradingClosed();

    /// @notice Thrown when trading while an assertion is awaiting resolution.
    error AssertionPending();

    /// @notice Thrown when creation or trading is attempted while paused.
    error ProtocolPaused();

    /// @notice Thrown when msg.value does not cover the market creation fee.
    error InsufficientCreationFee();

    /// @notice Thrown when trading against a market with no AMM liquidity.
    error NoLiquidity();

    /// @notice Thrown when removing more LP shares than owned.
    error InsufficientShares();

    // ─────────────────────────────────────────────────────────────────────────
    // Functions
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Create a new prediction market.
    /// @param outcome1     Label for the first outcome (e.g. "yes").
    /// @param outcome2     Label for the second outcome (e.g. "no").
    /// @param description  Human-readable market question.
    /// @param reward       Amount of bond currency offered as incentive to the asserter.
    /// @param requiredBond Minimum bond required from an asserter.
    /// @return marketId    The unique identifier for the newly created market.
    function initializeMarket(
        string calldata outcome1,
        string calldata outcome2,
        string calldata description,
        uint256 reward,
        uint256 requiredBond
    ) external payable returns (bytes32 marketId);

    /// @notice Create a new prediction market with an optional trading close time.
    /// @dev msg.value pays the creation fee; the rest seeds AMM liquidity (creator gets LP shares).
    function createMarket(
        string calldata outcome1,
        string calldata outcome2,
        string calldata description,
        uint256 reward,
        uint256 requiredBond,
        uint64 closeTime
    ) external payable returns (bytes32 marketId);

    /// @notice Burn `amount` of both outcome tokens for `amount` ETH before resolution.
    function mergeOutcomeTokens(bytes32 marketId, uint256 amount) external;

    /// @notice Sell outcome tokens back to the CPMM for ETH.
    function sellOutcomeToken(bytes32 marketId, bool isOutcome1, uint256 tokensIn, uint256 minEthOut) external;

    /// @notice Add ETH liquidity to a market's AMM.
    function addLiquidity(bytes32 marketId) external payable returns (uint256 shares);

    /// @notice Withdraw LP shares as outcome tokens.
    function removeLiquidity(bytes32 marketId, uint256 shares) external returns (uint256 amount1, uint256 amount2);

    /// @notice Quote a buy: tokens out and the fees paid.
    function quoteBuy(bytes32 marketId, bool isOutcome1, uint256 ethIn)
        external
        view
        returns (uint256 tokensOut, uint256 protocolFee, uint256 lpFee);

    /// @notice Quote a sell: ETH out and the fees paid.
    function quoteSell(bytes32 marketId, bool isOutcome1, uint256 tokensIn)
        external
        view
        returns (uint256 ethOut, uint256 protocolFee, uint256 lpFee);

    /// @notice Bond an asserter must approve for this market.
    function getAssertionBond(bytes32 marketId) external view returns (uint256);

    /// @notice Whether `account` may create markets and trade.
    function isEligibleAgent(address account) external view returns (bool);

    /// @notice The unresolved market asking this question, or zero.
    function getMarketIdByQuestion(string calldata description, string calldata outcome1, string calldata outcome2)
        external
        view
        returns (bytes32);

    /// @notice Creator, close time, active assertion, LP shares, question key, trading status.
    function getMarketInfo(bytes32 marketId)
        external
        view
        returns (
            address creator,
            uint64 closeTime,
            bytes32 activeAssertionId,
            uint256 totalLpShares,
            bytes32 marketKey,
            bool tradingOpen
        );

    /// @notice Deposit ETH collateral to mint equal amounts of both outcome tokens.
    /// @param marketId The market to mint tokens for.
    function mintOutcomeTokens(bytes32 marketId) external payable;

    /// @notice Assert the outcome of a market via UMA Optimistic Oracle V3.
    /// @param marketId        The market to assert.
    /// @param assertedOutcome The outcome string (must match outcome1, outcome2, or "Unresolvable").
    function assertMarket(bytes32 marketId, string calldata assertedOutcome) external;

    /// @notice Redeem winning outcome tokens for proportional ETH collateral.
    /// @param marketId The resolved market.
    function settleOutcomeTokens(bytes32 marketId) external;

    /// @notice Returns the full Market data for a given marketId.
    /// @param marketId The identifier of the market.
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
        );

    /// @notice Buy directional outcome tokens via the built-in CPMM.
    /// @param marketId      The market to trade on.
    /// @param isOutcome1    True to buy outcome1 tokens, false to buy outcome2 tokens.
    /// @param minTokensOut  Minimum tokens the buyer expects to receive (slippage protection).
    function buyOutcomeToken(bytes32 marketId, bool isOutcome1, uint256 minTokensOut) external payable;

    /// @notice Returns the implied probability for each outcome in basis points (0-10000).
    /// @param marketId The market to query.
    /// @return prob1Bps Outcome1 probability in basis points.
    /// @return prob2Bps Outcome2 probability in basis points.
    function getMarketProbability(bytes32 marketId) external view returns (uint256 prob1Bps, uint256 prob2Bps);

    /// @notice Returns the raw AMM reserves for a market.
    /// @param marketId The market to query.
    /// @return reserve1 The outcome1 token reserve.
    /// @return reserve2 The outcome2 token reserve.
    function getMarketReserves(bytes32 marketId) external view returns (uint256 reserve1, uint256 reserve2);

    /// @notice Returns all market IDs for enumeration.
    /// @return An array of all created marketId values.
    function getMarketIds() external view returns (bytes32[] memory);
}
