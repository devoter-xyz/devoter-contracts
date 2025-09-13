import {
  time,
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";
import { expect } from "chai";
import hre from "hardhat";
import { getAddress } from "viem";
// This import is needed to augment the HardhatRuntimeEnvironment type
import "@nomicfoundation/hardhat-viem";
import "@nomicfoundation/hardhat-viem/types";

// Add type declaration for HardhatRuntimeEnvironment
declare module "hardhat/types" {
  interface HardhatRuntimeEnvironment {
    viem: {
      getWalletClients: () => Promise<any[]>;
      deployContract: (name: string, args: any[]) => Promise<any>;
      getPublicClient: () => Promise<any>;
    };
  }
}

describe("DEVoterVoting", function () {
  async function deployDEVoterVotingFixture() {
    const [owner, voter1, voter2, maintainer1, otherAccount] =
      await hre.viem.getWalletClients();

    // Deploy MockDEVToken
    const mockDEVToken = await hre.viem.deployContract("MockDEVToken", [
      getAddress(owner.account.address),
      "Mock DEV Token",
      "mDEV",
    ]);

    // Deploy RepositoryRegistry
    const repositoryRegistry = await hre.viem.deployContract(
      "RepositoryRegistry",
      [getAddress(owner.account.address)]
    );

    // Deploy DEVoterEscrow
    const devoterEscrow = await hre.viem.deployContract("DEVoterEscrow", [
      getAddress(mockDEVToken.address),
      getAddress(owner.account.address), // feeWallet
      100n, // feeBasisPoints (1%)
      7n * 24n * 60n * 60n, // votingPeriod (7 days)
      getAddress(owner.account.address), // initialOwner
    ]);

    // Deploy DEVoterVoting
    const devoterVoting = await hre.viem.deployContract("DEVoterVoting", [
      getAddress(devoterEscrow.address),
      getAddress(repositoryRegistry.address),
      getAddress(owner.account.address),
    ]);

    const publicClient = await hre.viem.getPublicClient();

    return {
      devoterVoting,
      devoterEscrow,
      repositoryRegistry,
      mockDEVToken,
      owner,
      voter1,
      voter2,
      maintainer1,
      otherAccount,
      publicClient,
    };
  }

  describe("Voting Period Management", function () {
    describe("startVotingPeriod() tests", function () {
      it("Should set correct votingEndTime (startTime + duration)", async function () {
        const { devoterVoting, owner } = await loadFixture(
          deployDEVoterVotingFixture
        );

        const duration = 7 * 24 * 60 * 60; // 7 days in seconds

        // Get the current timestamp before starting the voting period
        const startTimeBefore = await time.latest();
        
        // Start a voting period
        await devoterVoting.write.startVotingPeriod([BigInt(duration)], {
          account: owner.account,
        });
        
        // Get the actual values from the contract
        const votingStartTime = await devoterVoting.read.votingStartTime();
        const votingEndTime = await devoterVoting.read.votingEndTime();
        
        // Verify that votingEndTime equals votingStartTime + duration
        expect(Number(votingEndTime)).to.equal(Number(votingStartTime) + duration);
        
        // Verify that votingStartTime is close to the current time when we started the period
        // Allow for a small margin of error due to block time variations
        expect(Number(votingStartTime)).to.be.closeTo(startTimeBefore, 5);
      });
    });

    describe("endVotingPeriod() tests", function () {
      it("Should allow owner to end active voting period", async function () {
        const { devoterVoting, owner } = await loadFixture(
          deployDEVoterVotingFixture
        );

        const duration = 7 * 24 * 60 * 60; // 7 days in seconds

        // First start a voting period
        await devoterVoting.write.startVotingPeriod([BigInt(duration)], {
          account: owner.account,
        });

        // Verify voting period is active
        expect(await devoterVoting.read.isVotingActive()).to.be.true;
        const initialStatus = await devoterVoting.read.getVotingStatus();
        expect((initialStatus as [boolean, bigint])[0]).to.be.true; // active

        
        // End the voting period
        await devoterVoting.write.endVotingPeriod({
          account: owner.account,
        });

        // Verify voting period is now inactive
        expect(await devoterVoting.read.isVotingActive()).to.be.false;
        const endedStatus = await devoterVoting.read.getVotingStatus();
        expect((endedStatus as [boolean, bigint])[0]).to.be.false; // not active
        expect(Number((endedStatus as [boolean, bigint])[1])).to.equal(0); // remaining time should be 0
      });
    });
  });
});
