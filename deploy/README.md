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

## Minimal Deployment Snippet

This snippet demonstrates how to deploy `MockDEVToken`, `RepositoryRegistry`, and `DEVoterTreasury` contracts.

**Related Contracts:**
- `contracts/MockDEVToken.sol`
- `contracts/RepositoryRegistry.sol`
- `contracts/DEVoterTreasury.sol`

**Usage:**

Create a new file, for example, `scripts/deploy-minimal.ts`, and paste the following content:

```typescript
import { ethers } from "hardhat";

async function main() {
  // Deploy MockDEVToken
  const MockDEVToken = await ethers.getContractFactory("MockDEVToken");
  const mockDEVToken = await MockDEVToken.deploy();
  await mockDEVToken.waitForDeployment();
  console.log(`MockDEVToken deployed to: ${mockDEVToken.target}`);

  // Deploy RepositoryRegistry
  const RepositoryRegistry = await ethers.getContractFactory("RepositoryRegistry");
  const repositoryRegistry = await RepositoryRegistry.deploy();
  await repositoryRegistry.waitForDeployment();
  console.log(`RepositoryRegistry deployed to: ${repositoryRegistry.target}`);

  // Deploy DEVoterTreasury
  // DEVoterTreasury constructor requires a token address and an owner address.
  // We'll use the deployed MockDEVToken address and the deployer's address as the owner.
  const [deployer] = await ethers.getSigners();
  const DEVoterTreasury = await ethers.getContractFactory("DEVoterTreasury");
  const devoterTreasury = await DEVoterTreasury.deploy(mockDEVToken.target, deployer.address);
  await devoterTreasury.waitForDeployment();
  console.log(`DEVoterTreasury deployed to: ${devoterTreasury.target}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

Then, run the script using Hardhat:

```bash
npx hardhat run scripts/deploy-minimal.ts --network <network-name>
```

**Example:**

```bash
npx hardhat run scripts/deploy-minimal.ts --network baseSepolia
```