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

// No need for manual type declaration as it's provided by @nomicfoundation/hardhat-viem
// No need for manual type declaration as it's provided by @nomicfoundation/hardhat-viem

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
        expect(Number(votingEndTime)).to.equal(
          Number(votingStartTime) + duration
        );

        // Verify that votingStartTime is close to the current time when we started the period
        // Allow for a small margin of error due to block time variations
        expect(Number(votingStartTime)).to.be.closeTo(startTimeBefore, 5);
      });

      it("Should reject start with negative duration", async function () {
        const { devoterVoting, owner } = await loadFixture(
          deployDEVoterVotingFixture
        );

        // Note: In Solidity, we can't directly pass negative numbers as uint256
        // But we can test the requirement that duration must be greater than zero
        // by using a very small duration that will be rejected

        // We'll use 0 as the duration, which will trigger the same validation
        // that would reject negative values if they could be passed
        await expect(
          devoterVoting.write.startVotingPeriod([BigInt(0)], {
            account: owner.account,
          })
        ).to.be.rejectedWith("Invalid duration");

        // Verify voting period is still inactive
        expect(await devoterVoting.read.isVotingActive()).to.be.false;
      });

      it("Should handle very short durations (1 second)", async function () {
        const { devoterVoting, owner } = await loadFixture(
          deployDEVoterVotingFixture
        );

        const duration = 1; // 1 second duration

        // Get the current timestamp before starting the voting period
        const startTimeBefore = await time.latest();
        
        // Start a voting period with very short duration
        await devoterVoting.write.startVotingPeriod([BigInt(duration)], {
          account: owner.account,
        });
        
        // Get the actual values from the contract
        const votingStartTime = await devoterVoting.read.votingStartTime();
        const votingEndTime = await devoterVoting.read.votingEndTime();
        const isVotingActive = await devoterVoting.read.isVotingActive();
        
        // Verify that votingEndTime equals votingStartTime + 1 second
        expect(Number(votingEndTime)).to.equal(Number(votingStartTime) + duration);
        
        // Verify that the voting period is active
        expect(isVotingActive).to.be.true;
        
        // Verify that votingStartTime is close to the current time when we started the period
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
        await devoterVoting.write.endVotingPeriod([], {
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
