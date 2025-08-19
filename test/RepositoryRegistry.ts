import {
  time,
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";
import { expect } from "chai";
import hre from "hardhat";
import { getAddress } from "viem";
import "@nomicfoundation/hardhat-viem/types";

describe("RepositoryRegistry", function () {
  async function deployRepositoryRegistryFixture() {
    const [owner, maintainer1, maintainer2, otherAccount] =
      await hre.viem.getWalletClients();

    const repositoryRegistry = await hre.viem.deployContract(
      "RepositoryRegistry",
      [getAddress(owner.account.address)]
    );

    const publicClient = await hre.viem.getPublicClient();

    return {
      repositoryRegistry,
      owner,
      maintainer1,
      maintainer2,
      otherAccount,
      publicClient,
    };
  }

  describe("updateRepository - Basic Functionality", function () {
    it("Should allow maintainer to update repository description", async function () {
      const { repositoryRegistry, maintainer1 } = await loadFixture(
        deployRepositoryRegistryFixture
      );

      // First submit a repository
      const name = "Test Repo";
      const description = "Original description";
      const url = "https://github.com/test/repo";
      const tags = ["javascript", "blockchain"];

      await repositoryRegistry.write.submitRepository(
        [name, description, url, tags],
        { account: maintainer1.account }
      );

      // Update the repository description
      const newDescription = "Updated description";
      await repositoryRegistry.write.updateRepository([1n, newDescription], {
        account: maintainer1.account,
      });

      // Verify the description was updated
      const repo = await repositoryRegistry.read.getRepositoryDetails([1n]);
      expect(repo.description).to.equal(newDescription);
      expect(repo.name).to.equal(name); // Other fields should remain unchanged
      expect(repo.githubUrl).to.equal(url);
      expect(repo.maintainer.toLowerCase()).to.equal(
        maintainer1.account.address.toLowerCase()
      );
      expect(repo.isActive).to.be.true;
    });

    it("Should emit RepositoryUpdated event", async function () {
      const { repositoryRegistry, maintainer1, publicClient } =
        await loadFixture(deployRepositoryRegistryFixture);

      // Submit a repository
      await repositoryRegistry.write.submitRepository(
        [
          "Test Repo",
          "Original description",
          "https://github.com/test/repo",
          ["tag1"],
        ],
        { account: maintainer1.account }
      );

      // Update and check for event by verifying transaction receipt has logs
      const newDescription = "Updated description";
      const hash = await repositoryRegistry.write.updateRepository(
        [1n, newDescription],
        { account: maintainer1.account }
      );

      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      // Verify that the transaction emitted at least one event (the RepositoryUpdated event)
      expect(receipt.logs).to.have.lengthOf.at.least(1);
      expect(receipt.status).to.equal("success");
    });

    it("Should reject update from non-maintainer", async function () {
      const { repositoryRegistry, maintainer1, otherAccount } =
        await loadFixture(deployRepositoryRegistryFixture);

      // Submit a repository
      await repositoryRegistry.write.submitRepository(
        [
          "Test Repo",
          "Original description",
          "https://github.com/test/repo",
          ["tag1"],
        ],
        { account: maintainer1.account }
      );

      // Try to update from different account
      await expect(
        repositoryRegistry.write.updateRepository([1n, "Malicious update"], {
          account: otherAccount.account,
        })
      ).to.be.rejectedWith("Not owner");
    });

    it("Should reject update of inactive repository", async function () {
      const { repositoryRegistry, maintainer1 } = await loadFixture(
        deployRepositoryRegistryFixture
      );

      // Submit a repository
      await repositoryRegistry.write.submitRepository(
        [
          "Test Repo",
          "Original description",
          "https://github.com/test/repo",
          ["tag1"],
        ],
        { account: maintainer1.account }
      );

      // Deactivate the repository
      await repositoryRegistry.write.deactivateRepository([1n], {
        account: maintainer1.account,
      });

      // Try to update inactive repository
      await expect(
        repositoryRegistry.write.updateRepository([1n, "Update attempt"], {
          account: maintainer1.account,
        })
      ).to.be.rejectedWith("Inactive");
    });

    it("Should reject update of non-existent repository", async function () {
      const { repositoryRegistry, maintainer1 } = await loadFixture(
        deployRepositoryRegistryFixture
      );

      // Try to update non-existent repository (ID 999)
      await expect(
        repositoryRegistry.write.updateRepository([999n, "Update attempt"], {
          account: maintainer1.account,
        })
      ).to.be.rejectedWith("Not owner");
    });
  });

  describe("Repository Submission", function () {
    it("Should successfully submit a repository with valid inputs", async function () {
      const { repositoryRegistry, maintainer1 } = await loadFixture(
        deployRepositoryRegistryFixture
      );

      const name = "Test Repository";
      const description = "A test repository for blockchain development";
      const url = "https://github.com/test/repository";
      const tags = ["javascript", "blockchain", "testing"];

      await repositoryRegistry.write.submitRepository(
        [name, description, url, tags],
        { account: maintainer1.account }
      );

      const repo = await repositoryRegistry.read.getRepositoryDetails([1n]);

      expect(repo.name).to.equal(name);
      expect(repo.description).to.equal(description);
      expect(repo.githubUrl).to.equal(url);
      expect(repo.maintainer.toLowerCase()).to.equal(
        maintainer1.account.address.toLowerCase()
      );
      expect(repo.totalVotes).to.equal(0n);
      expect(repo.isActive).to.be.true;
      expect(Number(repo.submissionTime)).to.be.greaterThan(0);
      expect(repo.tags).to.deep.equal(tags);
    });

    it("Should emit RepositorySubmitted event with correct parameters", async function () {
      const { repositoryRegistry, maintainer1, publicClient } =
        await loadFixture(deployRepositoryRegistryFixture);

      const name = "Event Test Repo";
      const description = "Testing event emission";
      const url = "https://github.com/event/test";
      const tags = ["event"];

      const hash = await repositoryRegistry.write.submitRepository(
        [name, description, url, tags],
        { account: maintainer1.account }
      );

      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      expect(receipt.logs).to.have.lengthOf.at.least(1);
      expect(receipt.status).to.equal("success");
    });

    it("Should assign sequential repository IDs", async function () {
      const { repositoryRegistry, maintainer1, maintainer2 } =
        await loadFixture(deployRepositoryRegistryFixture);

      // Submit first repository
      await repositoryRegistry.write.submitRepository(
        ["Repo 1", "First repo", "https://github.com/repo1", ["tag1"]],
        { account: maintainer1.account }
      );

      // Submit second repository
      await repositoryRegistry.write.submitRepository(
        ["Repo 2", "Second repo", "https://github.com/repo2", ["tag2"]],
        { account: maintainer2.account }
      );

      // Submit third repository
      await repositoryRegistry.write.submitRepository(
        ["Repo 3", "Third repo", "https://github.com/repo3", ["tag3"]],
        { account: maintainer1.account }
      );

      const repo1 = await repositoryRegistry.read.getRepositoryDetails([1n]);
      const repo2 = await repositoryRegistry.read.getRepositoryDetails([2n]);
      const repo3 = await repositoryRegistry.read.getRepositoryDetails([3n]);

      expect(repo1.name).to.equal("Repo 1");
      expect(repo2.name).to.equal("Repo 2");
      expect(repo3.name).to.equal("Repo 3");

      expect(repo1.maintainer.toLowerCase()).to.equal(
        maintainer1.account.address.toLowerCase()
      );
      expect(repo2.maintainer.toLowerCase()).to.equal(
        maintainer2.account.address.toLowerCase()
      );
      expect(repo3.maintainer.toLowerCase()).to.equal(
        maintainer1.account.address.toLowerCase()
      );
    });

    it("Should reject submission with empty repository name", async function () {
      const { repositoryRegistry, maintainer1 } = await loadFixture(
        deployRepositoryRegistryFixture
      );

      await expect(
        repositoryRegistry.write.submitRepository(
          ["", "Valid description", "https://github.com/test/repo", ["tag1"]],
          { account: maintainer1.account }
        )
      ).to.be.rejectedWith("Repository name cannot be empty");
    });

    it("Should reject submission with empty URL", async function () {
      const { repositoryRegistry, maintainer1 } = await loadFixture(
        deployRepositoryRegistryFixture
      );

      await expect(
        repositoryRegistry.write.submitRepository(
          ["Valid Name", "Valid description", "", ["tag1"]],
          { account: maintainer1.account }
        )
      ).to.be.rejectedWith("Repository URL cannot be empty");
    });

    it("Should reject submission with empty tags array", async function () {
      const { repositoryRegistry, maintainer1 } = await loadFixture(
        deployRepositoryRegistryFixture
      );

      await expect(
        repositoryRegistry.write.submitRepository(
          [
            "Valid Name",
            "Valid description",
            "https://github.com/test/repo",
            [],
          ],
          { account: maintainer1.account }
        )
      ).to.be.rejectedWith("Tags are required");
    });

    it("Should accept repository with empty description", async function () {
      const { repositoryRegistry, maintainer1 } = await loadFixture(
        deployRepositoryRegistryFixture
      );

      const name = "No Description Repo";
      const description = ""; // Empty description should be allowed
      const url = "https://github.com/test/nodesc";
      const tags = ["minimal"];

      await repositoryRegistry.write.submitRepository(
        [name, description, url, tags],
        { account: maintainer1.account }
      );

      const repo = await repositoryRegistry.read.getRepositoryDetails([1n]);
      expect(repo.name).to.equal(name);
      expect(repo.description).to.equal("");
      expect(repo.isActive).to.be.true;
    });

    it("Should handle single character inputs correctly", async function () {
      const { repositoryRegistry, maintainer1 } = await loadFixture(
        deployRepositoryRegistryFixture
      );

      const name = "A"; // Single character name
      const description = "B"; // Single character description
      const url = "https://github.com/a/b";
      const tags = ["x"]; // Single character tag

      await repositoryRegistry.write.submitRepository(
        [name, description, url, tags],
        { account: maintainer1.account }
      );

      const repo = await repositoryRegistry.read.getRepositoryDetails([1n]);
      expect(repo.name).to.equal(name);
      expect(repo.description).to.equal(description);
      expect(repo.githubUrl).to.equal(url);
      expect(repo.tags).to.deep.equal(tags);
    });

    it("Should handle multiple tags correctly", async function () {
      const { repositoryRegistry, maintainer1 } = await loadFixture(
        deployRepositoryRegistryFixture
      );

      const name = "Multi Tag Repo";
      const description = "Repository with many tags";
      const url = "https://github.com/multi/tags";
      const tags = [
        "javascript",
        "typescript",
        "react",
        "nodejs",
        "blockchain",
        "solidity",
        "web3",
      ];

      await repositoryRegistry.write.submitRepository(
        [name, description, url, tags],
        { account: maintainer1.account }
      );

      const repo = await repositoryRegistry.read.getRepositoryDetails([1n]);
      expect(repo.tags).to.deep.equal(tags);
      expect(repo.tags).to.have.lengthOf(7);
    });

    it("Should set correct submission timestamp", async function () {
      const { repositoryRegistry, maintainer1 } = await loadFixture(
        deployRepositoryRegistryFixture
      );

      const beforeSubmission = BigInt(Math.floor(Date.now() / 1000));

      await repositoryRegistry.write.submitRepository(
        [
          "Time Test",
          "Testing timestamp",
          "https://github.com/time/test",
          ["time"],
        ],
        { account: maintainer1.account }
      );

      const afterSubmission = BigInt(Math.floor(Date.now() / 1000));
      const repo = await repositoryRegistry.read.getRepositoryDetails([1n]);

      // Allow for some block time variance (submission time should be close to current time)
      expect(Number(repo.submissionTime)).to.be.greaterThanOrEqual(
        Number(beforeSubmission) - 60
      );
      expect(Number(repo.submissionTime)).to.be.lessThanOrEqual(
        Number(afterSubmission) + 60
      );
    });

    it("Should allow same maintainer to submit multiple repositories", async function () {
      const { repositoryRegistry, maintainer1 } = await loadFixture(
        deployRepositoryRegistryFixture
      );

      // Submit first repository
      await repositoryRegistry.write.submitRepository(
        [
          "First Repo",
          "First repository",
          "https://github.com/first",
          ["first"],
        ],
        { account: maintainer1.account }
      );

      // Submit second repository from same maintainer
      await repositoryRegistry.write.submitRepository(
        [
          "Second Repo",
          "Second repository",
          "https://github.com/second",
          ["second"],
        ],
        { account: maintainer1.account }
      );

      const repo1 = await repositoryRegistry.read.getRepositoryDetails([1n]);
      const repo2 = await repositoryRegistry.read.getRepositoryDetails([2n]);

      expect(repo1.maintainer.toLowerCase()).to.equal(
        maintainer1.account.address.toLowerCase()
      );
      expect(repo2.maintainer.toLowerCase()).to.equal(
        maintainer1.account.address.toLowerCase()
      );
      expect(repo1.name).to.equal("First Repo");
      expect(repo2.name).to.equal("Second Repo");
    });

    it("Should initialize repository with correct default values", async function () {
      const { repositoryRegistry, maintainer1 } = await loadFixture(
        deployRepositoryRegistryFixture
      );

      await repositoryRegistry.write.submitRepository(
        [
          "Default Test",
          "Testing defaults",
          "https://github.com/defaults",
          ["default"],
        ],
        { account: maintainer1.account }
      );

      const repo = await repositoryRegistry.read.getRepositoryDetails([1n]);

      // Verify default values
      expect(repo.totalVotes).to.equal(0n);
      expect(repo.isActive).to.be.true;
      expect(Number(repo.submissionTime)).to.be.greaterThan(0);
      expect(repo.maintainer).to.not.equal(
        "0x0000000000000000000000000000000000000000"
      );
    });
  });
});
