// This setup uses Hardhat Ignition to manage smart contract deployments.
// Learn more about it at https://hardhat.org/ignition

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
    m.getParameter("feeBasisPoints", 1000), // 10% = 1000 basis points
    m.getParameter("votingPeriod", 30 * 24 * 60 * 60), // 30 days
  ]);

  return { mockDEVToken, dEVoterEscrow };
});

export default DEVoterEscrowModule;
