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
    event FundsWithdrawn(address indexed to, uint256 amount);
    event OwnershipTransferInitiated(address indexed previousOwner, address indexed newOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event AuthorizationStatusChanged(address indexed account, bool status);

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
        require(to != address(0), "DEVoterTreasury: withdraw to the zero address");
        require(amount > 0, "DEVoterTreasury: withdraw zero amount");
        require(address(this).balance >= amount, "DEVoterTreasury: Insufficient balance for withdrawal");
        to.transfer(amount);
        emit FundsWithdrawn(to, amount);
    }

    function setAuthorized(address account, bool status) external onlyOwner {
        require(account != address(0), "DEVoterTreasury: authorize zero address");
        authorized[account] = status;
        emit AuthorizationStatusChanged(account, status);
    }

    function initiateOwnerTransfer(address newOwner) external onlyOwner {
        require(newOwner != address(0), "DEVoterTreasury: new owner is the zero address");
        require(newOwner != owner, "DEVoterTreasury: new owner is current owner");
        pendingOwner = newOwner;
        emit OwnershipTransferInitiated(owner, newOwner);
    }

    function acceptOwnerTransfer() external {
        require(pendingOwner != address(0), "DEVoterTreasury: no pending owner");
        require(msg.sender == pendingOwner, "DEVoterTreasury: not pending owner");
        address previousOwner = owner;
        owner = pendingOwner;
        pendingOwner = address(0);
        emit OwnershipTransferred(previousOwner, owner);
    }

    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }
}
