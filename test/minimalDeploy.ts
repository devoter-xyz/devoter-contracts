import {
  time,
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";
import { expect } from "chai";
import hre from "hardhat";
import { getAddress } from "viem";
import { DEVoterVoting } from "../typechain-types";
import { DEVoterEscrow } from "../typechain-types";
import { MockDEVToken } from "../typechain-types";
import { RepositoryRegistry } from "../typechain-types";


describe("DEVoterVoting", function () {
  async function deployVotingFixture() {
    const [owner, voter1, voter2, feeWallet, admin] =
      await hre.viem.getWalletClients();

    // Deploy MockDEVToken
    const mockDEVToken = await hre.viem.deployContract("MockDEVToken", [
      owner.account.address,
      "MockDEVToken",
      "mDEV",
    ]);

    // Deploy DEVoterEscrow
    const devoterEscrow = await hre.viem.deployContract("DEVoterEscrow", [
      mockDEVToken.address,
      feeWallet.account.address,
      0, // No fee for testing
      3600, // 1 hour voting period for escrow
      owner.account.address,
    ]);

    // Deploy RepositoryRegistry
    const repositoryRegistry = await hre.viem.deployContract(
      "RepositoryRegistry",
      [owner.account.address],
    );

    // Deploy DEVoterVoting
    const devoterVoting = await hre.viem.deployContract("DEVoterVoting", [
      devoterEscrow.address,
      repositoryRegistry.address,
      owner.account.address,
    ]);

    // Grant VOTING_CONTRACT_ROLE to DEVoterVoting in DEVoterEscrow
    await devoterEscrow.write.setVotingContractAddress([devoterVoting.address]);

    // Mint tokens for voters
    await mockDEVToken.write.mint([voter1.account.address, 1000n]);
    await mockDEVToken.write.mint([voter2.account.address, 1000n]);

    // Approve escrow to spend tokens
    await mockDEVToken.write.approve([devoterEscrow.address, 1000n], {
      account: voter1.account.address,
    });
    await mockDEVToken.write.approve([devoterEscrow.address, 1000n], {
      account: voter2.account.address,
    });

    // Deposit into escrow
    await devoterEscrow.write.deposit([1000n], { account: voter1.account.address });
    await devoterEscrow.write.deposit([1000n], { account: voter2.account.address });

    // Register a repository
    await repositoryRegistry.write.registerRepository([
      1,
      voter1.account.address,
      "repo1",
      "url1",
      "desc1",
    ]);

    return {
      devoterVoting,
      devoterEscrow,
      mockDEVToken,
      repositoryRegistry,
      owner,
      voter1,
      voter2,
      feeWallet,
      admin,
    };
  }

  describe("Withdrawal Restriction", function () {
    it("should reject withdrawVoteWithErrorHandling within 24 hours of voting end", async function () {
      const { devoterVoting, owner, voter1 } = await loadFixture(
        deployVotingFixture,
      );

      const repositoryId = 1;
      const voteAmount = 100n;
      const VOTING_PERIOD_DURATION = 7 * 24 * 60 * 60; // 7 days in seconds

      // Start voting period
      await devoterVoting.write.startVotingPeriod([VOTING_PERIOD_DURATION], {
        account: owner.account.address,
      });

      // Cast a vote
      await devoterVoting.write.castVote([repositoryId, voteAmount], {
        account: voter1.account.address,
      });

      const votingEndTime = await devoterVoting.read.votingEndTime();
      const WITHDRAWAL_RESTRICTION_PERIOD =
        await devoterVoting.read.WITHDRAWAL_RESTRICTION_PERIOD();

      // Advance time to just before the restriction period (e.g., 24 hours and 1 second before voting ends)
      const timeToSetBeforeRestriction =
        votingEndTime - WITHDRAWAL_RESTRICTION_PERIOD + 1n;
      await time.increaseTo(timeToSetBeforeRestriction);

      // Attempt to withdraw - should still be allowed
      await expect(
        devoterVoting.write.withdrawVoteWithErrorHandling([
          repositoryId,
          voteAmount,
        ], { account: voter1.account.address }),
      ).to.not.be.rejected;

      // Re-cast vote for next test
      await devoterVoting.write.castVote([repositoryId, voteAmount], {
        account: voter1.account.address,
      });

      // Advance time to exactly the start of the restriction period (24 hours before voting ends)
      const timeToSetAtRestrictionStart =
        votingEndTime - WITHDRAWAL_RESTRICTION_PERIOD;
      await time.increaseTo(timeToSetAtRestrictionStart);

      // Attempt to withdraw - should be rejected
      await expect(
        devoterVoting.write.withdrawVoteWithErrorHandling([
          repositoryId,
          voteAmount,
        ], { account: voter1.account.address }),
      ).to.be.rejectedWith(
        `WithdrawalDeadlinePassed(${timeToSetAtRestrictionStart}n, ${timeToSetAtRestrictionStart}n)`,
      );

      // Advance time to within the restriction period (e.g., 12 hours before voting ends)
      const twelveHours = 12 * 60 * 60;
      const timeToSetWithinRestriction = votingEndTime - BigInt(twelveHours);
      await time.increaseTo(timeToSetWithinRestriction);

      // Attempt to withdraw - should be rejected
      await expect(
        devoterVoting.write.withdrawVoteWithErrorHandling([
          repositoryId,
          voteAmount,
        ], { account: voter1.account.address }),
      ).to.be.rejectedWith(
        `WithdrawalDeadlinePassed(${timeToSetAtRestrictionStart}n, ${timeToSetWithinRestriction}n)`,
      );

      // Advance time to just before voting ends (e.g., 1 second before voting ends)
      const oneSecond = 1;
      const timeToSetJustBeforeEnd = votingEndTime - BigInt(oneSecond);
      await time.increaseTo(timeToSetJustBeforeEnd);

      // Attempt to withdraw - should be rejected
      await expect(
        devoterVoting.write.withdrawVoteWithErrorHandling([
          repositoryId,
          voteAmount,
        ], { account: voter1.account.address }),
      ).to.be.rejectedWith(
        `WithdrawalDeadlinePassed(${timeToSetAtRestrictionStart}n, ${timeToSetJustBeforeEnd}n)`,
      );
    });
  });
});