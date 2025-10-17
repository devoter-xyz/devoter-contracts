// SPDX-License-Identifier: MIT

/**
 * @title Lock
 * @dev A simple time-locked contract that allows the owner to withdraw funds after a specified unlock time.
 * The contract is initialized with an unlock time and can receive ETH. Only the owner can withdraw after the unlock time.
 */
pragma solidity ^0.8.28;

// Uncomment this line to use console.log
// import "hardhat/console.sol";

contract Lock {
    /**
     * @dev The timestamp when funds can be withdrawn.
     */
    uint public unlockTime;

    /**
     * @dev The address of the contract owner who can withdraw funds.
     */
    address payable public owner;

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
    constructor(uint _unlockTime) payable {
        require(
            block.timestamp < _unlockTime,
            "Unlock time should be in the future"
        );

        unlockTime = _unlockTime;
        owner = payable(msg.sender);
    }

    /**
     * @dev Allows the owner to withdraw all funds after the unlock time.
     * Access Control: Only the owner can call this function.
     * Reentrancy: This function transfers the entire balance, which is safe from reentrancy as there are no subsequent calls to external contracts.
     * Requirements:
     * - Current time must be greater than or equal to unlockTime.
     * - Caller must be the owner.
     * Emits a {Withdrawal} event.
     */
    function withdraw() public {
        // Uncomment this line, and the import of "hardhat/console.sol", to print a log in your terminal
        // console.log("Unlock time is %o and block timestamp is %o", unlockTime, block.timestamp);

        require(block.timestamp >= unlockTime, "You can't withdraw yet");
        require(msg.sender == owner, "You aren't the owner");

        emit Withdrawal(address(this).balance, block.timestamp);

        owner.transfer(address(this).balance);
    }
}
