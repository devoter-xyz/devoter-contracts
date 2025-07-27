# Fee Calculation System Documentation

## Overview

The DEVoterEscrow contract implements a comprehensive fee calculation system using basis points for precise fee management. This system provides accurate fee calculations, maximum fee limits, fee exemptions, and administrative controls.

## Basis Points System

### What are Basis Points?
- **1 basis point = 0.01%**
- **100 basis points = 1%**
- **10,000 basis points = 100%**

### Constants
- `BASIS_POINTS_DENOMINATOR = 10000` - Base for calculations
- `MAX_FEE_BASIS_POINTS = 500` - Maximum 5% fee (500 basis points)
- `MIN_FEE_BASIS_POINTS = 0` - Minimum 0% fee

## Fee Calculation Functions

### `calculateFee(uint256 amount, address user)`
Calculates the fee amount for a given deposit amount and user.

**Parameters:**
- `amount` - The amount to calculate fee for
- `user` - The user address (for exemption check)

**Returns:**
- `feeAmount` - The calculated fee amount

**Logic:**
1. Returns 0 if amount is 0
2. Returns 0 if user is fee exempt
3. Returns 0 if fee basis points is 0
4. Calculates: `(amount * feeBasisPoints) / BASIS_POINTS_DENOMINATOR`
5. Ensures fee doesn't exceed the amount

### `calculateEscrowAmount(uint256 amount, address user)`
Calculates both the fee and the amount that will be escrowed.

**Parameters:**
- `amount` - The total amount to be deposited
- `user` - The user address (for exemption check)

**Returns:**
- `escrowedAmount` - The amount that will be escrowed
- `feeAmount` - The fee amount that will be charged

### `previewFee(uint256 amount, address user)`
Preview function for users to see fee calculations before depositing.

**Parameters:**
- `amount` - The amount to calculate fee for
- `user` - The user address

**Returns:**
- `feeAmount` - The calculated fee amount
- `escrowedAmount` - The amount that would be escrowed
- `isExempt` - Whether the user is fee exempt

## Fee Exemption System

### Individual Exemptions
```solidity
function setFeeExemption(address user, bool isExempt) external onlyOwner
```

### Batch Exemptions
```solidity
function batchSetFeeExemptions(address[] calldata users, bool[] calldata exemptions) external onlyOwner
```

### Check Exemption Status
```solidity
function isFeeExempt(address user) external view returns (bool)
```

## Administrative Functions

### Update Fee Basis Points
```solidity
function updateFeeBasisPoints(uint256 newFeeBasisPoints) external onlyOwner
```
- Enforces maximum 5% (500 basis points) limit
- Enforces minimum 0% (0 basis points) limit
- Emits `FeeBasisPointsUpdated` event

### Update Fee Wallet
```solidity
function updateFeeWallet(address newFeeWallet) external onlyOwner
```
- Rejects zero address
- Emits `FeeWalletUpdated` event

## Fee Collection

### Automatic Collection
Fees are automatically collected during the `deposit` function:
1. Calculate fee using `calculateFee()`
2. Transfer total amount from user to contract
3. Transfer fee amount to fee wallet
4. Escrow remaining amount
5. Emit `FeeCollected` event

### Fee Tracking
Each escrow tracks the fee paid:
```solidity
struct EscrowData {
    bool isActive;
    uint256 amount;
    uint256 depositTimestamp;
    uint256 releaseTimestamp;
    uint256 feePaid; // Track fee paid for this escrow
}
```

## View Functions

### `getFeeInfo()`
Returns comprehensive fee information:
- Current fee in basis points
- Maximum allowed fee in basis points
- Current fee wallet address

### `getEscrowFeePaid(address user)`
Returns the fee amount paid for a specific escrow.

### Backward Compatibility
```solidity
function getFeePercentage() external view returns (uint256)
```
Converts basis points to percentage for legacy compatibility.

## Events

### Fee-Related Events
- `FeeBasisPointsUpdated(uint256 oldFeeBasisPoints, uint256 newFeeBasisPoints)`
- `FeeWalletUpdated(address indexed oldFeeWallet, address indexed newFeeWallet)`
- `FeeExemptionUpdated(address indexed user, bool isExempt)`
- `FeeCollected(address indexed user, uint256 feeAmount)`

### Enhanced Deposit Event
```solidity
event TokensDeposited(
    address indexed user, 
    uint256 amount, 
    uint256 feePaid, 
    uint256 amountEscrowed, 
    uint256 releaseTimestamp
);
```

## Usage Examples

### Basic Fee Calculation
```solidity
// 10% fee (1000 basis points)
uint256 amount = 1000 * 10**18; // 1000 tokens
uint256 fee = (amount * 1000) / 10000; // 100 tokens
uint256 escrowed = amount - fee; // 900 tokens
```

### Fee Exemption
```solidity
// Set user as fee exempt
escrowContract.setFeeExemption(userAddress, true);

// User deposits without fee
uint256 amount = 1000 * 10**18;
uint256 fee = escrowContract.calculateFee(amount, userAddress); // Returns 0
uint256 escrowed = amount; // Full amount escrowed
```

### Preview Before Deposit
```solidity
// User previews fee before depositing
(uint256 fee, uint256 escrowed, bool exempt) = escrowContract.previewFee(amount, userAddress);
```

## Security Features

### Maximum Fee Enforcement
- Hard-coded maximum of 5% (500 basis points)
- Prevents excessive fee extraction
- Validated in constructor and update functions

### Zero Address Protection
- Rejects zero addresses for token and fee wallet
- Prevents loss of funds

### Access Control
- Only owner can update fee parameters
- Only owner can set fee exemptions
- Uses OpenZeppelin's `Ownable` pattern

### Reentrancy Protection
- All state-changing functions use `nonReentrant` modifier
- Prevents reentrancy attacks during fee collection

## Gas Optimization

### Efficient Calculations
- Uses basis points for precise calculations
- Minimal storage operations
- Optimized for view functions

### Batch Operations
- `batchSetFeeExemptions` for efficient bulk updates
- Reduces gas costs for multiple exemptions

## Testing

The fee system includes comprehensive tests covering:
- Basic fee calculations
- Edge cases (zero amounts, rounding)
- Fee exemptions
- Administrative functions
- Maximum fee enforcement
- Event emissions
- Gas efficiency

## Migration from Percentage System

The contract maintains backward compatibility:
- `getFeePercentage()` converts basis points to percentage
- Existing integrations can continue working
- New features use basis points for precision

## Best Practices

1. **Always preview fees** before depositing
2. **Use basis points** for precise fee calculations
3. **Set appropriate exemptions** for special users
4. **Monitor fee collection** through events
5. **Test edge cases** with small amounts
6. **Validate fee parameters** before updates 