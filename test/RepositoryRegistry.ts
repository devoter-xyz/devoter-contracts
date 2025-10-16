import { expect } from "chai";
import hre from "hardhat";
import { parseEther } from "viem";

describe("RepositoryRegistry", function () {
    let repositoryRegistry: any; // viem contract instance
    let mockDEVToken: any; // viem contract instance
    let owner: any; // viem WalletClient
    let maintainer1: any; // viem WalletClient
    let maintainer2: any; // viem WalletClient

    const SUBMISSION_FEE = parseEther("10");

    beforeEach(async function () {
        const [ownerWalletClient, maintainer1WalletClient, maintainer2WalletClient] = await hre.viem.getWalletClients();
        owner = ownerWalletClient;
        maintainer1 = maintainer1WalletClient;
        maintainer2 = maintainer2WalletClient;

        // Deploy MockDEVToken using viem
        mockDEVToken = await hre.viem.deployContract("MockDEVToken", [
            owner.account.address,
            "MockDEVToken",
            "mDEV"
        ]);

        // Deploy RepositoryRegistry using viem
        repositoryRegistry = await hre.viem.deployContract("RepositoryRegistry", [
            owner.account.address,
            mockDEVToken.address,
            owner.account.address,
            SUBMISSION_FEE
        ]);

        // Mint tokens for maintainers and approve the registry
        await mockDEVToken.write.mintTo([maintainer1.account.address, parseEther("100")], { account: owner.account });
        await mockDEVToken.write.approve([repositoryRegistry.address, parseEther("100")], { account: maintainer1.account });

        await mockDEVToken.write.mintTo([maintainer2.account.address, parseEther("100")], { account: owner.account });
        await mockDEVToken.write.approve([repositoryRegistry.address, parseEther("100")], { account: maintainer2.account });
    });

    describe("searchByTag", function () {
        it("Should return repositories matching the tag (case-sensitive)", async function () {
            await repositoryRegistry.write.submitRepository(
                ["Repo1", "Description 1", "https://github.com/repo1", ["web3", "defi"]],
                { account: maintainer1.account }
            );

            await repositoryRegistry.write.submitRepository(
                ["Repo2", "Description 2", "https://github.com/repo2", ["Web3", "nft"]],
                { account: maintainer2.account }
            );

            const matchingReposCaseSensitive = await repositoryRegistry.read.searchByTag(["web3"]);
            expect(matchingReposCaseSensitive.length).to.equal(1);
            expect(matchingReposCaseSensitive[0]).to.equal(1n); // viem returns BigInt

            const matchingReposOtherCase = await repositoryRegistry.read.searchByTag(["Web3"]);
            expect(matchingReposOtherCase.length).to.equal(1);
            expect(matchingReposOtherCase[0]).to.equal(2n); // viem returns BigInt

            const noMatchingRepos = await repositoryRegistry.read.searchByTag(["nonexistent"]);
            expect(noMatchingRepos.length).to.equal(0);
        });
    });
});