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
