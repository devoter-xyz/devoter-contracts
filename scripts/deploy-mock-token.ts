import hre from "hardhat";
import { formatEther, parseEther } from "viem";

// Configuration for the MockDEVToken
const MOCK_DEV_TOKEN_CONFIG = {
  name: "Mock DEV Token",
  symbol: "mDEV",
  initialSupply: parseEther("1000000"),
};

async function main() {
  const network = hre.network.name;
  console.log(`\nDeploying to network: ${network}`);

  // Get the deployer account
  const [deployer] = await hre.viem.getWalletClients();
  const deployerAddress = deployer.account.address;
  console.log(`Deployer address: ${deployerAddress}`);

  try {
    const publicClient = await hre.viem.getPublicClient();

    // 1. DEPLOYMENT
    console.log("Deploying MockDEVToken...");
    const { contract: mockDevToken, deploymentTransaction } = await hre.viem.sendDeploymentTransaction("MockDEVToken", [
      deployerAddress,
      MOCK_DEV_TOKEN_CONFIG.name,
      MOCK_DEV_TOKEN_CONFIG.symbol,
    ]);
    
    console.log("...waiting for deployment transaction to be mined...");
    await publicClient.waitForTransactionReceipt({ hash: deploymentTransaction.hash });

    console.log(`MockDEVToken deployed to: ${mockDevToken.address}`);
    console.log(`Transaction hash: ${deploymentTransaction.hash}`);


    // 2. POST-DEPLOYMENT VERIFICATION
    console.log("Verifying contract state post-deployment...");
    const name = await mockDevToken.read.name();
    const symbol = await mockDevToken.read.symbol();
    const totalSupply = await mockDevToken.read.totalSupply();
    const deployerBalance = await mockDevToken.read.balanceOf([deployerAddress]);

    console.log(`   - Name: ${name}`);
    console.log(`   - Symbol: ${symbol}`);
    console.log(`   - Total Supply: ${formatEther(totalSupply as bigint)} ${symbol}`);
    console.log(`   - Deployer Balance: ${formatEther(deployerBalance as bigint)} ${symbol}`);

    if (
      name === MOCK_DEV_TOKEN_CONFIG.name &&
      symbol === MOCK_DEV_TOKEN_CONFIG.symbol &&
      totalSupply === MOCK_DEV_TOKEN_CONFIG.initialSupply &&
      deployerBalance === MOCK_DEV_TOKEN_CONFIG.initialSupply
    ) {
      console.log("Post-deployment verification successful.");
    } else {
      console.error("Post-deployment verification failed. State mismatch.");
    }


    // 3. CONTRACT VERIFICATION ON BLOCK EXPLORERS
    if (network !== "hardhat" && network !== "localhost") {
      console.log("Verifying contract on block explorer...");
      console.log("   (Waiting for 5 blocks before attempting verification...)");
      
      // Here we wait for 5 confirmations
      await publicClient.waitForTransactionReceipt({ hash: deploymentTransaction.hash, confirmations: 5 });

      try {
        await hre.run("verify:verify", {
          address: mockDevToken.address,
          constructorArguments: [
            deployerAddress,
            MOCK_DEV_TOKEN_CONFIG.name,
            MOCK_DEV_TOKEN_CONFIG.symbol,
          ],
        });
        console.log("Contract verified successfully on the block explorer.");
      } catch (error) {
        console.error("Contract verification failed:", error);
        console.warn("You may need to add an Etherscan API key to your hardhat.config.ts");
      }
    }

    console.log("Deployment script finished successfully!");

  } catch (error) {
    console.error("Deployment failed:", error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}); 