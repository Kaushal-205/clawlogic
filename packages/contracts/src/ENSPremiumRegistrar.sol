// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {IENS} from "./interfaces/IENS.sol";
import {IAgentRegistry} from "./interfaces/IAgentRegistry.sol";

/// @title ENSPremiumRegistrar
/// @author CLAWLOGIC Team
/// @notice Sells one-time premium ENS subdomain ownership under a configured base node
///         (e.g. `*.clawlogic.eth`) in exchange for USDC.
/// @dev Purchase flow uses commit-reveal to reduce label front-running risk:
///      1) commitPurchase(keccak256(abi.encode(buyer, labelHash, secret)))
///      2) buyName(label, secret, maxPrice)
///
///      The registrar must own `baseNode` in ENS for `setSubnodeOwner` to succeed.
contract ENSPremiumRegistrar {
    using SafeERC20 for IERC20;

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    error NotOwner();
    error ZeroAddress();
    error EmptyLabel();
    error NameAlreadySold();
    error NotAgent();
    error MissingCommitment();
    error CommitTooEarly();
    error CommitExpired();
    error PriceSlippage();
    error InvalidCommitWindow();

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event PurchaseCommitted(address indexed buyer, bytes32 indexed commitment, uint256 timestamp);
    event NamePurchased(
        address indexed buyer,
        string label,
        bytes32 indexed subnode,
        uint256 paidAmount
    );
    event PricingUpdated(uint256 shortPrice, uint256 mediumPrice, uint256 longPrice);
    event CommitWindowUpdated(uint64 minDelay, uint64 maxAge);
    event TreasuryUpdated(address indexed treasury);
    event AgentOnlyModeUpdated(bool enabled);

    // -------------------------------------------------------------------------
    // Constants / Immutables
    // -------------------------------------------------------------------------

    uint8 private constant SHORT_LABEL_MAX = 3;
    uint8 private constant MEDIUM_LABEL_MAX = 6;

    IENS public immutable i_ensRegistry;
    IERC20 public immutable i_usdc;
    bytes32 public immutable i_baseNode;
    IAgentRegistry public immutable i_agentRegistry;

    // -------------------------------------------------------------------------
    // Storage
    // -------------------------------------------------------------------------

    address public s_owner;
    address public s_treasury;
    bool public s_agentOnlyMode;

    uint256 public s_shortPrice;
    uint256 public s_mediumPrice;
    uint256 public s_longPrice;

    uint64 public s_commitMinDelay;
    uint64 public s_commitMaxAge;

    // commitment => commit timestamp
    mapping(bytes32 => uint256) public s_commitments;

    // labelHash => purchase info
    mapping(bytes32 => address) public s_labelOwner;
    mapping(bytes32 => uint256) public s_labelPurchasedAt;
    mapping(bytes32 => uint256) public s_labelPricePaid;

    constructor(
        IENS ensRegistry_,
        bytes32 baseNode_,
        IERC20 usdc_,
        IAgentRegistry agentRegistry_,
        address treasury_
    ) {
        if (address(ensRegistry_) == address(0)) revert ZeroAddress();
        if (baseNode_ == bytes32(0)) revert ZeroAddress();
        if (address(usdc_) == address(0)) revert ZeroAddress();
        if (treasury_ == address(0)) revert ZeroAddress();

        i_ensRegistry = ensRegistry_;
        i_baseNode = baseNode_;
        i_usdc = usdc_;
        i_agentRegistry = agentRegistry_;

        s_owner = msg.sender;
        s_treasury = treasury_;
        s_agentOnlyMode = true;

        // Default USDC tiers (6 decimals):
        // <=3 chars: 250 USDC
        // <=6 chars: 100 USDC
        // >6 chars:  25 USDC
        s_shortPrice = 250e6;
        s_mediumPrice = 100e6;
        s_longPrice = 25e6;

        // Default commit window
        s_commitMinDelay = 30; // seconds
        s_commitMaxAge = 1 days;
    }

    modifier onlyOwner() {
        if (msg.sender != s_owner) {
            revert NotOwner();
        }
        _;
    }

    // -------------------------------------------------------------------------
    // Admin
    // -------------------------------------------------------------------------

    function setTreasury(address treasury_) external onlyOwner {
        if (treasury_ == address(0)) revert ZeroAddress();
        s_treasury = treasury_;
        emit TreasuryUpdated(treasury_);
    }

    function setAgentOnlyMode(bool enabled) external onlyOwner {
        s_agentOnlyMode = enabled;
        emit AgentOnlyModeUpdated(enabled);
    }

    function setPricing(uint256 shortPrice, uint256 mediumPrice, uint256 longPrice) external onlyOwner {
        s_shortPrice = shortPrice;
        s_mediumPrice = mediumPrice;
        s_longPrice = longPrice;
        emit PricingUpdated(shortPrice, mediumPrice, longPrice);
    }

    function setCommitWindow(uint64 minDelay, uint64 maxAge) external onlyOwner {
        if (minDelay == 0 || maxAge <= minDelay) {
            revert InvalidCommitWindow();
        }
        s_commitMinDelay = minDelay;
        s_commitMaxAge = maxAge;
        emit CommitWindowUpdated(minDelay, maxAge);
    }

    // -------------------------------------------------------------------------
    // Purchase
    // -------------------------------------------------------------------------

    function commitPurchase(bytes32 commitment) external {
        s_commitments[commitment] = block.timestamp;
        emit PurchaseCommitted(msg.sender, commitment, block.timestamp);
    }

    function buyName(string calldata label, bytes32 secret, uint256 maxPrice) external returns (bytes32 subnode) {
        if (s_agentOnlyMode) {
            if (address(i_agentRegistry) == address(0) || !i_agentRegistry.isAgent(msg.sender)) {
                revert NotAgent();
            }
        }

        bytes32 labelHash = _labelHash(label);
        subnode = _subnode(labelHash);
        if (s_labelOwner[labelHash] != address(0) || i_ensRegistry.owner(subnode) != address(0)) {
            revert NameAlreadySold();
        }

        bytes32 commitment = computeCommitment(msg.sender, labelHash, secret);
        uint256 committedAt = s_commitments[commitment];
        if (committedAt == 0) revert MissingCommitment();
        if (block.timestamp < committedAt + s_commitMinDelay) revert CommitTooEarly();
        if (block.timestamp > committedAt + s_commitMaxAge) revert CommitExpired();

        uint256 price = quotePrice(label);
        if (price > maxPrice) revert PriceSlippage();

        // Transfer USDC to treasury.
        i_usdc.safeTransferFrom(msg.sender, s_treasury, price);

        // Mint ENS ownership for buyer.
        i_ensRegistry.setSubnodeOwner(i_baseNode, labelHash, msg.sender);

        s_labelOwner[labelHash] = msg.sender;
        s_labelPurchasedAt[labelHash] = block.timestamp;
        s_labelPricePaid[labelHash] = price;
        delete s_commitments[commitment];

        emit NamePurchased(msg.sender, label, subnode, price);
    }

    // -------------------------------------------------------------------------
    // Views
    // -------------------------------------------------------------------------

    function quotePrice(string calldata label) public view returns (uint256) {
        uint256 labelLength = bytes(label).length;
        if (labelLength == 0) revert EmptyLabel();
        if (labelLength <= SHORT_LABEL_MAX) return s_shortPrice;
        if (labelLength <= MEDIUM_LABEL_MAX) return s_mediumPrice;
        return s_longPrice;
    }

    function isNameAvailable(string calldata label) external view returns (bool) {
        bytes32 labelHash = _labelHash(label);
        bytes32 subnode = _subnode(labelHash);
        return s_labelOwner[labelHash] == address(0) && i_ensRegistry.owner(subnode) == address(0);
    }

    function getLabelInfo(string calldata label)
        external
        view
        returns (
            address owner,
            uint256 purchasedAt,
            uint256 paidPrice,
            bytes32 subnode,
            bool available
        )
    {
        bytes32 labelHash = _labelHash(label);
        subnode = _subnode(labelHash);
        owner = s_labelOwner[labelHash];
        purchasedAt = s_labelPurchasedAt[labelHash];
        paidPrice = s_labelPricePaid[labelHash];
        available = owner == address(0) && i_ensRegistry.owner(subnode) == address(0);
    }

    function computeCommitment(address buyer, bytes32 labelHash, bytes32 secret) public pure returns (bytes32) {
        return keccak256(abi.encode(buyer, labelHash, secret));
    }

    function computeLabelHash(string calldata label) external pure returns (bytes32) {
        return _labelHash(label);
    }

    function computeSubnode(string calldata label) external view returns (bytes32) {
        return _subnode(_labelHash(label));
    }

    // -------------------------------------------------------------------------
    // Internals
    // -------------------------------------------------------------------------

    function _labelHash(string calldata label) internal pure returns (bytes32) {
        if (bytes(label).length == 0) revert EmptyLabel();
        return keccak256(bytes(label));
    }

    function _subnode(bytes32 labelHash) internal view returns (bytes32) {
        return keccak256(abi.encodePacked(i_baseNode, labelHash));
    }
}
