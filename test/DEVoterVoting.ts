import {
  time,
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";
import { expect } from "chai";
import hre from "hardhat";
import { getAddress } from "viem";
import "@nomicfoundation/hardhat-viem/types";

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
      it("Should successfully start voting period with valid duration", async function () {
        const { devoterVoting, owner } = await loadFixture(
          deployDEVoterVotingFixture
        );

        const duration = 7 * 24 * 60 * 60; // 7 days in seconds

        // Start voting period
        await devoterVoting.write.startVotingPeriod([BigInt(duration)], {
          account: owner.account,
        });

        // Verify voting period is active
        const votingStatus = await devoterVoting.read.getVotingStatus();
        expect(votingStatus[0]).to.be.true; // active
        expect(Number(votingStatus[1])).to.be.approximately(duration, 5); // remaining time

        // Verify state variables are set correctly
        expect(await devoterVoting.read.isVotingActive()).to.be.true;
        expect(
          Number(await devoterVoting.read.votingStartTime())
        ).to.be.greaterThan(0);
        expect(
          Number(await devoterVoting.read.votingEndTime())
        ).to.be.greaterThan(Number(await devoterVoting.read.votingStartTime()));
      });

      it("Should set correct votingStartTime (current block.timestamp)", async function () {
        const { devoterVoting, owner } = await loadFixture(
          deployDEVoterVotingFixture
        );

        const duration = 5 * 24 * 60 * 60; // 5 days

        // Record time before starting
        const beforeStart = await time.latest();

        // Start voting period
        await devoterVoting.write.startVotingPeriod([BigInt(duration)], {
          account: owner.account,
        });

        // Get voting start time
        const startTime = await devoterVoting.read.votingStartTime();

        // Verify start time is recent and matches current block timestamp
        expect(Number(startTime)).to.be.greaterThanOrEqual(beforeStart);
        expect(Number(startTime)).to.be.lessThanOrEqual(beforeStart + 10);
      });
    });
  });
});
