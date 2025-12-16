import { ethers } from "hardhat";

async function main() {
  const [sender, receiver] = await ethers.getSigners();
  const amount = ethers.parseEther("0.01"); // Example amount

  console.log(`Attempting to transfer ${amount.toString()} ETH from ${sender.address} to ${receiver.address}`);

  try {
    // 1. Gas Estimation
    const gasPrice = (await ethers.provider.getFeeData()).gasPrice;
    if (!gasPrice) {
      throw new Error("Could not get gas price.");
    }
    const gasLimit = await sender.estimateGas({
      to: receiver.address,
      value: amount,
    });
    const transactionFee = gasPrice * gasLimit;

    console.log(`Estimated gas price: ${ethers.formatUnits(gasPrice, "gwei")} Gwei`);
    console.log(`Estimated gas limit: ${gasLimit.toString()}`);
    console.log(`Estimated transaction fee: ${ethers.formatEther(transactionFee)} ETH`);

    const senderBalance = await ethers.provider.getBalance(sender.address);
    if (senderBalance < amount + transactionFee) {
      throw new Error(`Insufficient funds: Sender balance ${ethers.formatEther(senderBalance)} ETH, required ${ethers.formatEther(amount + transactionFee)} ETH (amount + fee)`);
    }

    console.log("Sending transaction...");
    const tx = await sender.sendTransaction({
      to: receiver.address,
      value: amount,
      gasLimit: gasLimit,
      gasPrice: gasPrice,
    });

    console.log(`Transaction sent. Hash: ${tx.hash}`);
    console.log(`Waiting for transaction to be mined...`);

    // 2. Transaction Status Tracking
    const receipt = await tx.wait();

    if (receipt?.status === 1) {
      console.log(`Transaction successfully confirmed in block ${receipt.blockNumber}`);
      console.log(`Gas used: ${receipt.gasUsed.toString()}`);
      console.log(`Actual transaction fee: ${ethers.formatEther(receipt.gasUsed * gasPrice)} ETH`);
    } else {
      console.error(`Transaction failed (status: ${receipt?.status}). Receipt:`, receipt);
      throw new Error("Transaction failed.");
    }
  } catch (error: any) {
    // 3. Better Error Handling
    if (error.code === 'INSUFFICIENT_FUNDS') {
      console.error("Error: Insufficient funds to complete the transaction.");
    } else if (error.code === 'NETWORK_ERROR') {
      console.error("Error: Network error. Please check your connection or try again later.");
    } else if (error.reason) {
      console.error(`Transfer failed: ${error.reason}`);
    } else {
      console.error("An unexpected error occurred during transfer:", error.message || error);
    }
    process.exitCode = 1;
  }

}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
