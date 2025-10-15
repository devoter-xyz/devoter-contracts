import {
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";
import { expect } from "chai";
import hre from "hardhat";
import { getAddress, parseEther } from "viem";

describe("Integration Tests", function () {
  async function deployContractsFixture() {
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

  it("Contract deploys with correct initial state", async function () {
    const { mockDEVToken, owner } = await loadFixture(deployContractsFixture);
    const ownerAddress = getAddress(owner.account.address);
    const initialSupply = parseEther("1000000");

    expect(await mockDEVToken.read.name()).to.equal("Mock DEV Token");
    expect(await mockDEVToken.read.symbol()).to.equal("mDEV");
    expect(await mockDEVToken.read.balanceOf([ownerAddress])).to.equal(
      initialSupply
    );
  });

  it("Owner can mint tokens to test addresses", async function () {
    const { mockDEVToken, otherAccount } = await loadFixture(
      deployContractsFixture
    );
    const mintAmount = parseEther("500");
    const otherAccountAddress = getAddress(otherAccount.account.address);

    await mockDEVToken.write.mintTo([otherAccountAddress, mintAmount]);

    expect(await mockDEVToken.read.balanceOf([otherAccountAddress])).to.equal(
      mintAmount
    );
  });

  it("Non-owners cannot mint tokens", async function () {
    const { mockDEVToken, otherAccount, thirdAccount } = await loadFixture(
      deployContractsFixture
    );
    const mintAmount = parseEther("500");
    const thirdAccountAddress = getAddress(thirdAccount.account.address);

    await expect(
      mockDEVToken.write.mintTo([thirdAccountAddress, mintAmount], {
        account: otherAccount.account,
      })
    ).to.be.rejectedWith("MockDEVToken: caller not authorized to mint");
  });

  it("Users can delegate voting power", async function () {
    const { mockDEVToken, owner, otherAccount } = await loadFixture(
      deployContractsFixture
    );
    const ownerAddress = getAddress(owner.account.address);
    const otherAccountAddress = getAddress(otherAccount.account.address);

    await mockDEVToken.write.delegate([otherAccountAddress]);

    const delegate = await mockDEVToken.read.delegates([ownerAddress]);
    expect(delegate).to.equal(otherAccountAddress);
  });

  it("Voting power calculations are accurate", async function () {
    const { mockDEVToken, owner } = await loadFixture(deployContractsFixture);
    const ownerAddress = getAddress(owner.account.address);
    const balance = await mockDEVToken.read.balanceOf([ownerAddress]);

    await mockDEVToken.write.delegate([ownerAddress]);

    const votes = await mockDEVToken.read.getVotes([ownerAddress]);
    expect(votes).to.equal(balance);
  });
});
