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
    const feeBasisPoints = 500; // 5% (500 basis points)

    const dEVoterEscrow = await hre.viem.deployContract("DEVoterEscrow", [
      mockDEVToken.address,
      getAddress(feeWallet.account.address),
      feeBasisPoints,
      votingPeriod,
      getAddress(owner.account.address),
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
      feeBasisPoints,
      userInitialBalance,
      publicClient,
    };
  }

  describe("Deployment", function () {
    it("Should set the correct initial state", async function () {
      const { dEVoterEscrow, mockDEVToken, feeWallet, votingPeriod, feeBasisPoints } =
        await loadFixture(deployContractsFixture);

      expect(await dEVoterEscrow.read.token()).to.equal(
        getAddress(mockDEVToken.address)
      );
      expect(await dEVoterEscrow.read.feeWallet()).to.equal(
        getAddress(feeWallet.account.address)
      );
      expect(await dEVoterEscrow.read.feeBasisPoints()).to.equal(
        BigInt(feeBasisPoints)
      );
      expect(await dEVoterEscrow.read.votingPeriod()).to.equal(
        BigInt(votingPeriod)
      );
    });

    it("Should enforce maximum fee limit", async function () {
      const [owner, feeWallet] = await hre.viem.getWalletClients();
      const mockDEVToken = await hre.viem.deployContract("MockDEVToken", [
        getAddress(owner.account.address),
        "Mock DEV Token",
        "mDEV",
      ]);

      const votingPeriod = 30 * 24 * 60 * 60;
      const excessiveFeeBasisPoints = 600; // 6% > 5% max

      await expect(
        hre.viem.deployContract("DEVoterEscrow", [
          mockDEVToken.address,
          getAddress(feeWallet.account.address),
          excessiveFeeBasisPoints,
          votingPeriod,
          getAddress(owner.account.address),
        ])
      ).to.be.rejectedWith("Fee exceeds maximum allowed");
    });

    it("Should reject zero addresses", async function () {
      const [owner] = await hre.viem.getWalletClients();
      const mockDEVToken = await hre.viem.deployContract("MockDEVToken", [
        getAddress(owner.account.address),
        "Mock DEV Token",
        "mDEV",
      ]);

      const votingPeriod = 30 * 24 * 60 * 60;
      const feeBasisPoints = 500;

      // Test zero token address
      await expect(
        hre.viem.deployContract("DEVoterEscrow", [
          "0x0000000000000000000000000000000000000000",
          getAddress(owner.account.address),
          feeBasisPoints,
          votingPeriod,
          getAddress(owner.account.address),
        ])
      ).to.be.rejectedWith("Token address cannot be zero");

      // Test zero fee wallet address
      await expect(
        hre.viem.deployContract("DEVoterEscrow", [
          mockDEVToken.address,
          "0x0000000000000000000000000000000000000000",
          feeBasisPoints,
          votingPeriod,
          getAddress(owner.account.address),
        ])
      ).to.be.rejectedWith("Fee wallet cannot be zero");
    });
  });

  describe("Fee Calculation", function () {
    it("Should calculate fees correctly using basis points", async function () {
      const { dEVoterEscrow, user } = await loadFixture(deployContractsFixture);

      const amount = parseEther("1000");
      const expectedFee = (amount * 500n) / 10000n; // 5% = 500 basis points
      const expectedEscrowed = amount - expectedFee;

      const [escrowedAmount, feeAmount] = await dEVoterEscrow.read.calculateEscrowAmount([
        amount,
        getAddress(user.account.address),
      ]);

      expect(feeAmount).to.equal(expectedFee);
      expect(escrowedAmount).to.equal(expectedEscrowed);
    });

    it("Should handle zero amounts", async function () {
      const { dEVoterEscrow, user } = await loadFixture(deployContractsFixture);

      const [escrowedAmount, feeAmount] = await dEVoterEscrow.read.calculateEscrowAmount([
        0n,
        getAddress(user.account.address),
      ]);

      expect(feeAmount).to.equal(0n);
      expect(escrowedAmount).to.equal(0n);
    });

    it("Should handle zero fee basis points", async function () {
      const { dEVoterEscrow, user, owner } = await loadFixture(
        deployContractsFixture
      );

      // Set fee to zero
      await dEVoterEscrow.write.updateFeeBasisPoints([0n], {
        account: owner.account,
      });

      const amount = parseEther("1000");
      const [escrowedAmount, feeAmount] =
        await dEVoterEscrow.read.calculateEscrowAmount([
          amount,
          getAddress(user.account.address),
        ]);

      expect(feeAmount).to.equal(0n);
      expect(escrowedAmount).to.equal(amount);
    });

    it("Should handle fee exemptions", async function () {
      const { dEVoterEscrow, user, owner } = await loadFixture(
        deployContractsFixture
      );

      // Set user as fee exempt
      await dEVoterEscrow.write.setFeeExemption(
        [getAddress(user.account.address), true],
        { account: owner.account }
      );

      const amount = parseEther("1000");
      const [escrowedAmount, feeAmount] =
        await dEVoterEscrow.read.calculateEscrowAmount([
          amount,
          getAddress(user.account.address),
        ]);

      expect(feeAmount).to.equal(0n);
      expect(escrowedAmount).to.equal(amount);
    });

    it("Should preview fees correctly", async function () {
      const { dEVoterEscrow, user } = await loadFixture(deployContractsFixture);

      const amount = parseEther("1000");
      const expectedFee = (amount * 500n) / 10000n;

      const [feeAmount, escrowedAmount, isExempt] = await dEVoterEscrow.read.previewFee([
        amount,
        getAddress(user.account.address),
      ]);

      expect(feeAmount).to.equal(expectedFee);
      expect(escrowedAmount).to.equal(amount - expectedFee);
      expect(isExempt).to.be.false;
    });
  });

  describe("Deposit", function () {
    it("Should allow a user to deposit tokens with fee calculation", async function () {
      const {
        dEVoterEscrow,
        mockDEVToken,
        user,
        feeWallet,
        feeBasisPoints,
        userInitialBalance,
      } = await loadFixture(deployContractsFixture);

      const depositAmount = parseEther("100");
      const expectedFee = (depositAmount * BigInt(feeBasisPoints)) / 10000n;
      const expectedEscrowed = depositAmount - expectedFee;

      await dEVoterEscrow.write.deposit([depositAmount], {
        account: user.account,
      });

      const userAddress = getAddress(user.account.address);
      const escrow = await dEVoterEscrow.read.escrows([userAddress]);

      expect(escrow[0]).to.be.true; // isActive
      expect(escrow[1]).to.equal(expectedEscrowed); // amount
      expect(escrow[4]).to.equal(expectedFee); // feePaid

      // Check fee wallet received the fee
      const feeWalletBalance = await mockDEVToken.read.balanceOf([getAddress(feeWallet.account.address)]);
      expect(feeWalletBalance).to.equal(expectedFee);
    });

    it("Should handle fee exempt users", async function () {
      const { dEVoterEscrow, mockDEVToken, user, feeWallet, owner } = await loadFixture(deployContractsFixture);

      // Set user as fee exempt
      await dEVoterEscrow.write.setFeeExemption([
        getAddress(user.account.address),
        true,
      ], { account: owner.account });

      const depositAmount = parseEther("100");

      await dEVoterEscrow.write.deposit([depositAmount], {
        account: user.account,
      });

      const userAddress = getAddress(user.account.address);
      const escrow = await dEVoterEscrow.read.escrows([userAddress]);

      expect(escrow[0]).to.be.true; // isActive
      expect(escrow[1]).to.equal(depositAmount); // amount (no fee deducted)
      expect(escrow[4]).to.equal(0n); // feePaid

      // Check fee wallet received no fee
      const feeWalletBalance = await mockDEVToken.read.balanceOf([getAddress(feeWallet.account.address)]);
      expect(feeWalletBalance).to.equal(0n);
    });

    
  });

  describe("Admin Functions", function () {
    it("Should allow owner to update fee basis points", async function () {
      const { dEVoterEscrow, owner } = await loadFixture(deployContractsFixture);

      const newFeeBasisPoints = 500; // 5%
      await dEVoterEscrow.write.updateFeeBasisPoints([BigInt(newFeeBasisPoints)], {
        account: owner.account,
      });

      expect(await dEVoterEscrow.read.feeBasisPoints()).to.equal(BigInt(newFeeBasisPoints));
    });

    it("Should reject fee updates above maximum", async function () {
      const { dEVoterEscrow, owner } = await loadFixture(deployContractsFixture);

      const excessiveFeeBasisPoints = 600; // 6% > 5% max

      await expect(
        dEVoterEscrow.write.updateFeeBasisPoints([BigInt(excessiveFeeBasisPoints)], {
          account: owner.account,
        })
      ).to.be.rejectedWith("Fee exceeds maximum allowed");
    });

    it("Should allow owner to update fee wallet", async function () {
      const { dEVoterEscrow, owner } = await loadFixture(deployContractsFixture);
      const [newFeeWallet] = await hre.viem.getWalletClients();

      await dEVoterEscrow.write.updateFeeWallet([getAddress(newFeeWallet.account.address)], {
        account: owner.account,
      });

      expect(await dEVoterEscrow.read.feeWallet()).to.equal(getAddress(newFeeWallet.account.address));
    });

    it("Should reject zero fee wallet address", async function () {
      const { dEVoterEscrow, owner } = await loadFixture(deployContractsFixture);

      await expect(
        dEVoterEscrow.write.updateFeeWallet(["0x0000000000000000000000000000000000000000"], {
          account: owner.account,
        })
      ).to.be.rejectedWith("Fee wallet cannot be zero");
    });

    it("Should allow owner to set fee exemptions", async function () {
      const { dEVoterEscrow, owner, user } = await loadFixture(deployContractsFixture);

      await dEVoterEscrow.write.setFeeExemption([
        getAddress(user.account.address),
        true,
      ], { account: owner.account });

      expect(await dEVoterEscrow.read.isFeeExempt([getAddress(user.account.address)])).to.be.true;
    });

    it("Should allow owner to batch set fee exemptions", async function () {
      const { dEVoterEscrow, owner } = await loadFixture(deployContractsFixture);
      const [user1, user2, user3] = await hre.viem.getWalletClients();

      const users = [
        getAddress(user1.account.address),
        getAddress(user2.account.address),
        getAddress(user3.account.address),
      ];
      const exemptions = [true, false, true];

      await dEVoterEscrow.write.batchSetFeeExemptions([users, exemptions], {
        account: owner.account,
      });

      expect(await dEVoterEscrow.read.isFeeExempt([users[0]])).to.be.true;
      expect(await dEVoterEscrow.read.isFeeExempt([users[1]])).to.be.false;
      expect(await dEVoterEscrow.read.isFeeExempt([users[2]])).to.be.true;
    });

    it("Should reject batch exemptions with mismatched arrays", async function () {
      const { dEVoterEscrow, owner } = await loadFixture(deployContractsFixture);
      const [user1, user2] = await hre.viem.getWalletClients();

      const users = [
        getAddress(user1.account.address),
        getAddress(user2.account.address),
      ];
      const exemptions = [true]; // Mismatched length

      await expect(
        dEVoterEscrow.write.batchSetFeeExemptions([users, exemptions], {
          account: owner.account,
        })
      ).to.be.rejectedWith("Arrays length mismatch");
    });

    it("Should reject non-owner calls to admin functions", async function () {
      const { dEVoterEscrow, user } = await loadFixture(deployContractsFixture);

      await expect(
        dEVoterEscrow.write.updateFeeBasisPoints([500n], { account: user.account })
      ).to.be.rejected;

      await expect(
        dEVoterEscrow.write.updateFeeWallet([getAddress(user.account.address)], { account: user.account })
      ).to.be.rejected;

      await expect(
        dEVoterEscrow.write.setFeeExemption([getAddress(user.account.address), true], { account: user.account })
      ).to.be.rejected;
    });
  });

  describe("View Functions", function () {
    it("Should return correct fee information", async function () {
      const { dEVoterEscrow, feeWallet, feeBasisPoints } = await loadFixture(deployContractsFixture);

      const [currentFeeBasisPoints, maxFeeBasisPoints, feeWalletAddress] = await dEVoterEscrow.read.getFeeInfo();

      expect(currentFeeBasisPoints).to.equal(BigInt(feeBasisPoints));
      expect(maxFeeBasisPoints).to.equal(500n); // MAX_FEE_BASIS_POINTS
      expect(feeWalletAddress).to.equal(getAddress(feeWallet.account.address));
    });

    it("Should return correct fee exemption status", async function () {
      const { dEVoterEscrow, user, owner } = await loadFixture(deployContractsFixture);

      expect(await dEVoterEscrow.read.isFeeExempt([getAddress(user.account.address)])).to.be.false;

      // Set as exempt
      await dEVoterEscrow.write.setFeeExemption([
        getAddress(user.account.address),
        true,
      ], { account: owner.account });

      expect(await dEVoterEscrow.read.isFeeExempt([getAddress(user.account.address)])).to.be.true;
    });

    it("Should return correct escrow fee paid", async function () {
      const { dEVoterEscrow, user } = await loadFixture(deployContractsFixture);

      const depositAmount = parseEther("100");
      const expectedFee = (depositAmount * 500n) / 10000n;

      await dEVoterEscrow.write.deposit([depositAmount], { account: user.account });

      const feePaid = await dEVoterEscrow.read.getEscrowFeePaid([getAddress(user.account.address)]);
      expect(feePaid).to.equal(expectedFee);
    });

    it("Should maintain backward compatibility with getFeePercentage", async function () {
      const { dEVoterEscrow, feeBasisPoints } = await loadFixture(deployContractsFixture);

      const feePercentage = await dEVoterEscrow.read.getFeePercentage();
      const expectedPercentage = (BigInt(feeBasisPoints) * 100n) / 10000n;

      expect(feePercentage).to.equal(expectedPercentage);
    });
  });

  describe("Release", function () {
    it("Should allow users to release tokens after voting period", async function () {
      const { dEVoterEscrow, mockDEVToken, user, votingPeriod } = await loadFixture(deployContractsFixture);

      const depositAmount = parseEther("100");
      await dEVoterEscrow.write.deposit([depositAmount], { account: user.account });

      // Fast forward past voting period
      await time.increase(votingPeriod + 1);

      const userAddress = getAddress(user.account.address);
      const initialBalance = await mockDEVToken.read.balanceOf([userAddress]);

      await dEVoterEscrow.write.release({ account: user.account });

      const finalBalance = await mockDEVToken.read.balanceOf([userAddress]);
      const escrow = await dEVoterEscrow.read.escrows([userAddress]);

      expect(escrow[0]).to.be.false; // isActive
      expect(escrow[1]).to.equal(0n); // amount
      expect(finalBalance > initialBalance).to.be.true;
    });

    it("Should reject release before voting period ends", async function () {
      const { dEVoterEscrow, user } = await loadFixture(deployContractsFixture);

      const depositAmount = parseEther("100");
      await dEVoterEscrow.write.deposit([depositAmount], { account: user.account });

      // Try to release before voting period ends
      await expect(
        dEVoterEscrow.write.release({ account: user.account })
      ).to.be.rejectedWith("Voting period is not over yet");
    });
  });

  describe("Token Release", function () {
    it("Should allow a user to release their tokens", async function () {
      const { dEVoterEscrow, mockDEVToken, user, votingPeriod } = await loadFixture(deployContractsFixture);
      const depositAmount = parseEther("100");

      await dEVoterEscrow.write.deposit([depositAmount], { account: user.account });

      await time.increase(votingPeriod + 1);

      const initialBalance = await mockDEVToken.read.balanceOf([getAddress(user.account.address)]);
      await dEVoterEscrow.write.releaseTokens([], { account: user.account });
      const finalBalance = await mockDEVToken.read.balanceOf([getAddress(user.account.address)]);

      const escrow = await dEVoterEscrow.read.escrows([getAddress(user.account.address)]);
      expect(escrow[0]).to.be.false; // isActive
      expect(finalBalance > initialBalance).to.be.true;
    });

    it("Should prevent releasing tokens before the release timestamp", async function () {
      const { dEVoterEscrow, user } = await loadFixture(deployContractsFixture);
      const depositAmount = parseEther("100");

      await dEVoterEscrow.write.deposit([depositAmount], { account: user.account });

      await expect(
        dEVoterEscrow.write.releaseTokens([], { account: user.account })
      ).to.be.rejectedWith("Cannot release tokens before the release timestamp");
    });

    it("Should allow the owner to force release tokens", async function () {
      const { dEVoterEscrow, mockDEVToken, owner, user } = await loadFixture(deployContractsFixture);
      const depositAmount = parseEther("100");

      await dEVoterEscrow.write.deposit([depositAmount], { account: user.account });

      const initialBalance = await mockDEVToken.read.balanceOf([getAddress(user.account.address)]);
      await dEVoterEscrow.write.forceReleaseTokens([getAddress(user.account.address)], { account: owner.account });
      const finalBalance = await mockDEVToken.read.balanceOf([getAddress(user.account.address)]);

      const escrow = await dEVoterEscrow.read.escrows([getAddress(user.account.address)]);
      expect(escrow[0]).to.be.false; // isActive
      expect(finalBalance > initialBalance).to.be.true;
    });

    it("Should prevent non-owners from force releasing tokens", async function () {
      const { dEVoterEscrow, user } = await loadFixture(deployContractsFixture);
      const depositAmount = parseEther("100");

      await dEVoterEscrow.write.deposit([depositAmount], { account: user.account });

      await expect(
        dEVoterEscrow.write.forceReleaseTokens([getAddress(user.account.address)], { account: user.account })
      ).to.be.rejected;
    });
  });

  describe("Edge Cases", function () {
    it("Should handle very small amounts correctly", async function () {
      const { dEVoterEscrow, user } = await loadFixture(deployContractsFixture);

      const smallAmount = 1n; // 1 wei
      const [escrowedAmount, feeAmount] = await dEVoterEscrow.read.calculateEscrowAmount([
        smallAmount,
        getAddress(user.account.address),
      ]);

      // With 10% fee, 1 wei should result in 0 fee due to rounding
      expect(feeAmount).to.equal(0n);
      expect(escrowedAmount).to.equal(smallAmount);
    });

    it("Should handle maximum fee correctly", async function () {
      const { dEVoterEscrow, user, owner } = await loadFixture(deployContractsFixture);

      // Set fee to maximum (5%)
      await dEVoterEscrow.write.updateFeeBasisPoints([500n], {
        account: owner.account,
      });

      const amount = parseEther("1000");
      const expectedFee = (amount * 500n) / 10000n; // 5%

      const [escrowedAmount, feeAmount] = await dEVoterEscrow.read.calculateEscrowAmount([
        amount,
        getAddress(user.account.address),
      ]);

      expect(feeAmount).to.equal(expectedFee);
      expect(escrowedAmount).to.equal(amount - expectedFee);
    });

    it("Should handle fee calculation with rounding", async function () {
      const { dEVoterEscrow, user, owner } = await loadFixture(deployContractsFixture);

      // Set fee to 1 basis point (0.01%)
      await dEVoterEscrow.write.updateFeeBasisPoints([1n], {
        account: owner.account,
      });

      const amount = 1000n; // 1000 wei
      const expectedFee = (amount * 1n) / 10000n; // Should be 0 due to rounding

      const [escrowedAmount, feeAmount] = await dEVoterEscrow.read.calculateEscrowAmount([
        amount,
        getAddress(user.account.address),
      ]);

      expect(feeAmount).to.equal(expectedFee);
      expect(escrowedAmount).to.equal(amount - expectedFee);
    });
  });
});
