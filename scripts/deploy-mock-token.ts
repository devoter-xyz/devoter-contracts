import hre from "hardhat";
import { getAddress } from "viem";

async function main() {
  try {
    const [owner] = await hre.viem.getWalletClients();

    if (!owner) {
      throw new Error("No owner wallet client found. Ensure your Hardhat configuration is correct and a wallet is available.");
    }

    const ownerAddress = getAddress(owner.account.address);
    console.log(`Deploying MockDEVToken with owner: ${ownerAddress}`);

    const mockDEVToken = await hre.viem.deployContract("MockDEVToken", [
      ownerAddress,
      "Mock DEV Token",
      "mDEV",
    ]);

    console.log(`MockDEVToken deployed to: ${mockDEVToken.address}`);
  } catch (error) {
    console.error("Failed to deploy MockDEVToken:");
    console.error(error);
    process.exit(1);
  }
}

main();