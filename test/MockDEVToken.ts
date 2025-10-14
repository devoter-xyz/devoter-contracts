import {
  time,
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";
import { expect } from "chai";
import hre from "hardhat";
import { getAddress, parseGwei, parseEther } from "viem";

describe("MockDEVToken", function () {

  describe("Burning", function () {
    it("Should allow a user to burn their own tokens", async function () {
      const { mockDEVToken, owner } = await loadFixture(deployMockDEVTokenFixture);
      const burnAmount = parseEther("100");
      const initialBalance = await mockDEVToken.read.balanceOf([
        getAddress(owner.account.address),
      ]);
      await mockDEVToken.write.burn([burnAmount]);
      const finalBalance = await mockDEVToken.read.balanceOf([
        getAddress(owner.account.address),
      ]);
      expect(finalBalance).to.equal(initialBalance - burnAmount);
    });

    it("Should not allow burning zero tokens", async function () {
      const { mockDEVToken } = await loadFixture(deployMockDEVTokenFixture);
      await expect(
        mockDEVToken.write.burn([0n])
      ).to.be.rejectedWith("MockDEVToken: burn amount must be greater than zero");
    });

    it("Should not allow burning more tokens than balance", async function () {
      const { mockDEVToken, otherAccount } = await loadFixture(deployMockDEVTokenFixture);
      const burnAmount = parseEther("100");
      // otherAccount has 0 tokens
      await expect(
        mockDEVToken.write.burn([burnAmount], { account: otherAccount.account })
      ).to.be.rejected;
    });
  });
  async function deployMockDEVTokenFixture() {
    const [owner, otherAccount, thirdAccount] =
      await hre.viem.getWalletClients();

    const mockDEVToken = await hre.viem.deployContract("MockDEVToken", [
      getAddress(owner.account.address),
      "Mock DEV Token",
      "mDEV",
    ]);

    const publicClient = await hre.viem.getPublicClient();

    return {
      mockDEVToken,
      owner,
      otherAccount,
      thirdAccount,
      publicClient,
    };
  }

  describe("Deployment", function () {
    it("Should set the correct name and symbol", async function () {
      const { mockDEVToken } = await loadFixture(deployMockDEVTokenFixture);
      expect(await mockDEVToken.read.name()).to.equal("Mock DEV Token");
      expect(await mockDEVToken.read.symbol()).to.equal("mDEV");
    });

    it("Should mint the initial supply to the owner", async function () {
      const { mockDEVToken, owner } = await loadFixture(
        deployMockDEVTokenFixture
      );
      const expectedSupply = parseEther("1000000");
      expect(
        await mockDEVToken.read.balanceOf([getAddress(owner.account.address)])
      ).to.equal(expectedSupply);
    });
  });

  describe("Minting", function () {
    it("Should allow the owner to mint tokens", async function () {
      const { mockDEVToken, otherAccount } = await loadFixture(
        deployMockDEVTokenFixture
      );
      const mintAmount = parseEther("1000");
      await mockDEVToken.write.mintTo([
        getAddress(otherAccount.account.address),
        mintAmount,
      ]);
      expect(
        await mockDEVToken.read.balanceOf([
          getAddress(otherAccount.account.address),
        ])
      ).to.equal(mintAmount);
    });

    it("Should not allow a non-owner to mint tokens", async function () {
      const { mockDEVToken, otherAccount, thirdAccount } = await loadFixture(
        deployMockDEVTokenFixture
      );
      const mintAmount = parseEther("1000");
      await expect(
        mockDEVToken.write.mintTo(
          [getAddress(thirdAccount.account.address), mintAmount],
          {
            account: otherAccount.account,
          }
        )
      ).to.be.rejectedWith("MockDEVToken: caller not authorized to mint");
    });

    it("Should not allow minting to the zero address", async function () {
      const { mockDEVToken } = await loadFixture(deployMockDEVTokenFixture);
      const mintAmount = parseEther("1000");
      await expect(
        mockDEVToken.write.mintTo([
          "0x0000000000000000000000000000000000000000",
          mintAmount,
        ])
      ).to.be.rejectedWith("MockDEVToken: cannot mint to the zero address");
    });
  });

  describe("Delegation", function () {
    it("Should allow a user to delegate their voting power to themselves", async function () {
      const { mockDEVToken, owner } = await loadFixture(
        deployMockDEVTokenFixture
      );

      await mockDEVToken.write.delegate([getAddress(owner.account.address)]);

      const delegate = await mockDEVToken.read.delegates([
        getAddress(owner.account.address),
      ]);
      expect(delegate).to.equal(getAddress(owner.account.address));
    });

    it("Should allow a user to delegate their voting power to another address", async function () {
      const { mockDEVToken, owner, otherAccount } = await loadFixture(
        deployMockDEVTokenFixture
      );

      await mockDEVToken.write.delegate([
        getAddress(otherAccount.account.address),
      ]);

      const delegate = await mockDEVToken.read.delegates([
        getAddress(owner.account.address),
      ]);
      expect(delegate).to.equal(getAddress(otherAccount.account.address));
    });

    it("Should return the correct voting power for a user", async function () {
      const { mockDEVToken, owner } = await loadFixture(
        deployMockDEVTokenFixture
      );
      const balance = await mockDEVToken.read.balanceOf([
        getAddress(owner.account.address),
      ]);

      await mockDEVToken.write.delegate([getAddress(owner.account.address)]);

      const votes = await mockDEVToken.read.getVotes([
        getAddress(owner.account.address),
      ]);
      expect(votes).to.equal(balance);
    });

    it("Should correctly keep track of delegation checkpoints", async function () {
      const { mockDEVToken, owner, publicClient } = await loadFixture(
        deployMockDEVTokenFixture
      );

      await mockDEVToken.write.delegate([getAddress(owner.account.address)]);

      await hre.network.provider.send("evm_mine");
      await hre.network.provider.send("evm_mine");

      const numCheckpoints = await mockDEVToken.read.numCheckpoints([
        getAddress(owner.account.address),
      ]);
      expect(numCheckpoints > 0n).to.be.true;
    });
  });
});
