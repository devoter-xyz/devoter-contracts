// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract DEVoterEscrow is ReentrancyGuard, Ownable {
    IERC20 public immutable token;
    address public feeWallet;
    uint256 public feePercentage;

    mapping(address => uint256) public deposits;

    constructor(address _tokenAddress, address _feeWallet, uint256 _feePercentage) Ownable() {
        token = IERC20(_tokenAddress);
        feeWallet = _feeWallet;
        feePercentage = _feePercentage;
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
