import { expect } from "chai";
import hre from "hardhat";
import { parseEther, getAddress, encodeEventTopics, toHex } from "viem";


describe("RepositoryRegistry", function () {
    let repositoryRegistry: any; // viem contract instance
    let mockDEVToken: any; // viem contract instance
    let owner: any; // viem WalletClient
    let maintainer1: any; // viem WalletClient
    let maintainer2: any; // viem WalletClient
    let maintainer3: any; // viem WalletClient
    let publicClient: any; // viem PublicClient
    let feeWalletClient: any; // viem WalletClient

    const SUBMISSION_FEE = parseEther("10");
    const INITIAL_MINT_AMOUNT = parseEther("100");
    const MAX_DESCRIPTION_LENGTH = 1000;

    beforeEach(async function () {
        const [ownerWalletClient, maintainer1WalletClient, maintainer2WalletClient, maintainer3WalletClient, tempFeeWalletClient] = await hre.viem.getWalletClients();
        publicClient = await hre.viem.getPublicClient();
        owner = ownerWalletClient;
        maintainer1 = maintainer1WalletClient;
        maintainer2 = maintainer2WalletClient;
        maintainer3 = maintainer3WalletClient;
        feeWalletClient = tempFeeWalletClient;


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
            feeWalletClient.account.address, // Use a dedicated fee wallet
            SUBMISSION_FEE
        ]);

        // Mint tokens for maintainers and approve the registry
        await mockDEVToken.write.mintTo([maintainer1.account.address, INITIAL_MINT_AMOUNT], { account: owner.account });
        await mockDEVToken.write.approve([repositoryRegistry.address, INITIAL_MINT_AMOUNT], { account: maintainer1.account });

        await mockDEVToken.write.mintTo([maintainer2.account.address, INITIAL_MINT_AMOUNT], { account: owner.account });
        await mockDEVToken.write.approve([repositoryRegistry.address, INITIAL_MINT_AMOUNT], { account: maintainer2.account });

        await mockDEVToken.write.mintTo([maintainer3.account.address, INITIAL_MINT_AMOUNT], { account: owner.account });
        await mockDEVToken.write.approve([repositoryRegistry.address, INITIAL_MINT_AMOUNT], { account: maintainer3.account });
    });

    describe("submitRepository", function () {
        it("Should successfully submit a repository with valid inputs and transfer fee", async function () {
            const initialFeeWalletBalance = await mockDEVToken.read.balanceOf([feeWalletClient.account.address]);
            const initialMaintainerBalance = await mockDEVToken.read.balanceOf([maintainer1.account.address]);

            const txHash = await repositoryRegistry.write.submitRepository(
                ["Repo1", "Description 1", "https://github.com/repo1", ["web3", "defi"]],
                { account: maintainer1.account }
            );

            const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
            expect(receipt.status).to.equal("success");

            const finalFeeWalletBalance = await mockDEVToken.read.balanceOf([feeWalletClient.account.address]);
            const finalMaintainerBalance = await mockDEVToken.read.balanceOf([maintainer1.account.address]);

            expect(finalFeeWalletBalance - initialFeeWalletBalance).to.equal(SUBMISSION_FEE);
            expect(initialMaintainerBalance - finalMaintainerBalance).to.equal(SUBMISSION_FEE);

            const repoId = 1n; // First repository submitted
            const repo = await repositoryRegistry.read.getRepositoryDetails([repoId]);

            expect(repo.name).to.equal("Repo1");
            expect(repo.description).to.equal("Description 1");
            expect(repo.githubUrl).to.equal("https://github.com/repo1");
            expect(repo.maintainer).to.equal(getAddress(maintainer1.account.address));
            expect(repo.totalVotes).to.equal(0n);
            expect(repo.isActive).to.be.true;
            expect(repo.submissionTime > 0n).to.be.true;
            expect(repo.tags).to.deep.equal(["web3", "defi"]);

            // Event emission check
            const eventSignature = "RepositorySubmitted(uint256,address,uint256)";
            const eventTopic = encodeEventTopics({
                abi: repositoryRegistry.abi,
                eventName: "RepositorySubmitted",
                args: { id: repoId, maintainer: getAddress(maintainer1.account.address), feePaid: SUBMISSION_FEE }
            })[0];

            const log = receipt.logs.find(
                (log: any) => log.address === repositoryRegistry.address && log.topics[0] === eventTopic
            );
            expect(log).to.exist;
        });

        it("Should fail when allowance is insufficient", async function () {
            await mockDEVToken.write.approve([repositoryRegistry.address, parseEther("5")], { account: maintainer3.account }); // Only 5 tokens approved

            try {
                await repositoryRegistry.write.submitRepository(
                    ["RepoInsufficient", "Desc", "https://github.com/insufficient", ["tag"]],
                    { account: maintainer3.account }
                );
                expect.fail('expected submitRepository to revert');
            } catch (err: any) {
                expect(err.details).to.include('ERC20: insufficient allowance');
            }
        });

        it("Should reject empty name", async function () {
            await expect(
                repositoryRegistry.write.submitRepository(
                    ["", "Description", "https://github.com/emptyname", ["tag"]],
                    { account: maintainer1.account }
                )
            ).to.be.rejectedWith("Repository name cannot be empty");
        });

        it("Should reject empty URL", async function () {
            await expect(
                repositoryRegistry.write.submitRepository(
                    ["RepoEmptyURL", "Description", "", ["tag"]],
                    { account: maintainer1.account }
                )
            ).to.be.rejectedWith("Repository URL cannot be empty");
        });

        it("Should reject empty tags array", async function () {
            await expect(
                repositoryRegistry.write.submitRepository(
                    ["RepoEmptyTags", "Description", "https://github.com/emptytags", []],
                    { account: maintainer1.account }
                )
            ).to.be.rejectedWith("Tags are required");
        });

        it("Should accept empty description when contract allows it", async function () {
            const txHash = await repositoryRegistry.write.submitRepository(
                ["RepoEmptyDesc", "", "https://github.com/emptydesc", ["tag"]],
                { account: maintainer1.account }
            );
            const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
            expect(receipt.status).to.equal("success");

            const repo = await repositoryRegistry.read.getRepositoryDetails([1n]);
            expect(repo.description).to.equal("");
        });

        it("Should assign sequential IDs for multiple submissions by multiple maintainers", async function () {
            await repositoryRegistry.write.submitRepository(
                ["Repo1", "Desc1", "https://github.com/repo1", ["tag1"]],
                { account: maintainer1.account }
            );
            await repositoryRegistry.write.submitRepository(
                ["Repo2", "Desc2", "https://github.com/repo2", ["tag2"]],
                { account: maintainer2.account }
            );
            await repositoryRegistry.write.submitRepository(
                ["Repo3", "Desc3", "https://github.com/repo3", ["tag3"]],
                { account: maintainer1.account }
            );

            const repo1 = await repositoryRegistry.read.getRepositoryDetails([1n]);
            const repo2 = await repositoryRegistry.read.getRepositoryDetails([2n]);
            const repo3 = await repositoryRegistry.read.getRepositoryDetails([3n]);

            expect(repo1.name).to.equal("Repo1");
            expect(repo2.name).to.equal("Repo2");
            expect(repo3.name).to.equal("Repo3");
        });

        it("Should handle zero-fee submissions correctly", async function () {
            await repositoryRegistry.write.setSubmissionFee([0n], { account: owner.account });

            const initialFeeWalletBalance = await mockDEVToken.read.balanceOf([feeWalletClient.account.address]);
            const initialMaintainerBalance = await mockDEVToken.read.balanceOf([maintainer1.account.address]);

            const txHash = await repositoryRegistry.write.submitRepository(
                ["RepoZeroFee", "Description", "https://github.com/zerofee", ["tag"]],
                { account: maintainer1.account }
            );
            const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
            expect(receipt.status).to.equal("success");

            const finalFeeWalletBalance = await mockDEVToken.read.balanceOf([feeWalletClient.account.address]);
            const finalMaintainerBalance = await mockDEVToken.read.balanceOf([maintainer1.account.address]);

            expect(finalFeeWalletBalance).to.equal(initialFeeWalletBalance);
            expect(finalMaintainerBalance).to.equal(initialMaintainerBalance);

            // Event emission check for zero fee
            const eventSignature = "RepositorySubmitted(uint256,address,uint256)";
            const eventTopic = encodeEventTopics({
                abi: repositoryRegistry.abi,
                eventName: "RepositorySubmitted",
                args: { id: 1n, maintainer: getAddress(maintainer1.account.address), feePaid: 0n }
            })[0];

            const log = receipt.logs.find(
                (log: any) => log.address === repositoryRegistry.address && log.topics[0] === eventTopic
            );
            expect(log).to.exist;
        });

        it("Should handle multiple tags and single-character inputs", async function () {
            const txHash = await repositoryRegistry.write.submitRepository(
                ["RepoTags", "Desc", "https://github.com/tags", ["a", "b", "c", "tag123"]],
                { account: maintainer1.account }
            );
            const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
            expect(receipt.status).to.equal("success");

            const repo = await repositoryRegistry.read.getRepositoryDetails([1n]);
            expect(repo.tags).to.deep.equal(["a", "b", "c", "tag123"]);
        });

        it("Should reject duplicate repository name", async function () {
            await repositoryRegistry.write.submitRepository(
                ["DuplicateName", "Desc", "https://github.com/uniqueurl", ["tag"]],
                { account: maintainer1.account }
            );

            await expect(
                repositoryRegistry.write.submitRepository(
                    ["DuplicateName", "Another Desc", "https://github.com/anotherurl", ["tag2"]],
                    { account: maintainer2.account }
                )
            ).to.be.rejectedWith("Repository name already exists");
        });

        it("Should reject duplicate repository URL", async function () {
            await repositoryRegistry.write.submitRepository(
                ["UniqueName", "Desc", "https://github.com/duplicateurl", ["tag"]],
                { account: maintainer1.account }
            );

            await expect(
                repositoryRegistry.write.submitRepository(
                    ["AnotherUniqueName", "Another Desc", "https://github.com/duplicateurl", ["tag2"]],
                    { account: maintainer2.account }
                )
            ).to.be.rejectedWith("Repository URL already exists");
        });

        it("Should reject duplicate tags within the same submission", async function () {
            await expect(
                repositoryRegistry.write.submitRepository(
                    ["RepoDuplicateTags", "Desc", "https://github.com/duptags", ["tag1", "tag1"]],
                    { account: maintainer1.account }
                )
            ).to.be.rejectedWith("Duplicate tags are not allowed");
        });
    });

    describe("updateRepository", function () {
        let repoId: bigint;
        beforeEach(async function () {
            const txHash = await repositoryRegistry.write.submitRepository(
                ["RepoToUpdate", "Original Description", "https://github.com/toupdate", ["tag"]],
                { account: maintainer1.account }
            );
            const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
            expect(receipt.status).to.equal("success");
            repoId = 1n;
        });

        it("Should successfully update description by maintainer", async function () {
            const newDescription = "Updated Description";
            const txHash = await repositoryRegistry.write.updateRepository(
                [repoId, newDescription],
                { account: maintainer1.account }
            );
            const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
            expect(receipt.status).to.equal("success");

            const updatedRepo = await repositoryRegistry.read.getRepositoryDetails([repoId]);
            expect(updatedRepo.description).to.equal(newDescription);
            expect(updatedRepo.name).to.equal("RepoToUpdate"); // Other fields unchanged

            // Event emission check
            const eventSignature = "RepositoryUpdated(uint256,address,uint256)";
            const eventTopic = encodeEventTopics({
                abi: repositoryRegistry.abi,
                eventName: "RepositoryUpdated",
                args: { id: repoId, maintainer: getAddress(maintainer1.account.address), newDescriptionLength: BigInt(newDescription.length) }
            })[0];

            const log = receipt.logs.find(
                (log: any) => log.address === repositoryRegistry.address && log.topics[0] === eventTopic
            );
            expect(log).to.exist;
        });

        it("Should reject update by non-maintainer", async function () {
            const newDescription = "Unauthorized Update";
            await expect(
                repositoryRegistry.write.updateRepository(
                    [repoId, newDescription],
                    { account: maintainer2.account }
                )
            ).to.be.rejectedWith("Not owner");
        });

        it("Should reject update of inactive repository", async function () {
            await repositoryRegistry.write.deactivateRepository([repoId], { account: maintainer1.account });
            const newDescription = "Update Inactive";
            await expect(
                repositoryRegistry.write.updateRepository(
                    [repoId, newDescription],
                    { account: maintainer1.account }
                )
            ).to.be.rejectedWith("Inactive");
        });

        it("Should reject update of non-existent repository (ID too large)", async function () {
            const newDescription = "Update NonExistent";
            await expect(
                repositoryRegistry.write.updateRepository(
                    [999n, newDescription],
                    { account: maintainer1.account }
                )
            ).to.be.rejectedWith("Repository does not exist");
        });

        it("Should reject empty description", async function () {
            await expect(
                repositoryRegistry.write.updateRepository(
                    [repoId, ""],
                    { account: maintainer1.account }
                )
            ).to.be.rejectedWith("Description cannot be empty");
        });

        it("Should reject description exceeding max length", async function () {
            const longDescription = "a".repeat(MAX_DESCRIPTION_LENGTH + 1);
            await expect(
                repositoryRegistry.write.updateRepository(
                    [repoId, longDescription],
                    { account: maintainer1.account }
                )
            ).to.be.rejectedWith("Description too long");
        });

        it("Should handle Unicode and special-character descriptions", async function () {
            const unicodeDescription = "你好世界! 👋 This is a test with special characters: éàçüö";
            const txHash = await repositoryRegistry.write.updateRepository(
                [repoId, unicodeDescription],
                { account: maintainer1.account }
            );
            const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
            expect(receipt.status).to.equal("success");

            const updatedRepo = await repositoryRegistry.read.getRepositoryDetails([repoId]);
            expect(updatedRepo.description).to.equal(unicodeDescription);
        });

        it("Should ensure final state consistent with rapid sequential updates", async function () {
            const desc1 = "First update";
            await repositoryRegistry.write.updateRepository([repoId, desc1], { account: maintainer1.account });
            const desc2 = "Second update";
            await repositoryRegistry.write.updateRepository([repoId, desc2], { account: maintainer1.account });
            const desc3 = "Third update";
            await repositoryRegistry.write.updateRepository([repoId, desc3], { account: maintainer1.account });

            const finalRepo = await repositoryRegistry.read.getRepositoryDetails([repoId]);
            expect(finalRepo.description).to.equal(desc3);
        });
    });

    describe("deactivateRepository", function () {
        let repoId1: bigint;
        let repoId2: bigint;
        beforeEach(async function () {
            const txHash1 = await repositoryRegistry.write.submitRepository(
                ["RepoToDeactivate1", "Desc1", "https://github.com/deact1", ["tag1"]],
                { account: maintainer1.account }
            );
            const receipt1 = await publicClient.waitForTransactionReceipt({ hash: txHash1 });
            expect(receipt1.status).to.equal("success");
            repoId1 = 1n;

            const txHash2 = await repositoryRegistry.write.submitRepository(
                ["RepoToDeactivate2", "Desc2", "https://github.com/deact2", ["tag2"]],
                { account: maintainer2.account }
            );
            const receipt2 = await publicClient.waitForTransactionReceipt({ hash: txHash2 });
            expect(receipt2.status).to.equal("success");
            repoId2 = 2n;
        });

        it("Should allow maintainer to deactivate their own repository", async function () {
            const initialRepo = await repositoryRegistry.read.getRepositoryDetails([repoId1]);
            expect(initialRepo.isActive).to.be.true;

            const txHash = await repositoryRegistry.write.deactivateRepository([repoId1], { account: maintainer1.account });
            const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
            expect(receipt.status).to.equal("success");

            const deactivatedRepo = await repositoryRegistry.read.getRepositoryDetails([repoId1]);
            expect(deactivatedRepo.isActive).to.be.false;
            expect(deactivatedRepo.name).to.equal(initialRepo.name); // Other fields preserved

            // Event emission check
            const eventSignature = "RepositoryDeactivated(uint256)";
            const eventTopic = encodeEventTopics({
                abi: repositoryRegistry.abi,
                eventName: "RepositoryDeactivated",
                args: { id: repoId1 }
            })[0];

            const log = receipt.logs.find(
                (log: any) => log.address === repositoryRegistry.address && log.topics[0] === eventTopic
            );
            expect(log).to.exist;
        });

        it("Should allow contract owner to deactivate any repository", async function () {
            const initialRepo = await repositoryRegistry.read.getRepositoryDetails([repoId2]);
            expect(initialRepo.isActive).to.be.true;

            const txHash = await repositoryRegistry.write.deactivateRepository([repoId2], { account: owner.account });
            const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
            expect(receipt.status).to.equal("success");

            const deactivatedRepo = await repositoryRegistry.read.getRepositoryDetails([repoId2]);
            expect(deactivatedRepo.isActive).to.be.false;
        });

        it("Should reject deactivation by unauthorized user", async function () {
            await expect(
                repositoryRegistry.write.deactivateRepository([repoId1], { account: maintainer2.account })
            ).to.be.rejectedWith("No rights");
        });

        it("Should reject deactivation of non-existent repository", async function () {
            await expect(
                repositoryRegistry.write.deactivateRepository([999n], { account: maintainer1.account })
            ).to.be.rejectedWith("Repository does not exist");
        });

        it("Should reject deactivation of already inactive repository", async function () {
            await repositoryRegistry.write.deactivateRepository([repoId1], { account: maintainer1.account });
            await expect(
                repositoryRegistry.write.deactivateRepository([repoId1], { account: maintainer1.account })
            ).to.be.rejectedWith("Repository already inactive");
        });

        it("Should handle concurrent deactivation attempts (one succeeds)", async function () {
            // Both maintainer1 and owner try to deactivate repoId1
            const tx1 = repositoryRegistry.write.deactivateRepository([repoId1], { account: maintainer1.account });
            const tx2 = repositoryRegistry.write.deactivateRepository([repoId1], { account: owner.account });

            // One should succeed, the other should revert
            let successCount = 0;
            let revertCount = 0;

            try {
                await publicClient.waitForTransactionReceipt({ hash: await tx1 });
                successCount++;
            } catch (error) {
                revertCount++;
            }

            try {
                await publicClient.waitForTransactionReceipt({ hash: await tx2 });
                successCount++;
            } catch (error) {
                revertCount++;
            }

            expect(successCount).to.equal(1);
            expect(revertCount).to.equal(1);

            const finalRepo = await repositoryRegistry.read.getRepositoryDetails([repoId1]);
            expect(finalRepo.isActive).to.be.false;
        });
    });

    describe("getRepositoryDetails / getActiveRepositories / pagination / searchByTag", function () {
        beforeEach(async function () {
            await repositoryRegistry.write.submitRepository(
                ["RepoA", "DescA", "https://github.com/repoa", ["tag1", "web3"]],
                { account: maintainer1.account }
            ); // ID 1
            await repositoryRegistry.write.submitRepository(
                ["RepoB", "DescB", "https://github.com/repob", ["tag2", "defi"]],
                { account: maintainer2.account }
            ); // ID 2
            await repositoryRegistry.write.submitRepository(
                ["RepoC", "DescC", "https://github.com/repoc", ["tag1", "nft"]],
                { account: maintainer3.account }
            ); // ID 3
            await repositoryRegistry.write.submitRepository(
                ["RepoD", "DescD", "https://github.com/repod", ["tag3", "web3"]],
                { account: maintainer1.account }
            ); // ID 4
            await repositoryRegistry.write.deactivateRepository([2n], { account: maintainer2.account }); // Deactivate RepoB
        });

        it("getRepositoryDetails returns correct fields and BigInt types", async function () {
            const repo1 = await repositoryRegistry.read.getRepositoryDetails([1n]);
            expect(repo1.name).to.equal("RepoA");
            expect(repo1.description).to.equal("DescA");
            expect(repo1.githubUrl).to.equal("https://github.com/repoa");
            expect(repo1.maintainer).to.equal(getAddress(maintainer1.account.address));
            expect(repo1.totalVotes).to.equal(0n);
            expect(repo1.isActive).to.be.true;
            expect(repo1.submissionTime).to.be.a('bigint');
            expect(repo1.tags).to.deep.equal(["tag1", "web3"]);

            const repo2 = await repositoryRegistry.read.getRepositoryDetails([2n]);
            expect(repo2.isActive).to.be.false; // Deactivated
        });

        it("getActiveRepositories: validate pagination and active filtering", async function () {
            const allActive = await repositoryRegistry.read.getActiveRepositories([0n, 10n]);
            expect(allActive.length).to.equal(3); // RepoA, RepoC, RepoD
            expect(allActive.map((repo: any) => repo.name)).to.deep.equal(["RepoA", "RepoC", "RepoD"]);

            const firstTwo = await repositoryRegistry.read.getActiveRepositories([0n, 2n]);
            expect(firstTwo.length).to.equal(2);
            expect(firstTwo.map((repo: any) => repo.name)).to.deep.equal(["RepoA", "RepoC"]);

            const lastOne = await repositoryRegistry.read.getActiveRepositories([2n, 1n]);
            expect(lastOne.length).to.equal(1);
            expect(lastOne.map((repo: any) => repo.name)).to.deep.equal(["RepoD"]);

            const emptyPage = await repositoryRegistry.read.getActiveRepositories([10n, 5n]);
            expect(emptyPage.length).to.equal(0);
        });

        it("searchByTag: case sensitivity and empty results", async function () {
            const web3Repos = await repositoryRegistry.read.searchByTag(["web3"]);
            expect(web3Repos.length).to.equal(2);
            expect(web3Repos).to.deep.equal([1n, 4n]); // RepoA, RepoD

            const Web3Repos = await repositoryRegistry.read.searchByTag(["Web3"]); // Case-sensitive
            expect(Web3Repos.length).to.equal(0);

            const tag1Repos = await repositoryRegistry.read.searchByTag(["tag1"]);
            expect(tag1Repos.length).to.equal(2);
            expect(tag1Repos).to.deep.equal([1n, 3n]); // RepoA, RepoC

            const nonexistentTag = await repositoryRegistry.read.searchByTag(["nonexistent"]);
            expect(nonexistentTag.length).to.equal(0);

            // Search for a tag in a deactivated repository
            const defiRepos = await repositoryRegistry.read.searchByTag(["defi"]);
            expect(defiRepos.length).to.equal(0); // RepoB is deactivated
        });
    });

    describe("getRepositoriesByIds", function () {
        it("Should return correct details for valid IDs", async function () {
            await repositoryRegistry.write.submitRepository(
                ["Repo1", "Desc1", "https://github.com/repo1", ["tag1"]],
                { account: maintainer1.account }
            );
            await repositoryRegistry.write.submitRepository(
                ["Repo2", "Desc2", "https://github.com/repo2", ["tag2"]],
                { account: maintainer2.account }
            );

            const repos = await repositoryRegistry.read.getRepositoriesByIds([[1n, 2n]]);
            expect(repos.length).to.equal(2);

            expect(repos[0].id).to.equal(1n);
            expect(repos[0].name).to.equal("Repo1");
            expect(repos[0].maintainer).to.equal(getAddress(maintainer1.account.address));

            expect(repos[1].id).to.equal(2n);
            expect(repos[1].name).to.equal("Repo2");
            expect(repos[1].maintainer).to.equal(getAddress(maintainer2.account.address));
        });

        it("Should return zero-address maintainer for non-existent IDs", async function () {
            await repositoryRegistry.write.submitRepository(
                ["Repo1", "Desc1", "https://github.com/repo1", ["tag1"]],
                { account: maintainer1.account }
            );

            const repos = await repositoryRegistry.read.getRepositoriesByIds([[99n, 100n]]);
            expect(repos.length).to.equal(2);

            expect(repos[0].id).to.equal(99n);
            expect(repos[0].maintainer).to.equal(getAddress("0x0000000000000000000000000000000000000000"));
            expect(repos[0].name).to.equal(""); // Default empty string

            expect(repos[1].id).to.equal(100n);
            expect(repos[1].maintainer).to.equal(getAddress("0x0000000000000000000000000000000000000000"));
            expect(repos[1].name).to.equal("");
        });

        it("Should handle mixed valid and invalid IDs, preserving order", async function () {
            await repositoryRegistry.write.submitRepository(
                ["Repo1", "Desc1", "https://github.com/repo1", ["tag1"]],
                { account: maintainer1.account }
            );
            await repositoryRegistry.write.submitRepository(
                ["Repo2", "Desc2", "https://github.com/repo2", ["tag2"]],
                { account: maintainer2.account }
            );

            const repos = await repositoryRegistry.read.getRepositoriesByIds([[1n, 99n, 2n]]);
            expect(repos.length).to.equal(3);

            expect(repos[0].id).to.equal(1n);
            expect(repos[0].name).to.equal("Repo1");
            expect(repos[0].maintainer).to.equal(getAddress(maintainer1.account.address));

            expect(repos[1].id).to.equal(99n);
            expect(repos[1].maintainer).to.equal(getAddress("0x0000000000000000000000000000000000000000"));

            expect(repos[2].id).to.equal(2n);
            expect(repos[2].name).to.equal("Repo2");
            expect(repos[2].maintainer).to.equal(getAddress(maintainer2.account.address));
        });

        it("Should return an empty array for empty input", async function () {
            const repos = await repositoryRegistry.read.getRepositoriesByIds([[]]);
            expect(repos.length).to.equal(0);
            expect(repos).to.deep.equal([]);
        });

        // Optional: Test with a large array input if contract has limits or specific behavior
        it("Should handle a large array of valid IDs", async function () {
            const numRepos = 50;
            // Mint additional tokens for maintainer1 to cover all submissions
            await mockDEVToken.write.mintTo([maintainer1.account.address, parseEther("500")], { account: owner.account });
            // Increase allowance for maintainer1 to cover all submissions
            await mockDEVToken.write.approve([repositoryRegistry.address, parseEther("1000000")], { account: maintainer1.account });
            const repoIds: bigint[] = [];
            for (let i = 0; i < numRepos; i++) {
                await repositoryRegistry.write.submitRepository(
                    [`Repo${i}`, `Desc${i}`, `https://github.com/repo${i}`, [`tag${i}`]],
                    { account: maintainer1.account }
                );
                repoIds.push(BigInt(i + 1));
            }

            const repos = await repositoryRegistry.read.getRepositoriesByIds([repoIds]);
            expect(repos.length).to.equal(numRepos);
            for (let i = 0; i < numRepos; i++) {
                expect(repos[i].id).to.equal(BigInt(i + 1));
                expect(repos[i].name).to.equal(`Repo${i}`);
                expect(repos[i].maintainer).to.equal(getAddress(maintainer1.account.address));
            }
        });
    });

    describe("Fee management", function () {
        it("setSubmissionFee: only owner can call and validates fee updates", async function () {
            const oldFee = await repositoryRegistry.read.submissionFee();
            const newFee = parseEther("20");

            // Non-owner cannot set fee
            await expect(
                repositoryRegistry.write.setSubmissionFee([newFee], { account: maintainer1.account })
            ).to.be.rejectedWith("OwnableUnauthorizedAccount");

            // Owner sets new fee
            const txHash = await repositoryRegistry.write.setSubmissionFee([newFee], { account: owner.account });
            const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
            expect(receipt.status).to.equal("success");

            const updatedFee = await repositoryRegistry.read.submissionFee();
            expect(updatedFee).to.equal(newFee);

            // Event emission check
            const eventSignature = "SubmissionFeeUpdated(uint256,uint256)";
            const eventTopic = encodeEventTopics({
                abi: repositoryRegistry.abi,
                eventName: "SubmissionFeeUpdated",
                args: { oldFee: oldFee, newFee: newFee }
            })[0];

            const log = receipt.logs.find(
                (log: any) => log.address === repositoryRegistry.address && log.topics[0] === eventTopic
            );
            expect(log).to.exist;

            // Subsequent submission respects new fee
            const initialFeeWalletBalance = await mockDEVToken.read.balanceOf([feeWalletClient.account.address]);
            const initialMaintainerBalance = await mockDEVToken.read.balanceOf([maintainer1.account.address]);

            await repositoryRegistry.write.submitRepository(
                ["RepoNewFee", "Desc", "https://github.com/newfee", ["tag"]],
                { account: maintainer1.account }
            );

            const finalFeeWalletBalance = await mockDEVToken.read.balanceOf([feeWalletClient.account.address]);
            const finalMaintainerBalance = await mockDEVToken.read.balanceOf([maintainer1.account.address]);

            expect(finalFeeWalletBalance - initialFeeWalletBalance).to.equal(newFee);
            expect(initialMaintainerBalance - finalMaintainerBalance).to.equal(newFee);
        });

        it("setFeeWallet: only owner can call and validates wallet updates", async function () {
            const oldWallet = await repositoryRegistry.read.feeWallet();
            const newWallet = maintainer3.account.address;

            // Non-owner cannot set fee wallet
            await expect(
                repositoryRegistry.write.setFeeWallet([newWallet], { account: maintainer1.account })
            ).to.be.rejectedWith("OwnableUnauthorizedAccount");

            // Owner sets new fee wallet
            const txHash = await repositoryRegistry.write.setFeeWallet([newWallet], { account: owner.account });
            const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
            expect(receipt.status).to.equal("success");

            const updatedWallet = await repositoryRegistry.read.feeWallet();
            expect(updatedWallet).to.equal(getAddress(newWallet));

            // Event emission check
            const eventSignature = "FeeWalletUpdated(address,address)";
            const eventTopic = encodeEventTopics({
                abi: repositoryRegistry.abi,
                eventName: "FeeWalletUpdated",
                args: { oldWallet: oldWallet, newWallet: getAddress(newWallet) }
            })[0];

            const log = receipt.logs.find(
                (log: any) => log.address === repositoryRegistry.address && log.topics[0] === eventTopic
            );
            expect(log).to.exist;

            // Subsequent submission transfers to new fee wallet
            const initialNewFeeWalletBalance = await mockDEVToken.read.balanceOf([newWallet]);
            const initialMaintainerBalance = await mockDEVToken.read.balanceOf([maintainer1.account.address]);

            await repositoryRegistry.write.submitRepository(
                ["RepoNewWallet", "Desc", "https://github.com/newwallet", ["tag"]],
                { account: maintainer1.account }
            );

            const finalNewFeeWalletBalance = await mockDEVToken.read.balanceOf([newWallet]);
            const finalMaintainerBalance = await mockDEVToken.read.balanceOf([maintainer1.account.address]);

            expect(finalNewFeeWalletBalance - initialNewFeeWalletBalance).to.equal(SUBMISSION_FEE);
            expect(initialMaintainerBalance - finalMaintainerBalance).to.equal(SUBMISSION_FEE);
        });

        it("Should reject setting fee wallet to zero address", async function () {
            await expect(
                repositoryRegistry.write.setFeeWallet([getAddress("0x0000000000000000000000000000000000000000")], { account: owner.account })
            ).to.be.rejectedWith("Fee wallet cannot be zero");
        });
    });

    describe("Repository Counter and Indexing", function () {
        it("getRepoCounter should return the correct count", async function () {
            expect(await repositoryRegistry.read.getRepoCounter()).to.equal(0n);

            await repositoryRegistry.write.submitRepository(
                ["Repo1", "Desc1", "https://github.com/repo1", ["tag1"]],
                { account: maintainer1.account }
            );
            expect(await repositoryRegistry.read.getRepoCounter()).to.equal(1n);

            await repositoryRegistry.write.submitRepository(
                ["Repo2", "Desc2", "https://github.com/repo2", ["tag2"]],
                { account: maintainer2.account }
            );
            expect(await repositoryRegistry.read.getRepoCounter()).to.equal(2n);

            await repositoryRegistry.write.deactivateRepository([1n], { account: maintainer1.account });
            expect(await repositoryRegistry.read.getRepoCounter()).to.equal(2n); // Deactivation does not change counter
        });

        it("getRepositoryIdAtIndex should return correct ID for valid index", async function () {
            await repositoryRegistry.write.submitRepository(
                ["Repo1", "Desc1", "https://github.com/repo1", ["tag1"]],
                { account: maintainer1.account }
            );
            await repositoryRegistry.write.submitRepository(
                ["Repo2", "Desc2", "https://github.com/repo2", ["tag2"]],
                { account: maintainer2.account }
            );

            expect(await repositoryRegistry.read.getRepositoryIdAtIndex([0n])).to.equal(1n);
            expect(await repositoryRegistry.read.getRepositoryIdAtIndex([1n])).to.equal(2n);
        });

        it("getRepositoryIdAtIndex should revert for out-of-bounds index", async function () {
            await repositoryRegistry.write.submitRepository(
                ["Repo1", "Desc1", "https://github.com/repo1", ["tag1"]],
                { account: maintainer1.account }
            );

            await expect(repositoryRegistry.read.getRepositoryIdAtIndex([1n]))
                .to.be.rejectedWith("Index out of bounds");
            await expect(repositoryRegistry.read.getRepositoryIdAtIndex([999n]))
                .to.be.rejectedWith("Index out of bounds");
        });

        it("getRepositoryIdAtIndex should revert for deactivated repository", async function () {
            await repositoryRegistry.write.submitRepository(
                ["Repo1", "Desc1", "https://github.com/repo1", ["tag1"]],
                { account: maintainer1.account }
            );
            await repositoryRegistry.write.submitRepository(
                ["Repo2", "Desc2", "https://github.com/repo2", ["tag2"]],
                { account: maintainer2.account }
            );

            await repositoryRegistry.write.deactivateRepository([1n], { account: maintainer1.account });

            await expect(repositoryRegistry.read.getRepositoryIdAtIndex([0n]))
                .to.be.rejectedWith("Repository does not exist");
            expect(await repositoryRegistry.read.getRepositoryIdAtIndex([1n])).to.equal(2n);
        });
    });
});
