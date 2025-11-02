import * as hre from "hardhat";
import { PublicClient, http } from "viem";

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

  const configuredUrl = typeof hre.network.config.url === 'string' ? hre.network.config.url : undefined;
  const effectiveUrl = rpcUrl ?? configuredUrl;

  let publicClient: PublicClient;
  try {
    if (effectiveUrl || timeout) {
      if (!effectiveUrl) {
        console.error('No RPC URL available (neither --rpc provided nor network.config.url).');
        process.exit(1);
      }
      // Build transport options, include timeout only if defined
      const transport = http(effectiveUrl, timeout ? { timeout } : undefined);
      publicClient = await hre.viem.getPublicClient({ transport });
      console.log(`Using RPC URL: ${effectiveUrl}${timeout ? ` with timeout: ${timeout}ms` : ''}`);
    } else {
      // No custom url or timeout: use default configured client
      publicClient = await hre.viem.getPublicClient();
      console.log("Using Hardhat's default configured RPC client.");
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Failed to connect to the network using Hardhat's configured RPC URL.");
    console.error("Please check your network configuration or provide a valid --rpc URL.");
    console.error(`Error: ${message}`);
    process.exit(1);
  }

  let blockNumber: bigint;
  try {
    blockNumber = await publicClient.getBlockNumber();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Failed to retrieve the current block number.");
    console.error("The connection to the RPC might be unstable or the RPC URL is incorrect.");
    console.error(`Error: ${message}`);
    process.exit(1);
  }

  console.log("Successfully connected to the network!");
  console.log("Current block number:", blockNumber.toString());
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error("An unexpected error occurred:");
    console.error(message);
    process.exit(1);
  });
