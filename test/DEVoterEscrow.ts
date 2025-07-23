import {
  time,
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";
import { expect } from "chai";
import hre from "hardhat";
import { getAddress, parseEther } from "viem";

describe("DEVoterEscrow", function () {
    async function deployContracts() {
        const [owner, user1, feeWallet] = await hre.viem.getWalletClients();

        const mockDEVToken = await hre.viem.deployContract("MockDEVToken", [
            getAddress(owner.account.address),
            "Mock DEV Token",
            "mDEV",
        ]);

        const dEvoterEscrow = await hre.viem.deployContract("DEVoterEscrow", [
            mockDEVToken.address,
            getAddress(feeWallet.account.address),
            10,
        ]);

        await mockDEVToken.write.mintTo([
            getAddress(user1.account.address),
            parseEther("1000"),
        ]);

        return { dEvoterEscrow, mockDEVToken, owner, user1, feeWallet };
    }

    describe("escrowTokensForVoting", function () {
        it("should successfully deposit tokens and create an escrow", async function () {
            const { dEvoterEscrow, mockDEVToken, user1 } = await loadFixture(deployContracts);
            const depositAmount = parseEther("100");

            await mockDEVToken.write.approve([dEvoterEscrow.address, depositAmount], {
                account: user1.account,
            });
            await dEvoterEscrow.write.escrowTokensForVoting([depositAmount], {
                account: user1.account,
            });

            const escrowData = await dEvoterEscrow.read.userEscrows([getAddress(user1.account.address)]);
            expect(escrowData[0]).to.equal(depositAmount);
            expect(escrowData[3]).to.be.true;

            const contractBalance = await mockDEVToken.read.balanceOf([dEvoterEscrow.address]);
            expect(contractBalance).to.equal(depositAmount);
        });

        it("should fail if the deposit amount is zero", async function () {
            const { dEvoterEscrow, user1 } = await loadFixture(deployContracts);
            await expect(
                dEvoterEscrow.write.escrowTokensForVoting([0n], {
                    account: user1.account,
                })
            ).to.be.rejectedWith("Amount must be greater than 0");
        });

        it("should fail if the user already has an active escrow", async function () {
            const { dEvoterEscrow, mockDEVToken, user1 } = await loadFixture(deployContracts);
            const depositAmount = parseEther("100");

            await mockDEVToken.write.approve([dEvoterEscrow.address, depositAmount], {
                account: user1.account,
            });
            await dEvoterEscrow.write.escrowTokensForVoting([depositAmount], {
                account: user1.account,
            });

            await expect(
                dEvoterEscrow.write.escrowTokensForVoting([depositAmount], {
                    account: user1.account,
                })
            ).to.be.rejectedWith("User already has active escrow");
        });

        it("should emit a TokensDeposited event on successful deposit", async function () {
            const { dEvoterEscrow, mockDEVToken, user1 } = await loadFixture(deployContracts);
            const depositAmount = parseEther("100");
            const publicClient = await hre.viem.getPublicClient();

            await mockDEVToken.write.approve([dEvoterEscrow.address, depositAmount], {
                account: user1.account,
            });

            const hash = await dEvoterEscrow.write.escrowTokensForVoting([depositAmount], {
                account: user1.account,
            });
            const receipt = await publicClient.waitForTransactionReceipt({ hash });
            const block = await publicClient.getBlock({ blockNumber: receipt.blockNumber });

            const events = await dEvoterEscrow.getEvents.TokensDeposited();
            expect(events).to.have.lengthOf(1);
            expect(events[0].args.user).to.equal(getAddress(user1.account.address));
            expect(events[0].args.amount).to.equal(depositAmount);
            expect(events[0].args.releaseTimestamp).to.equal(block.timestamp + BigInt(30 * 24 * 60 * 60));
        });
    });
});
