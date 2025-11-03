// This setup uses Hardhat Ignition to manage smart contract deployments.
// Learn more about it at https://hardhat.org/ignition
//
// To run this module, use the command: `npx hardhat ignition deploy <module_name>`
// For example: `npx hardhat ignition deploy DEVoterEscrowModule`

import { buildModule, Contract } from "@nomicfoundation/hardhat-ignition/modules";
import { parseEther } from "viem";

/**
 * @dev This module deploys the MockDEVToken and DEVoterEscrow contracts.
 * It uses Hardhat Ignition to manage the deployment process.
 */
const DEVoterEscrowModule = buildModule("DEVoterEscrowModule", (m) => {
  // Helper function to deploy MockDEVToken
  const deployMockDEVToken = () => {
    return m.contract("MockDEVToken", [
      m.getParameter("defaultAdmin"),
      "Mock DEV Token",
      "mDEV",
    ]);
  };

  // Helper function to deploy DEVoterEscrow
  const deployDEVoterEscrow = (mockDEVToken: Contract) => {
    return m.contract("DEVoterEscrow", [
      mockDEVToken,
      m.getParameter("feeWallet"),
      m.getParameter("feeBasisPoints", 500), // 5% = 500 basis points
      m.getParameter("votingPeriod", 30 * 24 * 60 * 60), // 30 days
    ]);
  };

  const mockDEVToken = deployMockDEVToken();
  const dEVoterEscrow = deployDEVoterEscrow(mockDEVToken);

  return { mockDEVToken, dEVoterEscrow };
});

export default DEVoterEscrowModule;
