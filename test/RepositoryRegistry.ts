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

  describe("updateRepository - Data Integrity", function () {
    it("Should allow updating to empty description", async function () {
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

      // Update to empty description
      const emptyDescription = "";
      await repositoryRegistry.write.updateRepository([1n, emptyDescription], {
        account: maintainer1.account,
      });

      // Verify the description was updated to empty
      const repo = await repositoryRegistry.read.getRepositoryDetails([1n]);
      expect(repo.description).to.equal(emptyDescription);
      expect(repo.name).to.equal(name); // Other fields should remain unchanged
      expect(repo.githubUrl).to.equal(url);
      expect(repo.maintainer.toLowerCase()).to.equal(
        maintainer1.account.address.toLowerCase()
      );
      expect(repo.isActive).to.be.true;
    });

    it("Should allow updating to very long description", async function () {
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

      // Create a very long description (1000+ characters)
      const longDescription =
        "A".repeat(1000) +
        " This is a very long description that tests the contract's ability to handle large amounts of text data. ".repeat(
          10
        );

      await repositoryRegistry.write.updateRepository([1n, longDescription], {
        account: maintainer1.account,
      });

      // Verify the long description was updated correctly
      const repo = await repositoryRegistry.read.getRepositoryDetails([1n]);
      expect(repo.description).to.equal(longDescription);
      expect(repo.name).to.equal(name); // Other fields should remain unchanged
      expect(repo.githubUrl).to.equal(url);
      expect(repo.maintainer.toLowerCase()).to.equal(
        maintainer1.account.address.toLowerCase()
      );
      expect(repo.isActive).to.be.true;
    });
  });
});
