import hre from "hardhat";
import { PublicClient } from "viem";

async function main() {
  const publicClient: PublicClient = await hre.viem.getPublicClient();
  const blockNumber: bigint = await publicClient.getBlockNumber();
  console.log("Successfully connected to the network!");
  console.log("Current block number:", blockNumber.toString());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
