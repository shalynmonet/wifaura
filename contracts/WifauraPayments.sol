// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20Wif {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
}

/// @notice Immutable, noncustodial 50/50 checkout. Quote IDs encode an expiry
/// in their first 8 bytes, followed by a random 24-byte server nonce.
/// The server validates every event field against its durable quote before fulfillment.
/// No admin, upgrades, withdrawals, price oracle, or private keys are needed by this contract.
contract WifauraPayments {
    IERC20Wif public immutable token;
    address public immutable treasury;
    mapping(address => mapping(bytes32 => bool)) public paid;
    bool private entered;
    event Paid(bytes32 indexed quoteId, address indexed payer, address indexed reserve, uint256 amount, uint256 reserveAmount);

    constructor(address token_, address treasury_) {
        require(token_.code.length > 0 && treasury_ != address(0) && treasury_ != address(this), "configuration");
        token = IERC20Wif(token_);
        treasury = treasury_;
    }

    function pay(bytes32 quoteId, address reserve, uint256 amount, uint64 deadline) external {
        require(!entered, "reentrant");
        require(deadline == uint64(uint256(quoteId) >> 192), "quote deadline");
        require(block.timestamp <= deadline && quoteId != bytes32(0) && !paid[msg.sender][quoteId], "expired or paid");
        require(amount > 0 && amount % 2 == 0, "even amount required");
        require(reserve != address(0) && reserve != address(this) && reserve != treasury && reserve != msg.sender && msg.sender != treasury, "reserve");
        entered = true;
        paid[msg.sender][quoteId] = true;
        uint256 half = amount / 2;
        uint256 beforeReserve = token.balanceOf(reserve);
        uint256 beforeTreasury = token.balanceOf(treasury);
        require(token.transferFrom(msg.sender, reserve, half), "reserve transfer");
        require(token.transferFrom(msg.sender, treasury, half), "treasury transfer");
        // Reject transfer-tax/rebasing behavior rather than falsely reporting delivery.
        require(token.balanceOf(reserve) == beforeReserve + half, "reserve delta");
        require(token.balanceOf(treasury) == beforeTreasury + half, "treasury delta");
        emit Paid(quoteId, msg.sender, reserve, amount, half);
        entered = false;
    }
}
