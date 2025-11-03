import hre from "hardhat";
import { getAddress } from "viem";

async function main() {
  console.log("[Deploy Script] Starting MockDEVToken deployment...");

  const args = process.argv.slice(2);
  let networkName: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--network" && args[i + 1]) {
      networkName = args[i + 1];
      i++;
    }
  }

  if (networkName) {
    console.log(`[Deploy Script] Attempting to use network: ${networkName}`);
    await hre.changeNetwork(networkName);
  } else {
    console.log("[Deploy Script] Using default Hardhat network.");
  }

  try {
    const [owner] = await hre.viem.getWalletClients();

    if (!owner) {
      throw new Error("No owner wallet client found. Ensure your Hardhat configuration is correct and a wallet is available.");
    }

    const ownerAddress = getAddress(owner.account.address);
    console.log(`[Deploy Script] Deploying MockDEVToken with owner: ${ownerAddress} on network ${hre.network.name}`);

    const mockDEVToken = await hre.viem.deployContract("MockDEVToken", [
      ownerAddress,
      "Mock DEV Token",
      "mDEV",
    ]);

    console.log(`[Deploy Script] MockDEVToken deployed to: ${mockDEVToken.address}`);
    console.log("[Deploy Script] MockDEVToken deployment finished successfully.");
    process.exit(0);
  } catch (error) {
    console.error("[Deploy Script] Failed to deploy MockDEVToken:");
    console.error(error);
    console.error("[Deploy Script] MockDEVToken deployment failed.");
    process.exit(1);
  }
}

main();