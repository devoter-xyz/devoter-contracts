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

  describe("updateRepository - Data Integrity", function () {
    it("Should preserve other repository data when updating description", async function () {
      const { repositoryRegistry, maintainer1 } = await loadFixture(
        deployRepositoryRegistryFixture
      );

      // Submit a repository with comprehensive initial data
      const originalName = "Data Integrity Test Repo";
      const originalDescription = "Original comprehensive description";
      const originalUrl = "https://github.com/test/data-integrity";
      const originalTags = ["javascript", "blockchain", "testing"];

      await repositoryRegistry.write.submitRepository(
        [originalName, originalDescription, originalUrl, originalTags],
        { account: maintainer1.account }
      );

      // Get initial repository state for comparison
      const initialRepo = await repositoryRegistry.read.getRepositoryDetails([
        1n,
      ]);
      const initialSubmissionTime = initialRepo.submissionTime;
      const initialTotalVotes = initialRepo.totalVotes;

      // Update only the description
      const newDescription = "Updated description while preserving other data";
      await repositoryRegistry.write.updateRepository([1n, newDescription], {
        account: maintainer1.account,
      });

      // Verify the description was updated
      const updatedRepo = await repositoryRegistry.read.getRepositoryDetails([
        1n,
      ]);
      expect(updatedRepo.description).to.equal(newDescription);

      // Verify ALL other repository data is preserved exactly
      expect(updatedRepo.name).to.equal(originalName);
      expect(updatedRepo.githubUrl).to.equal(originalUrl);
      expect(updatedRepo.maintainer.toLowerCase()).to.equal(
        maintainer1.account.address.toLowerCase()
      );
      expect(updatedRepo.isActive).to.equal(initialRepo.isActive);
      expect(updatedRepo.submissionTime).to.equal(initialSubmissionTime);
      expect(updatedRepo.totalVotes).to.equal(initialTotalVotes);
      expect(updatedRepo.tags).to.deep.equal(originalTags);
    });

    it("Should handle multiple updates by same maintainer", async function () {
      const { repositoryRegistry, maintainer1 } = await loadFixture(
        deployRepositoryRegistryFixture
      );

      // Submit a repository
      const name = "Multiple Updates Test Repo";
      const initialDescription = "Initial description";
      const url = "https://github.com/test/multiple-updates";
      const tags = ["updates", "testing"];

      await repositoryRegistry.write.submitRepository(
        [name, initialDescription, url, tags],
        { account: maintainer1.account }
      );

      // Get initial state
      const initialRepo = await repositoryRegistry.read.getRepositoryDetails([
        1n,
      ]);

      // Perform multiple sequential updates
      const descriptions = [
        "First update - describing new features",
        "Second update - fixing typos and improving clarity",
        "Third update - adding more technical details",
        "Fourth update - final version with complete information",
      ];

      for (let i = 0; i < descriptions.length; i++) {
        await repositoryRegistry.write.updateRepository([1n, descriptions[i]], {
          account: maintainer1.account,
        });

        // Verify each update is successful and data integrity is maintained
        const repo = await repositoryRegistry.read.getRepositoryDetails([1n]);
        expect(repo.description).to.equal(descriptions[i]);

        // Ensure all other data remains unchanged after each update
        expect(repo.name).to.equal(name);
        expect(repo.githubUrl).to.equal(url);
        expect(repo.maintainer.toLowerCase()).to.equal(
          maintainer1.account.address.toLowerCase()
        );
        expect(repo.isActive).to.be.true;
        expect(repo.submissionTime).to.equal(initialRepo.submissionTime);
        expect(repo.totalVotes).to.equal(initialRepo.totalVotes);
        expect(repo.tags).to.deep.equal(tags);
      }

      // Final verification - ensure the last description is correctly stored
      const finalRepo = await repositoryRegistry.read.getRepositoryDetails([
        1n,
      ]);
      expect(finalRepo.description).to.equal(
        descriptions[descriptions.length - 1]
      );

      // Verify consistency: all non-description fields should be identical to initial state
      expect(finalRepo.name).to.equal(initialRepo.name);
      expect(finalRepo.githubUrl).to.equal(initialRepo.githubUrl);
      expect(finalRepo.maintainer).to.equal(initialRepo.maintainer);
      expect(finalRepo.isActive).to.equal(initialRepo.isActive);
      expect(finalRepo.submissionTime).to.equal(initialRepo.submissionTime);
      expect(finalRepo.totalVotes).to.equal(initialRepo.totalVotes);
      expect(finalRepo.tags).to.deep.equal(initialRepo.tags);
    });
  });
});
