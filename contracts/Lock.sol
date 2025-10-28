// SPDX-License-Identifier: MIT

/**
 * @title Lock
 * @dev A simple time-locked contract that allows the owner to withdraw funds after a specified unlock time.
 * The contract is initialized with an unlock time and can receive ETH. Only the owner can withdraw after the unlock time.
 */
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

// Uncomment this line to use console.log
import "hardhat/console.sol";

contract Lock is ReentrancyGuard, Ownable {
    /**
     * @dev The timestamp when funds can be withdrawn.
     */
    uint public unlockTime;

    /**
     * @dev The address of the contract owner who can withdraw funds.
     */


    /**
     * @dev Emitted when a withdrawal is made.
     * @param amount The amount withdrawn (entire contract balance).
     * @param when The timestamp when the withdrawal occurred.
     */
    event Withdrawal(uint amount, uint indexed when);

    /**
     * @dev Initializes the contract with a future unlock time. Sets the deployer as the owner.
     * @param _unlockTime The timestamp after which funds can be withdrawn.
     * Requirements:
     * - _unlockTime must be in the future.
     * - Contract can receive ETH at deployment.
     */
    constructor(uint _unlockTime) payable Ownable(msg.sender) {
        require(
            block.timestamp < _unlockTime,
            "Unlock time should be in the future"
        );

        unlockTime = _unlockTime;

    }

    /**
     * @dev Allows the owner to withdraw all funds after the unlock time.
     * Access Control: Only the owner can call this function.
     * Reentrancy: Protected with nonReentrant. Uses a value-bearing call to the owner; no state changes after the external call.
     * Requirements:
     * - Current time must be greater than or equal to unlockTime.
     * - Caller must be the owner.
     * Emits a {Withdrawal} event.
     */
    function withdraw() public onlyOwner nonReentrant {
        // Uncomment this line, and the import of "hardhat/console.sol", to print a log in your terminal
                console.log("Lock: withdraw called, balance: %o", address(this).balance);

        require(block.timestamp >= unlockTime, "You can't withdraw yet");


        uint256 amount = address(this).balance;
        (bool ok, ) = payable(owner()).call{value: amount}("");
        require(ok, "ETH transfer failed");
        emit Withdrawal(amount, block.timestamp);
    }

    // Accept plain ETH transfers after deployment
    receive() external payable {}
}
