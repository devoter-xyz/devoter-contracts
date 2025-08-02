import {
  loadFixture,
  time,
} from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";
import { expect } from "chai";
import hre from "hardhat";
import { getAddress, parseEther, keccak256, toHex, hexToBytes } from "viem";
import "@nomicfoundation/hardhat-viem/types";

describe("DEVoterEscrow Enhanced Features", function () {
  async function deployContractsFixture() {
    const [owner, user, feeWallet, admin, emergencyUser, nonAdmin] =
      await hre.viem.getWalletClients();

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

    // Mint some tokens to users
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

    // Set up roles
    const ADMIN_ROLE = keccak256(toHex("ADMIN_ROLE"));
    const EMERGENCY_ROLE = keccak256(toHex("EMERGENCY_ROLE"));

    return {
      dEVoterEscrow,
      mockDEVToken,
      owner,
      user,
      feeWallet,
      admin,
      emergencyUser,
      nonAdmin,
      votingPeriod,
      feeBasisPoints,
      userInitialBalance,
      publicClient,
      ADMIN_ROLE,
      EMERGENCY_ROLE,
    };
  }

  describe("Access Control", function () {
    it("Should set up initial roles correctly", async function () {
      const { dEVoterEscrow, owner, ADMIN_ROLE, EMERGENCY_ROLE } =
        await loadFixture(deployContractsFixture);

      const DEFAULT_ADMIN_ROLE =
        "0x0000000000000000000000000000000000000000000000000000000000000000";

      expect(
        await dEVoterEscrow.read.hasRole([
          DEFAULT_ADMIN_ROLE,
          getAddress(owner.account.address),
        ])
      ).to.be.true;
      expect(
        await dEVoterEscrow.read.hasRole([
          ADMIN_ROLE,
          getAddress(owner.account.address),
        ])
      ).to.be.true;
      expect(
        await dEVoterEscrow.read.hasRole([
          EMERGENCY_ROLE,
          getAddress(owner.account.address),
        ])
      ).to.be.true;
    });

    it("Should allow owner to grant admin role", async function () {
      const { dEVoterEscrow, owner, admin } = await loadFixture(
        deployContractsFixture
      );

      await dEVoterEscrow.write.grantAdminRole(
        [getAddress(admin.account.address)],
        {
          account: owner.account,
        }
      );

      const roleInfo = await dEVoterEscrow.read.getRoleInfo([
        getAddress(admin.account.address),
      ]);
      expect(roleInfo[0]).to.be.true; // hasAdminRole
    });

    it("Should allow owner to grant emergency role", async function () {
      const { dEVoterEscrow, owner, emergencyUser } = await loadFixture(
        deployContractsFixture
      );

      await dEVoterEscrow.write.grantEmergencyRole(
        [getAddress(emergencyUser.account.address)],
        {
          account: owner.account,
        }
      );

      const roleInfo = await dEVoterEscrow.read.getRoleInfo([
        getAddress(emergencyUser.account.address),
      ]);
      expect(roleInfo[1]).to.be.true; // hasEmergencyRole
    });

    it("Should not allow non-owner to grant roles", async function () {
      const { dEVoterEscrow, admin, nonAdmin } = await loadFixture(
        deployContractsFixture
      );

      await expect(
        dEVoterEscrow.write.grantAdminRole(
          [getAddress(admin.account.address)],
          {
            account: nonAdmin.account,
          }
        )
      ).to.be.rejectedWith("OwnableUnauthorizedAccount");
    });

    it("Should allow admin to perform admin functions", async function () {
      const { dEVoterEscrow, owner, admin } = await loadFixture(
        deployContractsFixture
      );

      // Grant admin role
      await dEVoterEscrow.write.grantAdminRole(
        [getAddress(admin.account.address)],
        {
          account: owner.account,
        }
      );

      // Admin should be able to update fee basis points
      await dEVoterEscrow.write.updateFeeBasisPoints([400n], {
        account: admin.account,
      });

      expect(await dEVoterEscrow.read.feeBasisPoints()).to.equal(400n);
    });
  });

  describe("Emergency Functions", function () {
    it("Should allow emergency role to pause contract", async function () {
      const { dEVoterEscrow, owner, emergencyUser } = await loadFixture(
        deployContractsFixture
      );

      // Grant emergency role
      await dEVoterEscrow.write.grantEmergencyRole(
        [getAddress(emergencyUser.account.address)],
        {
          account: owner.account,
        }
      );

      // Pause the contract
      await dEVoterEscrow.write.pauseContract([], {
        account: emergencyUser.account,
      });

      expect(await dEVoterEscrow.read.paused()).to.be.true;
    });

    it("Should allow emergency role to unpause contract", async function () {
      const { dEVoterEscrow, owner, emergencyUser } = await loadFixture(
        deployContractsFixture
      );

      // Grant emergency role and pause
      await dEVoterEscrow.write.grantEmergencyRole(
        [getAddress(emergencyUser.account.address)],
        {
          account: owner.account,
        }
      );
      await dEVoterEscrow.write.pauseContract([], {
        account: emergencyUser.account,
      });

      // Unpause the contract
      await dEVoterEscrow.write.unpauseContract([], {
        account: emergencyUser.account,
      });

      expect(await dEVoterEscrow.read.paused()).to.be.false;
    });

    it("Should not allow deposits when paused", async function () {
      const { dEVoterEscrow, owner, user, emergencyUser } = await loadFixture(
        deployContractsFixture
      );

      // Grant emergency role and pause
      await dEVoterEscrow.write.grantEmergencyRole(
        [getAddress(emergencyUser.account.address)],
        {
          account: owner.account,
        }
      );
      await dEVoterEscrow.write.pauseContract([], {
        account: emergencyUser.account,
      });

      // Should not allow deposits when paused
      await expect(
        dEVoterEscrow.write.deposit([parseEther("100")], {
          account: user.account,
        })
      ).to.be.rejectedWith("EnforcedPause");
    });

    it("Should allow emergency withdrawal", async function () {
      const { dEVoterEscrow, owner, user, emergencyUser } = await loadFixture(
        deployContractsFixture
      );

      // First deposit some tokens
      await dEVoterEscrow.write.deposit([parseEther("100")], {
        account: user.account,
      });

      // Grant emergency role
      await dEVoterEscrow.write.grantEmergencyRole(
        [getAddress(emergencyUser.account.address)],
        {
          account: owner.account,
        }
      );

      // Emergency withdraw
      await dEVoterEscrow.write.emergencyWithdraw(
        [getAddress(user.account.address), "Emergency situation"],
        {
          account: emergencyUser.account,
        }
      );

      const escrow = await dEVoterEscrow.read.escrows([
        getAddress(user.account.address),
      ]);
      expect(escrow[0]).to.be.false; // isActive should be false
    });

    it("Should not allow non-emergency role to perform emergency functions", async function () {
      const { dEVoterEscrow, nonAdmin } = await loadFixture(
        deployContractsFixture
      );

      await expect(
        dEVoterEscrow.write.pauseContract([], {
          account: nonAdmin.account,
        })
      ).to.be.rejectedWith("Caller does not have emergency role");
    });
  });

  describe("Enhanced Events System", function () {
    it("Should emit comprehensive events on deposit", async function () {
      const { dEVoterEscrow, user, publicClient } = await loadFixture(
        deployContractsFixture
      );

      const amount = parseEther("100");
      const hash = await dEVoterEscrow.write.deposit([amount], {
        account: user.account,
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      // Should emit multiple events including TokensDeposited, TokensEscrowed, EscrowStateChanged
      expect(receipt.logs.length).to.be.greaterThan(3);
    });

    it("Should emit events on pause/unpause", async function () {
      const { dEVoterEscrow, owner, emergencyUser, publicClient } =
        await loadFixture(deployContractsFixture);

      await dEVoterEscrow.write.grantEmergencyRole(
        [getAddress(emergencyUser.account.address)],
        {
          account: owner.account,
        }
      );

      const pauseHash = await dEVoterEscrow.write.pauseContract([], {
        account: emergencyUser.account,
      });

      const pauseReceipt = await publicClient.waitForTransactionReceipt({
        hash: pauseHash,
      });
      expect(pauseReceipt.logs.length).to.be.greaterThan(0);

      const unpauseHash = await dEVoterEscrow.write.unpauseContract([], {
        account: emergencyUser.account,
      });

      const unpauseReceipt = await publicClient.waitForTransactionReceipt({
        hash: unpauseHash,
      });
      expect(unpauseReceipt.logs.length).to.be.greaterThan(0);
    });

    it("Should emit events on fee parameter updates", async function () {
      const { dEVoterEscrow, owner, publicClient } = await loadFixture(
        deployContractsFixture
      );

      const hash = await dEVoterEscrow.write.updateFeeBasisPoints([400n], {
        account: owner.account,
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      // Should emit FeeBasisPointsUpdated and FeeParametersUpdated events
      expect(receipt.logs.length).to.be.greaterThan(1);
    });
  });

  describe("Vote Casting", function () {
    it("Should allow voting with escrowed tokens", async function () {
      const { dEVoterEscrow, user, publicClient } = await loadFixture(
        deployContractsFixture
      );

      // First deposit some tokens
      await dEVoterEscrow.write.deposit([parseEther("100")], {
        account: user.account,
      });

      // Cast a vote
      const repositoryId = 1n;
      const voteAmount = parseEther("50");

      const hash = await dEVoterEscrow.write.castVote(
        [repositoryId, voteAmount],
        {
          account: user.account,
        }
      );

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      expect(receipt.logs.length).to.be.greaterThan(0);
    });

    it("Should not allow voting without active escrow", async function () {
      const { dEVoterEscrow, user } = await loadFixture(deployContractsFixture);

      await expect(
        dEVoterEscrow.write.castVote([1n, parseEther("50")], {
          account: user.account,
        })
      ).to.be.rejectedWith("No active escrow for this user");
    });

    it("Should not allow voting with amount greater than escrowed", async function () {
      const { dEVoterEscrow, user } = await loadFixture(deployContractsFixture);

      // Deposit tokens
      await dEVoterEscrow.write.deposit([parseEther("100")], {
        account: user.account,
      });

      // Try to vote with more than escrowed (deposit has fees)
      await expect(
        dEVoterEscrow.write.castVote([1n, parseEther("100")], {
          account: user.account,
        })
      ).to.be.rejectedWith("Insufficient voting power");
    });
  });

  describe("Contract State Query Functions", function () {
    it("Should return correct contract state", async function () {
      const { dEVoterEscrow, user } = await loadFixture(deployContractsFixture);

      // Initial state
      let state = await dEVoterEscrow.read.getContractState();
      expect(state[0]).to.equal(0n); // totalEscrowed
      expect(state[1]).to.equal(0n); // totalFees
      expect(state[2]).to.equal(0n); // activeEscrows
      expect(state[4]).to.be.false; // isPaused

      // After deposit
      await dEVoterEscrow.write.deposit([parseEther("100")], {
        account: user.account,
      });

      state = await dEVoterEscrow.read.getContractState();
      expect(Number(state[0])).to.be.greaterThan(0); // totalEscrowed
      expect(Number(state[1])).to.be.greaterThan(0); // totalFees
      expect(state[2]).to.equal(1n); // activeEscrows
    });

    it("Should return detailed escrow info", async function () {
      const { dEVoterEscrow, user } = await loadFixture(deployContractsFixture);

      await dEVoterEscrow.write.deposit([parseEther("100")], {
        account: user.account,
      });

      const escrowInfo = await dEVoterEscrow.read.getDetailedEscrowInfo([
        getAddress(user.account.address),
      ]);

      expect(escrowInfo[0]).to.be.true; // isActive
      expect(Number(escrowInfo[1])).to.be.greaterThan(0); // amount
      expect(Number(escrowInfo[2])).to.be.greaterThan(0); // depositTime
      expect(Number(escrowInfo[3])).to.be.greaterThan(0); // releaseTime
      expect(Number(escrowInfo[4])).to.be.greaterThan(0); // feePaid
      expect(Number(escrowInfo[5])).to.be.greaterThan(0); // timeRemaining
    });

    it("Should return correct role info", async function () {
      const { dEVoterEscrow, owner, admin } = await loadFixture(
        deployContractsFixture
      );

      // Owner should have all roles
      let roleInfo = await dEVoterEscrow.read.getRoleInfo([
        getAddress(owner.account.address),
      ]);
      expect(roleInfo[0]).to.be.true; // hasAdminRole
      expect(roleInfo[1]).to.be.true; // hasEmergencyRole
      expect(roleInfo[2]).to.be.true; // isOwner

      // Regular user should have no roles
      roleInfo = await dEVoterEscrow.read.getRoleInfo([
        getAddress(admin.account.address),
      ]);
      expect(roleInfo[0]).to.be.false; // hasAdminRole
      expect(roleInfo[1]).to.be.false; // hasEmergencyRole
      expect(roleInfo[2]).to.be.false; // isOwner
    });

    it("Should return correct timing info", async function () {
      const { dEVoterEscrow, votingPeriod } = await loadFixture(
        deployContractsFixture
      );

      const timingInfo = await dEVoterEscrow.read.getTimingInfo();
      expect(timingInfo[0]).to.equal(BigInt(votingPeriod)); // currentVotingPeriod
      expect(Number(timingInfo[1])).to.be.greaterThan(0); // currentTimestamp
    });

    it("Should simulate vote casting correctly", async function () {
      const { dEVoterEscrow, user } = await loadFixture(deployContractsFixture);

      // Before deposit - should not be able to vote
      let simulation = await dEVoterEscrow.read.simulateVoteCast([
        getAddress(user.account.address),
        1n,
      ]);
      expect(simulation[0]).to.be.false; // canVote

      // After deposit - should be able to vote
      await dEVoterEscrow.write.deposit([parseEther("100")], {
        account: user.account,
      });

      simulation = await dEVoterEscrow.read.simulateVoteCast([
        getAddress(user.account.address),
        1n,
      ]);
      expect(simulation[0]).to.be.true; // canVote
      expect(Number(simulation[1])).to.be.greaterThan(0); // votingPower
      expect(Number(simulation[2])).to.be.greaterThan(0); // timeRemaining
    });
  });

  describe("Enhanced Admin Functions", function () {
    it("Should allow admin to update voting period", async function () {
      const { dEVoterEscrow, owner } = await loadFixture(
        deployContractsFixture
      );

      const newVotingPeriod = 60 * 24 * 60 * 60; // 60 days
      await dEVoterEscrow.write.updateVotingPeriod([BigInt(newVotingPeriod)], {
        account: owner.account,
      });

      expect(await dEVoterEscrow.read.votingPeriod()).to.equal(
        BigInt(newVotingPeriod)
      );
    });

    it("Should not allow setting zero voting period", async function () {
      const { dEVoterEscrow, owner } = await loadFixture(
        deployContractsFixture
      );

      await expect(
        dEVoterEscrow.write.updateVotingPeriod([0n], {
          account: owner.account,
        })
      ).to.be.rejectedWith("Voting period must be greater than 0");
    });

    it("Should update release timestamp with validation", async function () {
      const { dEVoterEscrow, owner, user } = await loadFixture(
        deployContractsFixture
      );

      // First create an escrow
      await dEVoterEscrow.write.deposit([parseEther("100")], {
        account: user.account,
      });

      const currentTime = BigInt(Math.floor(Date.now() / 1000));
      const futureTime = currentTime + 86400n; // 1 day from now

      await dEVoterEscrow.write.updateReleaseTimestamp(
        [getAddress(user.account.address), futureTime],
        {
          account: owner.account,
        }
      );

      const escrow = await dEVoterEscrow.read.escrows([
        getAddress(user.account.address),
      ]);
      expect(escrow[3]).to.equal(futureTime); // releaseTimestamp
    });
  });

  describe("Contract State Tracking", function () {
    it("Should track total escrowed amount correctly", async function () {
      const { dEVoterEscrow, user, mockDEVToken } = await loadFixture(
        deployContractsFixture
      );

      const initialState = await dEVoterEscrow.read.getContractState();
      expect(initialState[0]).to.equal(0n); // totalEscrowed

      // Mint more tokens to user for multiple deposits
      await mockDEVToken.write.mintTo([
        getAddress(user.account.address),
        parseEther("1000"),
      ]);
      await mockDEVToken.write.approve(
        [dEVoterEscrow.address, parseEther("2000")],
        { account: user.account }
      );

      // First deposit
      await dEVoterEscrow.write.deposit([parseEther("100")], {
        account: user.account,
      });

      let state = await dEVoterEscrow.read.getContractState();
      const firstEscrowAmount = state[0];
      expect(Number(firstEscrowAmount)).to.be.greaterThan(0);

      // Release tokens
      await time.increase(30 * 24 * 60 * 60 + 1); // Move past voting period
      await dEVoterEscrow.write.releaseTokens([], {
        account: user.account,
      });

      state = await dEVoterEscrow.read.getContractState();
      expect(state[0]).to.equal(0n); // totalEscrowed should be 0 after release
      expect(state[2]).to.equal(0n); // activeEscrows should be 0
    });

    it("Should track total fees collected", async function () {
      const { dEVoterEscrow, user } = await loadFixture(deployContractsFixture);

      const initialState = await dEVoterEscrow.read.getContractState();
      expect(initialState[1]).to.equal(0n); // totalFeesCollected

      await dEVoterEscrow.write.deposit([parseEther("100")], {
        account: user.account,
      });

      const state = await dEVoterEscrow.read.getContractState();
      expect(Number(state[1])).to.be.greaterThan(0); // totalFeesCollected should increase
    });
  });
});
