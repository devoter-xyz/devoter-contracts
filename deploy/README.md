# Deployment Scripts

This directory contains scripts for deploying and interacting with the smart contracts.

## Environment Variables

Before running any scripts, ensure you have a `.env` file in the project root (`devoter-contracts/`) with the following environment variables:

```
PRIVATE_KEY=your_metamask_private_key_here
BASE_MAINNET_RPC_URL=https://mainnet.base.org
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
ANKR_API_KEY=your_ankr_key_here
```

You can copy `.env.example` to `.env` and fill in your details:
```bash
cp .env.example .env
```

## Available Scripts

### `checkConnection.ts`

This script checks the connection to the configured network.

**Usage:**

```bash
npx hardhat run scripts/checkConnection.ts --network <network-name>
```

**Example:**

```bash
npx hardhat run scripts/checkConnection.ts --network baseSepolia
```

### `deploy-mock-token.ts`

This script deploys a mock DEV token contract.

**Usage:**

```bash
npx hardhat run scripts/deploy-mock-token.ts --network <network-name>
```

**Example:**

```bash
npx hardhat run scripts/deploy-mock-token.ts --network baseSepolia
```