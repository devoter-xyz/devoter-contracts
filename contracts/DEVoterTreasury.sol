// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title DEVoterTreasury
 * @dev A treasury contract to securely hold and manage protocol funds, with controlled withdrawal mechanisms.
 */
contract DEVoterTreasury {
    address public owner;
    address public pendingOwner;
    mapping(address => bool) public authorized;

    event Deposit(address indexed from, uint256 amount);
    event Withdrawal(address indexed to, uint256 amount);
    event OwnerTransferInitiated(address indexed previousOwner, address indexed newOwner);
    event OwnerTransferred(address indexed previousOwner, address indexed newOwner);
    event Authorized(address indexed account, bool status);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyAuthorized() {
        require(authorized[msg.sender] || msg.sender == owner, "Not authorized");
        _;
    }

    constructor() {
        owner = msg.sender;
        authorized[msg.sender] = true;
    }

    receive() external payable {
        emit Deposit(msg.sender, msg.value);
    }

    function deposit() external payable {
        emit Deposit(msg.sender, msg.value);
    }

    function withdraw(address payable to, uint256 amount) external onlyAuthorized {
        require(address(this).balance >= amount, "Insufficient balance");
        to.transfer(amount);
        emit Withdrawal(to, amount);
    }

    function setAuthorized(address account, bool status) external onlyOwner {
        authorized[account] = status;
        emit Authorized(account, status);
    }

    function initiateOwnerTransfer(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Zero address");
        pendingOwner = newOwner;
        emit OwnerTransferInitiated(owner, newOwner);
    }

    function acceptOwnerTransfer() external {
        require(msg.sender == pendingOwner, "Not pending owner");
        address previousOwner = owner;
        owner = pendingOwner;
        pendingOwner = address(0);
        emit OwnerTransferred(previousOwner, owner);
    }

    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }
}
