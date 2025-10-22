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


const DEVoterVotingBytecode = "0x608060405234801561001057600080fd5b5060405161311a38038061311a83398101604081905261002f916101c1565b806001600160a01b03811661005f57604051631e4fbdf760e01b8152600060048201526024015b60405180910390fd5b61006881610155565b50600180556001600160a01b0383166100c35760405162461bcd60e51b815260206004820152601660248201527f496e76616c696420657363726f772061646472657373000000000000000000006044820152606401610056565b6001600160a01b0382166101195760405162461bcd60e51b815260206004820152601860248201527f496e76616c6964207265676973747279206164647265737300000000000000006044820152606401610056565b50600280546001600160a01b039384166001600160a01b03199182161790915560038054929093169116179055600b805460ff19169055610204565b600080546001600160a01b038381166001600160a01b0319831681178455604051919092169283917f8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e09190a35050565b80516001600160a01b03811681146101bc57600080fd5b919050565b6000806000606084860312156101d657600080fd5b6101df846101a5565b92506101ed602085016101a5565b91506101fb604085016101a5565b90509250925092565b612f07806102136000396000f3fe608060405234801561001057600080fd5b506004361061025e5760003560e01c8063669ea37a11610146578063cd89b2e3116100c3578063e80a57a511610087578063e80a57a514610684578063ec0990791461068c578063eede9f8d14610694578063f2c93d3a146106a7578063f2fde38b146106ba578063fadaa14f146106cd57600080fd5b8063cd89b2e3146105e8578063d46f96ed14610610578063e1e1ff101461063e578063e42a96e714610651578063e502eb681461066457600080fd5b8063950c78221161010a578063950c78221461053f5780639ae3fb5114610561578063a2ca560c1461058c578063bec03dd114610596578063c241380b146105c157600080fd5b8063669ea37a146104b4578063715018a6146104dd5780638b3511f7146104e55780638da5cb5b146104f85780638ed10ca41461050957600080fd5b80632c0a3f89116101df578063491e5e40116101a3578063491e5e40146104205780634a778bc314610433578063581c281c146104465780636099c34b1461044e57806362fd1ae21461046157806363fceb711461048c57600080fd5b80632c0a3f89146103895780632ea5e6461461039c57806334e5c102146103bd57806346d1e91b146... [truncated]";

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