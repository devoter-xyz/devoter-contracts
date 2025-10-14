// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;


import "@thirdweb-dev/contracts/base/ERC20Vote.sol";

/**
 * @title MockDEVToken
 * @dev ERC20 token with voting capabilities, minting, burning, and batch minting for testing and development purposes.
 * Inherits from thirdweb's ERC20Vote contract.
 */
contract MockDEVToken is ERC20Vote {
    /**
     * @dev Deploys the MockDEVToken contract and mints an initial supply to the default admin.
     * @param _defaultAdmin The address that will receive the initial supply and have admin rights.
     * @param _name The name of the token.
     * @param _symbol The symbol of the token.
     */
    constructor(
        address _defaultAdmin,
        string memory _name,
        string memory _symbol
    ) ERC20Vote(_defaultAdmin, _name, _symbol) {
        // Calculate initial supply: 1,000,000 * 10^18
        uint256 initialSupply = 1000000 * 10**decimals();
        
        // Mint initial supply to default admin
        _mint(_defaultAdmin, initialSupply);
    }

    /**
     * @notice Burns tokens from the caller's account.
     * @dev The caller must have at least 'amount' tokens. Amount must be greater than zero.
     * @param amount The amount of tokens to burn.
     */
    function burn(uint256 amount) public override {
        require(amount > 0, "MockDEVToken: burn amount must be greater than zero");
        _burn(msg.sender, amount);
    }

    /**
     * @dev Checks if the given address is authorized to mint tokens.
     * Only the contract owner can mint new tokens.
     * @param _address The address to check for minting rights.
     * @return True if the address is the owner, false otherwise.
     */
    function _canMint(address _address) internal view virtual returns (bool) {
        return owner() == _address;
    }

    /**
     * @notice Mints tokens to a specified address.
     * @dev Only the owner can call this function. The recipient address must not be zero, and amount must be greater than zero.
     * @param to The address to receive the minted tokens.
     * @param amount The amount of tokens to mint.
     */
    function mintTo(address to, uint256 amount) public override {
        require(to != address(0), "MockDEVToken: cannot mint to the zero address");
        require(amount > 0, "MockDEVToken: mint amount must be greater than zero");
        require(_canMint(msg.sender), "MockDEVToken: caller not authorized to mint");
        _mint(to, amount);
    }

    /**
     * @notice Mints tokens to multiple addresses in a single transaction.
     * @dev Only the owner can call this function. Arrays must have the same length. Each recipient address must not be zero, and each amount must be greater than zero.
     * @param to Array of addresses to receive minted tokens.
     * @param amounts Array of amounts to mint to each address.
     */
    function batchMintTo(address[] calldata to, uint256[] calldata amounts) public {
        require(to.length == amounts.length, "MockDEVToken: recipient and amount arrays must have same length");
        require(_canMint(msg.sender), "MockDEVToken: caller not authorized to batch mint");
        for (uint256 i = 0; i < to.length; i++) {
            require(to[i] != address(0), "MockDEVToken: cannot mint to the zero address");
            require(amounts[i] > 0, "MockDEVToken: mint amount must be greater than zero");
            _mint(to[i], amounts[i]);
        }
    }
}