// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @notice Protocol Fee Calculation System Overview
 * @dev This contract is part of a system that may involve fee calculations.
 * The canonical formula for fee calculation across the protocol is:
 * `fee = (amount * feeBasisPoints) / BASIS_POINTS_DENOMINATOR`
 *
 * Key constants for fee calculation:
 * - BASIS_POINTS_DENOMINATOR = 10000 (for 0.01% precision)
 * - MAX_FEE_BASIS_POINTS = 500 (representing 5%)
 * - MIN_FEE_BASIS_POINTS = 0 (representing 0%, defined in DEVoterEscrow.sol)
 *
 * Integer division truncates (rounds down). Small amounts may yield a zero fee.
 * The computed fee is typically capped so it never exceeds the `amount`.
 * For a comprehensive explanation, refer to `docs/FeeCalculationSystem.md`.
 */
/**
 * @title DEVoterTreasury
 * @dev A treasury contract to securely hold and manage protocol funds, with controlled withdrawal mechanisms. For details on fee calculation, refer to docs/FeeCalculationSystem.md.
 */
contract DEVoterTreasury {
    address public owner; /**
     * @dev The address of the current owner of the contract.
     */
    address public pendingOwner; /**
     * @dev The address of the new owner during a two-step ownership transfer process.
     */
    mapping(address => bool) public authorized; /**
     * @dev Mapping to track which addresses are authorized to perform withdrawals.
     */

    uint256 public constant BASIS_POINTS_DENOMINATOR = 10000;
    uint256 public constant MAX_FEE_BASIS_POINTS = 500; // Represents 5%

    event Deposit(address indexed from, uint256 amount);
    event Withdrawal(address indexed to, uint256 amount);
    event OwnerTransferInitiated(address indexed previousOwner, address indexed newOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event Authorized(address indexed account, bool status);

    modifier onlyOwner() { /**
     * @dev Throws if called by any account other than the owner.
     */
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyAuthorized() { /**
     * @dev Throws if called by any account not authorized or not the owner.
     */
        require(authorized[msg.sender] || msg.sender == owner, "Not authorized");
        _;
    }

    /**
     * @dev Initializes the contract and sets the deployer as the initial owner and an authorized address.
     * @notice The deployer automatically gains ownership and authorization to manage the treasury.
     */
    constructor() {
        owner = msg.sender;
        authorized[msg.sender] = true;
    }

    /**
     * @dev Allows the contract to receive Ether directly.
     * @notice Any Ether sent directly to the contract will be recorded as a deposit.
     */
    receive() external payable {
        emit Deposit(msg.sender, msg.value);
    }

    /**
     * @dev Allows users to explicitly deposit Ether into the treasury.
     * @notice This function is an alternative to directly sending Ether to the contract address.
     */
    function deposit() external payable {
        emit Deposit(msg.sender, msg.value);
    }

    /**
     * @dev Allows authorized accounts to withdraw a specified amount of Ether from the treasury.
     * @param to The address to which the Ether will be sent.
     * @param amount The amount of Ether to withdraw.
     * @notice Only authorized addresses or the owner can withdraw funds.
     */
    function withdraw(address payable to, uint256 amount) external onlyAuthorized {
        require(to != address(0), "DEVoterTreasury: withdraw to the zero address");
        require(amount > 0, "DEVoterTreasury: withdraw zero amount");
        require(address(this).balance >= amount, "DEVoterTreasury: Insufficient balance for withdrawal");
        to.transfer(amount);
        emit Withdrawal(to, amount);
    }

    /**
     * @dev Sets or unsets the authorization status for a given account.
     * @param account The address to authorize or deauthorize.
     * @param status True to authorize, false to deauthorize.
     * @notice Only the owner can modify authorization statuses.
     */
    function setAuthorized(address account, bool status) external onlyOwner {
        require(account != address(0), "DEVoterTreasury: authorize zero address");
        authorized[account] = status;
        emit Authorized(account, status);
    }

    /**
     * @dev Initiates a two-step ownership transfer to a new address.
     * @param newOwner The address of the prospective new owner.
     * @notice The new owner must accept the transfer for it to be finalized.
     */
    function initiateOwnerTransfer(address newOwner) external onlyOwner {
        require(newOwner != address(0), "DEVoterTreasury: new owner is the zero address");
        require(newOwner != owner, "DEVoterTreasury: new owner is current owner");
        pendingOwner = newOwner;
        emit OwnerTransferInitiated(owner, newOwner);
    }

    /**
     * @dev Allows the `pendingOwner` to accept ownership of the contract.
     * @notice This completes the two-step ownership transfer process.
     */
    function acceptOwnerTransfer() external {
        require(pendingOwner != address(0), "DEVoterTreasury: no pending owner");
        require(msg.sender == pendingOwner, "DEVoterTreasury: not pending owner");
        address previousOwner = owner;
        owner = pendingOwner;
        pendingOwner = address(0);
        emit OwnershipTransferred(previousOwner, owner);
    }

    /**
     * @dev Returns the current Ether balance of the treasury contract.
     * @return The current balance of the contract in Wei.
     * @notice This function provides transparency into the treasury's holdings.
     */
    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }
}
