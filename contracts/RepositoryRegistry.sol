// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract RepositoryRegistry is Ownable, ReentrancyGuard {
    
    struct Repository {
        string name;
        string description;
        string githubUrl;
        address maintainer;
        uint256 totalVotes;
        bool isActive;
        uint256 submissionTime;
        string[] tags;
    }
    
    mapping(uint256 => Repository) private repositories;
    uint256 private repoCounter;
    
    // Event placeholders
    event RepositorySubmitted(uint256 indexed id, address indexed maintainer);
    event RepositoryUpdated(uint256 indexed id, address indexed maintainer);
    event RepositoryDeactivated(uint256 indexed id);
    
    constructor(address initialOwner) Ownable(initialOwner) {
        repoCounter = 0;
    }
    

    /**
     * @dev Update repository description by the original maintainer
     * @param id Repository ID to update
     * @param newDescription New description for the repository
     */
    function updateRepository(uint256 id, string calldata newDescription) external nonReentrant {
        Repository storage repo = repositories[id];
        require(repo.maintainer == msg.sender, "Not owner");
        require(repo.isActive, "Inactive");
        
        repo.description = newDescription;
        emit RepositoryUpdated(id, msg.sender);
    }

    /**
     * @dev Submit a new repository to the registry
     * @param name Repository name (must not be empty)
     * @param description Repository description
     * @param url GitHub URL (must not be empty)
     * @param tags Array of tags (must have at least one tag)
     */
    function submitRepository(
        string calldata name,
        string calldata description,
        string calldata url,
        string[] calldata tags
    ) external nonReentrant {
        // Validate input parameters
        require(bytes(name).length > 0, "Repository name cannot be empty");
        require(bytes(url).length > 0, "Repository URL cannot be empty");
        require(tags.length > 0, "Tags are required");
        
        // Increment counter and create new repository
        repoCounter += 1;
        
        // Store repository in mapping
        repositories[repoCounter] = Repository({
            name: name,
            description: description,
            githubUrl: url,
            maintainer: msg.sender,
            totalVotes: 0,
            isActive: true,
            submissionTime: block.timestamp,
            tags: tags
        });
        
        // Emit event
        emit RepositorySubmitted(repoCounter, msg.sender);
    }

    /**
     * @dev Deactivates a repository by setting isActive to false
     * @param id The ID of the repository to deactivate
     * @notice Only the repository maintainer or contract owner can deactivate a repository
     */
    function deactivateRepository(uint256 id) external nonReentrant {
        Repository storage repo = repositories[id];
        // Check if repository exists by verifying maintainer is not zero address
        // (uninitialized mappings return default values, so address defaults to 0x0)
        require(repo.maintainer != address(0), "Repository does not exist");
        require(repo.maintainer == msg.sender || owner() == msg.sender, "No rights");
        require(repo.isActive, "Repository already inactive");
        
        repo.isActive = false;
        emit RepositoryDeactivated(id);
    }

    // ===== QUERY, SEARCH & FILTERING UTILITIES =====

    /**
     * @dev Get repository details by ID
     * @param id Repository ID to query
     * @return Repository struct containing all repository data
     */
    function getRepositoryDetails(uint256 id) external view returns (Repository memory) {
        return repositories[id];
    }

    /**
     * @dev Get all active repositories
     * @return Array of Repository structs that are currently active
     */
    function getActiveRepositories() external view returns (Repository[] memory) {
        // First pass: count active repositories
        uint256 activeCount = 0;
        for (uint256 i = 1; i <= repoCounter; i++) {
            if (repositories[i].isActive && repositories[i].maintainer != address(0)) {
                activeCount++;
            }
        }

        // Create array with exact size needed
        Repository[] memory activeRepos = new Repository[](activeCount);
        
        // Second pass: populate the array
        uint256 index = 0;
        for (uint256 i = 1; i <= repoCounter; i++) {
            if (repositories[i].isActive && repositories[i].maintainer != address(0)) {
                activeRepos[index] = repositories[i];
                index++;
            }
        }

        return activeRepos;
    }

    /**
     * @dev Search repositories by tag (case-sensitive)
     * @param tag The tag to search for
     * @return Array of repository IDs that contain the specified tag
     */
    function searchByTag(string calldata tag) external view returns (uint256[] memory) {
        // First pass: count repositories with the tag
        uint256 matchCount = 0;
        for (uint256 i = 1; i <= repoCounter; i++) {
            if (repositories[i].maintainer != address(0) && repositories[i].isActive) {
                string[] memory tags = repositories[i].tags;
                for (uint256 j = 0; j < tags.length; j++) {
                    if (keccak256(abi.encodePacked(tags[j])) == keccak256(abi.encodePacked(tag))) {
                        matchCount++;
                        break; // Found the tag, no need to check other tags for this repo
                    }
                }
            }
        }

        // Create array with exact size needed
        uint256[] memory matchingIds = new uint256[](matchCount);
        
        // Second pass: populate the array
        uint256 index = 0;
        for (uint256 i = 1; i <= repoCounter; i++) {
            if (repositories[i].maintainer != address(0) && repositories[i].isActive) {
                string[] memory tags = repositories[i].tags;
                for (uint256 j = 0; j < tags.length; j++) {
                    if (keccak256(abi.encodePacked(tags[j])) == keccak256(abi.encodePacked(tag))) {
                        matchingIds[index] = i;
                        index++;
                        break; // Found the tag, no need to check other tags for this repo
                    }
                }
            }
        }

        return matchingIds;
    }

  

}
