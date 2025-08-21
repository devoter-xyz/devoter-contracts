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

  describe("updateRepository - Advanced Edge Cases", function () {
    describe("Special Characters in Description", function () {
      it("Should handle Unicode characters in description", async function () {
        const { repositoryRegistry, maintainer1 } = await loadFixture(
          deployRepositoryRegistryFixture
        );

        // Submit a repository
        await repositoryRegistry.write.submitRepository(
          [
            "Unicode Test Repo",
            "Original description",
            "https://github.com/test/unicode",
            ["unicode"],
          ],
          { account: maintainer1.account }
        );

        // Update with Unicode characters (emojis, accented characters, symbols)
        const unicodeDescription =
          "Updated with Unicode: 🚀 Café résumé 中文 العربية ñoño @#$%^&*()";
        await repositoryRegistry.write.updateRepository(
          [1n, unicodeDescription],
          {
            account: maintainer1.account,
          }
        );

        const repo = await repositoryRegistry.read.getRepositoryDetails([1n]);
        expect(repo.description).to.equal(unicodeDescription);
        expect(repo.isActive).to.be.true;
      });

      it("Should handle special JSON/HTML characters in description", async function () {
        const { repositoryRegistry, maintainer1 } = await loadFixture(
          deployRepositoryRegistryFixture
        );

        // Submit a repository
        await repositoryRegistry.write.submitRepository(
          [
            "Special Chars Repo",
            "Original description",
            "https://github.com/test/special",
            ["special"],
          ],
          { account: maintainer1.account }
        );

        // Update with special characters that could break JSON/HTML
        const specialDescription =
          "Description with \"quotes\" and 'apostrophes' and <tags> & {brackets} [arrays] \\backslashes\\ and newlines\nand tabs\t";
        await repositoryRegistry.write.updateRepository(
          [1n, specialDescription],
          {
            account: maintainer1.account,
          }
        );

        const repo = await repositoryRegistry.read.getRepositoryDetails([1n]);
        expect(repo.description).to.equal(specialDescription);
        expect(repo.isActive).to.be.true;
      });

      it("Should handle very long descriptions", async function () {
        const { repositoryRegistry, maintainer1 } = await loadFixture(
          deployRepositoryRegistryFixture
        );

        // Submit a repository
        await repositoryRegistry.write.submitRepository(
          [
            "Long Description Repo",
            "Short description",
            "https://github.com/test/long",
            ["long"],
          ],
          { account: maintainer1.account }
        );

        // Create a very long description (1000+ characters)
        const longDescription =
          "A".repeat(1000) +
          " This is a very long description with repeated characters. ".repeat(
            20
          );
        await repositoryRegistry.write.updateRepository([1n, longDescription], {
          account: maintainer1.account,
        });

        const repo = await repositoryRegistry.read.getRepositoryDetails([1n]);
        expect(repo.description).to.equal(longDescription);
        expect(repo.description.length).to.be.greaterThan(1000);
      });

      it("Should handle empty string description", async function () {
        const { repositoryRegistry, maintainer1 } = await loadFixture(
          deployRepositoryRegistryFixture
        );

        // Submit a repository
        await repositoryRegistry.write.submitRepository(
          [
            "Empty Description Test",
            "Original description",
            "https://github.com/test/empty",
            ["empty"],
          ],
          { account: maintainer1.account }
        );

        // Update with empty description
        const emptyDescription = "";
        await repositoryRegistry.write.updateRepository(
          [1n, emptyDescription],
          {
            account: maintainer1.account,
          }
        );

        const repo = await repositoryRegistry.read.getRepositoryDetails([1n]);
        expect(repo.description).to.equal(emptyDescription);
        expect(repo.isActive).to.be.true;
      });
    });

    describe("Concurrent Repository Updates", function () {
      it("Should handle multiple repositories being updated simultaneously", async function () {
        const { repositoryRegistry, maintainer1, maintainer2 } =
          await loadFixture(deployRepositoryRegistryFixture);

        // Submit multiple repositories from different maintainers
        await repositoryRegistry.write.submitRepository(
          [
            "Repo 1",
            "Original description 1",
            "https://github.com/test/repo1",
            ["tag1"],
          ],
          { account: maintainer1.account }
        );

        await repositoryRegistry.write.submitRepository(
          [
            "Repo 2",
            "Original description 2",
            "https://github.com/test/repo2",
            ["tag2"],
          ],
          { account: maintainer2.account }
        );

        await repositoryRegistry.write.submitRepository(
          [
            "Repo 3",
            "Original description 3",
            "https://github.com/test/repo3",
            ["tag3"],
          ],
          { account: maintainer1.account }
        );

        // Perform concurrent updates
        const updatePromises = [
          repositoryRegistry.write.updateRepository(
            [1n, "Updated description 1"],
            {
              account: maintainer1.account,
            }
          ),
          repositoryRegistry.write.updateRepository(
            [2n, "Updated description 2"],
            {
              account: maintainer2.account,
            }
          ),
          repositoryRegistry.write.updateRepository(
            [3n, "Updated description 3"],
            {
              account: maintainer1.account,
            }
          ),
        ];

        // Wait for all updates to complete
        await Promise.all(updatePromises);

        // Verify all updates were successful
        const repo1 = await repositoryRegistry.read.getRepositoryDetails([1n]);
        const repo2 = await repositoryRegistry.read.getRepositoryDetails([2n]);
        const repo3 = await repositoryRegistry.read.getRepositoryDetails([3n]);

        expect(repo1.description).to.equal("Updated description 1");
        expect(repo2.description).to.equal("Updated description 2");
        expect(repo3.description).to.equal("Updated description 3");

        // Verify all repositories are still active and other data is intact
        expect(repo1.isActive).to.be.true;
        expect(repo2.isActive).to.be.true;
        expect(repo3.isActive).to.be.true;
        expect(repo1.name).to.equal("Repo 1");
        expect(repo2.name).to.equal("Repo 2");
        expect(repo3.name).to.equal("Repo 3");
      });

      it("Should handle rapid sequential updates to the same repository", async function () {
        const { repositoryRegistry, maintainer1 } = await loadFixture(
          deployRepositoryRegistryFixture
        );

        // Submit a repository
        await repositoryRegistry.write.submitRepository(
          [
            "Rapid Update Repo",
            "Original description",
            "https://github.com/test/rapid",
            ["rapid"],
          ],
          { account: maintainer1.account }
        );

        // Perform multiple rapid updates to the same repository
        const updates = [
          "First update",
          "Second update",
          "Third update",
          "Fourth update",
          "Final update",
        ];

        for (let i = 0; i < updates.length; i++) {
          await repositoryRegistry.write.updateRepository([1n, updates[i]], {
            account: maintainer1.account,
          });
        }

        // Verify the final state
        const repo = await repositoryRegistry.read.getRepositoryDetails([1n]);
        expect(repo.description).to.equal("Final update");
        expect(repo.isActive).to.be.true;
        expect(repo.name).to.equal("Rapid Update Repo");
      });

      it("Should maintain data integrity during concurrent operations", async function () {
        const { repositoryRegistry, maintainer1, maintainer2, otherAccount } =
          await loadFixture(deployRepositoryRegistryFixture);

        // Submit repositories
        await repositoryRegistry.write.submitRepository(
          [
            "Integrity Test 1",
            "Description 1",
            "https://github.com/test/integrity1",
            ["integrity"],
          ],
          { account: maintainer1.account }
        );

        await repositoryRegistry.write.submitRepository(
          [
            "Integrity Test 2",
            "Description 2",
            "https://github.com/test/integrity2",
            ["integrity"],
          ],
          { account: maintainer2.account }
        );

        // Mix of concurrent operations: updates, failed updates, and queries
        const operations = [
          // Valid updates
          repositoryRegistry.write.updateRepository([1n, "Valid update 1"], {
            account: maintainer1.account,
          }),
          repositoryRegistry.write.updateRepository([2n, "Valid update 2"], {
            account: maintainer2.account,
          }),
          // Invalid update attempts (should fail)
          repositoryRegistry.write
            .updateRepository([1n, "Invalid update"], {
              account: otherAccount.account,
            })
            .catch(() => {
              // Expected to fail - not the owner
            }),
          repositoryRegistry.write
            .updateRepository([999n, "Non-existent"], {
              account: maintainer1.account,
            })
            .catch(() => {
              // Expected to fail - repository doesn't exist
            }),
          // Read operations during updates
          repositoryRegistry.read.getRepositoryDetails([1n]),
          repositoryRegistry.read.getRepositoryDetails([2n]),
        ];

        // Execute all operations concurrently
        await Promise.allSettled(operations);

        // Verify data integrity after all operations
        const repo1 = await repositoryRegistry.read.getRepositoryDetails([1n]);
        const repo2 = await repositoryRegistry.read.getRepositoryDetails([2n]);

        expect(repo1.description).to.equal("Valid update 1");
        expect(repo2.description).to.equal("Valid update 2");
        expect(repo1.isActive).to.be.true;
        expect(repo2.isActive).to.be.true;
        expect(repo1.maintainer.toLowerCase()).to.equal(
          maintainer1.account.address.toLowerCase()
        );
        expect(repo2.maintainer.toLowerCase()).to.equal(
          maintainer2.account.address.toLowerCase()
        );
      });
    });
  });
});
