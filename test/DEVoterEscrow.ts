import {
  loadFixture,
  time,
} from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";
import { expect } from "chai";
import hre from "hardhat";
import { getAddress, parseEther } from "viem";
import "@nomicfoundation/hardhat-viem/types";

describe("DEVoterEscrow", function () {
  async function deployContractsFixture() {
    const [owner, user, feeWallet] = await hre.viem.getWalletClients();

    const mockDEVToken = await hre.viem.deployContract("MockDEVToken", [
      getAddress(owner.account.address),
      "Mock DEV Token",
      "mDEV",
    ]);

    const votingPeriod = 30 * 24 * 60 * 60; // 30 days
    const feePercentage = 10; // 10%

    const dEVoterEscrow = await hre.viem.deployContract("DEVoterEscrow", [
      mockDEVToken.address,
      getAddress(feeWallet.account.address),
      feePercentage,
      votingPeriod,
    ]);

    const publicClient = await hre.viem.getPublicClient();

    // Mint some tokens to the user
    const userInitialBalance = parseEther("1000");
    await mockDEVToken.write.mintTo([
      getAddress(user.account.address),
      userInitialBalance,
    ]);

    // Approve the escrow contract to spend the user's tokens
    await mockDEVToken.write.approve(
      [dEVoterEscrow.address, userInitialBalance],
      { account: user.account }
    );

    return {
      dEVoterEscrow,
      mockDEVToken,
      owner,
      user,
      feeWallet,
      votingPeriod,
      feePercentage,
      userInitialBalance,
      publicClient,
    };
  }

  describe("Deployment", function () {
    it("Should set the correct initial state", async function () {
      const { dEVoterEscrow, mockDEVToken, feeWallet, votingPeriod, feePercentage } =
        await loadFixture(deployContractsFixture);

      expect(await dEVoterEscrow.read.token()).to.equal(
        getAddress(mockDEVToken.address)
      );
      expect(await dEVoterEscrow.read.feeWallet()).to.equal(
        getAddress(feeWallet.account.address)
      );
      expect(await dEVoterEscrow.read.feePercentage()).to.equal(
        BigInt(feePercentage)
      );
      expect(await dEVoterEscrow.read.votingPeriod()).to.equal(
        BigInt(votingPeriod)
      );
    });
  });

  describe("Deposit", function () {
    it("Should allow a user to deposit tokens", async function () {
      const {
        dEVoterEscrow,
        mockDEVToken,
        user,
        feeWallet,
        feePercentage,
        userInitialBalance,
      } = await loadFixture(deployContractsFixture);

      const depositAmount = parseEther("100");
      const fee = (depositAmount * BigInt(feePercentage)) / 100n;
      const escrowedAmount = depositAmount - fee;

      await dEVoterEscrow.write.deposit([depositAmount], {
        account: user.account,
      });

      const userAddress = getAddress(user.account.address);
      const escrow = await dEVoterEscrow.read.escrows([userAddress]);

      expect(escrow[0]).to.be.true; // isActive
      expect(escrow[1]).to.equal(escrowedAmount); // amount
      expect(escrow[2] > 0n).to.be.true; // depositTimestamp
      expect(escrow[3] > escrow[2]).to.be.true; // releaseTimestamp

      expect(await mockDEVToken.read.balanceOf([userAddress])).to.equal(
        userInitialBalance - depositAmount
      );
      expect(
        await mockDEVToken.read.balanceOf([dEVoterEscrow.address])
      ).to.equal(escrowedAmount);
      expect(
        await mockDEVToken.read.balanceOf([getAddress(feeWallet.account.address)])
      ).to.equal(fee);
    });

    it("Should fail if deposit amount is 0", async function () {
        const { dEVoterEscrow, user } = await loadFixture(deployContractsFixture);
  
        await expect(
          dEVoterEscrow.write.deposit([0n], { account: user.account })
        ).to.be.rejectedWith("Deposit amount must be greater than 0");
      });
  
      it("Should fail if user has an active escrow", async function () {
        const { dEVoterEscrow, user } = await loadFixture(deployContractsFixture);
        const depositAmount = parseEther("100");
  
        await dEVoterEscrow.write.deposit([depositAmount], { account: user.account });
  
        await expect(
          dEVoterEscrow.write.deposit([depositAmount], { account: user.account })
        ).to.be.rejectedWith("User already has an active escrow");
      });
  });

  describe("Release", function () {
    it("Should allow a user to release tokens after the voting period", async function () {
        const { dEVoterEscrow, mockDEVToken, user, votingPeriod } = await loadFixture(
          deployContractsFixture
        );
        const depositAmount = parseEther("100");
  
        await dEVoterEscrow.write.deposit([depositAmount], { account: user.account });
  
        const userAddress = getAddress(user.account.address);
        const escrow = await dEVoterEscrow.read.escrows([userAddress]);
        const escrowedAmount = escrow[1];
  
        await time.increaseTo(escrow[3]);
  
        const initialBalance = await mockDEVToken.read.balanceOf([userAddress]);
        await dEVoterEscrow.write.release({ account: user.account });
  
        const finalBalance = await mockDEVToken.read.balanceOf([userAddress]);
        expect(finalBalance).to.equal(initialBalance + escrowedAmount);
  
        const updatedEscrow = await dEVoterEscrow.read.escrows([userAddress]);
        expect(updatedEscrow[0]).to.be.false; // isActive
      });
  
      it("Should fail if voting period is not over", async function () {
        const { dEVoterEscrow, user } = await loadFixture(deployContractsFixture);
        const depositAmount = parseEther("100");
  
        await dEVoterEscrow.write.deposit([depositAmount], { account: user.account });
  
        await expect(
          dEVoterEscrow.write.release({ account: user.account })
        ).to.be.rejectedWith("Voting period is not over yet");
      });
  });

  describe("View Functions", function () {
    it("Should return correct values for view functions", async function () {
      const { dEVoterEscrow, user, votingPeriod } = await loadFixture(
        deployContractsFixture
      );
      const depositAmount = parseEther("100");
      const userAddress = getAddress(user.account.address);

      expect(await dEVoterEscrow.read.isVotingPeriodActive([userAddress])).to.be.false;
      expect(await dEVoterEscrow.read.canReleaseTokens([userAddress])).to.be.false;

      await dEVoterEscrow.write.deposit([depositAmount], { account: user.account });

      expect(await dEVoterEscrow.read.isVotingPeriodActive([userAddress])).to.be.true;
      const remainingTime = await dEVoterEscrow.read.getRemainingVotingTime([
        userAddress,
      ]);
      const expectedReleaseTime = BigInt(votingPeriod);
      const tolerance = 2n; // Allow a 2-second tolerance
      expect(
        remainingTime >= expectedReleaseTime - tolerance &&
          remainingTime <= expectedReleaseTime + tolerance
      ).to.be.true;

      const escrow = await dEVoterEscrow.read.escrows([userAddress]);
      await time.increaseTo(escrow[3]);

      expect(await dEVoterEscrow.read.isVotingPeriodActive([userAddress])).to.be.false;
      expect(await dEVoterEscrow.read.canReleaseTokens([userAddress])).to.be.true;
      expect(await dEVoterEscrow.read.getRemainingVotingTime([userAddress])).to.equal(0n);
    });
  });

  describe("Admin Functions", function () {
    it("Should allow owner to update release timestamp", async function () {
      const { dEVoterEscrow, user, owner } = await loadFixture(
        deployContractsFixture
      );
      const depositAmount = parseEther("100");
      const userAddress = getAddress(user.account.address);

      await dEVoterEscrow.write.deposit([depositAmount], { account: user.account });

      const newReleaseTimestamp = BigInt(Math.floor(Date.now() / 1000) + 60); // 1 minute from now
      await dEVoterEscrow.write.updateReleaseTimestamp([userAddress, newReleaseTimestamp], {
        account: owner.account,
      });

      const escrow = await dEVoterEscrow.read.escrows([userAddress]);
      expect(escrow[3]).to.equal(newReleaseTimestamp);
    });

    it("Should not allow non-owner to update release timestamp", async function () {
        const { dEVoterEscrow, user } = await loadFixture(
          deployContractsFixture
        );
        const depositAmount = parseEther("100");
        const userAddress = getAddress(user.account.address);
  
        await dEVoterEscrow.write.deposit([depositAmount], { account: user.account });
  
        const newReleaseTimestamp = BigInt(Math.floor(Date.now() / 1000) + 60);
        await expect(
          dEVoterEscrow.write.updateReleaseTimestamp([userAddress, newReleaseTimestamp], {
            account: user.account,
          })
        ).to.be.rejectedWith("Ownable: caller is not the owner");
      });
  });
});
