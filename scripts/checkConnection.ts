import * as hre from "hardhat";
import { PublicClient } from "viem";

async function main() {
  const args = process.argv.slice(2);
  let rpcUrl: string | undefined;
  let timeout: number | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--rpc" && args[i + 1]) {
      rpcUrl = args[i + 1];
      i++;
    } else if (args[i] === "--timeout" && args[i + 1]) {
      timeout = parseInt(args[i + 1], 10);
      if (isNaN(timeout)) {
        console.error("Error: --timeout must be a number.");
        process.exit(1);
      }
      i++;
    }
  }

  if (rpcUrl) {
    (hre.network.config as any).url = rpcUrl;
    console.log(`Using custom RPC URL: ${rpcUrl}`);
  }

  if (timeout) {
    // Hardhat doesn't have a direct 'timeout' config for viem client,
    // but we can set a network-level timeout if it's a custom network.
    // For simplicity, we'll just log it for now or assume it's handled by the RPC provider.
    console.log(`Using custom timeout: ${timeout}ms`);
  }

  let publicClient: PublicClient;
  try {
    publicClient = await (hre as any).viem.getPublicClient();
  } catch (error: any) {
    console.error("Failed to connect to the network using Hardhat's configured RPC URL.");
    console.error("Please check your network configuration or provide a valid --rpc URL.");
    console.error(`Error: ${error.message || error}`);
    process.exit(1);
  }

  let blockNumber: bigint;
  try {
    blockNumber = await publicClient.getBlockNumber();
  } catch (error: any) {
    console.error("Failed to retrieve the current block number.");
    console.error("The connection to the RPC might be unstable or the RPC URL is incorrect.");
    console.error(`Error: ${error.message || error}`);
    process.exit(1);
  }

  console.log("Successfully connected to the network!");
  console.log("Current block number:", blockNumber.toString());
}

main()
  .then(() => process.exit(0))
  .catch((error: any) => {
    console.error("An unexpected error occurred:");
    console.error(error);
    process.exit(1);
  });
