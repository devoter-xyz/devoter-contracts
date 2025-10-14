// This setup uses Hardhat Ignition to manage smart contract deployments.
// Learn more about it at https://hardhat.org/ignition
//
// To run this module, use the command: `npx hardhat ignition deploy <module_name>`
// For example: `npx hardhat ignition deploy DEVoterEscrowModule`

import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { parseEther } from "viem";

const DEVoterEscrowModule = buildModule("DEVoterEscrowModule", (m) => {
  // Deploy MockDEVToken first
  const mockDEVToken = m.contract("MockDEVToken", [
    m.getParameter("defaultAdmin"),
    "Mock DEV Token",
    "mDEV",
  ]);

  // Deploy DEVoterEscrow with basis points fee system
  const dEVoterEscrow = m.contract("DEVoterEscrow", [
    mockDEVToken,
    m.getParameter("feeWallet"),
    m.getParameter("feeBasisPoints", 500), // 5% = 500 basis points
    m.getParameter("votingPeriod", 30 * 24 * 60 * 60), // 30 days
  ]);

  return { mockDEVToken, dEVoterEscrow };
});

export default DEVoterEscrowModule;
