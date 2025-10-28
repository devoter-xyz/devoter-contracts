import {
  time,
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";
import { expect } from "chai";
import hre from "hardhat";
import { getAddress, parseGwei } from "viem";

describe("Lock", function () {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.
  async function deployOneYearLockFixture() {
    const ONE_YEAR_IN_SECS = 365 * 24 * 60 * 60;

    const lockedAmount = parseGwei("1");
    const unlockTime = BigInt((await time.latest()) + ONE_YEAR_IN_SECS);

    // Contracts are deployed using the first signer/account by default
    const [owner, otherAccount] = await hre.viem.getWalletClients();

    const lock = await hre.viem.deployContract("Lock", [unlockTime], {
      value: lockedAmount,
    });

    const publicClient = await hre.viem.getPublicClient();

    return {
      lock,
      unlockTime,
      lockedAmount,
      owner,
      otherAccount,
      publicClient,
    };
  }

  describe("Deployment", function () {
    it("Should set the right unlockTime", async function () {
      const { lock, unlockTime } = await loadFixture(deployOneYearLockFixture);

      expect(await lock.read.unlockTime()).to.equal(unlockTime);
    });

    it("Should set the right owner", async function () {
      const { lock, owner } = await loadFixture(deployOneYearLockFixture);

      expect(await lock.read.owner()).to.equal(
        getAddress(owner.account.address)
      );
    });

    it("Should receive and store the funds to lock", async function () {
      const { lock, lockedAmount, publicClient } = await loadFixture(
        deployOneYearLockFixture
      );

      expect(
        await publicClient.getBalance({
          address: lock.address,
        })
      ).to.equal(lockedAmount);
    });

    it("Should fail if the unlockTime is not in the future", async function () {
      // We don't use the fixture here because we want a different deployment
      const latestTime = BigInt(await time.latest());
      await expect(
        hre.viem.deployContract("Lock", [latestTime], {
          value: 1n,
        })
      ).to.be.rejectedWith("Unlock time should be in the future");
    });
  });

  describe("Withdrawals", function () {
    describe("Validations", function () {
      it("Should revert with the right error if called too soon", async function () {
        const { lock } = await loadFixture(deployOneYearLockFixture);

        await expect(lock.write.withdraw()).to.be.rejectedWith(
          "You can't withdraw yet"
        );
      });

      it("Should revert with the right error if called from another account", async function () {
        const { lock, unlockTime, otherAccount } = await loadFixture(
          deployOneYearLockFixture
        );

        // We can increase the time in Hardhat Network
        await time.increaseTo(unlockTime);

        // We retrieve the contract with a different account to send a transaction
        const lockAsOtherAccount = await hre.viem.getContractAt(
          "Lock",
          lock.address,
          { client: { wallet: otherAccount } }
        );
        await expect(lockAsOtherAccount.write.withdraw()).to.be.rejectedWith(
          "OwnableUnauthorizedAccount"
        );
      });

      it("Shouldn't fail if the unlockTime has arrived and the owner calls it", async function () {
        const { lock, unlockTime } = await loadFixture(
          deployOneYearLockFixture
        );

        // Transactions are sent using the first signer by default
        await time.increaseTo(unlockTime);

        await expect(lock.write.withdraw()).to.be.fulfilled;
      });
    });

    describe("Behavior", function () {
      it("Should transfer the funds to the owner", async function () {
        const { lock, unlockTime, lockedAmount, owner, publicClient } =
          await loadFixture(deployOneYearLockFixture);

        await time.increaseTo(unlockTime);

        const ownerInitialBalance = await publicClient.getBalance({
          address: getAddress(owner.account.address),
        });

        const hash = await lock.write.withdraw();
        const receipt = await publicClient.waitForTransactionReceipt({ hash });

        const ownerFinalBalance = await publicClient.getBalance({
          address: getAddress(owner.account.address),
        });

        // We need to account for the gas cost of the withdraw transaction
        const gasUsed = receipt.gasUsed * receipt.effectiveGasPrice;

        const actualAmountReceived = ownerFinalBalance + gasUsed;
        const expectedAmountReceived = ownerInitialBalance + lockedAmount;
        const difference = actualAmountReceived - expectedAmountReceived;

        const tolerance = parseGwei("0.0001");

        if (difference <= tolerance && difference >= -tolerance) {
          expect(true).to.be.true; // Test passes
        } else {
          expect.fail(`Expected difference to be within +/-${tolerance}, but got ${difference}`);
        }
      });
    });

    describe("Reentrancy", function () {
      it("Should prevent reentrant calls to withdraw", async function () {
        const { lock, unlockTime, owner, publicClient } = await loadFixture(
          deployOneYearLockFixture
        );

        await time.increaseTo(unlockTime);

        // Deploy the malicious contract
        const maliciousContract = await hre.viem.deployContract(
          "MaliciousReentrant",
          [lock.address],
          { value: 1n } // Send some ETH to the malicious contract
        );

        // Fund the lock contract with more ETH for the attack
        await owner.sendTransaction({
          to: lock.address,
          value: parseGwei("10"),
        });

        // The malicious contract tries to attack
        await expect(maliciousContract.write.attack()).to.be.rejectedWith(
          "ReentrancyGuard: reentrant call"
        );

        // Verify that the lock contract still holds its funds (minus the initial 1n sent to malicious contract)
        expect(
          await publicClient.getBalance({ address: lock.address })
        ).to.equal(parseGwei("11")); // Initial 1 + 10 sent by owner
      });
    });
  });
});
