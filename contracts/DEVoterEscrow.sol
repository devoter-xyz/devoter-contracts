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
    uint256 public votingPeriod;

    struct EscrowData {
        bool isActive;
        uint256 amount;
        uint256 depositTimestamp;
        uint256 releaseTimestamp;
    }

    mapping(address => EscrowData) public escrows;

    event TokensDeposited(address indexed user, uint256 amount, uint256 releaseTimestamp);

    constructor(
        address _tokenAddress,
        address _feeWallet,
        uint256 _feePercentage,
        uint256 _votingPeriod
    ) Ownable() {
        token = IERC20(_tokenAddress);
        feeWallet = _feeWallet;
        feePercentage = _feePercentage;
        votingPeriod = _votingPeriod;
    }

    function deposit(uint256 _amount) external nonReentrant {
        require(_amount > 0, "Deposit amount must be greater than 0");
        require(!escrows[msg.sender].isActive, "User already has an active escrow");

        uint256 fee = (_amount * feePercentage) / 100;
        uint256 amountToEscrow = _amount - fee;

        require(token.transferFrom(msg.sender, address(this), _amount), "Token transfer failed");
        if (fee > 0) {
            require(token.transfer(feeWallet, fee), "Fee transfer failed");
        }

        escrows[msg.sender] = EscrowData({
            isActive: true,
            amount: amountToEscrow,
            depositTimestamp: block.timestamp,
            releaseTimestamp: calculateReleaseTimestamp(block.timestamp)
        });

        emit TokensDeposited(msg.sender, amountToEscrow, escrows[msg.sender].releaseTimestamp);
    }

    function release() external nonReentrant {
        EscrowData storage escrow = escrows[msg.sender];
        require(escrow.isActive, "No active escrow for this user");
        require(block.timestamp >= escrow.releaseTimestamp, "Voting period is not over yet");

        uint256 amountToRelease = escrow.amount;
        escrow.isActive = false;
        escrow.amount = 0;

        require(token.transfer(msg.sender, amountToRelease), "Token release failed");
    }

    function calculateReleaseTimestamp(uint256 depositTime) internal view returns (uint256) {
        return depositTime + votingPeriod;
    }

    function isVotingPeriodActive(address user) public view returns (bool) {
        EscrowData memory escrow = escrows[user];
        return escrow.isActive && block.timestamp < escrow.releaseTimestamp;
    }

    function getRemainingVotingTime(address user) external view returns (uint256) {
        EscrowData memory escrow = escrows[user];
        if (!escrow.isActive || block.timestamp >= escrow.releaseTimestamp) {
            return 0;
        }
        return escrow.releaseTimestamp - block.timestamp;
    }

    function canReleaseTokens(address user) public view returns (bool) {
        EscrowData memory escrow = escrows[user];
        return escrow.isActive && block.timestamp >= escrow.releaseTimestamp;
    }

    function getEscrowDetails(address user) external view onlyOwner returns (EscrowData memory) {
        return escrows[user];
    }

    function updateReleaseTimestamp(address user, uint256 newReleaseTimestamp) external onlyOwner {
        require(escrows[user].isActive, "No active escrow for this user");
        escrows[user].releaseTimestamp = newReleaseTimestamp;
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