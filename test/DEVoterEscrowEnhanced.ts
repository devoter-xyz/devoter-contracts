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

    it("Should revert emergencyTokenRecovery if no surplus escrow token", async function () {
      const { dEVoterEscrow, mockDEVToken, owner, user, votingPeriod } =
        await loadFixture(deployContractsFixture);

      // Deposit tokens to create an escrow
      const depositAmount = parseEther("100");
      await dEVoterEscrow.write.deposit([depositAmount], {
        account: user.account,
      });

      // Fast forward time to allow release, but don't release yet
      await time.increase(votingPeriod + 1);

      // Pause the contract
      await dEVoterEscrow.write.pauseContract([], { account: owner.account });

      // At this point, contractBalance should be equal to totalEscrowedAmount (after fee deduction)
      // So, emergencyTokenRecovery should revert with "No surplus escrow token to recover"
      await expect(
        dEVoterEscrow.write.emergencyTokenRecovery([mockDEVToken.address], {
          account: owner.account,
        })
      ).to.be.rejectedWith("No surplus escrow token to recover");
    });

    it("Should recover only surplus escrow tokens during emergencyTokenRecovery", async function () {
      const { dEVoterEscrow, mockDEVToken, owner, user, votingPeriod } =
        await loadFixture(deployContractsFixture);

      // Deposit tokens to create an escrow
      const depositAmount = parseEther("100");
      await dEVoterEscrow.write.deposit([depositAmount], {
        account: user.account,
      });

      // Send some extra tokens directly to the contract (surplus)
      const surplusAmount = parseEther("50");
      await mockDEVToken.write.transfer(
        [dEVoterEscrow.address, surplusAmount],
        { account: owner.account }
      );

      // Pause the contract
      await dEVoterEscrow.write.pauseContract([], { account: owner.account });

      const ownerInitialBalance = await mockDEVToken.read.balanceOf([
        getAddress(owner.account.address),
      ]);

      await dEVoterEscrow.write.emergencyTokenRecovery(
        [mockDEVToken.address],
        {
          account: owner.account,
        }
      );

      const ownerFinalBalance = await mockDEVToken.read.balanceOf([
        getAddress(owner.account.address),
      ]);

      expect(ownerFinalBalance).to.equal(ownerInitialBalance + surplusAmount);
    });

    it("Should recover foreign tokens during emergencyTokenRecovery", async function () {
      const { dEVoterEscrow, owner } = await loadFixture(
        deployContractsFixture
      );

      // Deploy a mock foreign token
      const mockForeignToken = await hre.viem.deployContract("MockDEVToken", [
        getAddress(owner.account.address),
        "Mock Foreign Token",
        "mFT",
      ]);

      // Send some foreign tokens directly to the escrow contract
      const foreignTokenAmount = parseEther("75");
      await mockForeignToken.write.transfer(
        [dEVoterEscrow.address, foreignTokenAmount],
        { account: owner.account }
      );

      // Pause the contract
      await dEVoterEscrow.write.pauseContract([], { account: owner.account });

      const ownerInitialBalance = await mockForeignToken.read.balanceOf([
        getAddress(owner.account.address),
      ]);

      await dEVoterEscrow.write.emergencyTokenRecovery(
        [mockForeignToken.address],
        {
          account: owner.account,
        }
      );

      const ownerFinalBalance = await mockForeignToken.read.balanceOf([
        getAddress(owner.account.address),
      ]);

      expect(ownerFinalBalance).to.equal(ownerInitialBalance + foreignTokenAmount);
    });

    it("Should revert emergencyTokenRecovery if recoverToken is zero address", async function () {
      const { dEVoterEscrow, owner } = await loadFixture(
        deployContractsFixture
      );

      // Pause the contract
      await dEVoterEscrow.write.pauseContract([], { account: owner.account });

      await expect(
        dEVoterEscrow.write.emergencyTokenRecovery(
          ["0x0000000000000000000000000000000000000000"],
          { account: owner.account }
        )
      ).to.be.rejectedWith("Zero token");
    });

    it("Should revert emergencyTokenRecovery if no foreign tokens to recover", async function () {
      const { dEVoterEscrow, owner } = await loadFixture(
        deployContractsFixture
      );

      // Deploy a mock foreign token
      const mockForeignToken = await hre.viem.deployContract("MockDEVToken", [
        getAddress(owner.account.address),
        "Mock Foreign Token",
        "mFT",
      ]);

      // Pause the contract
      await dEVoterEscrow.write.pauseContract([], { account: owner.account });

      await expect(
        dEVoterEscrow.write.emergencyTokenRecovery(
          [mockForeignToken.address],
          { account: owner.account }
        )
      ).to.be.rejectedWith("No tokens to recover");
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

    it("Should correctly adjust votesCast when tokens are returned", async function () {
      const { dEVoterEscrow, mockDEVToken, owner, user, votingPeriod } =
        await loadFixture(deployContractsFixture);

      // Set the voting contract address (owner can do this)
      await dEVoterEscrow.write.setVotingContractAddress(
        [getAddress(owner.account.address)], // Using owner as mock voting contract
        { account: owner.account }
      );

      const depositAmount = parseEther("100");
      await dEVoterEscrow.write.deposit([depositAmount], {
        account: user.account,
      });

      const userAddress = getAddress(user.account.address);
      let escrow = await dEVoterEscrow.read.escrows([userAddress]);
      const initialEscrowedAmount = escrow[1];
      expect(escrow[5]).to.equal(0n); // votesCast should be 0 initially

      // Cast some votes
      const repositoryId = 1n;
      const voteAmount = parseEther("30");
      await dEVoterEscrow.write.castVote([repositoryId, voteAmount], {
        account: user.account,
      });

      escrow = await dEVoterEscrow.read.escrows([userAddress]);
      expect(escrow[5]).to.equal(voteAmount); // votesCast should be voteAmount

      // Return some tokens (less than votesCast)
      const returnAmount1 = parseEther("10");
      await dEVoterEscrow.write.returnVoteTokens([userAddress, returnAmount1], {
        account: owner.account, // Mock voting contract
      });

      escrow = await dEVoterEscrow.read.escrows([userAddress]);
      expect(escrow[1]).to.equal(initialEscrowedAmount - returnAmount1); // amount adjusted
      expect(escrow[5]).to.equal(voteAmount - returnAmount1); // votesCast adjusted

      // Return more tokens (more than remaining votesCast, should clamp to 0)
      const returnAmount2 = parseEther("50"); // (30 - 10) = 20 remaining votesCast
      await dEVoterEscrow.write.returnVoteTokens([userAddress, returnAmount2], {
        account: owner.account, // Mock voting contract
      });

      escrow = await dEVoterEscrow.read.escrows([userAddress]);
      expect(escrow[1]).to.equal(initialEscrowedAmount - returnAmount1 - returnAmount2); // amount adjusted
      expect(escrow[5]).to.equal(0n); // votesCast clamped to 0
    });

    it("Should not allow voting without active escrow", async function () {
      const { dEVoterEscrow, user } = await loadFixture(deployContractsFixture);

      await expect(
        dEVoterEscrow.write.castVote([1n, parseEther("50")], {
          account: user.account,
        })
      ).to.be.rejectedWith("No active escrow");
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
      ).to.be.rejectedWith("Insufficient vote balance");
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

    it("Should update release timestamp with validation and emit event", async function () {
      const { dEVoterEscrow, owner, user, publicClient } = await loadFixture(
        deployContractsFixture
      );

      // First create an escrow
      await dEVoterEscrow.write.deposit([parseEther("100")], {
        account: user.account,
      });

      const userAddress = getAddress(user.account.address);
      const initialEscrow = await dEVoterEscrow.read.escrows([userAddress]);
      const previousReleaseTimestamp = initialEscrow[3];

      const currentTime = BigInt(Math.floor(Date.now() / 1000));
      const newReleaseTimestamp = currentTime + 86400n; // 1 day from now

      const hash = await dEVoterEscrow.write.updateReleaseTimestamp(
        [userAddress, newReleaseTimestamp],
        {
          account: owner.account,
        }
      );

      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      const escrow = await dEVoterEscrow.read.escrows([userAddress]);
      expect(escrow[3]).to.equal(newReleaseTimestamp); // releaseTimestamp updated

      // Decode the ReleaseTimestampUpdated event
      const releaseTimestampUpdatedEvent = receipt.logs.find((log) => {
        return log.topics[0] === keccak256(toHex("ReleaseTimestampUpdated(address,uint256,uint256,address)"));
      });

      expect(releaseTimestampUpdatedEvent).to.not.be.undefined;

      const { decodeEventLog } = require("viem");

      const decodedArgs = decodeEventLog({
        abi: dEVoterEscrow.abi,
        eventName: "ReleaseTimestampUpdated",
        data: releaseTimestampUpdatedEvent.data,
        topics: releaseTimestampUpdatedEvent.topics,
      }).args;

      expect(decodedArgs.user).to.equal(userAddress);
      expect(decodedArgs.oldReleaseTimestamp).to.equal(
        previousReleaseTimestamp
      );
      expect(decodedArgs.newReleaseTimestamp).to.equal(newReleaseTimestamp);
      expect(decodedArgs.updatedBy).to.equal(getAddress(owner.account.address));
    });

    it("Should revert updateReleaseTimestamp if user has no active escrow", async function () {
      const { dEVoterEscrow, owner, nonAdmin } = await loadFixture(
        deployContractsFixture
      );

      const currentTime = BigInt(Math.floor(Date.now() / 1000));
      const newReleaseTimestamp = currentTime + 86400n; // 1 day from now

      await expect(
        dEVoterEscrow.write.updateReleaseTimestamp(
          [getAddress(nonAdmin.account.address), newReleaseTimestamp],
          { account: owner.account }
        )
      ).to.be.rejectedWith("No active escrow for this user");
    });

    it("Should revert updateReleaseTimestamp if newReleaseTimestamp is not in the future", async function () {
      const { dEVoterEscrow, owner, user } = await loadFixture(
        deployContractsFixture
      );

      // First create an escrow
      await dEVoterEscrow.write.deposit([parseEther("100")], {
        account: user.account,
      });

      const currentTime = BigInt(Math.floor(Date.now() / 1000));
      const pastTime = currentTime - 100n; // In the past

      await expect(
        dEVoterEscrow.write.updateReleaseTimestamp(
          [getAddress(user.account.address), pastTime],
          { account: owner.account }
        )
      ).to.be.rejectedWith("Release timestamp must be in the future");
    });

    it("Should revert updateReleaseTimestamp if called by non-admin", async function () {
      const { dEVoterEscrow, user, nonAdmin } = await loadFixture(
        deployContractsFixture
      );

      // First create an escrow
      await dEVoterEscrow.write.deposit([parseEther("100")], {
        account: user.account,
      });

      const currentTime = BigInt(Math.floor(Date.now() / 1000));
      const futureTime = currentTime + 86400n; // 1 day from now

      await expect(
        dEVoterEscrow.write.updateReleaseTimestamp(
          [getAddress(user.account.address), futureTime],
          { account: nonAdmin.account }
        )
      ).to.be.rejected;
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
