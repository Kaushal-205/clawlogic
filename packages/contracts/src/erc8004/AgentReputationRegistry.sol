// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC8004AgentReputation} from "../interfaces/erc8004/IERC8004AgentReputation.sol";
import {IERC8004AgentIdentity} from "../interfaces/erc8004/IERC8004AgentIdentity.sol";

/// @title AgentReputationRegistry
/// @author $CLAWLOGIC Team
/// @notice ERC-8004 compliant Agent Reputation Registry.
/// @dev Tracks on-chain reputation metrics for agent identities. Reputation is derived
///      from market assertion outcomes (assertions that were resolved successfully vs.
///      disputed and overturned) and the cumulative trading volume.
///
///      **Data Model:**
///      The ReputationScore struct is gas-optimized with packed fields:
///      - totalAssertions (uint64): supports up to ~18.4 quintillion assertions per agent
///      - successfulAssertions (uint64): same range
///      - totalVolume (uint128): supports up to ~3.4e38 wei (~3.4e20 ETH)
///      - lastUpdated (uint256): full timestamp precision
///      This packs the first three fields into a single 256-bit storage slot.
///
///      **Access Control:**
///      Only the authorized recorder (intended to be the PredictionMarketHook) can write
///      reputation data. The recorder address is set by the contract owner and can be
///      updated if the hook is redeployed.
///
///      **Identity Verification:**
///      The registry verifies that agent IDs exist in the AgentIdentityRegistry before
///      recording data, ensuring reputation is only tracked for valid identities.
contract AgentReputationRegistry is Ownable, IERC8004AgentReputation {
    // -------------------------------------------------
    // Immutables
    // -------------------------------------------------

    /// @notice The AgentIdentityRegistry used to verify agent existence.
    IERC8004AgentIdentity public immutable i_identityRegistry;

    // -------------------------------------------------
    // Storage
    // -------------------------------------------------

    /// @dev Maps agent ID to its reputation score.
    mapping(uint256 => ReputationScore) private s_reputations;

    /// @dev The address authorized to record assertion outcomes (PredictionMarketHook).
    address private s_recorder;

    // -------------------------------------------------
    // Constructor
    // -------------------------------------------------

    /// @notice Deploys the AgentReputationRegistry.
    /// @param initialOwner The address that can set/change the recorder (protocol admin).
    /// @param identityRegistry The AgentIdentityRegistry for agent existence checks.
    /// @param recorder The initial address authorized to record assertions (PredictionMarketHook).
    constructor(address initialOwner, IERC8004AgentIdentity identityRegistry, address recorder)
        Ownable(initialOwner)
    {
        if (recorder == address(0)) {
            revert ZeroAddress();
        }
        i_identityRegistry = identityRegistry;
        s_recorder = recorder;
    }

    // -------------------------------------------------
    // Modifiers
    // -------------------------------------------------

    /// @dev Restricts function access to the authorized recorder address.
    modifier onlyRecorder() {
        if (msg.sender != s_recorder) {
            revert OnlyRecorder();
        }
        _;
    }

    // -------------------------------------------------
    // External Functions
    // -------------------------------------------------

    /// @inheritdoc IERC8004AgentReputation
    function recordAssertion(uint256 agentId, bytes32 marketId, bool successful, uint256 volume)
        external
        onlyRecorder
    {
        if (!i_identityRegistry.agentExists(agentId)) {
            revert AgentDoesNotExist();
        }

        ReputationScore storage score = s_reputations[agentId];

        // Increment counters. Using unchecked for gas savings -- uint64 overflow at
        // ~1.8e19 is practically unreachable in any real scenario.
        unchecked {
            score.totalAssertions++;
            if (successful) {
                score.successfulAssertions++;
            }
        }

        // Accumulate volume. uint128 supports up to ~3.4e38 wei which is sufficient.
        // We use a safe cast check to prevent silent overflow.
        uint128 volumeU128 = _safeToUint128(volume);
        unchecked {
            score.totalVolume += volumeU128;
        }

        score.lastUpdated = block.timestamp;

        emit AssertionRecorded(agentId, marketId, successful, volume);
    }

    /// @notice Update the authorized recorder address.
    /// @dev Only callable by the contract owner.
    /// @param newRecorder The new recorder address (typically a new PredictionMarketHook deployment).
    function setRecorder(address newRecorder) external onlyOwner {
        if (newRecorder == address(0)) {
            revert ZeroAddress();
        }

        address oldRecorder = s_recorder;
        s_recorder = newRecorder;

        emit RecorderUpdated(oldRecorder, newRecorder);
    }

    /// @inheritdoc IERC8004AgentReputation
    function getReputationScore(uint256 agentId) external view returns (ReputationScore memory) {
        return s_reputations[agentId];
    }

    /// @inheritdoc IERC8004AgentReputation
    function getAccuracy(uint256 agentId) external view returns (uint256) {
        ReputationScore storage score = s_reputations[agentId];

        if (score.totalAssertions == 0) {
            return 0;
        }

        // Return accuracy in basis points (0-10000).
        // successfulAssertions <= totalAssertions by invariant, so no overflow risk
        // in the multiplication since both are uint64 and 10000 fits in uint16.
        return (uint256(score.successfulAssertions) * 10_000) / uint256(score.totalAssertions);
    }

    /// @notice Get the current authorized recorder address.
    /// @return The recorder address.
    function getRecorder() external view returns (address) {
        return s_recorder;
    }

    // -------------------------------------------------
    // Internal Helpers
    // -------------------------------------------------

    /// @dev Safely casts a uint256 to uint128, reverting on overflow.
    /// @param value The value to cast.
    /// @return The value as uint128.
    function _safeToUint128(uint256 value) internal pure returns (uint128) {
        if (value > type(uint128).max) {
            // This would indicate an impossibly large volume in a single assertion.
            // We revert rather than silently truncating.
            revert("Volume overflow");
        }
        return uint128(value);
    }
}
