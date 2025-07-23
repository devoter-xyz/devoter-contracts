// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract DEVoterEscrow is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable token;
    address public feeWallet;
    uint256 public feePercentage;
    uint256 public constant ESCROW_DURATION = 30 days;

    struct EscrowData {
        uint256 amount;
        uint256 depositTimestamp;
        uint256 releaseTimestamp;
        bool isActive;
        uint256 votesCast;
    }

    mapping(address => EscrowData) public userEscrows;
    mapping(address => bool) public hasActiveEscrow;

    event TokensDeposited(address indexed user, uint256 amount, uint256 releaseTimestamp);

    constructor(address _tokenAddress, address _feeWallet, uint256 _feePercentage) Ownable() {
        token = IERC20(_tokenAddress);
        feeWallet = _feeWallet;
        feePercentage = _feePercentage;
    }

    function escrowTokensForVoting(uint256 amount) external nonReentrant {
        require(amount > 0, "Amount must be greater than 0");
        require(!hasActiveEscrow[msg.sender], "User already has active escrow");

        token.safeTransferFrom(msg.sender, address(this), amount);

        uint256 releaseTimestamp = block.timestamp + ESCROW_DURATION;

        userEscrows[msg.sender] = EscrowData({
            amount: amount,
            depositTimestamp: block.timestamp,
            releaseTimestamp: releaseTimestamp,
            isActive: true,
            votesCast: 0
        });

        hasActiveEscrow[msg.sender] = true;

        emit TokensDeposited(msg.sender, amount, releaseTimestamp);
    }

    function getFeeWallet() external view returns (address) {
        return feeWallet;
    }

    function getFeePercentage() external view returns (uint256) {
        return feePercentage;
    }

    function getTokenAddress() external view returns (address) {
        return address(token);
    }
}
