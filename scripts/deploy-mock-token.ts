import hre from "hardhat";
import { getAddress } from "viem";

async function main() {
  const [owner] = await hre.viem.getWalletClients();
  const ownerAddress = getAddress(owner.account.address);

  const mockDEVToken = await hre.viem.deployContract("MockDEVToken", [
    ownerAddress,
    "Mock DEV Token",
    "mDEV",
  ]);

  console.log(`MockDEVToken deployed to: ${mockDEVToken.address}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });