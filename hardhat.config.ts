import type { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox-viem";
import "dotenv/config";

const privateKey = process.env.PRIVATE_KEY;

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    "base-mainnet": {
      url: process.env.BASE_MAINNET_RPC_URL || "",
      accounts: privateKey && privateKey.length === 64 ? [privateKey] : [],
      gasPrice: 1000000000,
    },
    "base-sepolia": {
      url: process.env.BASE_SEPOLIA_RPC_URL || "",
      accounts: privateKey && privateKey.length === 64 ? [privateKey] : [],
      gasPrice: 1000000000,
    },
  },
  defaultNetwork: "hardhat",
};

export default config;
