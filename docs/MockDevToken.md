# MockDEVToken Contract

## Overview

MockDEVToken is an ERC20 token with voting capabilities, built on top of Thirdweb's ERC20Vote contract. This contract is designed for testing and development purposes in the Devoter ecosystem.

## Features

- **ERC20 Compliance**: Standard ERC20 token functionality
- **Voting Capabilities**: Built-in delegation and voting power tracking
- **Minting Controls**: Owner-only minting with batch support
- **Initial Supply**: 1,000,000 tokens minted to deployer

## Contract Details

- **Symbol**: mDEV (configurable)
- **Name**: Mock DEV Token (configurable)
- **Decimals**: 18 (inherited from ERC20Vote)
- **Initial Supply**: 1,000,000 tokens

## Functions

### Core Functions

- `mintTo(address to, uint256 amount)` - Mint tokens to a specific address (owner only)
- `batchMintTo(address[] to, uint256[] amounts)` - Batch mint tokens to multiple addresses
- `delegate(address delegatee)` - Delegate voting power to another address
- `getVotes(address account)` - Get current voting power of an address

### Access Control

- Only the contract owner can mint new tokens
- All standard ERC20 functions are available to token holders

## Deployment

The contract requires three constructor parameters:
- `_defaultAdmin`: Address that will own the contract and receive initial supply
- `_name`: Token name
- `_symbol`: Token symbol

## Testing

Comprehensive tests are available in [test/MockDEVToken.ts](../test/MockDEVToken.ts) covering:
- Deployment and initialization
- Minting functionality and restrictions
- Voting delegation features
- Access control mechanisms

## Usage Example

```typescript
// Deploy the contract
const mockDEVToken = await hre.viem.deployContract("MockDEVToken", [
  ownerAddress,
  "Mock DEV Token",
  "mDEV",
]);

// Mint tokens to an address
await mockDEVToken.write.mintTo([recipientAddress, parseEther("1000")]);

// Delegate voting power
await mockDEVToken.write.delegate([delegateAddress]);