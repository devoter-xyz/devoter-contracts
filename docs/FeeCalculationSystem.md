# Fee Calculation System

## What this doc covers

This document explains the fee system implemented in `DEVoterEscrow`. It describes:

- the basis-points model used for calculations
- how fees are calculated and collected
- exemption and administrative controls
- rounding behaviour and common edge cases

## Basis points (bps) refresher

- 1 basis point (1 bps) = 0.01%
- 100 bps = 1%
- 10,000 bps = 100%

Key constants used in the contract:

- `BASIS_POINTS_DENOMINATOR = 10000` (the denominator for bps math)
- `MAX_FEE_BASIS_POINTS = 500` (maximum fee: 5%)
- `MIN_FEE_BASIS_POINTS = 0` (minimum fee: 0%)

## Core formula

All fee calculations use integer arithmetic. The canonical formula used by `calculateFee` is:

$$
fee = \left\lfloor \frac{amount \times fee\_basis\_points}{BASIS\_POINTS\_DENOMINATOR} \right\rfloor
$$

In solidity this is implemented as:

```solidity
uint256 fee = (amount * feeBasisPoints) / BASIS_POINTS_DENOMINATOR;
```

Notes:

- Integer division truncates (rounds down). Small amounts may yield a zero fee.
- The contract enforces: `feeBasisPoints <= MAX_FEE_BASIS_POINTS`.
- For safety the computed fee is capped so it never exceeds `amount` (i.e. `fee = min(fee, amount)`).

## Function behavior (summary)

- calculateFee(uint256 amount, address user) -> (uint256 fee)

  - Returns 0 when `amount == 0`.
  - Returns 0 when `isFeeExempt(user) == true`.
  - Returns 0 when `feeBasisPoints == 0`.
  - Otherwise returns the formula above, capped by `amount`.

- calculateEscrowAmount(uint256 amount, address user) -> (uint256 escrowedAmount, uint256 fee)

  - Computes `fee` with `calculateFee` and returns `escrowedAmount = amount - fee`.

- previewFee(uint256 amount, address user) -> (uint256 fee, uint256 escrowedAmount, bool isExempt)
  - Read-only helper for clients to preview the result before calling `deposit`.

## Fee collection flow (high level)

During `deposit`:

1. Call `calculateFee(amount, user)`.
2. Transfer `amount` from the user to the contract (ERC20 `transferFrom`).
3. Transfer `fee` from the contract to `feeWallet`.
4. Create the escrow for `escrowedAmount = amount - fee`.
5. Emit `FeeCollected` and `TokensDeposited` (or equivalent) events.

Escrow data stores the `feePaid` so fees are traceable per-escrow.

```solidity
struct EscrowData {
        bool isActive;
        uint256 amount; // amount escrowed (after fee)
        uint256 depositTimestamp;
        uint256 releaseTimestamp;
        uint256 feePaid; // fee paid for this escrow
}
```

## Exemptions and administration

- setFeeExemption(address user, bool isExempt) external onlyOwner
- batchSetFeeExemptions(address[] calldata users, bool[] calldata exemptions) external onlyOwner
- isFeeExempt(address user) external view returns (bool)

Admin controls:

- updateFeeBasisPoints(uint256 newFeeBasisPoints) external onlyOwner

  - Enforced constraints: `MIN_FEE_BASIS_POINTS <= newFeeBasisPoints <= MAX_FEE_BASIS_POINTS`.
  - Emits `FeeBasisPointsUpdated(old, new)`.

- updateFeeWallet(address newFeeWallet) external onlyOwner
  - Rejects zero address.
  - Emits `FeeWalletUpdated(old, new)`.

## Events

- `event FeeBasisPointsUpdated(uint256 indexed oldFeeBasisPoints, uint256 indexed newFeeBasisPoints)`
- `event FeeWalletUpdated(address indexed oldFeeWallet, address indexed newFeeWallet)`
- `event FeeExemptionUpdated(address indexed user, bool isExempt)`
- `event FeeCollected(address indexed user, uint256 feeAmount)`
- `event TokensDeposited(address indexed user, uint256 amount, uint256 feePaid, uint256 amountEscrowed, uint256 releaseTimestamp)`

## Examples

Example 1 — typical deposit with 5% fee (contract max):

```text
amount = 1_000 * 10**18  // 1000 tokens with 18 decimals
feeBasisPoints = 500     // 5%
fee = floor(amount * 500 / 10000) = 50 * 10**18
escrowed = amount - fee = 950 * 10**18
```

Example 2 — small amount rounding to zero fee:

```text
amount = 1 * 10**12      // very small token amount relative to decimals
feeBasisPoints = 500     // 5%
fee = floor(amount * 500 / 10000) = 0  // becomes zero due to integer division
escrowed = amount
```

Example 3 — fee exemption:

```text
isFeeExempt(user) == true
fee = 0
escrowed = amount
```

## Edge cases & notes

- Rounding: Solidity integer division rounds toward zero. Tests should assert expected rounding behavior for small amounts.
- Cap: The fee is always capped by the deposited amount (defensive programming) even though math should not produce a larger fee.
- Token decimals: Fee math is token-decimals-agnostic; however the effective human-perceived fee depends on token decimals. Use consistent units in UI (e.g., show values in token decimals).
- Gas: `batchSetFeeExemptions` reduces repeated owner calls but may be gas-heavy for very large arrays; split into chunks if needed.

## Tests (what to cover)

- Basic calculation at several bps values (0, small, max).
- Zero amount, fee = 0.
- Rounding behaviour for small amounts.
- Fee exemption on/off.
- updateFeeBasisPoints enforcement (min/max and events).
- updateFeeWallet rejects zero address and emits event.
- deposit flow emits `FeeCollected` and stores `feePaid` on the escrow record.

## Best practices

1. Always call `previewFee` on the client before creating a deposit transaction.
2. Keep UI and smart contract using the same token-decimal assumptions.
3. Use exemptions sparingly and track them via events for auditability.
4. When changing fees, notify users off-chain (fee changes affect costs immediately).

---
